import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRangosFecha, whereRangosFecha } from './rangosFecha.js'

test('parseRangosFecha: un solo rango sigue funcionando igual que antes', () => {
  assert.deepEqual(
    parseRangosFecha('fecha', '2026-07-01', '2026-07-31'),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }]
  )
})

test('parseRangosFecha: sin campo_fecha cae a fecha', () => {
  assert.deepEqual(
    parseRangosFecha(undefined, '2026-07-01', '2026-07-31'),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }]
  )
})

test('parseRangosFecha: dos rangos posicionales', () => {
  assert.deepEqual(
    parseRangosFecha('fecha,periodo', '2026-07-01,2026-06-01', '2026-07-31,2026-06-30'),
    [
      { campo: 'fecha',   desde: '2026-07-01', hasta: '2026-07-31' },
      { campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }
    ]
  )
})

test('parseRangosFecha: un rango con solo desde y otro con solo hasta', () => {
  assert.deepEqual(
    parseRangosFecha('fecha,periodo', '2026-07-01,', ',2026-06-30'),
    [
      { campo: 'fecha',   desde: '2026-07-01', hasta: null },
      { campo: 'periodo', desde: null,         hasta: '2026-06-30' }
    ]
  )
})

test('parseRangosFecha: un campo que no esta en la whitelist cae a fecha', () => {
  // Nunca se interpola un valor arbitrario como key de Prisma.
  assert.deepEqual(
    parseRangosFecha('id_local', '2026-07-01', '2026-07-31'),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }]
  )
})

test('parseRangosFecha: descarta los rangos sin ninguna fecha', () => {
  assert.deepEqual(parseRangosFecha('fecha,periodo', '2026-07-01,', '2026-07-31,'), [
    { campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }
  ])
})

test('parseRangosFecha: sin fechas devuelve lista vacia', () => {
  assert.deepEqual(parseRangosFecha('fecha', undefined, undefined), [])
  assert.deepEqual(parseRangosFecha(undefined, '', ''), [])
})

test('whereRangosFecha: sin rangos no filtra nada', () => {
  assert.deepEqual(whereRangosFecha([]), {})
})

test('whereRangosFecha: un rango va como clave suelta, sin AND', () => {
  const w = whereRangosFecha([{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }])
  assert.deepEqual(Object.keys(w), ['fecha'])
  assert.equal(w.fecha.gte.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(w.fecha.lte.toISOString(), '2026-07-31T23:59:59.999Z')
})

test('whereRangosFecha: dos rangos se combinan con AND', () => {
  const w = whereRangosFecha([
    { campo: 'fecha',   desde: '2026-07-01', hasta: '2026-07-31' },
    { campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }
  ])
  assert.deepEqual(Object.keys(w), ['AND'])
  assert.equal(w.AND.length, 2)
  assert.equal(w.AND[0].fecha.gte.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(w.AND[1].periodo.lte.toISOString(), '2026-06-30T23:59:59.999Z')
})

test('whereRangosFecha: dos rangos sobre el MISMO campo no se pisan', () => {
  // Por esto hace falta AND y no se puede usar una clave por campo.
  const w = whereRangosFecha([
    { campo: 'fecha', desde: '2026-01-01', hasta: '2026-12-31' },
    { campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }
  ])
  assert.equal(w.AND.length, 2)
})

test('whereRangosFecha: fecha_pago y created_at usan hora de Argentina', () => {
  // Son instantes reales: sin el offset, lo cargado de noche (21-24hs ART)
  // cae en el dia UTC siguiente y el filtro se corre un dia.
  const w = whereRangosFecha([{ campo: 'fecha_pago', desde: '2026-07-01', hasta: '2026-07-01' }])
  assert.equal(w.fecha_pago.gte.toISOString(), '2026-07-01T03:00:00.000Z')
  assert.equal(w.fecha_pago.lte.toISOString(), '2026-07-02T02:59:59.999Z')

  const w2 = whereRangosFecha([{ campo: 'created_at', desde: '2026-07-01', hasta: '2026-07-01' }])
  assert.equal(w2.created_at.gte.toISOString(), '2026-07-01T03:00:00.000Z')
})

test('whereRangosFecha: periodo y cashflow son dias calendario en UTC', () => {
  const w = whereRangosFecha([{ campo: 'periodo', desde: '2026-07-01', hasta: '2026-07-01' }])
  assert.equal(w.periodo.gte.toISOString(), '2026-07-01T00:00:00.000Z')

  const w2 = whereRangosFecha([{ campo: 'cashflow', desde: '2026-07-01', hasta: '2026-07-01' }])
  assert.equal(w2.cashflow.gte.toISOString(), '2026-07-01T00:00:00.000Z')
})

test('whereRangosFecha: un rango con solo desde no pone lte', () => {
  const w = whereRangosFecha([{ campo: 'fecha', desde: '2026-07-01', hasta: null }])
  assert.deepEqual(Object.keys(w.fecha), ['gte'])
})
