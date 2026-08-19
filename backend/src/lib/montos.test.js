import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMonto, parseEntero } from './montos.js'

// ── parseMonto ────────────────────────────────────────────────────────────

test('vacío opcional devuelve null', () => {
  for (const v of [undefined, null, '']) {
    assert.deepEqual(parseMonto(v), { ok: true, value: null })
  }
})

test('vacío requerido es error', () => {
  for (const v of [undefined, null, '']) {
    assert.equal(parseMonto(v, { requerido: true }).ok, false)
  }
})

test('cero es un valor válido, no un vacío', () => {
  assert.deepEqual(parseMonto(0), { ok: true, value: 0 })
  assert.deepEqual(parseMonto('0'), { ok: true, value: 0 })
  assert.deepEqual(parseMonto(0, { requerido: true }), { ok: true, value: 0 })
})

test('números y strings numéricos', () => {
  assert.deepEqual(parseMonto(1234.56), { ok: true, value: 1234.56 })
  assert.deepEqual(parseMonto('1234.56'), { ok: true, value: 1234.56 })
})

test('no numérico es error, nunca NaN', () => {
  for (const v of ['abc', '12abc no', {}, [], true, NaN]) {
    const r = parseMonto(v)
    assert.equal(r.ok, false, `esperaba error para ${JSON.stringify(v)}`)
    assert.ok(r.error)
  }
})

test('Infinity y magnitudes absurdas son error', () => {
  assert.equal(parseMonto(Infinity).ok, false)
  assert.equal(parseMonto(-Infinity).ok, false)
  assert.equal(parseMonto(1e13).ok, false)
  assert.equal(parseMonto(-1e13).ok, false)
})

test('negativos: permitidos por defecto, rechazables con positivo', () => {
  assert.deepEqual(parseMonto(-50), { ok: true, value: -50 })
  assert.equal(parseMonto(-50, { positivo: true }).ok, false)
  assert.equal(parseMonto('-0.01', { positivo: true }).ok, false)
  // positivo admite cero: la regla es "sin negativos", no "mayor a cero"
  assert.deepEqual(parseMonto(0, { positivo: true }), { ok: true, value: 0 })
})

// ── parseEntero ───────────────────────────────────────────────────────────

test('entero: vacío opcional devuelve null', () => {
  for (const v of [undefined, null, '']) {
    assert.deepEqual(parseEntero(v), { ok: true, value: null })
  }
})

test('entero: cero es válido', () => {
  assert.deepEqual(parseEntero(0), { ok: true, value: 0 })
  assert.deepEqual(parseEntero('0'), { ok: true, value: 0 })
})

test('entero: trunca decimales como parseInt', () => {
  assert.deepEqual(parseEntero('7.9'), { ok: true, value: 7 })
})

test('entero: no numérico es error, nunca "NaN"', () => {
  for (const v of ['abc', {}, NaN]) {
    assert.equal(parseEntero(v).ok, false)
  }
})

test('entero requerido: vacío es error', () => {
  assert.equal(parseEntero('', { requerido: true }).ok, false)
})
