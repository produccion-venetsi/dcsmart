import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { normalizarPassword } from './password.js'

test('normalizarPassword: el espacio que agrega el teclado del celular no cuenta', () => {
  assert.equal(normalizarPassword('Dcauditoria2026! '), 'Dcauditoria2026!')
  assert.equal(normalizarPassword(' Dcauditoria2026!'), 'Dcauditoria2026!')
  assert.equal(normalizarPassword('  Dcauditoria2026!  '), 'Dcauditoria2026!')
})

test('normalizarPassword: una contraseña sin espacios pasa igual', () => {
  assert.equal(normalizarPassword('Dcauditoria2026!'), 'Dcauditoria2026!')
})

test('normalizarPassword: los espacios del medio NO se tocan', () => {
  // Solo molestan los de los extremos: una passphrase con espacios internos
  // sigue siendo valida tal cual.
  assert.equal(normalizarPassword('mi frase con espacios'), 'mi frase con espacios')
})

test('normalizarPassword: no rompe con lo que no es string', () => {
  assert.equal(normalizarPassword(undefined), undefined)
  assert.equal(normalizarPassword(null), null)
  assert.equal(normalizarPassword(12345), 12345)
})

test('normalizarPassword: una contraseña que era solo espacios queda vacia y la valida el llamador', () => {
  // El handler chequea `!password` despues de normalizar, asi que esto termina
  // en un 400 "password requerido" en lugar de hashear espacios.
  assert.equal(normalizarPassword('   '), '')
})

// El punto de todo el cambio: verificar y guardar tienen que normalizar igual,
// si no la contraseña queda inaccesible.
test('normalizarPassword: guardar con espacio y entrar sin el (y viceversa) funciona', async () => {
  const hash = await bcrypt.hash(normalizarPassword('Secreta2026! '), 12)

  assert.equal(await bcrypt.compare(normalizarPassword('Secreta2026!'), hash), true)
  assert.equal(await bcrypt.compare(normalizarPassword('Secreta2026! '), hash), true)
  assert.equal(await bcrypt.compare(normalizarPassword(' Secreta2026!'), hash), true)

  // Y sigue rechazando lo que de verdad esta mal
  assert.equal(await bcrypt.compare(normalizarPassword('Secreta2026'), hash), false)
  assert.equal(await bcrypt.compare(normalizarPassword('secreta2026!'), hash), false)
})
