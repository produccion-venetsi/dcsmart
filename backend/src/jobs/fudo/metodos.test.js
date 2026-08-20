import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nombreMetodo, esEfectivo, esTarjeta, esCuentaCorriente, resolverMetodos, METODO_DESCONOCIDO } from './metodos.js'

const CON_DESCONOCIDO = [{ id: 'id-desconocido', nombre: 'Metodo desconocido' }]

test('traduce los codes estandar de Fudo al catalogo de DCSmart (alias por code)', () => {
  assert.equal(nombreMetodo('cash'), 'Efectivo')
  assert.equal(nombreMetodo('mp'), 'Mercado Pago')
  assert.equal(nombreMetodo('mp qr'), 'Mercado Pago QR')
  assert.equal(nombreMetodo('credit-card'), 'Credito')
  assert.equal(nombreMetodo('debit-card'), 'Debito')
  assert.equal(nombreMetodo('payway'), 'PayWay')
  assert.equal(nombreMetodo('house-account'), 'Cuenta Cte.')
  assert.equal(nombreMetodo('fudo_payments'), 'FudoPagos')
})

test('un code desconocido devuelve null en vez de inventar un metodo', () => {
  assert.equal(nombreMetodo('pix'), null)
  assert.equal(nombreMetodo(undefined), null)
})

test('clasifica que es efectivo, que es tarjeta y que es cuenta corriente por code estandar', () => {
  assert.ok(esEfectivo('cash'))
  assert.ok(!esEfectivo('mp'))
  for (const c of ['credit-card', 'debit-card', 'payway']) assert.ok(esTarjeta(c), c)
  assert.ok(!esTarjeta('cash'))
  assert.ok(esCuentaCorriente('house-account'))
  assert.ok(!esCuentaCorriente('cash'))
})

test('esEfectivo/esTarjeta/esCuentaCorriente tambien miran el nombre inventado por el local', () => {
  // El code que invento el local no dice nada, pero el nombre si.
  assert.ok(esEfectivo('efectivo-caja-1', 'efectivo'))
  assert.ok(esEfectivo(undefined, 'Efectivo'))
  assert.ok(esTarjeta('tarjeta-local', 'tarjeta'))
  assert.ok(esTarjeta('cred-local', 'Credito'))
  assert.ok(esTarjeta('deb-local', 'Debito'))
  assert.ok(esTarjeta('pw-local', 'PayWay'))
  assert.ok(esCuentaCorriente('cc-local', 'Cta Cte'))
  assert.ok(esCuentaCorriente('cc-local', 'cuenta cte'))
})

test('Nota de credito NO cuenta como tarjeta aunque contenga "credito"', () => {
  assert.ok(!esTarjeta('nc-local', 'Nota de crédito'))
  assert.ok(!esTarjeta('nc-local', 'nota de credito'))
  assert.ok(!esTarjeta(undefined, 'NOTA DE CREDITO'))
})

test('resuelve los metodos contra los que ya existen en la base', () => {
  const existentes = [
    { id: 'id-efectivo', nombre: 'Efectivo' },
    { id: 'id-mp', nombre: 'Mercado Pago' },
    ...CON_DESCONOCIDO,
  ]
  const { porCode, sinResolver } = resolverMetodos(
    [{ code: 'cash', name: 'Efectivo' }, { code: 'mp', name: 'Mp' }],
    existentes,
  )
  assert.equal(porCode.get('cash')?.id, 'id-efectivo')
  assert.equal(porCode.get('mp')?.id, 'id-mp')
  assert.deepEqual(sinResolver, [])
})

test('el matching ignora mayusculas y acentos', () => {
  const existentes = [{ id: 'id-cc', nombre: 'CUENTA CTE.' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'house-account', name: 'Cuenta Corriente' }], existentes)
  assert.equal(porCode.get('house-account')?.id, 'id-cc')
})

test('normaliza acentos reales: credit-card matchea Crédito en la base', () => {
  const existentes = [{ id: 'id-credito', nombre: 'Crédito' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'credit-card', name: 'Tarjeta de crédito' }], existentes)
  assert.equal(porCode.get('credit-card')?.id, 'id-credito')
})

test('un metodo sin equivalente cae en "Metodo desconocido" y queda informado en sinResolver', () => {
  const existentes = [{ id: 'id-efectivo', nombre: 'Efectivo' }, ...CON_DESCONOCIDO]
  const { porCode, sinResolver } = resolverMetodos(
    [{ code: 'cash', name: 'Efectivo' }, { code: 'obra-condarco', name: 'obra condarco 2026' }],
    existentes,
  )
  assert.equal(porCode.get('cash')?.id, 'id-efectivo')
  assert.equal(porCode.get('obra-condarco')?.id, 'id-desconocido')
  assert.deepEqual(sinResolver, [{ code: 'obra-condarco', name: 'obra condarco 2026' }])
})

test('el job ya no falla por un metodo sin equivalente: sinResolver es solo informativo', () => {
  const existentes = CON_DESCONOCIDO
  assert.doesNotThrow(() => resolverMetodos([{ code: 'qr-raro', name: 'qr raro' }], existentes))
})

test('si "Metodo desconocido" no existe en la base, tira un error explicito', () => {
  assert.throws(
    () => resolverMetodos([{ code: 'cash', name: 'Efectivo' }], [{ id: 'id-efectivo', nombre: 'Efectivo' }]),
    /Metodo desconocido/,
  )
})

test('no crea metodos nuevos: nunca hay un id que no venga de "existentes"', () => {
  const existentes = [{ id: 'id-efectivo', nombre: 'Efectivo' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'cash', name: 'Efectivo' }, { code: 'raro', name: 'Raro' }], existentes)
  const idsValidos = new Set(existentes.map((m) => m.id))
  for (const metodo of porCode.values()) assert.ok(idsValidos.has(metodo.id))
})

// El modelo simple usa el NOMBRE del metodo, no su id: el detalle convertido
// se llama como el metodo canonico de la base ("Cuenta Cte.", no "Cta. Cte.").
test('porCode trae el nombre canonico junto al id', () => {
  const existentes = [{ id: 'id-cc', nombre: 'Cuenta Cte.' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'x', name: 'Cta. Cte.' }], existentes)
  assert.deepEqual(porCode.get('x'), { id: 'id-cc', nombre: 'Cuenta Cte.' })
})

test('el metodo sin equivalente trae el nombre "Metodo desconocido"', () => {
  const { porCode } = resolverMetodos([{ code: 'raro', name: 'Raro' }], CON_DESCONOCIDO)
  assert.equal(porCode.get('raro')?.nombre, 'Metodo desconocido')
})

// --- Tabla de alias por nombre, fila por fila ---

test('alias: Cta. Cte. -> Cuenta Cte.', () => {
  const existentes = [{ id: 'id-cc', nombre: 'Cuenta Cte.' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'cta-cte-local', name: 'Cta. Cte.' }], existentes)
  assert.equal(porCode.get('cta-cte-local')?.id, 'id-cc')
})

test('alias: Tarj. Débito -> Tarjeta débito', () => {
  const existentes = [{ id: 'id-td', nombre: 'Tarjeta débito' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'tarj-deb', name: 'Tarj. Débito' }], existentes)
  assert.equal(porCode.get('tarj-deb')?.id, 'id-td')
})

test('alias: Echeq -> E-Cheque', () => {
  const existentes = [{ id: 'id-echeq', nombre: 'E-Cheque' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'echeq-local', name: 'Echeq' }], existentes)
  assert.equal(porCode.get('echeq-local')?.id, 'id-echeq')
})

test('alias: Qr -> MP QR', () => {
  const existentes = [{ id: 'id-qr', nombre: 'MP QR' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'qr-local', name: 'Qr' }], existentes)
  assert.equal(porCode.get('qr-local')?.id, 'id-qr')
})

test('alias: Transferencia banco galicia -> Transferencia', () => {
  const existentes = [{ id: 'id-transf', nombre: 'Transferencia' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'transf-galicia', name: 'Transferencia banco galicia' }], existentes)
  assert.equal(porCode.get('transf-galicia')?.id, 'id-transf')
})

test('alias: FudoPagos -> FudoPagos', () => {
  const existentes = [{ id: 'id-fudopagos', nombre: 'FudoPagos' }, ...CON_DESCONOCIDO]
  const { porCode } = resolverMetodos([{ code: 'fudo_payments', name: 'FudoPagos' }], existentes)
  assert.equal(porCode.get('fudo_payments')?.id, 'id-fudopagos')
})

test('alias de los locales de agosto: Mercardo Pago (typo), Pedido Ya y MP', () => {
  const existentes = [
    { id: 'id-mp', nombre: 'Mercado Pago' },
    { id: 'id-peya', nombre: 'PedidosYa' },
    ...CON_DESCONOCIDO,
  ]
  // Vienen con espacios al final tal cual los cargó cada cuenta.
  const casos = [
    { code: 'mercardo pago ', name: 'Mercardo Pago ', esperado: 'id-mp' },
    { code: 'pedido ya ', name: 'Pedido Ya ', esperado: 'id-peya' },
    { code: 'mp ', name: 'MP ', esperado: 'id-mp' },
  ]
  for (const { code, name, esperado } of casos) {
    const { porCode, sinResolver } = resolverMetodos([{ code, name }], existentes)
    assert.equal(porCode.get(code)?.id, esperado, name)
    assert.deepEqual(sinResolver, [], name)
  }
})

test('el code con espacios de mas matchea el alias estandar igual', () => {
  assert.equal(nombreMetodo('mp '), 'Mercado Pago')
  assert.equal(nombreMetodo(' cash '), 'Efectivo')
})

test('los alias se comparan normalizados: Cta. Cte., CTA CTE y cta.cte. caen todos en el mismo lugar', () => {
  const existentes = [{ id: 'id-cc', nombre: 'Cuenta Cte.' }, ...CON_DESCONOCIDO]
  for (const variante of ['Cta. Cte.', 'CTA CTE', 'cta.cte.', 'Cta Cte']) {
    const { porCode } = resolverMetodos([{ code: 'x', name: variante }], existentes)
    assert.equal(porCode.get('x')?.id, 'id-cc', variante)
  }
})

// --- Nombres que matchean solos, sin necesitar alias ---

test('Efectivo, Tarjeta y Nota de credito matchean solos por nombre normalizado, sin alias', () => {
  const existentes = [
    { id: 'id-efectivo', nombre: 'Efectivo' },
    { id: 'id-tarjeta', nombre: 'Tarjeta' },
    { id: 'id-nc', nombre: 'Nota de Crédito' },
    ...CON_DESCONOCIDO,
  ]
  const casos = [
    { code: 'efectivo', name: 'Efectivo', esperado: 'id-efectivo' },
    { code: 'tarjeta', name: 'Tarjeta', esperado: 'id-tarjeta' },
    { code: 'nota-credito', name: 'Nota de crédito', esperado: 'id-nc' },
  ]
  for (const { code, name, esperado } of casos) {
    const { porCode, sinResolver } = resolverMetodos([{ code, name }], existentes)
    assert.equal(porCode.get(code)?.id, esperado, name)
    assert.deepEqual(sinResolver, [], name)
  }
})
