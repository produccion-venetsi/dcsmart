// backend/src/jobs/fudo/api.js
// Cliente de la API publica de Fudo (v1alpha1). El fetch se inyecta para poder
// testear sin red.
'use strict'

const AUTH_URL = 'https://auth.fu.do/api'
const API_BASE = 'https://api.fu.do/v1alpha1'
const TAMANO_PAGINA = 500
// El token dura 24 h; se renueva 5 minutos antes para no cortarse en el medio
// de una corrida larga.
const MARGEN_RENOVACION_MS = 5 * 60 * 1000

// auth.fu.do tiene rate limit propio: con 6+ locales pidiendo token en ráfaga
// (una cuenta por local) devuelve 429 "Retry later" y el local que llega último
// pierde la corrida entera -- pasó con LORETO el 2026-08-16, la primera corrida
// con 6 locales. Ante un 429 se espera y se reintenta; el resto de los errores
// de auth siguen cortando de una.
const REINTENTOS_AUTH_429 = 3
const ESPERA_429_MS = 65_000

export function crearCliente({ apiKey, apiSecret, fetchImpl = fetch, ahora = () => Date.now(), esperar = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let cache = null // { token, venceEn }

  async function token() {
    if (cache && cache.venceEn - MARGEN_RENOVACION_MS > ahora()) return cache.token
    for (let intento = 0; ; intento++) {
      const resp = await fetchImpl(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ apiKey, apiSecret }),
      })
      const texto = await resp.text()
      if (resp.status === 429 && intento < REINTENTOS_AUTH_429) {
        await esperar(ESPERA_429_MS)
        continue
      }
      if (!resp.ok) throw new Error(`Fudo auth respondió ${resp.status}: ${texto.slice(0, 300)}`)
      const { token: t, exp } = JSON.parse(texto)
      cache = { token: t, venceEn: Number(exp) * 1000 }
      return t
    }
  }

  // La respuesta no trae el total de items: se pide pagina tras pagina hasta
  // que una devuelve menos de las que se pidieron.
  async function listar(ruta) {
    const t = await token()
    const data = [], included = []
    for (let pagina = 1; ; pagina++) {
      const sep = ruta.includes('?') ? '&' : '?'
      const url = `${API_BASE}${ruta}${sep}page[size]=${TAMANO_PAGINA}&page[number]=${pagina}`
      const resp = await fetchImpl(url, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } })
      const texto = await resp.text()
      if (!resp.ok) throw new Error(`Fudo ${ruta} respondió ${resp.status}: ${texto.slice(0, 300)}`)
      const json = JSON.parse(texto)
      data.push(...(json.data || []))
      included.push(...(json.included || []))
      if ((json.data || []).length < TAMANO_PAGINA) break
    }
    return { data, included }
  }

  const ventasDelDia = ({ desde, hasta }) =>
    listar(`/sales?filter[closedAt]=and(gte.${desde},lt.${hasta})&filter[saleState]=in.(CLOSED)` +
      `&include=payments.paymentMethod,closedBy,commercialDocuments`)

  // Unico filtro del sistema que NO acepta timestamp: con hora devuelve 400.
  // Por eso es por dia calendario y no por la ventana de 06:00 a 06:00 que usa
  // ventasDelDia -- es una aproximacion deliberada: un gasto cargado de
  // madrugada cae en el dia siguiente. Ojo con `lte`: si se pidiera hasta el
  // dia siguiente (como hacia antes), sus gastos entrarian aca Y en su propia
  // corrida cuando se procese ese dia, duplicandose solos en los 4 dias que
  // reprocesa el job.
  //
  // Los `fields[expense]` NO son opcionales: sin ellos el gasto viene con
  // `relationships` y SIN `attributes`, o sea sin `amount` ni `useInCashCount`.
  // El job los daba por descartados en silencio -- medido contra CONDARCO:
  // 83 gastos de caja por $4.343.732 en dos semanas que no llegaban nunca.
  //
  // `paymentMethod` y `provider` tienen que ir TAMBIÉN en fields[expense]:
  // fields restringe el documento y sin nombrarlos ahí los gastos vienen sin
  // `relationships`, con lo que el `include` trae los PaymentMethod sueltos
  // pero no se puede saber cuál corresponde a cada gasto (verificado contra
  // CONDARCO 2026-08-16 -- por eso el job cargaba todo gasto como Efectivo).
  const gastosDelDia = ({ fecha }) =>
    listar(`/expenses?filter[date]=and(gte.${fecha},lte.${fecha})` +
      `&fields[expense]=amount,canceled,date,description,status,useInCashCount,paymentMethod,provider` +
      `&include=paymentMethod,provider`)

  return { token, listar, ventasDelDia, gastosDelDia }
}
