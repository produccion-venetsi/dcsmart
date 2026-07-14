import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, resolverMetodo } from './metodos.js'

test('normalizar saca acentos, mayusculas y separadores', () => {
  assert.equal(normalizar('E-Cheque'), 'echeque')
  assert.equal(normalizar('E-CHEQUE'), 'echeque')
  assert.equal(normalizar('Mercado Pago'), 'mercadopago')
  assert.equal(normalizar('MercadoPago'), 'mercadopago')
})

test('resolverMetodo matchea por normalizacion contra existentes', () => {
  const existentes = [
    { id: '1', nombre: 'Efectivo' },
    { id: '2', nombre: 'Mercado Pago' },
    { id: '3', nombre: 'Transferencia' },
  ]
  assert.deepEqual(resolverMetodo('Efectivo', existentes), { nombre: 'Efectivo', existenteId: '1' })
  assert.deepEqual(resolverMetodo('MercadoPago', existentes), { nombre: 'Mercado Pago', existenteId: '2' })
})

test('resolverMetodo usa el alias explicito Transfer -> Transferencia', () => {
  const existentes = [{ id: '3', nombre: 'Transferencia' }]
  assert.deepEqual(resolverMetodo('Transfer', existentes), { nombre: 'Transferencia', existenteId: '3' })
})

test('resolverMetodo devuelve existenteId null si no matchea nada (se crea nuevo)', () => {
  const existentes = [{ id: '1', nombre: 'Efectivo' }]
  assert.deepEqual(resolverMetodo('MP Point', existentes), { nombre: 'MP Point', existenteId: null })
})
