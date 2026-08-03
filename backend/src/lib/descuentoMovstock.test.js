import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DESCUENTO_MOVSTOCK_DEFAULT, validarPorcentaje, porcentajeDelLocal, calcularDescuento
} from './descuentoMovstock.js'

// ── validarPorcentaje ───────────────────────────────────────────────────────

test('validarPorcentaje: acepta un porcentaje normal', () => {
  assert.deepEqual(validarPorcentaje(30), { ok: true, value: 30 })
  assert.deepEqual(validarPorcentaje('25'), { ok: true, value: 25 })
})

test('validarPorcentaje: acepta decimales y redondea a dos', () => {
  assert.deepEqual(validarPorcentaje(12.5), { ok: true, value: 12.5 })
  assert.deepEqual(validarPorcentaje(33.333333), { ok: true, value: 33.33 })
})

test('validarPorcentaje: vaciar el campo vuelve al general', () => {
  // null significa "este local no tiene nada pactado aparte".
  assert.deepEqual(validarPorcentaje(''), { ok: true, value: null })
  assert.deepEqual(validarPorcentaje(null), { ok: true, value: null })
  assert.deepEqual(validarPorcentaje(undefined), { ok: true, value: null })
})

test('validarPorcentaje: 0 es valido y no es lo mismo que vacio', () => {
  // Un local sin descuento pactado (0%) es distinto de uno que usa el general.
  assert.deepEqual(validarPorcentaje(0), { ok: true, value: 0 })
})

test('validarPorcentaje: fuera de 0 a 100 se rechaza', () => {
  // 130% dejaria el importe en negativo; -10 lo subiria.
  assert.equal(validarPorcentaje(130).ok, false)
  assert.equal(validarPorcentaje(-10).ok, false)
  assert.equal(validarPorcentaje(100.01).ok, false)
})

test('validarPorcentaje: 100 es el limite y entra', () => {
  assert.deepEqual(validarPorcentaje(100), { ok: true, value: 100 })
})

test('validarPorcentaje: lo que no es numero se rechaza', () => {
  assert.equal(validarPorcentaje('treinta').ok, false)
  assert.equal(validarPorcentaje('30%').ok, false)
  assert.equal(validarPorcentaje(Infinity).ok, false)
})

// ── porcentajeDelLocal ──────────────────────────────────────────────────────

test('porcentajeDelLocal: sin nada configurado usa el 30 general', () => {
  assert.equal(porcentajeDelLocal({ descuento_movstock: null }), 30)
  assert.equal(porcentajeDelLocal({}), 30)
  assert.equal(porcentajeDelLocal(null), 30)
  assert.equal(DESCUENTO_MOVSTOCK_DEFAULT, 30)
})

test('porcentajeDelLocal: el del local pisa al general', () => {
  assert.equal(porcentajeDelLocal({ descuento_movstock: 15 }), 15)
})

test('porcentajeDelLocal: un local con 0 no cae al 30', () => {
  // El bug facil: tratar el 0 como "vacio" y aplicarle 30% a un local que
  // justamente no tiene descuento.
  assert.equal(porcentajeDelLocal({ descuento_movstock: 0 }), 0)
})

test('porcentajeDelLocal: acepta el Decimal de Prisma como string', () => {
  assert.equal(porcentajeDelLocal({ descuento_movstock: '15.50' }), 15.5)
})

// ── calcularDescuento ───────────────────────────────────────────────────────

test('calcularDescuento: el 30% de un neto redondo', () => {
  assert.equal(calcularDescuento(1000, 30), 300)
  assert.equal(calcularDescuento(10000, 30), 3000)
})

test('calcularDescuento: el neto menos el descuento da el 70%', () => {
  // Es lo que se pidio: "importe movstock con 30% menos".
  const neto = 1000
  assert.equal(neto - calcularDescuento(neto, 30), 700)
})

test('calcularDescuento: redondea a dos decimales', () => {
  // Va a una columna Decimal(12,2): con mas decimales el total guardado no
  // coincidiria con el que se mostro.
  assert.equal(calcularDescuento(1234.56, 30), 370.37)
  assert.equal(calcularDescuento(333.33, 15), 50)
})

test('calcularDescuento: 0% no descuenta nada', () => {
  assert.equal(calcularDescuento(1000, 0), 0)
})

test('calcularDescuento: sin neto no hay descuento', () => {
  assert.equal(calcularDescuento(0, 30), 0)
  assert.equal(calcularDescuento('', 30), 0)
  assert.equal(calcularDescuento(null, 30), 0)
})

test('calcularDescuento: un neto que no es numero no rompe', () => {
  assert.equal(calcularDescuento('cualquiera', 30), 0)
  assert.equal(calcularDescuento(1000, 'cualquiera'), 0)
})

test('calcularDescuento: acepta el string que manda el formulario', () => {
  assert.equal(calcularDescuento('1000', '30'), 300)
})
