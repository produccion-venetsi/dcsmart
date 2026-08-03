import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROLES, ROLES_TODOS, esRolDc, puedeOperar, puedeEditar,
  puedeBorrarPagos, puedeBorrarCajas, puedeCrearCajas
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
