import { test } from 'node:test'
import assert from 'node:assert/strict'
import { direccionPorTipo, importeFirmado } from './direccionPago.js'

test('la nota de credito SIEMPRE es ingreso; la de debito, egreso', () => {
  assert.equal(direccionPorTipo('NCA'), true)
  assert.equal(direccionPorTipo('NCB'), true)
  assert.equal(direccionPorTipo('NDA'), false)
  assert.equal(direccionPorTipo('NDB'), false)
})

test('los demas tipos no fijan direccion', () => {
  for (const t of ['A', 'B', 'C', 'CM', 'DDJJ', 'M', 'STK', null, undefined]) {
    assert.equal(direccionPorTipo(t), null, String(t))
  }
})

test('el importe firmado: egreso suma, ingreso resta', () => {
  assert.equal(importeFirmado({ importe: 100, ingresa_egreso: false }), 100)
  assert.equal(importeFirmado({ importe: 100, ingresa_egreso: true }), -100)
  // Decimal de Prisma llega como string
  assert.equal(importeFirmado({ importe: '1465657.6', ingresa_egreso: true }), -1465657.6)
  assert.equal(importeFirmado({ importe: null }), 0)
})
