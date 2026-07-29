import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarUrl, validarMail } from './localFicha.js'

test('normalizarUrl deja null lo vacio', () => {
  for (const v of ['', '   ', null, undefined]) {
    assert.deepEqual(normalizarUrl(v), { ok: true, value: null })
  }
})

test('normalizarUrl prefija https cuando falta el esquema', () => {
  assert.deepEqual(
    normalizarUrl('maps.google.com/?q=878'),
    { ok: true, value: 'https://maps.google.com/?q=878' }
  )
})

test('normalizarUrl respeta http y https', () => {
  assert.equal(normalizarUrl('https://a.com/x').value, 'https://a.com/x')
  assert.equal(normalizarUrl('http://a.com/x').value,  'http://a.com/x')
})

test('normalizarUrl recorta espacios', () => {
  assert.equal(normalizarUrl('  https://a.com  ').value, 'https://a.com/')
})

test('normalizarUrl rechaza esquemas peligrosos', () => {
  for (const v of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
    assert.equal(normalizarUrl(v).ok, false, `deberia rechazar ${v}`)
  }
})

test('normalizarUrl rechaza basura sin host', () => {
  assert.equal(normalizarUrl('no es una url').ok, false)
})

test('validarMail deja null lo vacio', () => {
  assert.deepEqual(validarMail('  '), { ok: true, value: null })
})

test('validarMail acepta un mail normal y lo normaliza', () => {
  assert.deepEqual(
    validarMail('  Facturas@Local.COM '),
    { ok: true, value: 'facturas@local.com' }
  )
})

test('validarMail rechaza lo que no es mail', () => {
  for (const v of ['facturas', 'facturas@', '@local.com', 'a b@local.com']) {
    assert.equal(validarMail(v).ok, false, `deberia rechazar ${v}`)
  }
})
