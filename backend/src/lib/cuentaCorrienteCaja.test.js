import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLASIFICACIONES_QUE_CARGAN, clasificacionDeDetalle, cargaCuenta, cargoDeDetalle,
  totalesCajaCliente, totalesCajaPorCliente, whereDetallesCliente, validarClienteDetalle,
} from './cuentaCorrienteCaja.js'
import { calcularCuadre } from './cuadreCaja.js'

const CLI = 'cli-1'

// ── que cuenta como cargo ───────────────────────────────────────────────────

test('un detalle sin cliente no toca ninguna cuenta', () => {
  assert.equal(cargaCuenta({ tipo: 'cobro', monto: 5000 }), false)
  assert.equal(cargoDeDetalle({ tipo: 'cobro', monto: 5000 }), 0)
})

test('cobro con cliente: venta que quedo en su cuenta', () => {
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: 'cobro', monto: 5000 }), 5000)
})

test('gasto con cliente: la caja pago algo a su nombre', () => {
  // Los dos casos suman a lo que el cliente debe. Lo que BAJA la deuda es la cobranza, y
  // esa se carga como op ingreso CTA CTE CLI, del lado de pagos.
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: 'gasto', monto: 3000 }), 3000)
})

test('informativo con cliente NO mueve la cuenta', () => {
  // Es desglose de algo ya contado (un canal de venta), no plata que alguien deba.
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: 'informativo', monto: 9000 }), 0)
})

test('el monto va en positivo aunque venga negativo', () => {
  // La direccion no la lleva el signo: misma convencion que el resto del proyecto.
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: 'cobro', monto: -5000 }), 5000)
})

test('un monto que no es numero cuenta 0 en vez de NaN', () => {
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: 'cobro', monto: 'ocho mil' }), 0)
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: 'cobro', monto: null }), 0)
})

// ── clasificacion efectiva ──────────────────────────────────────────────────

test('la clasificacion del detalle gana sobre la de su tipo', () => {
  // Misma precedencia que el cuadre: el usuario la elige al cargar el detalle.
  const d = { id_cliente: CLI, tipo: 'informativo', detalle_tipo: { clasificacion: 'cobro' }, monto: 100 }
  assert.equal(clasificacionDeDetalle(d), 'informativo')
  assert.equal(cargoDeDetalle(d), 0)
})

test('sin clasificacion propia usa la del tipo del catalogo', () => {
  const d = { id_cliente: CLI, tipo: null, detalle_tipo: { clasificacion: 'cobro' }, monto: 100 }
  assert.equal(cargoDeDetalle(d), 100)
})

test('acepta las clasificaciones historicas de la base', () => {
  // 'ingreso'/'medio_pago' -> cobro, 'egreso' -> gasto, 'canal'/'otro' -> informativo.
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: 'ingreso', monto: 100 }), 100)
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: 'egreso', monto: 100 }), 100)
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: 'canal', monto: 100 }), 0)
})

test('sin clasificacion en ningun lado no carga', () => {
  // El cuadre asume cobro cuando falta, pero cobrarle a un cliente por un detalle sin
  // clasificar es inventarle deuda: aca hace falta el dato.
  assert.equal(cargoDeDetalle({ id_cliente: CLI, tipo: null, monto: 100 }), 0)
})

// ── totales ─────────────────────────────────────────────────────────────────

test('suma los cargos y cuenta los movimientos', () => {
  const t = totalesCajaCliente([
    { id_cliente: CLI, tipo: 'cobro', monto: 5000 },
    { id_cliente: CLI, tipo: 'gasto', monto: 3000 },
    { tipo: 'cobro', monto: 999999 },                       // de otra caja, sin cliente
  ])
  assert.equal(t.cargado, 8000)
  assert.equal(t.cantidad, 2)
})

test('los informativos con cliente se cuentan aparte y no suman', () => {
  // Esconderlos del todo haria que un monto cargado a nombre de alguien desapareciera sin
  // explicacion.
  const t = totalesCajaCliente([
    { id_cliente: CLI, tipo: 'cobro', monto: 5000 },
    { id_cliente: CLI, tipo: 'informativo', monto: 2000 },
  ])
  assert.equal(t.cargado, 5000)
  assert.equal(t.informativos, 2000)
  assert.equal(t.cantidad_informativos, 1)
})

test('sin detalles todo en cero, no undefined', () => {
  for (const entrada of [[], null, undefined]) {
    const t = totalesCajaCliente(entrada)
    assert.deepEqual(t, { cargado: 0, cantidad: 0, informativos: 0, cantidad_informativos: 0 })
  }
})

// ── groupBy para el listado ─────────────────────────────────────────────────

test('los totales del listado salen del groupBy', () => {
  const out = totalesCajaPorCliente([
    { id_cliente: 'a', tipo: 'cobro', _sum: { monto: 5000 } },
    { id_cliente: 'a', tipo: 'gasto', _sum: { monto: 1000 } },
    { id_cliente: 'b', tipo: 'cobro', _sum: { monto: 200 } },
    { id_cliente: null, tipo: 'cobro', _sum: { monto: 999 } },
  ])
  assert.equal(out.a.cargado, 6000)
  assert.equal(out.b.cargado, 200)
  assert.equal(Object.keys(out).length, 2, 'las filas sin cliente no crean cuenta')
})

test('el listado y la ficha usan el mismo criterio', () => {
  // Si el criterio viviera dos veces, el numero del listado y el de la ficha podrian
  // discrepar para el mismo cliente. Un informativo no suma en ninguno de los dos.
  const out = totalesCajaPorCliente([
    { id_cliente: 'a', tipo: 'informativo', _sum: { monto: 7000 } },
  ])
  assert.equal(out.a.cargado, 0)
  assert.equal(out.a.informativos, 7000)
})

// ── el where ────────────────────────────────────────────────────────────────

test('los detalles se traen de todos los locales del grupo', () => {
  // Un cliente puede consumir en cualquier local: recortar por local daria saldos
  // incompletos. Mismo criterio que whereMovimientosCliente.
  assert.deepEqual(whereDetallesCliente(CLI), { id_cliente: CLI })
})

// ── validacion al guardar ───────────────────────────────────────────────────

test('sin cliente no valida nada', () => {
  assert.equal(validarClienteDetalle(null, 'informativo'), null)
  assert.equal(validarClienteDetalle('', null), null)
})

test('cliente con cobro o con gasto se acepta', () => {
  assert.equal(validarClienteDetalle(CLI, 'cobro'), null)
  assert.equal(validarClienteDetalle(CLI, 'gasto'), null)
})

test('cliente con informativo se rechaza y explica que hacer', () => {
  // Sin esto se guarda plata a nombre de alguien que no figura en su saldo.
  const err = validarClienteDetalle(CLI, 'informativo')
  assert.ok(err)
  assert.match(err, /cobro o gasto/)
})

test('cliente sin clasificacion se rechaza', () => {
  assert.ok(validarClienteDetalle(CLI, null))
  assert.ok(validarClienteDetalle(CLI, ''))
})

test('la validacion acepta los valores historicos', () => {
  assert.equal(validarClienteDetalle(CLI, 'ingreso'), null)
  assert.equal(validarClienteDetalle(CLI, 'egreso'), null)
  assert.ok(validarClienteDetalle(CLI, 'canal'))
})

// ── el cuadre de caja no cambia ─────────────────────────────────────────────

test('CUADRE: una venta a cuenta corriente sigue contando como cobro', () => {
  // `total` es la VENTA del turno, no la plata del cajon: una venta a cuenta corriente
  // esta dentro de esa venta y tiene que sumar como cobro igual que Mercado Pago. Si se
  // excluyera, toda caja con una venta a cuenta quedaria descuadrada.
  const caja = {
    origin: 'DCSMART',
    efectivo: 100000,
    total: 150000,
    detalles: [{ id_cliente: CLI, tipo: 'cobro', monto: 50000 }],
  }
  const c = calcularCuadre(caja)
  assert.equal(c.cobros, 50000)
  assert.equal(c.cuadra, true, `diferencia ${c.diferencia}`)
})

test('CUADRE: el mismo detalle con y sin cliente da el mismo numero', () => {
  const base = { origin: 'DCSMART', efectivo: 100000, total: 150000 }
  const sin = calcularCuadre({ ...base, detalles: [{ tipo: 'cobro', monto: 50000 }] })
  const con = calcularCuadre({ ...base, detalles: [{ id_cliente: CLI, tipo: 'cobro', monto: 50000 }] })
  assert.deepEqual(con, sin, 'atribuir un detalle a un cliente cambio el cuadre')
})

// ── contrato ────────────────────────────────────────────────────────────────

test('CONTRATO: el esquema tiene id_cliente en caja_detalles con su indice', () => {
  // Sin la columna no hay a que atribuir; sin el indice, cada apertura de ficha escanea
  // caja_detalles entera (la tabla mas grande del sistema).
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
  const i = schema.indexOf('model CajaDetalle')
  assert.ok(i > -1)
  const bloque = schema.slice(i, schema.indexOf('\n}', i))
  assert.match(bloque, /id_cliente\s+String\?/)
  assert.match(bloque, /@@index\(\[id_cliente\]\)/)
})
