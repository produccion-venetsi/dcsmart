import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesMetodos } from './metodosSelect.js'

const CATALOGO = [
  { id: 'a', nombre: 'Efectivo' },
  { id: 'b', nombre: 'Transferencia' },
]

test('sin selección devuelve el catálogo tal cual', () => {
  assert.deepEqual(opcionesMetodos(CATALOGO, ''), CATALOGO)
  assert.deepEqual(opcionesMetodos(CATALOGO, null), CATALOGO)
})

test('selección presente en el catálogo no agrega nada', () => {
  assert.deepEqual(opcionesMetodos(CATALOGO, 'b'), CATALOGO)
})

test('selección ausente antepone una option con su nombre', () => {
  const r = opcionesMetodos(CATALOGO, 'x', 'Cheque')
  assert.equal(r.length, 3)
  assert.deepEqual(r[0], { id: 'x', nombre: 'Cheque (inactivo)' })
})

test('selección ausente sin nombre conocido usa un placeholder', () => {
  const r = opcionesMetodos(CATALOGO, 'x')
  assert.equal(r[0].nombre, '(método actual)')
})

test('catálogo vacío o null no rompe', () => {
  assert.deepEqual(opcionesMetodos([], 'x', 'Cheque'), [{ id: 'x', nombre: 'Cheque (inactivo)' }])
  assert.deepEqual(opcionesMetodos(null, ''), [])
})
