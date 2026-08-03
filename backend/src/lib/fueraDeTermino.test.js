import test from 'node:test'
import assert from 'node:assert/strict'
import { esFueraDeTermino } from './fueraDeTermino.js'

test('esFueraDeTermino: cargada en agosto con periodo de junio esta fuera de termino', () => {
  assert.equal(esFueraDeTermino('2026-06-01', '2026-08-05'), true)
})

test('esFueraDeTermino: cargada en el mismo mes del periodo esta en termino', () => {
  assert.equal(esFueraDeTermino('2026-08-01', '2026-08-05'), false)
})

test('esFueraDeTermino: cargada el ultimo dia del mes del periodo sigue en termino', () => {
  assert.equal(esFueraDeTermino('2026-08-01', '2026-08-31'), false)
})

test('esFueraDeTermino: cargada el primer dia del mes siguiente ya esta fuera', () => {
  // Es el criterio de Anaxi: la factura pertenece a un mes que ya se reporto.
  assert.equal(esFueraDeTermino('2026-07-01', '2026-08-01'), true)
})

test('esFueraDeTermino: el dia del periodo no importa, solo el mes', () => {
  // 97,8% de los pagos con periodo tienen dia 1, pero no todos.
  assert.equal(esFueraDeTermino('2026-07-15', '2026-08-01'), true)
  assert.equal(esFueraDeTermino('2026-08-31', '2026-08-01'), false)
})

test('esFueraDeTermino: cruza bien el fin de año', () => {
  assert.equal(esFueraDeTermino('2025-12-01', '2026-01-03'), true)
  assert.equal(esFueraDeTermino('2026-01-01', '2026-01-03'), false)
})

test('esFueraDeTermino: un periodo futuro no esta fuera de termino', () => {
  // Raro, pero no es el problema que este reporte busca.
  assert.equal(esFueraDeTermino('2026-09-01', '2026-08-05'), false)
})

test('esFueraDeTermino: cargado de noche el ultimo dia del mes NO cuenta como atrasado', () => {
  // 31/08 22hs de Argentina son las 01:00 UTC del 01/09. Sin corregir la zona
  // esta factura de agosto quedaria marcada como fuera de termino sin serlo.
  assert.equal(esFueraDeTermino('2026-08-01', '2026-09-01T01:00:00.000Z'), false)
  // Y a las 03:00 UTC del 01/09 ya es medianoche en Argentina: septiembre.
  assert.equal(esFueraDeTermino('2026-08-01', '2026-09-01T03:00:00.000Z'), true)
})

test('esFueraDeTermino: sin periodo no se puede decir nada', () => {
  assert.equal(esFueraDeTermino(null, '2026-08-05'), false)
  assert.equal(esFueraDeTermino(undefined, '2026-08-05'), false)
})

test('esFueraDeTermino: acepta Date y string ISO, no solo el string del input', () => {
  assert.equal(esFueraDeTermino(new Date('2026-06-01T00:00:00Z'), new Date('2026-08-05T12:00:00Z')), true)
  assert.equal(esFueraDeTermino('2026-06-01T00:00:00.000Z', '2026-08-05T15:30:00.000Z'), true)
})

test('esFueraDeTermino: un valor que no es fecha no rompe ni afirma nada', () => {
  assert.equal(esFueraDeTermino('cualquiera', '2026-08-05'), false)
  assert.equal(esFueraDeTermino('2026-06-01', 'cualquiera'), false)
})
