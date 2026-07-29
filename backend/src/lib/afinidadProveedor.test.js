import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partirPorAfinidad, TIPOS_LOCAL_VALIDOS } from './afinidadProveedor.js'

const base = { activo: true }

test('sin tipo de local no parte nada', () => {
  for (const t of [undefined, null, '', '   ']) {
    assert.equal(partirPorAfinidad(base, t), null, `deberia ser null para ${JSON.stringify(t)}`)
  }
})

test('un tipo que no existe se ignora en vez de romper', () => {
  assert.equal(partirPorAfinidad(base, 'PANADERIA'), null)
  assert.equal(partirPorAfinidad(base, 'gastronomia'), null)
})

test('parte en afines y resto conservando el where original', () => {
  const r = partirPorAfinidad(base, 'GASTRONOMIA')
  assert.deepEqual(r.afin, {
    activo: true,
    OR: [{ tipos_afines: { has: 'GASTRONOMIA' } }, { es_general: true }]
  })
  assert.deepEqual(r.resto, {
    activo: true,
    NOT: { OR: [{ tipos_afines: { has: 'GASTRONOMIA' } }, { es_general: true }] }
  })
})

test('no pisa un OR que ya traia el where (busqueda por texto)', () => {
  const conBusqueda = {
    activo: true,
    OR: [{ nombre: { contains: 'coca' } }, { cuit: { contains: '30' } }]
  }
  const r = partirPorAfinidad(conBusqueda, 'GASTRONOMIA')
  // El OR del texto tiene que sobrevivir dentro de AND, si no la afinidad
  // ensancharia la busqueda y traeria proveedores que no matchean el texto.
  assert.deepEqual(r.afin, {
    activo: true,
    AND: [
      { OR: conBusqueda.OR },
      { OR: [{ tipos_afines: { has: 'GASTRONOMIA' } }, { es_general: true }] }
    ]
  })
  assert.deepEqual(r.resto, {
    activo: true,
    AND: [
      { OR: conBusqueda.OR },
      { NOT: { OR: [{ tipos_afines: { has: 'GASTRONOMIA' } }, { es_general: true }] } }
    ]
  })
})

test('los cinco tipos del enum son validos', () => {
  assert.deepEqual(
    [...TIPOS_LOCAL_VALIDOS].sort(),
    ['ARQUITECTURA', 'GASTRONOMIA', 'INDUMENTARIA', 'INMOBILIARIO', 'MULTIMEDIA']
  )
  for (const t of TIPOS_LOCAL_VALIDOS) {
    assert.ok(partirPorAfinidad(base, t), `${t} deberia partir`)
  }
})
