import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etiquetarSnapshot } from './snapshotLabels.js'

const catalogos = {
  proveedores: new Map([['p1', 'Coca-Cola FEMSA']]),
  rubcats:     new Map([['rc1', 'CMV Bebidas / Gaseosas']]),
  metodos:     new Map([['m1', 'Efectivo']]),
  locales:     new Map([['l1', 'Palermo']]),
}

test('etiquetarSnapshot resuelve los ids a nombres', () => {
  const labels = etiquetarSnapshot(
    { id_proveedor: 'p1', id_rubcat: 'rc1', id_metodo: 'm1', id_local: 'l1', id_tipo: 'A' },
    catalogos
  )
  assert.equal(labels.proveedor, 'Coca-Cola FEMSA')
  assert.equal(labels.rubcat,    'CMV Bebidas / Gaseosas')
  assert.equal(labels.metodo,    'Efectivo')
  assert.equal(labels.local,     'Palermo')
})

test('etiquetarSnapshot marca los ids que ya no existen', () => {
  const labels = etiquetarSnapshot({ id_proveedor: 'borrado', id_rubcat: 'rc1' }, catalogos)
  assert.equal(labels.proveedor, '— (no existe)')
})

test('etiquetarSnapshot deja em-dash si el id es null o falta', () => {
  const labels = etiquetarSnapshot({ id_rubcat: 'rc1' }, catalogos)
  assert.equal(labels.proveedor, '—')
  assert.equal(labels.metodo,    '—')
})

test('etiquetarSnapshot muestra DC_1 y DC_2 como DC (1) y DC (2)', () => {
  assert.equal(etiquetarSnapshot({ id_tipo: 'DC_1' }, catalogos).tipo, 'DC (1)')
  assert.equal(etiquetarSnapshot({ id_tipo: 'DC_2' }, catalogos).tipo, 'DC (2)')
})

test('etiquetarSnapshot deja los demas tipos tal cual', () => {
  assert.equal(etiquetarSnapshot({ id_tipo: 'A' },   catalogos).tipo, 'A')
  assert.equal(etiquetarSnapshot({ id_tipo: 'NCA' }, catalogos).tipo, 'NCA')
  assert.equal(etiquetarSnapshot({ id_tipo: null },  catalogos).tipo, '—')
})

test('etiquetarSnapshot no explota con snapshot vacio', () => {
  const labels = etiquetarSnapshot(null, catalogos)
  assert.equal(labels.proveedor, '—')
  assert.equal(labels.tipo,      '—')
})
