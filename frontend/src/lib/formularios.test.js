import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esEnterDeSubForm, enterEjecuta } from './formularios.js'

test('Enter en input o select se intercepta', () => {
  assert.equal(esEnterDeSubForm('Enter', 'INPUT'), true)
  assert.equal(esEnterDeSubForm('Enter', 'SELECT'), true)
})

test('Enter en textarea o botón no se toca', () => {
  assert.equal(esEnterDeSubForm('Enter', 'TEXTAREA'), false)
  assert.equal(esEnterDeSubForm('Enter', 'BUTTON'), false)
})

test('otras teclas no se tocan', () => {
  assert.equal(esEnterDeSubForm('a', 'INPUT'), false)
  assert.equal(esEnterDeSubForm('Escape', 'SELECT'), false)
})

test('enterEjecuta previene el default y ejecuta la acción', () => {
  let ejecutado = false, prevenido = false
  const handler = enterEjecuta(() => { ejecutado = true })
  handler({ key: 'Enter', target: { tagName: 'INPUT' }, preventDefault: () => { prevenido = true } })
  assert.equal(ejecutado, true)
  assert.equal(prevenido, true)
})

test('enterEjecuta deja pasar el resto', () => {
  let ejecutado = false
  const handler = enterEjecuta(() => { ejecutado = true })
  handler({ key: 'Enter', target: { tagName: 'TEXTAREA' }, preventDefault: () => {} })
  handler({ key: 'x', target: { tagName: 'INPUT' }, preventDefault: () => {} })
  assert.equal(ejecutado, false)
})
