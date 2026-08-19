import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeCatalogo } from './catalogos.js'

const errCon = (status) => ({ response: { status } })

test('403 explica que es un problema de permisos', () => {
  const msg = mensajeCatalogo(errCon(403), 'los métodos de pago')
  assert.match(msg, /permiso/)
  assert.match(msg, /métodos de pago/)
})

test('401 habla de sesión expirada', () => {
  assert.match(mensajeCatalogo(errCon(401), 'los métodos de pago'), /sesión/)
})

test('sin response es problema de conexión', () => {
  assert.match(mensajeCatalogo(new Error('Network Error'), 'los métodos de pago'), /conexión/)
  assert.match(mensajeCatalogo(undefined, 'los métodos de pago'), /conexión/)
})

test('otros status muestran el código', () => {
  assert.match(mensajeCatalogo(errCon(500), 'los tipos de detalle'), /500/)
})
