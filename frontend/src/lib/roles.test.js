import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROLES, ROLES_TODOS, esRolDc, puedeOperar, puedeEditar,
  puedeBorrarPagos, puedeBorrarCajas, puedeCrearCajas,
  esAlcanceGlobal, sinLocalesVeTodos
} from './roles.js'

test('externo edita como admin', () => {
  assert.equal(puedeEditar(ROLES.EXTERNO), true)
  assert.equal(puedeOperar(ROLES.EXTERNO), true)
})

test('externo SI puede borrar pagos y cajas; admin no', () => {
  // Es la unica diferencia entre los dos roles.
  assert.equal(puedeBorrarPagos(ROLES.EXTERNO), true)
  assert.equal(puedeBorrarCajas(ROLES.EXTERNO), true)
  assert.equal(puedeBorrarPagos(ROLES.ADMIN), false)
  assert.equal(puedeBorrarCajas(ROLES.ADMIN), false)
})

test('externo NO es rol interno de DC', () => {
  // No ve el circuito DC ni el historial de actividad: es gente de afuera.
  assert.equal(esRolDc(ROLES.EXTERNO), false)
  assert.equal(esRolDc(ROLES.SUPER), true)
  assert.equal(esRolDc(ROLES.DCSMART), true)
  assert.equal(esRolDc(ROLES.ADMIN), false)
})

test('externo NO tiene alcance global de locales', () => {
  // El bug que esto evita: la pantalla de usuarios lo trataba como
  // super_admin/dcsmart y mostraba "Acceso a todos los grupos y locales",
  // ademas de no dejar limitarlo a locales especificos.
  assert.equal(esAlcanceGlobal(ROLES.EXTERNO), false)
  assert.equal(esAlcanceGlobal(ROLES.ADMIN), false)
  assert.equal(esAlcanceGlobal(ROLES.CAJERO), false)
  assert.equal(esAlcanceGlobal(ROLES.SUPER), true)
  assert.equal(esAlcanceGlobal(ROLES.DCSMART), true)
})

test('externo y admin: sin locales asignados ven todos los del grupo', () => {
  // Espeja ROLES_TODOS_LOS_LOCALES del backend (plugins/appContext.js).
  assert.equal(sinLocalesVeTodos(ROLES.EXTERNO), true)
  assert.equal(sinLocalesVeTodos(ROLES.ADMIN), true)
  // El cajero necesita local asignado si o si.
  assert.equal(sinLocalesVeTodos(ROLES.CAJERO), false)
  assert.equal(sinLocalesVeTodos(ROLES.SUPER), false)
})

test('cajero solo crea cajas, no edita ni borra', () => {
  assert.equal(puedeCrearCajas(ROLES.CAJERO), true)
  assert.equal(puedeEditar(ROLES.CAJERO), false)
  assert.equal(puedeBorrarCajas(ROLES.CAJERO), false)
})

test('super_admin y dcsmart pueden todo', () => {
  for (const rol of [ROLES.SUPER, ROLES.DCSMART]) {
    assert.equal(puedeEditar(rol), true)
    assert.equal(puedeBorrarPagos(rol), true)
    assert.equal(puedeBorrarCajas(rol), true)
    assert.equal(puedeCrearCajas(rol), true)
  }
})

test('un rol desconocido no puede nada', () => {
  // Si aparece un rol nuevo en la base y nadie lo agrego aca, que no herede
  // permisos por accidente.
  for (const fn of [esRolDc, puedeOperar, puedeEditar, puedeBorrarPagos, puedeBorrarCajas, puedeCrearCajas]) {
    assert.equal(fn('rol_que_no_existe'), false)
    assert.equal(fn(undefined), false)
    assert.equal(fn(null), false)
  }
})

test('ROLES_TODOS tiene los cinco roles', () => {
  assert.deepEqual([...ROLES_TODOS].sort(), ['admin', 'cajero', 'dcsmart', 'externo', 'super_admin'])
})
