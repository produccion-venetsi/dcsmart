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

export function crearCliente({ apiKey, apiSecret, fetchImpl = fetch, ahora = () => Date.now() }) {
  let cache = null // { token, venceEn }

  async function token() {
    if (cache && cache.venceEn - MARGEN_RENOVACION_MS > ahora()) return cache.token
    const resp = await fetchImpl(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ apiKey, apiSecret }),
    })
    const texto = await resp.text()
    if (!resp.ok) throw new Error(`Fudo auth respondió ${resp.status}: ${texto.slice(0, 300)}`)
    const { token: t, exp } = JSON.parse(texto)
    cache = { token: t, venceEn: Number(exp) * 1000 }
    return t
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
  const gastosDelDia = ({ fecha }) =>
    listar(`/expenses?filter[date]=and(gte.${fecha},lte.${fecha})&include=paymentMethod,provider`)

  return { token, listar, ventasDelDia, gastosDelDia }
}
