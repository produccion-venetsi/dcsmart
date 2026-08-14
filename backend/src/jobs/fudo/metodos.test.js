import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nombreMetodo, esEfectivo, esTarjeta, esCuentaCorriente, resolverMetodos } from './metodos.js'

test('traduce los codes que usa Fudo al catalogo de DCSmart', () => {
  assert.equal(nombreMetodo('cash'), 'Efectivo')
  assert.equal(nombreMetodo('mp'), 'Mercado Pago')
  assert.equal(nombreMetodo('mp qr'), 'Mercado Pago QR')
  assert.equal(nombreMetodo('credit-card'), 'Credito')
  assert.equal(nombreMetodo('debit-card'), 'Debito')
  assert.equal(nombreMetodo('payway'), 'PayWay')
  assert.equal(nombreMetodo('house-account'), 'Cuenta Cte.')
})

test('un code desconocido devuelve null en vez de inventar un metodo', () => {
  // Crear metodos nuevos automaticamente fue lo que ensucio la tabla con TapTap.
  assert.equal(nombreMetodo('pix'), null)
  assert.equal(nombreMetodo(undefined), null)
})

test('clasifica que es efectivo, que es tarjeta y que es cuenta corriente', () => {
  assert.ok(esEfectivo('cash'))
  assert.ok(!esEfectivo('mp'))
  for (const c of ['credit-card', 'debit-card', 'payway']) assert.ok(esTarjeta(c), c)
  assert.ok(!esTarjeta('cash'))
  assert.ok(esCuentaCorriente('house-account'))
  assert.ok(!esCuentaCorriente('cash'))
})

test('resuelve los codes contra los metodos que ya existen en la base', () => {
  const existentes = [
    { id: 'id-efectivo', nombre: 'Efectivo' },
    { id: 'id-mp', nombre: 'Mercado Pago' },
  ]
  const { porCode, faltantes } = resolverMetodos(['cash', 'mp'], existentes)
  assert.equal(porCode.get('cash'), 'id-efectivo')
  assert.equal(porCode.get('mp'), 'id-mp')
  assert.deepEqual(faltantes, [])
})

test('el matching ignora mayusculas y acentos', () => {
  const existentes = [{ id: 'id-cc', nombre: 'CUENTA CTE.' }]
  const { porCode } = resolverMetodos(['house-account'], existentes)
  assert.equal(porCode.get('house-account'), 'id-cc')
})

test('informa los codes que no tienen equivalente para que el local falle explicito', () => {
  const { porCode, faltantes } = resolverMetodos(['cash', 'pix'], [{ id: 'id-efectivo', nombre: 'Efectivo' }])
  assert.equal(porCode.get('cash'), 'id-efectivo')
  assert.deepEqual(faltantes, ['pix'])
})

test('un code conocido que no esta en la base tambien es faltante', () => {
  const { faltantes } = resolverMetodos(['payway'], [{ id: 'id-efectivo', nombre: 'Efectivo' }])
  assert.deepEqual(faltantes, ['payway'])
})
