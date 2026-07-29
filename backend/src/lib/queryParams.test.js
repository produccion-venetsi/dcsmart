import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsvParam } from './queryParams.js'

test('parseCsvParam: sin valor devuelve lista vacía', () => {
  assert.deepEqual(parseCsvParam(undefined), [])
  assert.deepEqual(parseCsvParam(null), [])
  assert.deepEqual(parseCsvParam(''), [])
})

test('parseCsvParam: un solo valor sigue funcionando igual que antes', () => {
  assert.deepEqual(parseCsvParam('Mañana'), ['Mañana'])
})

test('parseCsvParam: varios valores separados por coma', () => {
  assert.deepEqual(parseCsvParam('Mañana,Noche'), ['Mañana', 'Noche'])
})

test('parseCsvParam: descarta segmentos vacíos y espacios sobrantes', () => {
  assert.deepEqual(parseCsvParam('a,,b, c ,'), ['a', 'b', 'c'])
})
