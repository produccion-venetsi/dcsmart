import test from 'node:test'
import assert from 'node:assert/strict'
import { puedeAutoRecargar, VENTANA_AUTO_RECARGA_MS, CLAVE_ULTIMO_AUTO } from './autoActualizar.js'

const AHORA = 1_785_000_000_000

test('la primera vez se puede: no hay nada guardado', () => {
  assert.equal(puedeAutoRecargar(AHORA, null), true)
  assert.equal(puedeAutoRecargar(AHORA, undefined), true)
  assert.equal(puedeAutoRecargar(AHORA, ''), true)
})

test('recien recargado NO se vuelve a recargar: eso seria el bucle', () => {
  assert.equal(puedeAutoRecargar(AHORA, String(AHORA)), false)
  assert.equal(puedeAutoRecargar(AHORA + 1000, String(AHORA)), false)
  assert.equal(puedeAutoRecargar(AHORA + VENTANA_AUTO_RECARGA_MS - 1, String(AHORA)), false)
})

test('pasada la ventana se puede de nuevo', () => {
  assert.equal(puedeAutoRecargar(AHORA + VENTANA_AUTO_RECARGA_MS, String(AHORA)), true)
  assert.equal(puedeAutoRecargar(AHORA + VENTANA_AUTO_RECARGA_MS * 10, String(AHORA)), true)
})

test('un valor guardado corrupto no bloquea la actualizacion para siempre', () => {
  assert.equal(puedeAutoRecargar(AHORA, 'anteayer'), true)
  assert.equal(puedeAutoRecargar(AHORA, 'NaN'), true)
  assert.equal(puedeAutoRecargar(AHORA, '0'), true)
  assert.equal(puedeAutoRecargar(AHORA, '-5'), true)
})

test('un timestamp en el futuro (reloj corregido) tampoco bloquea', () => {
  assert.equal(puedeAutoRecargar(AHORA, String(AHORA + 999_999)), true)
})

test('la ventana se puede ajustar', () => {
  assert.equal(puedeAutoRecargar(AHORA + 5000, String(AHORA), 10_000), false)
  assert.equal(puedeAutoRecargar(AHORA + 5000, String(AHORA), 1000), true)
})

test('la clave de sessionStorage no choca con la de los chunks', () => {
  assert.notEqual(CLAVE_ULTIMO_AUTO, 'chunk-reload-at')
})
