import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DESCUENTO_MOVSTOCK_DEFAULT, porcentajeDelLocal, calcularDescuento, descuentoParaInput,
  siguienteDescuento
} from './descuentoMovstock.js'

// ── siguienteDescuento: cuándo el formulario tiene que recalcular ──
//
// El bug que originó esto: el descuento se recalculaba SOLO al escribir el
// importe neto. Si alguien cargaba el neto y después elegía el comprobante
// MovStock, no pasaba nada y el total se guardaba sin descontar.

const base = { campo: 'id_tipo', tipo: 'STK', neto: '1000', pct: 30, editando: false, manual: false }

test('siguienteDescuento: elegir el tipo MovStock aplica el descuento sobre el neto ya cargado', () => {
  assert.equal(siguienteDescuento(base), '300.00')
})

test('siguienteDescuento: escribir el neto con el tipo ya en MovStock tambien recalcula', () => {
  assert.equal(siguienteDescuento({ ...base, campo: 'importe_neto' }), '300.00')
})

test('siguienteDescuento: respeta el porcentaje pactado del local', () => {
  assert.equal(siguienteDescuento({ ...base, pct: 15 }), '150.00')
  assert.equal(siguienteDescuento({ ...base, pct: 0 }), '')
})

test('siguienteDescuento: cambiar el tipo a otro comprobante limpia el descuento automatico', () => {
  assert.equal(siguienteDescuento({ ...base, tipo: 'A' }), '')
})

test('siguienteDescuento: un descuento escrito a mano no se pisa nunca', () => {
  assert.equal(siguienteDescuento({ ...base, manual: true }), undefined)
  assert.equal(siguienteDescuento({ ...base, campo: 'importe_neto', manual: true }), undefined)
})

test('siguienteDescuento: al editar un pago existente no se toca', () => {
  assert.equal(siguienteDescuento({ ...base, editando: true }), undefined)
})

test('siguienteDescuento: los demas campos del formulario no lo mueven', () => {
  for (const campo of ['fecha', 'id_proveedor', 'importe', 'nro']) {
    assert.equal(siguienteDescuento({ ...base, campo }), undefined, campo)
  }
})

test('siguienteDescuento: sin neto cargado no inventa un descuento', () => {
  assert.equal(siguienteDescuento({ ...base, neto: '' }), '')
})

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
  assert.equal(porcentajeDelLocal({ descuento_movstock: 0 }), 0)
})

test('porcentajeDelLocal: acepta el Decimal que viaja como string en el JSON', () => {
  assert.equal(porcentajeDelLocal({ descuento_movstock: '15.50' }), 15.5)
})

test('calcularDescuento: el 30% de un neto redondo', () => {
  assert.equal(calcularDescuento(1000, 30), 300)
})

test('calcularDescuento: el neto menos el descuento da el 70%', () => {
  assert.equal(1000 - calcularDescuento(1000, 30), 700)
})

test('calcularDescuento: redondea a dos decimales', () => {
  assert.equal(calcularDescuento(1234.56, 30), 370.37)
})

test('calcularDescuento: sin neto o sin porcentaje no descuenta', () => {
  assert.equal(calcularDescuento(0, 30), 0)
  assert.equal(calcularDescuento('', 30), 0)
  assert.equal(calcularDescuento(1000, 0), 0)
  assert.equal(calcularDescuento('cualquiera', 30), 0)
})

test('descuentoParaInput: devuelve el string con dos decimales', () => {
  assert.equal(descuentoParaInput(1000, 30), '300.00')
  assert.equal(descuentoParaInput(1234.56, 30), '370.37')
})

test('descuentoParaInput: sin descuento deja el campo vacio, no en cero', () => {
  // Un '0.00' se ve como un cero escrito a mano.
  assert.equal(descuentoParaInput('', 30), '')
  assert.equal(descuentoParaInput(1000, 0), '')
})
