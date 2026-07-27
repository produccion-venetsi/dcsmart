import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tiposImpuestoPresentes, columnasImpuesto, filaTotales } from './exportPagos.js'

const pagos = [
  { importe_neto: 1000, importe: 1210, impuestos: [{ tipo: 'IVA21', monto: 210 }] },
  { importe_neto: 2000, importe: 2370, impuestos: [{ tipo: 'IVA21', monto: 420 }, { tipo: 'RETENCION', monto: -50 }] },
]

test('tiposImpuestoPresentes devuelve solo los tipos que aparecen', () => {
  assert.deepEqual(tiposImpuestoPresentes(pagos), ['IVA21', 'RETENCION'])
})

test('tiposImpuestoPresentes respeta el orden del enum, no el de aparicion', () => {
  const rows = [{ impuestos: [{ tipo: 'RETENCION', monto: 1 }, { tipo: 'IVA10', monto: 2 }, { tipo: 'IVA21', monto: 3 }] }]
  assert.deepEqual(tiposImpuestoPresentes(rows), ['IVA21', 'IVA10', 'RETENCION'])
})

test('tiposImpuestoPresentes devuelve vacio si no hay impuestos', () => {
  assert.deepEqual(tiposImpuestoPresentes([{ importe: 100 }]), [])
  assert.deepEqual(tiposImpuestoPresentes([{ importe: 100, impuestos: [] }]), [])
})

test('columnasImpuesto suma los montos del mismo tipo en un pago', () => {
  const [col] = columnasImpuesto(['IVA21'])
  assert.equal(col.label, 'IVA21')
  assert.equal(col.get({ impuestos: [{ tipo: 'IVA21', monto: 100 }, { tipo: 'IVA21', monto: 50 }] }), 150)
})

test('columnasImpuesto devuelve 0 (no vacio) si el pago no tiene ese impuesto', () => {
  const [col] = columnasImpuesto(['IVA21'])
  assert.equal(col.get({ impuestos: [] }), 0)
  assert.equal(col.get({}), 0)
})

test('filaTotales suma las columnas numericas y deja en blanco las de texto', () => {
  const columns = [
    { label: 'OP',      get: (p) => p.op },
    { label: 'Neto',    get: (p) => p.importe_neto ?? '' },
    { label: 'IVA21',   get: (p) => (p.impuestos ?? []).filter(i => i.tipo === 'IVA21').reduce((a, i) => a + Number(i.monto), 0) },
    { label: 'Importe', get: (p) => p.importe ?? '' },
  ]
  const fila = filaTotales(pagos, columns)
  assert.equal(fila[0], 'TOTAL')
  assert.equal(fila[1], 3000)
  assert.equal(fila[2], 630)
  assert.equal(fila[3], 3580)
})

test('filaTotales pone TOTAL en la primera celda aunque esa columna sea numerica', () => {
  const columns = [{ label: 'Neto', get: (p) => p.importe_neto }]
  assert.equal(filaTotales(pagos, columns)[0], 'TOTAL')
})

test('filaTotales no suma columnas de fecha ni de texto', () => {
  const columns = [
    { label: 'OP',    get: () => 'OP-1' },
    { label: 'Fecha', get: () => '15/07/2026' },
  ]
  assert.deepEqual(filaTotales(pagos, columns), ['TOTAL', ''])
})

test('filaTotales no suma columnas con cero a la izquierda tipo PV/Nro', () => {
  const columns = [
    { label: 'OP',  get: () => 'OP-1' },
    { label: 'PV',  get: () => '00001' },
    { label: 'Nro', get: () => '00000012' },
  ]
  assert.deepEqual(filaTotales(pagos, columns), ['TOTAL', '', ''])
})
