import test from 'node:test'
import assert from 'node:assert/strict'
import {
  idsDeGrupos, estadoSeleccion, textoSeleccionarTodo, ayudaSeleccionarTodo,
} from './seleccionPdp.js'

// Como llegan los grupos a PdpColumn: agrupados por proveedor, con sus ordenes adentro.
const G = [
  { key: 'prov-1', items: [{ id: 'a' }, { id: 'b' }] },
  { key: 'prov-2', items: [{ id: 'c' }] },
]

test('junta los ids de todos los grupos', () => {
  assert.deepEqual(idsDeGrupos(G), ['a', 'b', 'c'])
})

test('un grupo COLAPSADO igual cuenta', () => {
  // El colapso es solo visual (vive en el estado del componente, no en los datos).
  // Seleccionar solo lo que se ve dejaria afuera filas que el usuario cree incluidas, y al
  // mandar a PDP quedarian ordenes sin mover.
  assert.equal(idsDeGrupos(G).length, 3)
})

test('aguanta grupos vacios, items sin id y nulos', () => {
  assert.deepEqual(idsDeGrupos([{ key: 'x', items: [] }]), [])
  assert.deepEqual(idsDeGrupos([{ key: 'x' }]), [])
  assert.deepEqual(idsDeGrupos([{ key: 'x', items: [{ nombre: 'sin id' }] }]), [])
  assert.deepEqual(idsDeGrupos([]), [])
  assert.deepEqual(idsDeGrupos(null), [])
})

test('un id que es 0 no se pierde', () => {
  // `if (item.id)` habria descartado el 0. Los ids son uuid, pero el descarte silencioso es
  // justo el bug que no se nota hasta que aparece.
  assert.deepEqual(idsDeGrupos([{ items: [{ id: 0 }] }]), [0])
})

// ── estado de la seleccion ──────────────────────────────────────────────────

test('sin nada seleccionado: vacia', () => {
  assert.equal(estadoSeleccion(G, new Set()), 'vacia')
})

test('algunos seleccionados: parcial', () => {
  assert.equal(estadoSeleccion(G, new Set(['a'])), 'parcial')
  assert.equal(estadoSeleccion(G, new Set(['a', 'b'])), 'parcial')
})

test('todos seleccionados: completa', () => {
  assert.equal(estadoSeleccion(G, new Set(['a', 'b', 'c'])), 'completa')
})

test('una columna sin ordenes es vacia, no completa', () => {
  // `every` sobre una lista vacia da true: sin este caso, una columna vacia diria que esta
  // todo seleccionado y el boton ofreceria "Ninguno".
  assert.equal(estadoSeleccion([], new Set()), 'vacia')
  assert.equal(estadoSeleccion([{ items: [] }], new Set(['a'])), 'vacia')
})

test('lo seleccionado de OTRA columna no cuenta', () => {
  // Las dos columnas tienen su propio Set; si se mezclaran, seleccionar en Deuda haria que
  // Pagar dijera "completa".
  assert.equal(estadoSeleccion(G, new Set(['z1', 'z2'])), 'vacia')
})

test('aguanta que no venga el Set', () => {
  assert.equal(estadoSeleccion(G, undefined), 'vacia')
  assert.equal(estadoSeleccion(G, null), 'vacia')
})

// ── el texto del boton ──────────────────────────────────────────────────────

test('el boton ofrece lo contrario de lo que ya esta', () => {
  assert.equal(textoSeleccionarTodo('vacia'), 'Todos')
  assert.equal(textoSeleccionarTodo('parcial'), 'Todos')
  assert.equal(textoSeleccionarTodo('completa'), 'Ninguno')
})

test('la ayuda dice CUANTOS son', () => {
  // "Todos" a secas no aclara si son los 3 que se ven o los 120 que hay con los grupos
  // cerrados.
  assert.match(ayudaSeleccionarTodo(G, 'vacia'), /3 órdenes/)
  assert.match(ayudaSeleccionarTodo(G, 'vacia'), /grupos cerrados/)
  assert.match(ayudaSeleccionarTodo(G, 'completa'), /Deseleccionar las 3/)
})

test('sin ordenes, la ayuda lo dice en vez de hablar de cero', () => {
  assert.equal(ayudaSeleccionarTodo([], 'vacia'), 'No hay órdenes para seleccionar')
})
