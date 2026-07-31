import { test } from 'node:test'
import assert from 'node:assert/strict'
import { multiParam, normalizarMulti, normalizarRangos, resumenSeleccion } from './filtros.js'

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

test('normalizarRangos: el formato viejo de un solo rango se convierte en una fila', () => {
  assert.deepEqual(
    normalizarRangos({ campo_fecha: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }),
    [{ campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }]
  )
})

test('normalizarRangos: formato viejo sin campo_fecha asume fecha', () => {
  assert.deepEqual(
    normalizarRangos({ desde: '2026-07-01', hasta: '2026-07-31' }),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }]
  )
})

test('normalizarRangos: el formato nuevo pasa igual', () => {
  const rangos = [
    { campo: 'fecha',   desde: '2026-07-01', hasta: '2026-07-31' },
    { campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }
  ]
  assert.deepEqual(normalizarRangos({ rangos_fecha: rangos }), rangos)
})

test('normalizarRangos: descarta las filas sin ninguna fecha', () => {
  assert.deepEqual(
    normalizarRangos({ rangos_fecha: [
      { campo: 'fecha',   desde: '2026-07-01', hasta: '' },
      { campo: 'periodo', desde: '',           hasta: '' }
    ] }),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '' }]
  )
})

test('normalizarRangos: un preset viejo sin ninguna fecha da lista vacia', () => {
  assert.deepEqual(normalizarRangos({ campo_fecha: 'fecha', desde: '', hasta: '' }), [])
})

test('normalizarRangos: vacio, null y ausente dan lista vacia', () => {
  assert.deepEqual(normalizarRangos({}), [])
  assert.deepEqual(normalizarRangos(null), [])
  assert.deepEqual(normalizarRangos(undefined), [])
})

test('normalizarRangos: el formato nuevo gana si por algun motivo estan los dos', () => {
  assert.deepEqual(
    normalizarRangos({
      rangos_fecha: [{ campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }],
      campo_fecha: 'fecha', desde: '2026-07-01', hasta: '2026-07-31'
    }),
    [{ campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }]
  )
})
