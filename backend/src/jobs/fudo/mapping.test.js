import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapDia, esMovimientoDelJob, DETALLES_SIEMPRE } from './mapping.js'

const crudo = JSON.parse(readFileSync(new URL('./fixtures/sales-2026-08-13.json', import.meta.url)))
const mapear = (extra = {}) => mapDia({ ventas: crudo.data, incluidos: crudo.included, fecha: '2026-08-13', ...extra })

test('la caja lleva la fecha del dia comercial como id_externo', () => {
  const { caja } = mapear()
  assert.equal(caja.id_externo, '2026-08-13')
  assert.equal(caja.origin, 'FFUDO')
  assert.equal(caja.fecha_inicio, '2026-08-13T09:00:00Z')
  assert.equal(caja.fecha_cierre, '2026-08-14T09:00:00Z')
})

test('las ventas anuladas no suman', () => {
  const { caja } = mapear()
  assert.equal(caja.total, '807000.00')  // 797000 + 10000, la CANCELED queda afuera
  assert.equal(caja.tickets, 2)
})

test('el efectivo sale de los cobros con code cash', () => {
  assert.equal(mapear().caja.efectivo, '10000.00')
})

test('el fiscal son las ventas que tienen documento comercial', () => {
  // Solo la 55953 tiene factura.
  assert.equal(mapear().caja.fiscal, '797000.00')
})

test('los comensales suman y toleran el null que manda Fudo en takeaway', () => {
  assert.equal(mapear().caja.comensales, 1)
})

test('el cajero es quien cerro mas ventas', () => {
  assert.equal(mapear().caja.cajero, 'Angeles Zeballos')
})

test('la observacion deja constancia de las anuladas excluidas', () => {
  assert.match(mapear().caja.observaciones, /1 venta/)
})

test('Fudo no tiene turnos: nro_turno y tipo_turno quedan vacios', () => {
  const { caja } = mapear()
  assert.equal(caja.nro_turno, null)
  assert.equal(caja.tipo_turno, null)
})

test('hay un movimiento COBRO por metodo, con la cantidad de cobros', () => {
  const { movimientos } = mapear()
  const porCode = Object.fromEntries(movimientos.map((m) => [m.code, m]))
  assert.equal(porCode['mp'].monto, '797000.00')
  assert.equal(porCode['mp'].cantidad, 1)
  assert.equal(porCode['mp'].tipo, 'COBRO')
  assert.equal(porCode['cash'].monto, '10000.00')
})

test('cuenta corriente no genera movimiento: no es plata en la caja', () => {
  const incluidos = [
    ...crudo.included,
    { type: 'PaymentMethod', id: '2', attributes: { name: 'Cta. Cte.', code: 'house-account' } },
    { type: 'Payment', id: '99', attributes: { amount: 5000, canceled: null }, relationships: { paymentMethod: { data: { type: 'PaymentMethod', id: '2' } } } },
  ]
  const ventas = [
    ...crudo.data,
    { type: 'Sale', id: '99', attributes: { closedAt: '2026-08-13T23:00:00Z', people: 2, total: 5000, saleType: 'EAT-IN', saleState: 'CLOSED' },
      relationships: { payments: { data: [{ type: 'Payment', id: '99' }] }, commercialDocuments: { data: [] }, closedBy: { data: null } } },
  ]
  const { movimientos, detalles } = mapDia({ ventas, incluidos, fecha: '2026-08-13' })
  assert.ok(!movimientos.some((m) => m.code === 'house-account'))
  assert.equal(detalles.find((d) => d.nombre === 'Cta Cte').monto, '5000.00')
})

test('los cobros anulados se ignoran', () => {
  const incluidos = crudo.included.map((i) =>
    i.type === 'Payment' && i.id === '53866' ? { ...i, attributes: { ...i.attributes, canceled: true } } : i)
  const { caja } = mapDia({ ventas: crudo.data, incluidos, fecha: '2026-08-13' })
  assert.equal(caja.efectivo, '0.00')
})

test('los seis detalles se crean siempre, aunque den cero', () => {
  const { detalles } = mapear()
  assert.deepEqual(detalles.map((d) => d.nombre), DETALLES_SIEMPRE)
  assert.equal(detalles.find((d) => d.nombre === 'Salon').monto, '10000.00')
  assert.equal(detalles.find((d) => d.nombre === 'Mostrador').monto, '797000.00')
  assert.equal(detalles.find((d) => d.nombre === 'Delivery').monto, '0.00')
  assert.equal(detalles.find((d) => d.nombre === 'Online').monto, '0.00')
})

test('los gastos que cuentan en caja entran como movimiento GASTO', () => {
  const gastos = [
    { id: '10', attributes: { amount: 3000, useInCashCount: true, description: 'Verduleria' } },
    { id: '11', attributes: { amount: 9999, useInCashCount: false, description: 'Transferencia a proveedor' } },
  ]
  const { movimientos } = mapear({ gastos })
  const gasto = movimientos.filter((m) => m.tipo === 'GASTO')
  assert.equal(gasto.length, 1)
  assert.equal(gasto[0].monto, '3000.00')
})

test('un dia sin ventas no arma caja', () => {
  assert.equal(mapDia({ ventas: [], incluidos: [], fecha: '2026-08-13' }), null)
})

test('devuelve los codes vistos para resolverlos contra la base', () => {
  assert.deepEqual([...mapear().codes].sort(), ['cash', 'mp'])
})

test('solo COBRO y GASTO son del job: el resto lo carga la gente', () => {
  assert.ok(esMovimientoDelJob('COBRO'))
  assert.ok(esMovimientoDelJob('GASTO'))
  for (const t of ['INICIAL', 'RETIRO', 'VACIADO', 'INGRESO', 'EGRESO']) {
    assert.ok(!esMovimientoDelJob(t), t)
  }
})
