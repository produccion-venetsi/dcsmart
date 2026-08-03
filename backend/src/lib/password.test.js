import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { normalizarPassword, verificarPassword } from './password.js'

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

// ── hashes anteriores al trim ────────────────────────────────────────────────
//
// El commit que agrego normalizarPassword (de0b793, 31/07/2026) empezo a
// trimear al guardar Y al verificar. Los hashes creados ANTES quedaron con el
// espacio adentro: si el admin pego la contrasena con un espacio al crear el
// usuario, el hash es de " clave " y el login, que ahora trimea, compara
// "clave" y nunca matchea. Esa cuenta queda inaccesible para siempre sin que
// nadie pueda darse cuenta de por que.

test('regresion: un hash guardado CON espacio (previo al trim) no matchea trimeando', async () => {
  // Asi se creaban los hashes antes del fix: sin normalizar.
  const hashViejo = await bcrypt.hash('Secreta2026! ', 12)

  // El login de hoy trimea el input y por eso falla, aunque la persona escriba
  // exactamente la contraseña que le dieron.
  assert.equal(await bcrypt.compare(normalizarPassword('Secreta2026! '), hashViejo), false)
})

test('verificarPassword: el hash nuevo (normalizado) acepta cualquier variante de espacios', async () => {
  const hashNuevo = await bcrypt.hash('Secreta2026!', 12)
  for (const tipeado of ['Secreta2026!', 'Secreta2026! ', ' Secreta2026!']) {
    assert.equal(await verificarPassword(tipeado, hashNuevo), true, `[${tipeado}]`)
  }
})

test('verificarPassword: el hash viejo con espacio acepta que se tipee ese mismo espacio', async () => {
  const hashViejo = await bcrypt.hash('Secreta2026! ', 12)  // guardado sin normalizar

  // Recuperable: llega la contraseña cruda, tal como se hasheó.
  assert.equal(await verificarPassword('Secreta2026! ', hashViejo), true)

  // NO recuperable, y es un límite conocido: el hash tiene el espacio al final y
  // acá se tipea al principio. Reconstruir eso sería probar combinaciones de
  // espacios a ciegas. Estas cuentas se arreglan reseteando la contraseña, que
  // vuelve a guardar el hash normalizado.
  assert.equal(await verificarPassword(' Secreta2026!', hashViejo), false)
})

test('verificarPassword no afloja nada mas: sigue rechazando lo que esta mal', async () => {
  const hash = await bcrypt.hash('Secreta2026!', 12)
  assert.equal(await verificarPassword('Secreta2026',   hash), false)
  assert.equal(await verificarPassword('secreta2026!',  hash), false)
  assert.equal(await verificarPassword('Secreta 2026!', hash), false) // espacio del medio
  assert.equal(await verificarPassword('',              hash), false)
  assert.equal(await verificarPassword('   ',           hash), false)
})

test('verificarPassword no explota con entradas invalidas', async () => {
  const hash = await bcrypt.hash('Secreta2026!', 12)
  assert.equal(await verificarPassword(undefined, hash),  false)
  assert.equal(await verificarPassword(null, hash),       false)
  assert.equal(await verificarPassword(12345, hash),      false)
  assert.equal(await verificarPassword('Secreta2026!', null),      false)
  assert.equal(await verificarPassword('Secreta2026!', ''),        false)
  assert.equal(await verificarPassword('Secreta2026!', 'no-hash'), false)
})
