// backend/src/jobs/fudo/api.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearCliente } from './api.js'

const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) })
const authOk = (exp) => ok({ token: 'tok-123', exp })

// Devuelve un fetch falso que registra las llamadas.
function fetchFalso(respuestas) {
  const llamadas = []
  const impl = async (url, opciones) => {
    llamadas.push({ url, opciones })
    const r = respuestas.shift()
    if (!r) throw new Error(`llamada inesperada a ${url}`)
    return r
  }
  impl.llamadas = llamadas
  return impl
}

test('pide el token con apiKey y apiSecret', async () => {
  const f = fetchFalso([authOk(9999999999)])
  const c = crearCliente({ apiKey: 'k', apiSecret: 's', fetchImpl: f })
  assert.equal(await c.token(), 'tok-123')
  assert.equal(f.llamadas[0].url, 'https://auth.fu.do/api')
  assert.deepEqual(JSON.parse(f.llamadas[0].opciones.body), { apiKey: 'k', apiSecret: 's' })
})

test('reusa el token mientras siga vigente', async () => {
  const f = fetchFalso([authOk(2000000000)])
  const c = crearCliente({ apiKey: 'k', apiSecret: 's', fetchImpl: f, ahora: () => 1000000000_000 })
  await c.token()
  await c.token()
  assert.equal(f.llamadas.length, 1) // no pidio otro
})

test('renueva el token si esta por vencer', async () => {
  // exp dentro de 2 minutos: menos que el margen de 5.
  const ahora = 1000000000_000
  const f = fetchFalso([authOk(1000000120), authOk(1000000999)])
  const c = crearCliente({ apiKey: 'k', apiSecret: 's', fetchImpl: f, ahora: () => ahora })
  await c.token()
  await c.token()
  assert.equal(f.llamadas.length, 2)
})

test('un error de autenticacion se propaga con el status', async () => {
  const f = fetchFalso([{ ok: false, status: 401, text: async () => '{"errors":[{"status":"401"}]}' }])
  const c = crearCliente({ apiKey: 'k', apiSecret: 'mal', fetchImpl: f })
  await assert.rejects(() => c.token(), /401/)
})

test('manda el token como Bearer en cada request', async () => {
  const f = fetchFalso([authOk(9999999999), ok({ data: [] })])
  const c = crearCliente({ apiKey: 'k', apiSecret: 's', fetchImpl: f })
  await c.listar('/sales?filter[x]=1')
  assert.equal(f.llamadas[1].opciones.headers.Authorization, 'Bearer tok-123')
  assert.match(f.llamadas[1].url, /^https:\/\/api\.fu\.do\/v1alpha1\/sales/)
})

test('pagina hasta que una pagina viene incompleta', async () => {
  // La API no informa el total: se corta cuando devuelve menos que page[size].
  const llena = { data: Array.from({ length: 500 }, (_, i) => ({ id: String(i) })), included: [{ type: 'X', id: '1' }] }
  const ultima = { data: [{ id: 'final' }], included: [{ type: 'X', id: '2' }] }
  const f = fetchFalso([authOk(9999999999), ok(llena), ok(ultima)])
  const c = crearCliente({ apiKey: 'k', apiSecret: 's', fetchImpl: f })
  const r = await c.listar('/sales?filter[x]=1')
  assert.equal(r.data.length, 501)
  assert.equal(r.included.length, 2)
  assert.match(f.llamadas[1].url, /page\[number\]=1/)
  assert.match(f.llamadas[2].url, /page\[number\]=2/)
})

test('las ventas se piden cerradas y con lo que hace falta para armar la caja', async () => {
  const f = fetchFalso([authOk(9999999999), ok({ data: [] })])
  const c = crearCliente({ apiKey: 'k', apiSecret: 's', fetchImpl: f })
  await c.ventasDelDia({ desde: '2026-08-13T09:00:00Z', hasta: '2026-08-14T09:00:00Z' })
  const url = decodeURIComponent(f.llamadas[1].url)
  assert.match(url, /filter\[closedAt\]=and\(gte\.2026-08-13T09:00:00Z,lt\.2026-08-14T09:00:00Z\)/)
  assert.match(url, /filter\[saleState\]=in\.\(CLOSED\)/)
  assert.match(url, /include=payments\.paymentMethod,closedBy,commercialDocuments/)
})

test('los gastos se piden por fecha sin hora: con hora la API responde 400', async () => {
  const f = fetchFalso([authOk(9999999999), ok({ data: [] })])
  const c = crearCliente({ apiKey: 'k', apiSecret: 's', fetchImpl: f })
  await c.gastosDelDia({ fecha: '2026-08-13' })
  const url = decodeURIComponent(f.llamadas[1].url)
  assert.match(url, /filter\[date\]=and\(gte\.2026-08-13,lte\.2026-08-14\)/)
})

test('un error de la API dice que ruta fallo', async () => {
  const f = fetchFalso([authOk(9999999999), { ok: false, status: 400, text: async () => 'detalle del error' }])
  const c = crearCliente({ apiKey: 'k', apiSecret: 's', fetchImpl: f })
  await assert.rejects(() => c.listar('/sales?x=1'), /400.*detalle del error/s)
})
