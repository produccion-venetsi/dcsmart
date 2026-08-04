import test from 'node:test'
import assert from 'node:assert/strict'
import { conTipoElegido } from './detalleForm.js'

const TIPOS = [
  { id: 't1', nombre: 'Mostrador', clasificacion: 'informativo' },
  { id: 't2', nombre: 'MP QR', clasificacion: 'cobro' },
  { id: 't3', nombre: 'Gastos', clasificacion: 'egreso' },
]

test('elegir un tipo NO cambia la clasificación que puso el usuario', () => {
  // El caso que el usuario pidió explícitamente: "Mostrador" es informativo en el
  // catálogo, pero si la persona eligió cobro, queda cobro.
  const form = { clasificacion: 'cobro', id_tipo: '', nombre: '', monto: '100' }
  const r = conTipoElegido(form, TIPOS, 't1', 'Mostrador')
  assert.equal(r.clasificacion, 'cobro')
  assert.equal(r.id_tipo, 't1')
  assert.equal(r.nombre, 'Mostrador')
})

test('tampoco la cambia con un tipo de clasificación distinta', () => {
  for (const t of TIPOS) {
    const r = conTipoElegido({ clasificacion: 'informativo' }, TIPOS, t.id, t.nombre)
    assert.equal(r.clasificacion, 'informativo', `${t.nombre} pisó la clasificación`)
  }
})

test('un nombre libre (sin tipo) conserva la clasificación elegida', () => {
  const r = conTipoElegido({ clasificacion: 'gasto', id_tipo: 't2', nombre: 'MP QR' }, TIPOS, null, 'Algo nuevo')
  assert.equal(r.clasificacion, 'gasto')
  assert.equal(r.id_tipo, null)
  assert.equal(r.nombre, 'Algo nuevo')
})

test('no inventa una clasificación cuando el formulario todavía no tiene una', () => {
  const r = conTipoElegido({ id_tipo: '', nombre: '' }, TIPOS, 't1', 'Mostrador')
  assert.equal(r.clasificacion, undefined)
})

test('preserva el resto de los campos del formulario', () => {
  const form = { clasificacion: 'cobro', id_tipo: '', nombre: '', monto: '250.50', observaciones: 'sobre 3' }
  const r = conTipoElegido(form, TIPOS, 't2', 'MP QR')
  assert.equal(r.monto, '250.50')
  assert.equal(r.observaciones, 'sobre 3')
})

test('no muta el formulario original', () => {
  const form = { clasificacion: 'cobro', id_tipo: '', nombre: '' }
  conTipoElegido(form, TIPOS, 't1', 'Mostrador')
  assert.deepEqual(form, { clasificacion: 'cobro', id_tipo: '', nombre: '' })
})

test('un tipo que no está en la lista tampoco rompe', () => {
  const r = conTipoElegido({ clasificacion: 'cobro' }, TIPOS, 'inexistente', 'X')
  assert.equal(r.clasificacion, 'cobro')
  assert.equal(r.id_tipo, 'inexistente')
})
