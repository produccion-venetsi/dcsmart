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

test('mas de un cobro del mismo metodo se acumulan monto y cantidad', () => {
  // La 55942 del fixture ya trae un cobro en cash por 10000. Agregamos otra
  // venta con otro cobro en cash para probar que se suman de verdad.
  const incluidos = [
    ...crudo.included,
    { type: 'Payment', id: '77', attributes: { amount: 5000, canceled: null }, relationships: { paymentMethod: { data: { type: 'PaymentMethod', id: '1' } } } },
  ]
  const ventas = [
    ...crudo.data,
    { type: 'Sale', id: '77', attributes: { closedAt: '2026-08-13T20:00:00Z', people: 2, total: 5000, saleType: 'EAT-IN', saleState: 'CLOSED' },
      relationships: { payments: { data: [{ type: 'Payment', id: '77' }] }, commercialDocuments: { data: [] }, closedBy: { data: { type: 'User', id: '1' } } } },
  ]
  const { movimientos } = mapDia({ ventas, incluidos, fecha: '2026-08-13' })
  const cash = movimientos.find((m) => m.code === 'cash')
  assert.equal(cash.monto, '15000.00') // 10000 (fixture) + 5000
  assert.equal(cash.cantidad, 2)
})

test('los montos con centavos se suman sin perder precision', () => {
  const ventas = [
    { type: 'Sale', id: '201', attributes: { closedAt: '2026-08-13T12:00:00Z', people: 1, total: 10.10, saleType: 'EAT-IN', saleState: 'CLOSED' },
      relationships: { payments: { data: [{ type: 'Payment', id: '201' }] }, commercialDocuments: { data: [] }, closedBy: { data: { type: 'User', id: '1' } } } },
    { type: 'Sale', id: '202', attributes: { closedAt: '2026-08-13T13:00:00Z', people: 1, total: 20.20, saleType: 'EAT-IN', saleState: 'CLOSED' },
      relationships: { payments: { data: [{ type: 'Payment', id: '202' }] }, commercialDocuments: { data: [] }, closedBy: { data: { type: 'User', id: '1' } } } },
    { type: 'Sale', id: '203', attributes: { closedAt: '2026-08-13T14:00:00Z', people: 1, total: 0.05, saleType: 'EAT-IN', saleState: 'CLOSED' },
      relationships: { payments: { data: [{ type: 'Payment', id: '203' }] }, commercialDocuments: { data: [] }, closedBy: { data: { type: 'User', id: '1' } } } },
  ]
  const incluidos = [
    { type: 'Payment', id: '201', attributes: { amount: 10.10, canceled: null }, relationships: { paymentMethod: { data: { type: 'PaymentMethod', id: '1' } } } },
    { type: 'Payment', id: '202', attributes: { amount: 20.20, canceled: null }, relationships: { paymentMethod: { data: { type: 'PaymentMethod', id: '1' } } } },
    { type: 'Payment', id: '203', attributes: { amount: 0.05, canceled: null }, relationships: { paymentMethod: { data: { type: 'PaymentMethod', id: '1' } } } },
    { type: 'PaymentMethod', id: '1', attributes: { name: 'Efectivo', code: 'cash' } },
    { type: 'User', id: '1', attributes: { name: 'Angeles Zeballos' } },
  ]
  const { caja } = mapDia({ ventas, incluidos, fecha: '2026-08-13' })
  assert.equal(caja.total, '30.35')
  assert.equal(caja.efectivo, '30.35')
})

test('un dia con ventas pero todas anuladas no arma caja', () => {
  const ventas = crudo.data.filter((v) => v.attributes.saleState === 'CANCELED')
  assert.equal(mapDia({ ventas, incluidos: crudo.included, fecha: '2026-08-13' }), null)
})

test('codes incluye cash cuando hay un gasto, aunque ningun cobro haya sido en efectivo', () => {
  // Solo la 55953 (cobro en mp), ningun cobro en cash.
  const ventas = [crudo.data[0]]
  const gastos = [{ id: '1', attributes: { amount: 100, useInCashCount: true, description: 'Test' } }]
  const { codes } = mapDia({ ventas, incluidos: crudo.included, gastos, fecha: '2026-08-13' })
  assert.deepEqual([...codes].sort(), ['cash', 'mp'])
})
