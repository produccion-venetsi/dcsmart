import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarCuit, normalizarTipoComprobante, validarAritmetica,
  aCamposFormulario, camposConDato, matchearMetodoPago, normalizarTexto
} from './leerFactura.js'

// ── CUIT ────────────────────────────────────────────────────────────────────

test('el CUIT se limpia a 11 digitos, como esta en la base', () => {
  assert.equal(normalizarCuit('30-71234567-8'), '30712345678')
  assert.equal(normalizarCuit('30.71234567.8'), '30712345678')
  assert.equal(normalizarCuit('30 71234567 8'), '30712345678')
  assert.equal(normalizarCuit('30712345678'), '30712345678')
})

test('un CUIT que no tiene 11 digitos se descarta', () => {
  // Preferimos no buscar proveedor antes que buscar por un CUIT mal leido.
  assert.equal(normalizarCuit('3071234567'), null)   // 10
  assert.equal(normalizarCuit('307123456789'), null) // 12
  assert.equal(normalizarCuit('CUIT no visible'), null)
  assert.equal(normalizarCuit(null), null)
  assert.equal(normalizarCuit(''), null)
})

// ── Tipo de comprobante ─────────────────────────────────────────────────────

test('los tipos de comprobante mapean al enum del sistema', () => {
  assert.equal(normalizarTipoComprobante('A'), 'A')
  assert.equal(normalizarTipoComprobante('b'), 'B')
  assert.equal(normalizarTipoComprobante(' c '), 'C')
  assert.equal(normalizarTipoComprobante('M'), 'M')
})

test('las notas de credito y debito mapean a NCA y NDA', () => {
  assert.equal(normalizarTipoComprobante('NC'), 'NCA')
  assert.equal(normalizarTipoComprobante('nota de credito'), 'NCA')
  assert.equal(normalizarTipoComprobante('ND'), 'NDA')
  assert.equal(normalizarTipoComprobante('NOTA DE DEBITO'), 'NDA')
})

test('un tipo desconocido no se inventa', () => {
  assert.equal(normalizarTipoComprobante('X'), null)
  assert.equal(normalizarTipoComprobante('FACTURA'), null)
  assert.equal(normalizarTipoComprobante(null), null)
})

// ── Aritmetica ──────────────────────────────────────────────────────────────

test('cuadra: neto + IVA = total', () => {
  const r = validarAritmetica({ importe_neto: 1000, impuestos: [{ tipo: 'IVA21', monto: 210 }], total: 1210 })
  assert.equal(r.cuadra, true)
  assert.equal(r.esperado, 1210)
  assert.equal(r.diferencia, 0)
})

test('no cuadra: el caso que este control existe para pescar', () => {
  // Total mal leido: 1500 en vez de 1210.
  const r = validarAritmetica({ importe_neto: 1000, impuestos: [{ tipo: 'IVA21', monto: 210 }], total: 1500 })
  assert.equal(r.cuadra, false)
  assert.equal(r.esperado, 1210)
  assert.equal(r.diferencia, 290)
})

test('el descuento resta del total esperado', () => {
  const r = validarAritmetica({ importe_neto: 1000, impuestos: [{ tipo: 'IVA21', monto: 210 }], descuento: 100, total: 1110 })
  assert.equal(r.cuadra, true)
})

test('una factura B sin IVA discriminado cuadra sola', () => {
  const r = validarAritmetica({ importe_neto: 1210, impuestos: [], total: 1210 })
  assert.equal(r.cuadra, true)
})

test('varios impuestos se suman', () => {
  const r = validarAritmetica({
    importe_neto: 1000,
    impuestos: [{ tipo: 'IVA21', monto: 210 }, { tipo: 'PERCEPCION', monto: 30 }],
    total: 1240
  })
  assert.equal(r.cuadra, true)
})

test('un peso de redondeo sigue cuadrando', () => {
  const r = validarAritmetica({ importe_neto: 1000, impuestos: [{ tipo: 'IVA21', monto: 210 }], total: 1210.5 })
  assert.equal(r.cuadra, true)
})

test('sin neto o sin total no se afirma que cuadre ni que no', () => {
  for (const caso of [
    { importe_neto: null, total: 1210 },
    { importe_neto: 1000, total: null },
    {}
  ]) {
    const r = validarAritmetica(caso)
    assert.equal(r.verificable, false)
    assert.equal(r.cuadra, null)
  }
})

// ── Mapeo a los campos del formulario ───────────────────────────────────────

const CRUDO_OK = {
  fecha: '2026-07-15',
  tipo_comprobante: 'A',
  punto_venta: 1,
  numero: 12345,
  cuit_emisor: '30-71234567-8',
  razon_social_emisor: '  Proveedor SA  ',
  importe_neto: 1000,
  descuento: 0,
  total: 1210,
  impuestos: [{ tipo: 'IVA21', monto: 210 }]
}

test('una factura bien leida mapea a los campos del formulario', () => {
  const c = aCamposFormulario(CRUDO_OK)
  assert.equal(c.fecha, '2026-07-15')
  assert.equal(c.id_tipo, 'A')
  assert.equal(c.pv, 1)
  assert.equal(c.nro, 12345)
  assert.equal(c.importe_neto, 1000)
  assert.equal(c.importe, 1210)
  assert.equal(c.cuit_emisor, '30712345678')
  assert.equal(c.razon_social_emisor, 'Proveedor SA')
  assert.deepEqual(c.impuestos, [{ tipo: 'IVA21', monto: 210 }])
})

test('si la foto no es legible no se devuelve nada', () => {
  assert.equal(aCamposFormulario({ legible: false, total: 999 }), null)
  assert.equal(aCamposFormulario(null), null)
})

test('una fecha con formato raro se descarta en vez de romper el input date', () => {
  assert.equal(aCamposFormulario({ ...CRUDO_OK, fecha: '15/07/2026' }).fecha, null)
  assert.equal(aCamposFormulario({ ...CRUDO_OK, fecha: 'julio 2026' }).fecha, null)
  assert.equal(aCamposFormulario({ ...CRUDO_OK, fecha: null }).fecha, null)
})

test('un impuesto que no existe en el sistema se descarta', () => {
  // Si pasara, el POST fallaria al guardar por el enum.
  const c = aCamposFormulario({ ...CRUDO_OK, impuestos: [{ tipo: 'IVA5', monto: 50 }, { tipo: 'IVA21', monto: 210 }] })
  assert.deepEqual(c.impuestos, [{ tipo: 'IVA21', monto: 210 }])
})

test('un impuesto en cero no se carga', () => {
  const c = aCamposFormulario({ ...CRUDO_OK, impuestos: [{ tipo: 'IVA21', monto: 0 }] })
  assert.deepEqual(c.impuestos, [])
})

test('los campos que el modelo no vio quedan en null, no en cero', () => {
  // Un 0 en importe se leeria como "la factura es de $0", que es distinto de
  // "no se pudo leer el importe".
  const c = aCamposFormulario({ fecha: null, punto_venta: null, importe_neto: null, total: null })
  assert.equal(c.pv, null)
  assert.equal(c.importe_neto, null)
  assert.equal(c.importe, null)
})

// ── Que campos marcar en la pantalla ────────────────────────────────────────

test('camposConDato lista solo lo que trajo dato', () => {
  const c = aCamposFormulario(CRUDO_OK)
  const marcados = camposConDato(c)
  assert.equal(marcados.includes('fecha'), true)
  assert.equal(marcados.includes('importe'), true)
  assert.equal(marcados.includes('impuestos'), true)
})

test('camposConDato no marca lo que quedo vacio', () => {
  const c = aCamposFormulario({ ...CRUDO_OK, punto_venta: null, numero: null, impuestos: [] })
  const marcados = camposConDato(c)
  assert.equal(marcados.includes('pv'), false)
  assert.equal(marcados.includes('nro'), false)
  assert.equal(marcados.includes('impuestos'), false)
  assert.equal(marcados.includes('fecha'), true)
})

test('camposConDato tolera que no haya campos', () => {
  assert.deepEqual(camposConDato(null), [])
})

// ── La cadena completa ──────────────────────────────────────────────────────
// Estos tests faltaban y por eso paso desapercibido que validarAritmetica
// esperaba `total` mientras aCamposFormulario devuelve `importe`: cada funcion
// andaba bien por separado y la cadena se salteaba la validacion en silencio.

test('la cadena crudo -> campos -> aritmetica valida de verdad', () => {
  const campos = aCamposFormulario(CRUDO_OK)
  const r = validarAritmetica(campos)
  assert.equal(r.verificable, true, 'la validación no se puede saltear')
  assert.equal(r.cuadra, true)
})

test('la cadena pesca un total mal leido', () => {
  const campos = aCamposFormulario({ ...CRUDO_OK, total: 1500 })
  const r = validarAritmetica(campos)
  assert.equal(r.verificable, true)
  assert.equal(r.cuadra, false)
  assert.equal(r.diferencia, 290)
})

test('validarAritmetica acepta los dos nombres del campo total', () => {
  const base = { importe_neto: 1000, impuestos: [{ tipo: 'IVA21', monto: 210 }] }
  assert.equal(validarAritmetica({ ...base, total: 1210 }).cuadra, true)
  assert.equal(validarAritmetica({ ...base, importe: 1210 }).cuadra, true)
})

test('el caso real de la factura de prueba', () => {
  // Lo que devolvio Vertex AI con la factura de Distribuidora Norte:
  // neto 100.000 + IVA 21.000 + percepcion 3.000 = 124.000
  const campos = aCamposFormulario({
    fecha: '2026-07-12', tipo_comprobante: 'A', punto_venta: 3, numero: 4521,
    cuit_emisor: '30712345678', razon_social_emisor: 'DISTRIBUIDORA NORTE S.A.',
    importe_neto: 100000, descuento: 0, total: 124000,
    impuestos: [{ tipo: 'IVA21', monto: 21000 }, { tipo: 'PERCEPCION', monto: 3000 }],
    legible: true
  })
  assert.equal(campos.id_tipo, 'A')
  assert.equal(campos.importe, 124000)
  assert.equal(campos.impuestos.length, 2)
  const r = validarAritmetica(campos)
  assert.equal(r.verificable, true)
  assert.equal(r.cuadra, true)
})

test('sin aritmetica no se puede afirmar nada: neto sin leer', () => {
  const campos = aCamposFormulario({ ...CRUDO_OK, importe_neto: null })
  assert.equal(validarAritmetica(campos).verificable, false)
})

test('IMP_INTERNOS es un tipo valido del sistema', () => {
  // Esta en el enum TipoImpuesto y el frontend lo ofrece: si el lib lo
  // descartara, una factura con impuestos internos perderia ese renglon.
  const c = aCamposFormulario({ ...CRUDO_OK, impuestos: [{ tipo: 'IMP_INTERNOS', monto: 500 }] })
  assert.deepEqual(c.impuestos, [{ tipo: 'IMP_INTERNOS', monto: 500 }])
})

// ── Metodo de pago desde la condicion de venta ──────────────────────────────
// Los nombres son los reales del catalogo (los 16 que tienen pagos cargados).

const METODOS = [
  { id: 'm1', nombre: 'Efectivo' },
  { id: 'm2', nombre: 'Transferencia' },
  { id: 'm3', nombre: 'Cuenta Cte.' },
  { id: 'm4', nombre: 'Mercado Pago' },
  { id: 'm5', nombre: 'Tarjeta crédito' },
  { id: 'm6', nombre: 'Tarjeta débito' },
  { id: 'm7', nombre: 'CHEQUE AL DÍA' },
  { id: 'm8', nombre: 'CHEQUE DIFERIDO' },
  { id: 'm9', nombre: 'E-Cheque' },
  { id: 'm10', nombre: 'Débito Automático' },
  { id: 'm11', nombre: 'Nota de Crédito' },
]

test('"Contado" mapea a Efectivo, que es el caso mas comun', () => {
  // No coinciden en una sola letra: sin sinonimos esto no se resuelve.
  assert.equal(matchearMetodoPago('Contado', METODOS)?.nombre, 'Efectivo')
  assert.equal(matchearMetodoPago('CONTADO', METODOS)?.nombre, 'Efectivo')
})

test('"Cuenta Corriente" mapea a Cuenta Cte.', () => {
  assert.equal(matchearMetodoPago('Cuenta Corriente', METODOS)?.nombre, 'Cuenta Cte.')
  assert.equal(matchearMetodoPago('Cta. Cte.', METODOS)?.nombre, 'Cuenta Cte.')
  assert.equal(matchearMetodoPago('CTA CTE', METODOS)?.nombre, 'Cuenta Cte.')
})

test('el nombre del catalogo tal cual tambien matchea', () => {
  assert.equal(matchearMetodoPago('Transferencia', METODOS)?.nombre, 'Transferencia')
  assert.equal(matchearMetodoPago('Mercado Pago', METODOS)?.nombre, 'Mercado Pago')
  assert.equal(matchearMetodoPago('mercado pago', METODOS)?.nombre, 'Mercado Pago')
})

test('los acentos y puntos no importan', () => {
  assert.equal(matchearMetodoPago('Debito Automatico', METODOS)?.nombre, 'Débito Automático')
  assert.equal(matchearMetodoPago('CHEQUE AL DIA', METODOS)?.nombre, 'CHEQUE AL DÍA')
})

test('el texto con datos de mas igual matchea', () => {
  // Las facturas escriben cosas como "Cuenta Corriente 30 dias F.F."
  assert.equal(matchearMetodoPago('Cuenta Corriente 30 días F.F.', METODOS)?.nombre, 'Cuenta Cte.')
  assert.equal(matchearMetodoPago('Pago: transferencia bancaria', METODOS)?.nombre, 'Transferencia')
})

test('"cheque diferido" gana sobre "cheque"', () => {
  // Se prueban los sinonimos mas largos primero; si no, un cheque diferido
  // quedaria cargado como cheque al dia.
  assert.equal(matchearMetodoPago('Cheque diferido', METODOS)?.nombre, 'CHEQUE DIFERIDO')
  assert.equal(matchearMetodoPago('Cheque de pago diferido a 60 días', METODOS)?.nombre, 'CHEQUE DIFERIDO')
  assert.equal(matchearMetodoPago('Cheque', METODOS)?.nombre, 'CHEQUE AL DÍA')
})

test('echeq mapea a E-Cheque', () => {
  assert.equal(matchearMetodoPago('ECHEQ', METODOS)?.nombre, 'E-Cheque')
  assert.equal(matchearMetodoPago('e-cheq', METODOS)?.nombre, 'E-Cheque')
})

test('si leyo algo que no se puede mapear, devuelve el texto igual', () => {
  // Se informa para que la persona elija, en vez de descartarlo en silencio.
  const r = matchearMetodoPago('Canje de mercadería', METODOS)
  assert.equal(r.id, null)
  assert.equal(r.texto, 'Canje de mercadería')
})

test('un metodo que no esta en el catalogo del local no se inventa', () => {
  // Si "Tarjeta crédito" no existiera, no se puede precargar nada.
  const sinTarjeta = METODOS.filter((m) => !m.nombre.startsWith('Tarjeta'))
  const r = matchearMetodoPago('Tarjeta de crédito', sinTarjeta)
  assert.equal(r.id, null)
  assert.equal(r.texto, 'Tarjeta de crédito')
})

test('sin condicion de venta no se devuelve nada', () => {
  assert.equal(matchearMetodoPago(null, METODOS), null)
  assert.equal(matchearMetodoPago('', METODOS), null)
  assert.equal(matchearMetodoPago('   ', METODOS), null)
})

test('la condicion de venta llega hasta los campos del formulario', () => {
  const c = aCamposFormulario({ ...CRUDO_OK, condicion_venta: '  Cuenta Corriente 30 días  ' })
  assert.equal(c.condicion_venta, 'Cuenta Corriente 30 días')
})
