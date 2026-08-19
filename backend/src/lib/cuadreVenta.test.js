import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCuadreVenta, calcularEfectivoFisico, esVentaNoCobrada } from './cuadreVenta.js'

const det = (monto, clasificacion, nombre = 'x') => ({ monto, tipo: clasificacion, nombre })
const mov = (tipo, monto, metodo) => ({ tipo, monto, metodo_pago: { nombre: metodo } })

// ── Qué es venta que quedó sin cobrar ─────────────────────────────────────

test('reconoce los nombres que TapTap y Fudo usan para la venta no cobrada', () => {
  for (const n of ['Cta Cte', 'cta cte', 'Cuenta Corriente', 'Mesas Abiertas', 'A Cobrar', 'mesa abierta']) {
    assert.equal(esVentaNoCobrada(n), true, n)
  }
})

test('no confunde un canal de venta con venta no cobrada', () => {
  for (const n of ['Delivery', 'Takeaway', 'Salón', 'Web', 'Tarjetas', 'Mostrador']) {
    assert.equal(esVentaNoCobrada(n), false, n)
  }
})

// Cuando el detalle sale del catálogo, su `nombre` queda null y el nombre real
// vive en el tipo -- así los guarda el sync de TapTap, que es justo donde la
// venta fiada importa. Mirar solo `d.nombre` la hacía invisible.
test('la venta fiada se reconoce aunque el nombre venga del tipo del catalogo', () => {
  const r = calcularCuadreVenta({
    total: 1000, efectivo: 300, origin: 'TAPTAP',
    movimientos: [mov('COBRO', 300, 'Efectivo'), mov('COBRO', 600, 'MP Point')],
    detalles: [{ monto: 100, tipo: 'informativo', nombre: null, detalle_tipo: { nombre: 'Cta Cte', clasificacion: 'informativo' } }],
  })
  assert.equal(r.no_cobrado, 100)
  assert.equal(r.cuadra, true)
})

// ── Cuadre de VENTA ───────────────────────────────────────────────────────

test('la venta se explica con el efectivo cobrado y los cobros no efectivo', () => {
  const r = calcularCuadreVenta({
    total: 1100, efectivo: 100,
    detalles: [det(1000, 'cobro')], movimientos: []
  })
  assert.equal(r.efectivo_cobrado, 100)
  assert.equal(r.cobros_no_efectivo, 1000)
  assert.equal(r.esperado, 1100)
  assert.equal(r.cuadra, true)
})

// El caso que motivó todo: LATINO TACUARI 84 turno 753. La diferencia de
// 19.700 era exactamente el detalle "Cta Cte", que el cuadre viejo ignoraba
// por ser una caja TapTap (miraba solo movimientos).
test('la venta fiada cuenta como venta explicada, venga por detalle', () => {
  const r = calcularCuadreVenta({
    total: 996390, efectivo: 205000, origin: 'TAPTAP',
    movimientos: [
      mov('COBRO', 205000, 'Efectivo'), mov('COBRO', 2700, 'Fiserv'),
      mov('COBRO', 375200, 'MP Point'), mov('COBRO', 10400, 'MpDelivery'),
      mov('COBRO', 342050, 'PedidosYa'), mov('COBRO', 41340, 'Rappi'),
      mov('RETIRO', 205000, 'Efectivo'),
    ],
    detalles: [det(19700, 'informativo', 'Cta Cte'), det(521102, 'informativo', 'Takeaway')]
  })
  assert.equal(r.no_cobrado, 19700)
  assert.equal(r.diferencia, 0)
  assert.equal(r.cuadra, true)
})

// En las cajas cargadas a mano el campo `efectivo` es lo que QUEDÓ en el cajón,
// ya neteado de los gastos que se pagaron con esa misma plata. Para reconstruir
// lo que se cobró hay que devolverle los gastos.
// Caso real de LOS GALGOS: cuadra exacto sumándolos, y daba 74.800 (2x los
// gastos) cuando se restaban.
test('en carga manual los gastos se devuelven al efectivo para reconstruir lo cobrado', () => {
  const r = calcularCuadreVenta({
    total: 3284530, efectivo: 789030, origin: 'DCSMART',
    detalles: [det(2458100, 'ingreso'), det(37400, 'egreso')], movimientos: []
  })
  assert.equal(r.efectivo_cobrado, 826430) // 789.030 + 37.400
  assert.equal(r.diferencia, 0)
  assert.equal(r.cuadra, true)
})

// Cuando el origen informa el cobro en efectivo como movimiento, ese dato es
// bruto y manda: sumarle los gastos lo inflaría.
test('con cobro en efectivo informado, los gastos no se suman', () => {
  const r = calcularCuadreVenta({
    total: 1000, efectivo: 800, origin: 'TAPTAP',
    movimientos: [mov('COBRO', 800, 'Efectivo'), mov('COBRO', 200, 'MP Point'), mov('GASTO', 50, 'Efectivo')],
    detalles: []
  })
  assert.equal(r.efectivo_cobrado, 800)
  assert.equal(r.cuadra, true)
})

test('los canales de venta no suman: son desglose de lo que ya esta en el total', () => {
  const r = calcularCuadreVenta({
    total: 1000, efectivo: 1000, origin: 'TAPTAP',
    movimientos: [mov('COBRO', 1000, 'Efectivo')],
    detalles: [det(600, 'informativo', 'Takeaway'), det(400, 'informativo', 'Delivery'), det(1000, 'informativo', 'Tarjetas')]
  })
  assert.equal(r.cuadra, true)
  assert.equal(r.diferencia, 0)
})

test('los movimientos que solo mueven plata del cajon no tocan la venta', () => {
  const base = { total: 500, efectivo: 500, origin: 'TAPTAP', detalles: [] }
  const sinMover = calcularCuadreVenta({ ...base, movimientos: [mov('COBRO', 500, 'Efectivo')] })
  const conMover = calcularCuadreVenta({ ...base, movimientos: [
    mov('COBRO', 500, 'Efectivo'), mov('INICIAL', 200, 'Efectivo'),
    mov('RETIRO', 300, 'Efectivo'), mov('VACIADO', 100, 'Efectivo'),
  ] })
  assert.equal(sinMover.diferencia, conMover.diferencia)
})

test('sin total cargado no hay nada contra que comparar', () => {
  const r = calcularCuadreVenta({ total: null, efectivo: 100, detalles: [], movimientos: [] })
  assert.equal(r.cuadra, null)
  assert.equal(r.diferencia, null)
})

test('la tolerancia de un peso absorbe el redondeo', () => {
  const r = calcularCuadreVenta({ total: 1000.4, efectivo: 1000, detalles: [], movimientos: [] })
  assert.equal(r.cuadra, true)
})

test('montos basura no propagan NaN', () => {
  const r = calcularCuadreVenta({ total: 100, efectivo: 'abc', detalles: [det('x', 'cobro')], movimientos: [] })
  assert.equal(Number.isFinite(r.esperado), true)
})

test('caja vacia o nula no explota', () => {
  assert.equal(calcularCuadreVenta(null), null)
  assert.equal(calcularCuadreVenta({}).cuadra, null)
})

// ── Cuadre del EFECTIVO FÍSICO ────────────────────────────────────────────

test('lo que deberia quedar en el cajon: inicial + cobrado - gastos - retiros - vaciados', () => {
  const r = calcularEfectivoFisico({
    efectivo: 205000, origin: 'TAPTAP',
    movimientos: [
      mov('INICIAL', 20000, 'Efectivo'),
      mov('COBRO', 205000, 'Efectivo'),
      mov('GASTO', 5000, 'Efectivo'),
      mov('RETIRO', 150000, 'Efectivo'),
      mov('VACIADO', 20000, 'Efectivo'),
    ],
    detalles: []
  })
  assert.equal(r.inicial, 20000)
  assert.equal(r.cobrado, 205000)
  assert.equal(r.gastos, 5000)
  assert.equal(r.retiros, 150000)
  assert.equal(r.vaciados, 20000)
  assert.equal(r.queda, 50000)
})

test('solo cuenta el efectivo: un gasto pagado con tarjeta no sale del cajon', () => {
  const r = calcularEfectivoFisico({
    efectivo: 100, movimientos: [mov('COBRO', 100, 'Efectivo'), mov('GASTO', 80, 'MP Point')], detalles: []
  })
  assert.equal(r.gastos, 0)
})

test('sin movimientos de caja el circuito de efectivo no se puede armar', () => {
  const r = calcularEfectivoFisico({ efectivo: 500, origin: 'DCSMART', movimientos: [], detalles: [] })
  assert.equal(r.disponible, false)
})

// Fudo informa cobros y gastos pero NO fondo inicial, retiros ni vaciados: con
// eso no se puede decir cuánto quedó en el cajón.
test('con solo cobros y gastos el circuito sigue incompleto', () => {
  const r = calcularEfectivoFisico({
    efectivo: 200, origin: 'FFUDO',
    movimientos: [mov('COBRO', 200, 'Efectivo'), mov('GASTO', 12, 'Efectivo')], detalles: []
  })
  assert.equal(r.disponible, false)
})

// El ejemplo 908: el retiro se anotó como movimiento pero el cobro en efectivo
// vive en el campo. Mirando solo los movimientos, el cajón daba -150.000.
test('el cajon no queda negativo cuando el cobro en efectivo no es un movimiento', () => {
  const r = calcularEfectivoFisico({
    efectivo: 200000, origin: 'DCSMART',
    movimientos: [mov('COBRO', 100000, 'Tarjeta de Crédito'), mov('RETIRO', 150000, 'Efectivo')],
    detalles: []
  })
  assert.equal(r.cobrado, 200000)
  assert.equal(r.queda, 50000)
  assert.ok(r.queda >= 0)
})
