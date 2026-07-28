import { test } from 'node:test'
import assert from 'node:assert/strict'
import { multiParam, normalizarMulti, resumenSeleccion } from './filtros.js'

const TURNOS = [
  { value: 'Mañana', label: 'Mañana' },
  { value: 'Noche',  label: 'Noche' },
]

test('multiParam: arma el CSV con los values', () => {
  assert.equal(multiParam([{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }]), 'A,B')
  assert.equal(multiParam([]), '')
  assert.equal(multiParam(undefined), '')
})

test('normalizarMulti: string suelto de un preset viejo', () => {
  assert.deepEqual(normalizarMulti('Mañana', TURNOS), [{ value: 'Mañana', label: 'Mañana' }])
})

test('normalizarMulti: array de ids resuelve labels contra las opciones', () => {
  assert.deepEqual(
    normalizarMulti(['Noche'], TURNOS),
    [{ value: 'Noche', label: 'Noche' }]
  )
})

test('normalizarMulti: id sin opción conocida usa el value como label', () => {
  assert.deepEqual(normalizarMulti(['zzz'], TURNOS), [{ value: 'zzz', label: 'zzz' }])
})

test('normalizarMulti: formato viejo de proveedores {id, nombre}', () => {
  assert.deepEqual(
    normalizarMulti([{ id: 'u1', nombre: 'Coca' }]),
    [{ value: 'u1', label: 'Coca' }]
  )
})

test('normalizarMulti: el formato nuevo pasa igual', () => {
  assert.deepEqual(
    normalizarMulti([{ value: 'A', label: 'A' }]),
    [{ value: 'A', label: 'A' }]
  )
})

test('normalizarMulti: vacío, null y ausente dan lista vacía', () => {
  assert.deepEqual(normalizarMulti(undefined), [])
  assert.deepEqual(normalizarMulti(null), [])
  assert.deepEqual(normalizarMulti(''), [])
  assert.deepEqual(normalizarMulti([]), [])
})

test('resumenSeleccion: sin selección muestra el placeholder', () => {
  assert.equal(resumenSeleccion([], 'Todos los turnos'), 'Todos los turnos')
})

test('resumenSeleccion: hasta el máximo lista los labels', () => {
  assert.equal(resumenSeleccion(TURNOS, 'Todos'), 'Mañana, Noche')
})

test('resumenSeleccion: pasado el máximo agrega el contador', () => {
  const cuatro = ['Mañana', 'Noche', 'Tarde', 'Evento'].map(v => ({ value: v, label: v }))
  assert.equal(resumenSeleccion(cuatro, 'Todos'), 'Mañana, Noche +2')
})
