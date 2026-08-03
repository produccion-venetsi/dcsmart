import test from 'node:test'
import assert from 'node:assert/strict'
import { resolverRangoCmv } from './rangoCmv.js'

// El bug: el reporte comparaba VENTAS por día real (caja.fecha_inicio) contra
// CMV por PERÍODO (pago.periodo, que es mensual y se guarda como el día 1). Con
// "últimos 30 días" (04/07 al 03/08) la condición `periodo >= 2026-07-04` dejaba
// afuera todo julio, porque julio es 2026-07-01. Medido en LOS GALGOS: el
// reporte mostraba 1.465.211,80 en 5 pagos, cuando los 247 pagos de julio suman
// 57.115.386,50. El numerador y el denominador del % no hablaban del mismo tiempo.

test('con mes: el CMV va por periodo y las ventas por los dias de ese mes', () => {
  const r = resolverRangoCmv({ mes: '2026-07' })
  assert.equal(r.campoPago, 'periodo')
  // periodo se guarda a medianoche UTC del día elegido: el rango tiene que
  // abarcar el mes entero en UTC puro, sin el offset de Argentina.
  assert.equal(r.pagoDesde.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-07-31T23:59:59.999Z')
  // Las ventas son instantes reales: rango en hora Argentina.
  assert.equal(r.ventasDesde.toISOString(), '2026-07-01T03:00:00.000Z')
  assert.equal(r.ventasHasta.toISOString(), '2026-08-01T02:59:59.999Z')
})

test('con mes: febrero y los meses de 30 dias cierran donde deben', () => {
  assert.equal(resolverRangoCmv({ mes: '2026-02' }).pagoHasta.toISOString(), '2026-02-28T23:59:59.999Z')
  assert.equal(resolverRangoCmv({ mes: '2024-02' }).pagoHasta.toISOString(), '2024-02-29T23:59:59.999Z') // bisiesto
  assert.equal(resolverRangoCmv({ mes: '2026-04' }).pagoHasta.toISOString(), '2026-04-30T23:59:59.999Z')
  assert.equal(resolverRangoCmv({ mes: '2026-12' }).pagoHasta.toISOString(), '2026-12-31T23:59:59.999Z')
})

test('con rango de dias: el CMV va por FECHA, la misma unidad que las ventas', () => {
  const r = resolverRangoCmv({ desde: '2026-07-04', hasta: '2026-08-03' })
  // Acá está el fix: por `fecha`, no por `periodo`. Un rango de días contra un
  // campo mensual perdía meses enteros.
  assert.equal(r.campoPago, 'fecha')
  assert.equal(r.pagoDesde.toISOString(), '2026-07-04T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-08-03T23:59:59.999Z')
  assert.equal(r.ventasDesde.toISOString(), '2026-07-04T03:00:00.000Z')
})

test('el mes tiene prioridad sobre el rango si vienen los dos', () => {
  const r = resolverRangoCmv({ mes: '2026-07', desde: '2026-01-01', hasta: '2026-01-31' })
  assert.equal(r.campoPago, 'periodo')
  assert.equal(r.pagoDesde.toISOString(), '2026-07-01T00:00:00.000Z')
})

test('rechaza lo que no puede resolver, en vez de devolver un rango silencioso', () => {
  assert.equal(resolverRangoCmv({}), null)
  assert.equal(resolverRangoCmv({ desde: '2026-07-04' }), null)          // falta hasta
  assert.equal(resolverRangoCmv({ hasta: '2026-08-03' }), null)          // falta desde
  assert.equal(resolverRangoCmv({ mes: '2026-13' }), null)               // mes inexistente
  assert.equal(resolverRangoCmv({ mes: '2026-00' }), null)
  assert.equal(resolverRangoCmv({ mes: 'julio' }), null)
  assert.equal(resolverRangoCmv({ mes: '2026-7' }), null)                // sin cero
  assert.equal(resolverRangoCmv({ desde: 'ayer', hasta: 'hoy' }), null)
  assert.equal(resolverRangoCmv(undefined), null)
})

test('un rango invertido no se acepta: daria un total vacio sin explicacion', () => {
  assert.equal(resolverRangoCmv({ desde: '2026-08-03', hasta: '2026-07-04' }), null)
})

test('un rango de un solo dia es valido', () => {
  const r = resolverRangoCmv({ desde: '2026-07-15', hasta: '2026-07-15' })
  assert.equal(r.campoPago, 'fecha')
  assert.equal(r.pagoDesde.toISOString(), '2026-07-15T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-07-15T23:59:59.999Z')
})
