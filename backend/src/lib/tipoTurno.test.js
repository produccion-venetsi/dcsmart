import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTipoTurnoEnum, fromTipoTurnoEnum, toTipoTurnoEnumList } from './tipoTurno.js'

test('toTipoTurnoEnum: etiqueta visible a clave del enum', () => {
  assert.equal(toTipoTurnoEnum('Mañana'), 'MANANA')
  assert.equal(toTipoTurnoEnum('Trasnoche'), 'TRASNOCHE')
})

test('toTipoTurnoEnum: vacío devuelve null', () => {
  assert.equal(toTipoTurnoEnum(''), null)
  assert.equal(toTipoTurnoEnum(undefined), null)
})

test('toTipoTurnoEnum: valor desconocido pasa tal cual', () => {
  assert.equal(toTipoTurnoEnum('MANANA'), 'MANANA')
  assert.equal(toTipoTurnoEnum('Cualquiera'), 'Cualquiera')
})

test('fromTipoTurnoEnum: clave del enum a etiqueta visible', () => {
  assert.equal(fromTipoTurnoEnum('NOCHE'), 'Noche')
  assert.equal(fromTipoTurnoEnum(null), null)
})

test('toTipoTurnoEnumList: convierte la lista y descarta vacíos', () => {
  assert.deepEqual(toTipoTurnoEnumList(['Mañana', 'Noche']), ['MANANA', 'NOCHE'])
  assert.deepEqual(toTipoTurnoEnumList([]), [])
  assert.deepEqual(toTipoTurnoEnumList(undefined), [])
})
