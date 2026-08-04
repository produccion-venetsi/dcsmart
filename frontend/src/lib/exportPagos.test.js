import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tiposImpuestoPresentes, columnasImpuesto, filaTotales, esNotaCredito, conSignoNotaCredito } from './exportPagos.js'

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

// ── Signo de notas de credito ───────────────────────────────────────────────

test('esNotaCredito reconoce NCA y NCB, y nada mas', () => {
  assert.equal(esNotaCredito({ id_tipo: 'NCA' }), true)
  assert.equal(esNotaCredito({ id_tipo: 'NCB' }), true)
  // NDA/ND son notas de DEBITO: suman, no restan.
  assert.equal(esNotaCredito({ id_tipo: 'NDA' }), false)
  assert.equal(esNotaCredito({ id_tipo: 'ND' }), false)
  assert.equal(esNotaCredito({ id_tipo: 'A' }), false)
  assert.equal(esNotaCredito({}), false)
  assert.equal(esNotaCredito(null), false)
})

test('conSignoNotaCredito invierte las columnas de plata de una NC', () => {
  const columns = conSignoNotaCredito([
    { label: 'Neto',    get: (p) => p.importe_neto ?? '', total: true },
    { label: 'Importe', get: (p) => p.importe ?? '',      total: true },
  ])
  const nc = { id_tipo: 'NCA', importe_neto: 1000, importe: 1210 }
  assert.equal(columns[0].get(nc), -1000)
  assert.equal(columns[1].get(nc), -1210)
})

test('conSignoNotaCredito no toca las facturas comunes', () => {
  const columns = conSignoNotaCredito([{ label: 'Neto', get: (p) => p.importe_neto, total: true }])
  assert.equal(columns[0].get({ id_tipo: 'A', importe_neto: 1000 }), 1000)
})

test('conSignoNotaCredito no toca las columnas de texto aunque la fila sea NC', () => {
  // El tipo, el proveedor y las fechas de una NC salen igual que siempre:
  // el signo es solo de las columnas de plata.
  const columns = conSignoNotaCredito([
    { label: 'Tipo',  get: (p) => p.id_tipo },
    { label: 'Nro',   get: (p) => p.nro },
  ])
  const nc = { id_tipo: 'NCA', nro: '00001234' }
  assert.equal(columns[0].get(nc), 'NCA')
  assert.equal(columns[1].get(nc), '00001234')
})

test('conSignoNotaCredito deja vacio lo que ya venia vacio', () => {
  // Un Neto sin cargar tiene que seguir siendo celda vacia, no un 0 inventado.
  const columns = conSignoNotaCredito([{ label: 'Neto', get: (p) => p.importe_neto ?? '', total: true }])
  assert.equal(columns[0].get({ id_tipo: 'NCA' }), '')
})

test('conSignoNotaCredito normaliza el -0 a 0', () => {
  const columns = conSignoNotaCredito([{ label: 'IVA21', get: () => 0, total: true }])
  assert.equal(Object.is(columns[0].get({ id_tipo: 'NCA' }), -0), false)
  assert.equal(columns[0].get({ id_tipo: 'NCA' }), 0)
})

test('conSignoNotaCredito hereda el signo en las columnas de impuesto', () => {
  // columnasImpuesto marca total:true sola, asi que un tipo de impuesto nuevo
  // sale negativo en las NC sin que nadie lo configure.
  const [col] = conSignoNotaCredito(columnasImpuesto(['IVA21']))
  assert.equal(col.get({ id_tipo: 'NCA', impuestos: [{ tipo: 'IVA21', monto: 210 }] }), -210)
  assert.equal(col.get({ id_tipo: 'A',   impuestos: [{ tipo: 'IVA21', monto: 210 }] }), 210)
})

test('la fila TOTAL resta las notas de credito', () => {
  // El caso completo: una factura A y una NC por la mitad. El TOTAL tiene que
  // dar el neto real, no la suma de los valores absolutos.
  const filas = [
    { id_tipo: 'A',   importe_neto: 100000, importe: 121000, impuestos: [{ tipo: 'IVA21', monto: 21000 }] },
    { id_tipo: 'NCA', importe_neto:  50000, importe:  60500, impuestos: [{ tipo: 'IVA21', monto: 10500 }] },
  ]
  const columns = conSignoNotaCredito([
    { label: 'Tipo',    get: (p) => p.id_tipo },
    { label: 'Neto',    get: (p) => p.importe_neto, total: true },
    ...columnasImpuesto(['IVA21']),
    { label: 'Importe', get: (p) => p.importe, total: true },
  ])
  assert.deepEqual(filaTotales(filas, columns), ['TOTAL', 50000, 10500, 60500])
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
