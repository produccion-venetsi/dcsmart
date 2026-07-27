import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNroOrd } from './nroOrd.js'

test('parseNroOrd acepta un numero suelto', () => {
  assert.equal(parseNroOrd('101'), 101)
})

test('parseNroOrd acepta el prefijo OP en cualquier forma', () => {
  assert.equal(parseNroOrd('OP-101'), 101)
  assert.equal(parseNroOrd('op-101'), 101)
  assert.equal(parseNroOrd('OP 101'), 101)
  assert.equal(parseNroOrd('op101'), 101)
})

test('parseNroOrd ignora espacios alrededor', () => {
  assert.equal(parseNroOrd('  OP-101  '), 101)
})

test('parseNroOrd devuelve null si no hay numero', () => {
  assert.equal(parseNroOrd(''), null)
  assert.equal(parseNroOrd('   '), null)
  assert.equal(parseNroOrd('coca cola'), null)
  assert.equal(parseNroOrd('OP-'), null)
  assert.equal(parseNroOrd(null), null)
  assert.equal(parseNroOrd(undefined), null)
})
