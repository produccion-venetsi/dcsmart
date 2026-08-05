import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarDescuadre, agruparDetallesReporte } from './descuadreAgregado.js'

// Sin detalles ni movimientos, calcularCuadre usa la fuente 'detalles' con
// cobros=0 y gastos=0, asi que esperado = efectivo y diferencia = total - efectivo.
const caja = (total, efectivo) => ({ total, efectivo, detalles: [], movimientos: [] })

test('sin cajas devuelve todo en cero', () => {
  assert.deepEqual(agregarDescuadre([]), { absoluto: 0, cantidad_cajas: 0, sin_total: 0 })
})

test('una caja que cuadra no aporta descuadre', () => {
  assert.deepEqual(agregarDescuadre([caja(1000, 1000)]), { absoluto: 0, cantidad_cajas: 0, sin_total: 0 })
})

test('un faltante y un sobrante iguales NO se cancelan', () => {
  const r = agregarDescuadre([caja(900, 1000), caja(1100, 1000)])
  assert.equal(r.absoluto, 200)
  assert.equal(r.cantidad_cajas, 2)
})

test('las cajas sin total cargado se cuentan aparte y no ensucian el desvio', () => {
  const r = agregarDescuadre([caja(1000, 1000), caja(null, 500)])
  assert.equal(r.absoluto, 0)
  assert.equal(r.cantidad_cajas, 0)
  assert.equal(r.sin_total, 1)
})

test('una diferencia de un peso entra en la tolerancia y no es descuadre', () => {
  const r = agregarDescuadre([caja(1001, 1000)])
  assert.equal(r.cantidad_cajas, 0)
  assert.equal(r.absoluto, 0)
})

test('una diferencia de dos pesos ya es descuadre', () => {
  const r = agregarDescuadre([caja(1002, 1000)])
  assert.equal(r.cantidad_cajas, 1)
  assert.equal(r.absoluto, 2)
})

test('el descuadre tiene en cuenta cobros y gastos de los detalles', () => {
  // esperado = efectivo(500) + cobros(300) - gastos(100) = 700; total 700 cuadra.
  const c = {
    total: 700, efectivo: 500, movimientos: [],
    detalles: [
      { tipo: 'cobro', monto: 300, detalle_tipo: { nombre: 'MP QR', clasificacion: 'cobro' } },
      { tipo: 'gasto', monto: 100, detalle_tipo: { nombre: 'Fletes', clasificacion: 'gasto' } },
    ],
  }
  assert.equal(agregarDescuadre([c]).cantidad_cajas, 0)
})

test('cajas null en la lista no rompen', () => {
  const r = agregarDescuadre([null, caja(1000, 1000)])
  assert.equal(r.sin_total, 1)
  assert.equal(r.cantidad_cajas, 0)
})

// ── agruparDetallesReporte ──────────────────────────────────────────────────

const det = (clasificacion, nombre, monto) => ({
  tipo: clasificacion, monto, detalle_tipo: { nombre, clasificacion },
})

test('sin detalles devuelve lista vacia', () => {
  assert.deepEqual(agruparDetallesReporte([]), [])
})

test('agrupa por clasificacion y dentro por nombre, con totales', () => {
  const r = agruparDetallesReporte([
    det('cobro', 'MP QR', 100),
    det('cobro', 'MP QR', 50),
    det('gasto', 'Fletes', 30),
  ])
  assert.equal(r.length, 2)
  assert.equal(r[0].clasificacion, 'cobro')
  assert.equal(r[0].label, 'Cobros')
  assert.equal(r[0].total, 150)
  assert.equal(r[0].cantidad, 2)
  assert.deepEqual(r[0].subgrupos, [{ nombre: 'MP QR', total: 150, cantidad: 2 }])
  assert.equal(r[1].clasificacion, 'gasto')
  assert.equal(r[1].total, 30)
})

test('ordena cobro, gasto, informativo', () => {
  const r = agruparDetallesReporte([
    det('informativo', 'Delivery', 10),
    det('gasto', 'Fletes', 10),
    det('cobro', 'MP QR', 10),
  ])
  assert.deepEqual(r.map(g => g.clasificacion), ['cobro', 'gasto', 'informativo'])
})

test('normaliza las clasificaciones historicas al mismo grupo', () => {
  // 'ingreso' y 'medio_pago' son cobros en ROL_POR_CLASIFICACION.
  const r = agruparDetallesReporte([
    det('cobro', 'A', 10),
    det('ingreso', 'B', 20),
    det('medio_pago', 'C', 30),
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].clasificacion, 'cobro')
  assert.equal(r[0].total, 60)
})

test('canal y otro son informativos, no cobros', () => {
  const r = agruparDetallesReporte([det('canal', 'Rappi', 10), det('otro', 'Ajuste', 5)])
  assert.equal(r.length, 1)
  assert.equal(r[0].clasificacion, 'informativo')
  assert.equal(r[0].total, 15)
})

test('un detalle sin nombre de tipo usa su nombre libre', () => {
  const r = agruparDetallesReporte([
    { tipo: 'gasto', monto: 15, nombre: 'Cargado a mano', detalle_tipo: null },
  ])
  assert.deepEqual(r[0].subgrupos, [{ nombre: 'Cargado a mano', total: 15, cantidad: 1 }])
})

test('sin clasificacion propia ni en su tipo se asume cobro, igual que el cuadre', () => {
  const r = agruparDetallesReporte([{ tipo: null, monto: 40, nombre: 'X', detalle_tipo: null }])
  assert.equal(r[0].clasificacion, 'cobro')
})

test('monto como string se suma bien', () => {
  const r = agruparDetallesReporte([det('cobro', 'MP QR', '10.50')])
  assert.equal(r[0].total, 10.5)
})

test('los subgrupos vienen ordenados de mayor a menor', () => {
  const r = agruparDetallesReporte([
    det('cobro', 'Chico', 5),
    det('cobro', 'Grande', 500),
    det('cobro', 'Medio', 50),
  ])
  assert.deepEqual(r[0].subgrupos.map(s => s.nombre), ['Grande', 'Medio', 'Chico'])
})

test('la suma de los subgrupos da el total del grupo', () => {
  const r = agruparDetallesReporte([
    det('cobro', 'A', 10), det('cobro', 'B', 20), det('gasto', 'C', 30),
  ])
  for (const g of r) {
    assert.equal(g.subgrupos.reduce((s, x) => s + x.total, 0), g.total)
    assert.equal(g.subgrupos.reduce((s, x) => s + x.cantidad, 0), g.cantidad)
  }
})
