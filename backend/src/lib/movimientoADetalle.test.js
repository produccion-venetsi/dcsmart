import { test } from 'node:test'
import assert from 'node:assert/strict'
import { movimientoADetalle, NOMBRE_EFECTIVO_INFORMATIVO } from './movimientoADetalle.js'

test('el cobro toma el nombre del metodo', () => {
  assert.deepEqual(
    movimientoADetalle({ tipo: 'COBRO', metodo: 'MP Point' }),
    { tipo: 'cobro', nombre: 'MP Point' }
  )
})

test('el cobro en efectivo queda informativo: ya esta en el campo Efectivo', () => {
  assert.deepEqual(
    movimientoADetalle({ tipo: 'COBRO', metodo: 'Efectivo' }),
    { tipo: 'informativo', nombre: NOMBRE_EFECTIVO_INFORMATIVO }
  )
  // La misma regla que usa el cuadre: matchea por contener "efectivo".
  assert.equal(movimientoADetalle({ tipo: 'COBRO', metodo: 'efectivo ARS' }).tipo, 'informativo')
})

test('un cobro sin metodo no dice "null": queda "Cobro"', () => {
  assert.deepEqual(
    movimientoADetalle({ tipo: 'COBRO', metodo: null }),
    { tipo: 'cobro', nombre: 'Cobro' }
  )
})

test('el gasto lleva el metodo en el nombre, salvo efectivo', () => {
  assert.deepEqual(
    movimientoADetalle({ tipo: 'GASTO', metodo: 'MP QR' }),
    { tipo: 'gasto', nombre: 'Gasto · MP QR' }
  )
  assert.deepEqual(
    movimientoADetalle({ tipo: 'GASTO', metodo: 'Efectivo' }),
    { tipo: 'gasto', nombre: 'Gasto' }
  )
  assert.deepEqual(movimientoADetalle({ tipo: 'EGRESO', metodo: null }), { tipo: 'gasto', nombre: 'Gasto' })
})

test('inicial, retiro y vaciado son informativos con su nombre', () => {
  assert.deepEqual(movimientoADetalle({ tipo: 'INICIAL' }), { tipo: 'informativo', nombre: 'Fondo inicial' })
  assert.deepEqual(movimientoADetalle({ tipo: 'RETIRO' }), { tipo: 'informativo', nombre: 'Retiro' })
  assert.deepEqual(
    movimientoADetalle({ tipo: 'VACIADO', metodo: 'Crédito' }),
    { tipo: 'informativo', nombre: 'Vaciado · Crédito' }
  )
  assert.deepEqual(movimientoADetalle({ tipo: 'VACIADO' }), { tipo: 'informativo', nombre: 'Vaciado' })
})

test('un tipo desconocido cae en informativo, nunca se pierde', () => {
  assert.deepEqual(movimientoADetalle({ tipo: 'INGRESO' }), { tipo: 'informativo', nombre: 'Ingreso' })
  assert.deepEqual(movimientoADetalle({ tipo: 'LO_QUE_SEA' }), { tipo: 'informativo', nombre: 'Ingreso' })
})

// Multi-moneda (DON ALDO): "Efectivo Reales" NO es el efectivo del cajon --
// es un cobro en otra moneda. Tratarlo como efectivo lo hacia desaparecer del
// cuadre: 172 cajas descuadradas por exactamente esa suma.
test('el efectivo en moneda extranjera sigue siendo un cobro', () => {
  assert.deepEqual(
    movimientoADetalle({ tipo: 'COBRO', metodo: 'Efectivo Reales' }),
    { tipo: 'cobro', nombre: 'Efectivo Reales' }
  )
  assert.deepEqual(
    movimientoADetalle({ tipo: 'COBRO', metodo: 'Efectivo dólar' }),
    { tipo: 'cobro', nombre: 'Efectivo dólar' }
  )
})
