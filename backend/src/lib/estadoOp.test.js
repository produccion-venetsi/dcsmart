import { test } from 'node:test'
import assert from 'node:assert/strict'
import { debeQuedarEnCaja, partirIdsPorEstado } from './estadoOp.js'

test('un pago en CUENTA_CTE pasa a CAJA al pagarse', () => {
  assert.equal(debeQuedarEnCaja('CUENTA_CTE'), true)
})

test('un pago sin estado (null) pasa a CAJA al pagarse', () => {
  assert.equal(debeQuedarEnCaja(null), true)
  assert.equal(debeQuedarEnCaja(undefined), true)
})

test('un pago que ya esta en CAJA sigue en CAJA', () => {
  assert.equal(debeQuedarEnCaja('CAJA'), true)
})

test('los pagos del flujo PDP conservan su estado', () => {
  assert.equal(debeQuedarEnCaja('PDP'), false)
  assert.equal(debeQuedarEnCaja('MP_PDP'), false)
})

test('partirIdsPorEstado separa los dos grupos', () => {
  const pagos = [
    { id: 'a', estado_op: 'CUENTA_CTE' },
    { id: 'b', estado_op: 'PDP' },
    { id: 'c', estado_op: null },
    { id: 'd', estado_op: 'MP_PDP' },
    { id: 'e', estado_op: 'CAJA' },
  ]
  const { idsCaja, idsConservan } = partirIdsPorEstado(pagos)
  assert.deepEqual(idsCaja,     ['a', 'c', 'e'])
  assert.deepEqual(idsConservan, ['b', 'd'])
})

test('partirIdsPorEstado con lista vacia devuelve dos listas vacias', () => {
  assert.deepEqual(partirIdsPorEstado([]), { idsCaja: [], idsConservan: [] })
})
