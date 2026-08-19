import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIAS, GRUPOS, categoria, labelCategoria, claseCategoria, grupoDe } from './categoriasLinea.js'

test('todas las categorias tienen etiqueta en castellano y ayuda', () => {
  for (const c of CATEGORIAS) {
    assert.ok(c.label?.length > 0, `${c.id} sin label`)
    assert.ok(c.ayuda?.length > 20, `${c.id} sin ayuda util`)
    // La etiqueta es lo que ve el usuario: nunca el nombre técnico.
    assert.notEqual(c.label, c.id)
  }
})

test('solo cobro y fiado suman a la venta', () => {
  const suman = CATEGORIAS.filter((c) => c.suma === 'venta').map((c) => c.id)
  assert.deepEqual(suman.sort(), ['COBRO', 'FIADO'])
})

test('lo informativo no suma en ninguna cuenta', () => {
  for (const id of ['INFORMATIVO', 'DIFERENCIA']) {
    assert.equal(categoria(id).suma, 'ninguna')
  }
})

test('los gastos y retiros se ven como salida de plata', () => {
  for (const id of ['GASTO', 'RETIRO', 'VACIADO']) {
    assert.equal(claseCategoria(id), 'badge-red')
  }
})

test('el fiado se distingue del cobro a la vista', () => {
  assert.notEqual(claseCategoria('FIADO'), claseCategoria('COBRO'))
})

test('cada categoria cae en uno de los tres grupos', () => {
  const ids = GRUPOS.map((g) => g.id)
  for (const c of CATEGORIAS) assert.ok(ids.includes(c.grupo), `${c.id} en grupo desconocido`)
})

test('una categoria desconocida no rompe la pantalla', () => {
  assert.equal(categoria('INVENTADA'), null)
  assert.equal(labelCategoria('INVENTADA'), 'INVENTADA')
  assert.equal(labelCategoria(null), '—')
  assert.equal(claseCategoria('INVENTADA'), 'badge-muted')
  assert.equal(grupoDe('INVENTADA'), 'info')
})
