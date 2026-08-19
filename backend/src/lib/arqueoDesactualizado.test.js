import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarArqueos } from './arqueoDesactualizado.js'

const d = (s) => new Date(s)

// Un local con dos arqueos: el primero es línea de base, el segundo se compara.
const ARQUEOS = [
  { id: 'a1', fecha: d('2026-08-18T14:21:00Z'), total: 1437670, ingresos: 765100, gastos: 6135300, comprobacion: -523700, created_at: d('2026-08-18T14:21:00Z') },
  { id: 'a2', fecha: d('2026-08-19T13:42:00Z'), total: 1603270, ingresos: 153500, gastos: 151000, comprobacion: -163100, created_at: d('2026-08-19T13:42:00Z') },
]

test('sin cajas ni pagos nuevos, nada difiere', () => {
  // El período de a2 con exactamente lo que a2 guardó: efectivo 153500, gastos 151000.
  const cajas = [{ fecha_inicio: d('2026-08-18T20:03:00Z'), fecha_cierre: d('2026-08-19T03:00:00Z'), efectivo: 153500, created_at: d('2026-08-19T03:05:00Z') }]
  const pagos = [{ fecha_pago: d('2026-08-19T10:00:00Z'), importe: 151000 }]
  const r = evaluarArqueos(ARQUEOS, cajas, pagos)
  assert.equal(r.get('a2').difiere, false)
  assert.equal(r.get('a2').comprobacion, -163100)
})

test('el primer arqueo nunca se marca: su numero no significa nada', () => {
  const r = evaluarArqueos(ARQUEOS, [], [])
  assert.equal(r.get('a1').difiere, false)
  assert.equal(r.get('a1').es_primero, true)
})

test('una caja cargada DESPUES del arqueo lo marca como desactualizado', () => {
  const cajas = [
    { fecha_inicio: d('2026-08-18T20:03:00Z'), fecha_cierre: d('2026-08-19T03:00:00Z'), efectivo: 153500, created_at: d('2026-08-19T03:05:00Z') },
    // t528: entra al período por su cierre, y se cargó DESPUÉS de cerrado el arqueo
    { fecha_inicio: d('2026-08-18T13:59:00Z'), fecha_cierre: d('2026-08-18T20:00:00Z'), efectivo: 164400, created_at: d('2026-08-19T14:30:00Z') },
  ]
  const pagos = [{ fecha_pago: d('2026-08-19T10:00:00Z'), importe: 151000 }]
  const r = evaluarArqueos(ARQUEOS, cajas, pagos)
  const a2 = r.get('a2')
  assert.equal(a2.difiere, true)
  assert.equal(a2.cajas_tardias, 1)
  assert.equal(a2.ingresos, 317900)
  assert.equal(a2.comprobacion, 1300)
})

test('una caja del periodo cargada ANTES no cuenta como tardia, pero igual difiere si el monto no coincide', () => {
  const cajas = [
    { fecha_inicio: d('2026-08-18T20:03:00Z'), fecha_cierre: d('2026-08-19T03:00:00Z'), efectivo: 153500, created_at: d('2026-08-19T03:05:00Z') },
    // Se cargó antes del arqueo (a2 debió haberla contado), así que no es "tardía":
    // la diferencia viene de otro lado (una edición, o el criterio viejo).
    { fecha_inicio: d('2026-08-18T13:59:00Z'), fecha_cierre: d('2026-08-18T20:00:00Z'), efectivo: 164400, created_at: d('2026-08-19T08:03:00Z') },
  ]
  const pagos = [{ fecha_pago: d('2026-08-19T10:00:00Z'), importe: 151000 }]
  const a2 = evaluarArqueos(ARQUEOS, cajas, pagos).get('a2')
  assert.equal(a2.difiere, true)
  assert.equal(a2.cajas_tardias, 0)
})

test('un pago en efectivo nuevo tambien desactualiza', () => {
  const cajas = [{ fecha_inicio: d('2026-08-18T20:03:00Z'), fecha_cierre: d('2026-08-19T03:00:00Z'), efectivo: 153500, created_at: d('2026-08-19T03:05:00Z') }]
  const pagos = [
    { fecha_pago: d('2026-08-19T10:00:00Z'), importe: 151000 },
    { fecha_pago: d('2026-08-19T11:00:00Z'), importe: 20000 },
  ]
  const a2 = evaluarArqueos(ARQUEOS, cajas, pagos).get('a2')
  assert.equal(a2.difiere, true)
  assert.equal(a2.gastos, 171000)
})

test('diferencias de centavos no marcan nada (misma tolerancia que el cuadre)', () => {
  const cajas = [{ fecha_inicio: d('2026-08-18T20:03:00Z'), fecha_cierre: d('2026-08-19T03:00:00Z'), efectivo: 153500.4, created_at: d('2026-08-19T03:05:00Z') }]
  const pagos = [{ fecha_pago: d('2026-08-19T10:00:00Z'), importe: 151000 }]
  assert.equal(evaluarArqueos(ARQUEOS, cajas, pagos).get('a2').difiere, false)
})

test('sin arqueos devuelve un mapa vacio', () => {
  assert.equal(evaluarArqueos([], [], []).size, 0)
})
