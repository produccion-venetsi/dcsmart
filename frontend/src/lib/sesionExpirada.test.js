import test from 'node:test'
import assert from 'node:assert/strict'
import { esSesionExpirada } from './sesionExpirada.js'

// El bug que arregla esto: el interceptor de axios expulsaba y recargaba la
// pagina ante CUALQUIER 401, incluido el del propio login. La recarga borraba
// el estado de React y con el el mensaje "Email o contraseña incorrectos", asi
// que un login fallido se veia como un formulario que se limpia solo.

test('un 401 en el login NO es sesion expirada: hay que mostrar el error', () => {
  assert.equal(esSesionExpirada(401, '/auth/login'), false)
})

test('un 401 en el login con Google tampoco expulsa', () => {
  assert.equal(esSesionExpirada(401, '/auth/google'), false)
})

test('un 401 en una ruta autenticada SI es sesion expirada', () => {
  assert.equal(esSesionExpirada(401, '/pagos'), true)
  assert.equal(esSesionExpirada(401, '/auth/me'), true)
  assert.equal(esSesionExpirada(401, '/reportes/pagos'), true)
})

test('otros codigos nunca expulsan', () => {
  assert.equal(esSesionExpirada(403, '/pagos'), false)
  assert.equal(esSesionExpirada(500, '/auth/login'), false)
  assert.equal(esSesionExpirada(200, '/pagos'), false)
})

test('tolera url ausente o rara sin romper', () => {
  assert.equal(esSesionExpirada(401, undefined), true)
  assert.equal(esSesionExpirada(401, ''), true)
  assert.equal(esSesionExpirada(undefined, '/auth/login'), false)
})

test('matchea aunque la url venga absoluta o con querystring', () => {
  assert.equal(esSesionExpirada(401, 'https://gestion.dcsmart.app/api/auth/login'), false)
  assert.equal(esSesionExpirada(401, '/auth/login?x=1'), false)
})

test('no confunde una ruta que apenas contiene el texto', () => {
  // /auth/login-historial es una ruta autenticada distinta: debe expulsar
  assert.equal(esSesionExpirada(401, '/auth/login-historial'), true)
})
