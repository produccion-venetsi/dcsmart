import test from 'node:test'
import assert from 'node:assert/strict'
import { wheresDeuda, deudaNeta } from './deuda.js'

test('wheresDeuda: parte el where base en egresos y ingresos impagos', () => {
  const base = { id_local: { in: ['L1'] } }
  const { egresos, ingresos } = wheresDeuda(base)

  assert.deepEqual(egresos,  { id_local: { in: ['L1'] }, pagado: false, ingresa_egreso: false })
  assert.deepEqual(ingresos, { id_local: { in: ['L1'] }, pagado: false, ingresa_egreso: true })
})

test('wheresDeuda: no muta el where base', () => {
  const base = { id_local: { in: ['L1'] } }
  wheresDeuda(base)
  assert.deepEqual(base, { id_local: { in: ['L1'] } })
})

test('wheresDeuda: pisa pagado e ingresa_egreso si venian en el where base', () => {
  // El filtro de la pantalla puede traer pagado/ingresa_egreso elegidos por el
  // usuario, pero la deuda es por definicion lo impago: manda la deuda.
  const base = { pagado: true, ingresa_egreso: true, id_local: { in: ['L1'] } }
  const { egresos, ingresos } = wheresDeuda(base)

  assert.equal(egresos.pagado, false)
  assert.equal(egresos.ingresa_egreso, false)
  assert.equal(ingresos.pagado, false)
  assert.equal(ingresos.ingresa_egreso, true)
})

test('wheresDeuda: un where base vacio da los dos where minimos', () => {
  const { egresos, ingresos } = wheresDeuda({})
  assert.deepEqual(egresos,  { pagado: false, ingresa_egreso: false })
  assert.deepEqual(ingresos, { pagado: false, ingresa_egreso: true })
})

test('deudaNeta: egresos menos ingresos', () => {
  assert.equal(deudaNeta(1000, 300), 700)
})

test('deudaNeta: una nota de credito cargada como ingreso reduce la deuda', () => {
  // El caso que reporto Anaxi: la NC entra como ingreso y tiene que restar.
  assert.equal(deudaNeta(148883513, 3570484.74), 145313028.26)
})

test('deudaNeta: sin ingresos la deuda es el total de egresos', () => {
  assert.equal(deudaNeta(1000, 0), 1000)
})

test('deudaNeta: puede dar negativo si hay mas notas de credito que facturas', () => {
  // A favor del local. No se recorta a cero: un cero esconderia el saldo real.
  assert.equal(deudaNeta(100, 350), -250)
})

test('deudaNeta: trata null, undefined y Decimal como numero', () => {
  assert.equal(deudaNeta(null, undefined), 0)
  assert.equal(deudaNeta('1000.50', '0.50'), 1000)
})
