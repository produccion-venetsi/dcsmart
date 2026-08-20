import test from 'node:test'
import assert from 'node:assert/strict'
import { resolverRangoCmv } from './rangoCmv.js'

// El CMV se lee SIEMPRE por período contable (`pago.periodo`). Antes había dos
// modos y daban números distintos para "julio": por rango de días se filtraba
// `pago.fecha` y por mes `pago.periodo`. Medido en 878COOP para julio 2026:
// 10.989.797,80 (96 pagos) por fecha contra 11.758.312,04 (100 pagos) por
// período. La diferencia era real, no de redondeo: el modo fecha sumaba un pago
// de período mayo cargado en julio (7.600) y perdía 5 pagos de período julio
// cargados en junio (776.114,19).
//
// Ahora la unidad es una sola: meses. Un rango de días entra igual pero se
// redondea a los meses que toca, porque `periodo` vive el día 1 del mes y
// compararlo contra un día arbitrario dejaba meses enteros afuera.

test('rango de meses: el CMV va por periodo y las ventas por los dias de esos meses', () => {
  const r = resolverRangoCmv({ mes_desde: '2026-06', mes_hasta: '2026-07' })
  assert.equal(r.campoPago, 'periodo')
  assert.equal(r.mesDesde, '2026-06')
  assert.equal(r.mesHasta, '2026-07')
  // periodo se guarda a medianoche UTC del día elegido: el rango tiene que
  // abarcar los meses enteros en UTC puro, sin el offset de Argentina.
  assert.equal(r.pagoDesde.toISOString(), '2026-06-01T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-07-31T23:59:59.999Z')
  // Las ventas son instantes reales: rango en hora Argentina.
  assert.equal(r.ventasDesde.toISOString(), '2026-06-01T03:00:00.000Z')
  assert.equal(r.ventasHasta.toISOString(), '2026-08-01T02:59:59.999Z')
})

test('un solo mes: mes_desde igual a mes_hasta', () => {
  const r = resolverRangoCmv({ mes_desde: '2026-07', mes_hasta: '2026-07' })
  assert.equal(r.campoPago, 'periodo')
  assert.equal(r.pagoDesde.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-07-31T23:59:59.999Z')
  assert.equal(r.ventasDesde.toISOString(), '2026-07-01T03:00:00.000Z')
  assert.equal(r.ventasHasta.toISOString(), '2026-08-01T02:59:59.999Z')
})

test('mes suelto sigue andando: es el rango de un mes', () => {
  const r = resolverRangoCmv({ mes: '2026-07' })
  assert.equal(r.campoPago, 'periodo')
  assert.equal(r.mesDesde, '2026-07')
  assert.equal(r.mesHasta, '2026-07')
  assert.equal(r.pagoDesde.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-07-31T23:59:59.999Z')
})

test('medio rango de meses no se rechaza: vale como mes unico', () => {
  // Que la pantalla quede vacía por un input a medio llenar es peor que asumir
  // lo obvio: si solo hay un extremo, es ese mes.
  const soloDesde = resolverRangoCmv({ mes_desde: '2026-07' })
  assert.equal(soloDesde.mesDesde, '2026-07')
  assert.equal(soloDesde.mesHasta, '2026-07')

  const soloHasta = resolverRangoCmv({ mes_hasta: '2026-07' })
  assert.equal(soloHasta.mesDesde, '2026-07')
  assert.equal(soloHasta.mesHasta, '2026-07')
})

test('un extremo vacio es ausencia; uno mal escrito es un error', () => {
  // El querystring manda `mes_hasta=` cuando el input está sin llenar.
  const vacio = resolverRangoCmv({ mes_desde: '2026-07', mes_hasta: '' })
  assert.equal(vacio.mesDesde, '2026-07')
  assert.equal(vacio.mesHasta, '2026-07')
  // Pero un mes presente y malformado no se silencia mostrando el otro.
  assert.equal(resolverRangoCmv({ mes_desde: '2026-7', mes_hasta: '2026-08' }), null)
  assert.equal(resolverRangoCmv({ mes_desde: '2026-07', mes_hasta: 'agosto' }), null)
})

test('febrero y los meses de 30 dias cierran donde deben', () => {
  const fin = (mes) => resolverRangoCmv({ mes }).pagoHasta.toISOString()
  assert.equal(fin('2026-02'), '2026-02-28T23:59:59.999Z')
  assert.equal(fin('2024-02'), '2024-02-29T23:59:59.999Z') // bisiesto
  assert.equal(fin('2026-04'), '2026-04-30T23:59:59.999Z')
  assert.equal(fin('2026-12'), '2026-12-31T23:59:59.999Z')
})

test('un rango de meses que cruza el año no se rompe', () => {
  const r = resolverRangoCmv({ mes_desde: '2025-11', mes_hasta: '2026-02' })
  assert.equal(r.pagoDesde.toISOString(), '2025-11-01T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-02-28T23:59:59.999Z')
})

// Antes un rango parcial se redondeaba a los meses que tocaba: pedias una
// semana y el reporte mostraba julio entero (reportado por el usuario,
// 2026-08-20). Ahora un rango parcial pregunta otra cosa -- cuanto se CARGO
// en esos dias -- y va por `fecha`, declarando el modo.
test('un rango de dias parcial va por fecha de carga, con los dias exactos', () => {
  const r = resolverRangoCmv({ desde: '2026-07-04', hasta: '2026-08-03' })
  assert.equal(r.modo, 'fecha')
  assert.equal(r.campoPago, 'fecha')
  assert.equal(r.diaDesde, '2026-07-04')
  assert.equal(r.diaHasta, '2026-08-03')
  assert.equal(r.pagoDesde.toISOString(), '2026-07-04T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-08-03T23:59:59.999Z')
  // Las ventas acompañan los MISMOS dias: numerador y denominador del % hablan
  // del mismo tiempo, igual que en el modo contable.
  assert.equal(r.ventasDesde.toISOString(), '2026-07-04T03:00:00.000Z')
  assert.equal(r.ventasHasta.toISOString(), '2026-08-04T02:59:59.999Z')
})

test('una semana va por fecha: el caso reportado', () => {
  const r = resolverRangoCmv({ desde: '2026-08-10', hasta: '2026-08-16' })
  assert.equal(r.modo, 'fecha')
  assert.equal(r.pagoDesde.toISOString(), '2026-08-10T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-08-16T23:59:59.999Z')
})

test('un rango de dias de meses ENTEROS sigue siendo contable (periodo)', () => {
  const r = resolverRangoCmv({ desde: '2026-07-01', hasta: '2026-08-31' })
  assert.equal(r.modo, 'periodo')
  assert.equal(r.campoPago, 'periodo')
  assert.equal(r.pagoDesde.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(r.pagoHasta.toISOString(), '2026-08-31T23:59:59.999Z')
})

test('los parametros de mes ganan sobre desde/hasta: siguen por periodo', () => {
  const r = resolverRangoCmv({ mes: '2026-07', desde: '2026-07-04', hasta: '2026-07-10' })
  assert.equal(r.modo, 'periodo')
  assert.equal(r.mesDesde, '2026-07')
})

test('un rango de dias dentro de un mes da exactamente ese mes', () => {
  // El caso que reportó el usuario: poner 01/07 a 31/07 en las fechas tiene que
  // dar lo mismo que elegir el período julio.
  const porDias = resolverRangoCmv({ desde: '2026-07-01', hasta: '2026-07-31' })
  const porMes  = resolverRangoCmv({ mes: '2026-07' })
  assert.equal(porDias.campoPago, porMes.campoPago)
  assert.equal(porDias.pagoDesde.toISOString(), porMes.pagoDesde.toISOString())
  assert.equal(porDias.pagoHasta.toISOString(), porMes.pagoHasta.toISOString())
  assert.equal(porDias.ventasDesde.toISOString(), porMes.ventasDesde.toISOString())
  assert.equal(porDias.ventasHasta.toISOString(), porMes.ventasHasta.toISOString())
})

test('los meses tienen prioridad sobre el rango de dias si vienen los dos', () => {
  const r = resolverRangoCmv({ mes_desde: '2026-07', mes_hasta: '2026-07', desde: '2026-01-01', hasta: '2026-01-31' })
  assert.equal(r.mesDesde, '2026-07')
  assert.equal(r.pagoDesde.toISOString(), '2026-07-01T00:00:00.000Z')

  const conMesSuelto = resolverRangoCmv({ mes: '2026-07', desde: '2026-01-01', hasta: '2026-01-31' })
  assert.equal(conMesSuelto.pagoDesde.toISOString(), '2026-07-01T00:00:00.000Z')
})

test('rechaza lo que no puede resolver, en vez de devolver un rango silencioso', () => {
  assert.equal(resolverRangoCmv({}), null)
  assert.equal(resolverRangoCmv({ desde: '2026-07-04' }), null)          // falta hasta
  assert.equal(resolverRangoCmv({ hasta: '2026-08-03' }), null)          // falta desde
  assert.equal(resolverRangoCmv({ mes: '2026-13' }), null)               // mes inexistente
  assert.equal(resolverRangoCmv({ mes: '2026-00' }), null)
  assert.equal(resolverRangoCmv({ mes: 'julio' }), null)
  assert.equal(resolverRangoCmv({ mes: '2026-7' }), null)                // sin cero
  assert.equal(resolverRangoCmv({ mes_desde: '2026-7', mes_hasta: '2026-08' }), null)
  assert.equal(resolverRangoCmv({ desde: 'ayer', hasta: 'hoy' }), null)
  assert.equal(resolverRangoCmv(undefined), null)
})

test('un rango invertido no se acepta: daria un total vacio sin explicacion', () => {
  assert.equal(resolverRangoCmv({ mes_desde: '2026-08', mes_hasta: '2026-07' }), null)
  assert.equal(resolverRangoCmv({ desde: '2026-08-03', hasta: '2026-07-04' }), null)
})

test('un rango de dias invertido dentro del mismo mes tampoco pasa', () => {
  // Redondeados los dos al mismo mes el rango sería válido, pero el input está
  // mal y conviene decirlo antes de mostrar un número.
  assert.equal(resolverRangoCmv({ desde: '2026-07-31', hasta: '2026-07-01' }), null)
})
