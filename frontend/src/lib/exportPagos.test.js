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

test('columnasImpuesto marca sus columnas como total:true automaticamente', () => {
  // Un tipo de impuesto nuevo no puede requerir que alguien se acuerde de
  // marcarlo a mano: columnasImpuesto tiene que ponerselo solo.
  const [col21, colRetencion] = columnasImpuesto(['IVA21', 'RETENCION'])
  assert.equal(col21.total, true)
  assert.equal(colRetencion.total, true)
})

test('filaTotales suma solo las columnas marcadas con total:true', () => {
  const columns = [
    { label: 'OP',      get: (p) => p.op },
    { label: 'Neto',    get: (p) => p.importe_neto ?? '', total: true },
    { label: 'IVA21',   get: (p) => (p.impuestos ?? []).filter(i => i.tipo === 'IVA21').reduce((a, i) => a + Number(i.monto), 0), total: true },
    { label: 'Importe', get: (p) => p.importe ?? '', total: true },
  ]
  const fila = filaTotales(pagos, columns)
  assert.equal(fila[0], 'TOTAL')
  assert.equal(fila[1], 3000)
  assert.equal(fila[2], 630)
  assert.equal(fila[3], 3580)
})

test('filaTotales pone TOTAL en la primera celda aunque esa columna sea numerica', () => {
  const columns = [{ label: 'Neto', get: (p) => p.importe_neto, total: true }]
  assert.equal(filaTotales(pagos, columns)[0], 'TOTAL')
})

test('filaTotales no suma columnas de fecha ni de texto sin marcar', () => {
  const columns = [
    { label: 'OP',    get: () => 'OP-1' },
    { label: 'Fecha', get: () => '15/07/2026' },
  ]
  assert.deepEqual(filaTotales(pagos, columns), ['TOTAL', ''])
})

test('filaTotales deja vacio un Nro de 8 digitos sin cero a la izquierda (no es plata)', () => {
  // Antes de este fix, sniffing por valor contaba "12345678" como numerico
  // y el TOTAL sumaba numeros de comprobante. Ahora Nro nunca lleva el
  // marcador total, sin importar si el valor "parece" numerico.
  const columns = [
    { label: 'OP',  get: () => 'OP-1' },
    { label: 'Nro', get: () => '12345678' },
  ]
  assert.deepEqual(filaTotales(pagos, columns), ['TOTAL', ''])
})

test('filaTotales deja vacio un PV de 5 cifras sin cero a la izquierda (no es plata)', () => {
  const columns = [
    { label: 'OP', get: () => 'OP-1' },
    { label: 'PV', get: () => '10001' },
  ]
  assert.deepEqual(filaTotales(pagos, columns), ['TOTAL', ''])
})

test('filaTotales deja vacia una columna Observaciones aunque el texto parezca numerico', () => {
  // Una nota como "1234" no debe hacer que el TOTAL sume texto libre.
  const columns = [
    { label: 'OP',            get: () => 'OP-1' },
    { label: 'Observaciones', get: (p) => p.observaciones },
  ]
  const conNotaNumerica = [{ observaciones: '1234' }, { observaciones: '5678' }]
  assert.deepEqual(filaTotales(conNotaNumerica, columns), ['TOTAL', ''])
})

test('filaTotales redondea a 2 decimales para evitar el arrastre de error de flotante', () => {
  const columns = [
    { label: 'OP',   get: () => 'OP-1' },
    { label: 'Neto', get: (p) => p.importe_neto, total: true },
  ]
  const conFloats = [{ importe_neto: 0.1 }, { importe_neto: 0.2 }, { importe_neto: 0.3 }]
  // 0.1 + 0.2 + 0.3 en floats da 0.6000000000000001 sin redondeo.
  assert.equal(filaTotales(conFloats, columns)[1], 0.6)
})
