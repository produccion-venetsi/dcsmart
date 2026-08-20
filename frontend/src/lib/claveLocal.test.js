import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveLocal } from './claveLocal.js'

test('devuelve una clave distinta cada vez', () => {
  const claves = new Set(Array.from({ length: 500 }, () => claveLocal()))
  assert.equal(claves.size, 500)
})

// El caso que rompia en el celular: Safari iOS < 15.4 y los contextos no
// seguros no tienen crypto.randomUUID, y tocar "Agregar" tiraba TypeError.
// `globalThis.crypto` en Node es un getter de solo lectura: se reemplaza con
// defineProperty y se restaura el descriptor original.
function sinRandomUUID(reemplazo, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', { value: reemplazo, configurable: true, writable: true })
  try { fn() } finally { Object.defineProperty(globalThis, 'crypto', original) }
}

test('sigue funcionando sin crypto.randomUUID', () => {
  sinRandomUUID({}, () => { // objeto crypto sin randomUUID, como el Safari viejo
    const claves = new Set(Array.from({ length: 200 }, () => claveLocal()))
    assert.equal(claves.size, 200)
    assert.ok(claves.values().next().value.startsWith('tmp-'))
  })
})

test('sigue funcionando sin objeto crypto', () => {
  sinRandomUUID(undefined, () => {
    assert.ok(claveLocal().startsWith('tmp-'))
  })
})
