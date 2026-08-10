import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CUADRANTES, cuadranteDe, totalesCuentaCorriente,
  whereMovimientosCliente, validarClienteYEstado, totalesPorCliente,
} from './cuentaCorriente.js'

// Los cuatro tipos de movimiento de una cuenta corriente.
const gastoPendiente = (importe) => ({ importe, ingresa_egreso: false, pagado: false })
const gasto          = (importe) => ({ importe, ingresa_egreso: false, pagado: true })
const aCobrar        = (importe) => ({ importe, ingresa_egreso: true,  pagado: false })
const ingreso        = (importe) => ({ importe, ingresa_egreso: true,  pagado: true })

// ── clasificación ───────────────────────────────────────────────────────────

test('cada combinación de dirección y estado cae en su cuadrante', () => {
  assert.equal(cuadranteDe(gastoPendiente(1)), CUADRANTES.GASTOS_PENDIENTES)
  assert.equal(cuadranteDe(gasto(1)), CUADRANTES.GASTOS)
  assert.equal(cuadranteDe(aCobrar(1)), CUADRANTES.A_COBRAR)
  assert.equal(cuadranteDe(ingreso(1)), CUADRANTES.INGRESOS)
})

test('`pagado` decide, no `fecha_pago`', () => {
  // Hay pagos marcados como pagados sin fecha cargada. Si la fecha decidiera, esos
  // figurarian como plata a cobrar que en realidad ya se cobró.
  assert.equal(cuadranteDe({ importe: 1, ingresa_egreso: true, pagado: true, fecha_pago: null }), CUADRANTES.INGRESOS)
  assert.equal(cuadranteDe({ importe: 1, ingresa_egreso: true, pagado: false, fecha_pago: new Date() }), CUADRANTES.A_COBRAR)
})

test('cualquier cosa que no sea true se trata como no pagado / egreso', () => {
  // Misma convención que el resto del proyecto: solo `true` cuenta como true.
  assert.equal(cuadranteDe({ importe: 1, ingresa_egreso: null, pagado: null }), CUADRANTES.GASTOS_PENDIENTES)
  assert.equal(cuadranteDe({ importe: 1, ingresa_egreso: 'true', pagado: 'si' }), CUADRANTES.GASTOS_PENDIENTES)
})

// ── los cuatro totales ──────────────────────────────────────────────────────

test('los cuatro tags suman por separado', () => {
  const t = totalesCuentaCorriente([
    gastoPendiente(1000), gastoPendiente(500),
    gasto(2000),
    aCobrar(300),
    ingreso(700), ingreso(50),
  ])
  assert.equal(t.gastos_pendientes, 1500)
  assert.equal(t.gastos, 2000)
  assert.equal(t.a_cobrar, 300)
  assert.equal(t.ingresos, 750)
})

test('los no pagados CUENTAN: es la corrección que motivó este modelo', () => {
  // Antes esto devolvía todo en cero porque se filtraban los no pagados.
  const t = totalesCuentaCorriente([gastoPendiente(1000), aCobrar(400)])
  assert.equal(t.gastos_pendientes, 1000)
  assert.equal(t.a_cobrar, 400)
  assert.equal(t.total_pendiente, 1400)
})

test('lo que el cliente debe son los ingresos sin cobrar, NO egresos menos ingresos', () => {
  // El caso que aparecio con datos reales: un ingreso sin cobrar de 1.000.000 y
  // ningun egreso. Con `egresos - ingresos` daba -1.000.000, o sea "a favor
  // 1.000.000" para alguien que debe un millon.
  const t = totalesCuentaCorriente([aCobrar(1000000)])
  assert.equal(t.debe_cliente, 1000000)
  assert.equal(t.falta_pagar, 0)
})

test('cobrar deja de contar como deuda del cliente', () => {
  const sinCobrar = totalesCuentaCorriente([aCobrar(500)])
  const cobrado = totalesCuentaCorriente([ingreso(500)])
  assert.equal(sinCobrar.debe_cliente, 500)
  assert.equal(cobrado.debe_cliente, 0)
  // La plata no desaparece: pasa a ingresos.
  assert.equal(cobrado.ingresos, 500)
})

test('pagar un gasto deja de contar como pendiente del local', () => {
  assert.equal(totalesCuentaCorriente([gastoPendiente(800)]).falta_pagar, 800)
  assert.equal(totalesCuentaCorriente([gasto(800)]).falta_pagar, 0)
})

test('pagar mueve la plata de cuadrante, los totales por eje no cambian', () => {
  const sinPagar = totalesCuentaCorriente([gastoPendiente(1000), aCobrar(400)])
  const pagados  = totalesCuentaCorriente([gasto(1000), ingreso(400)])

  assert.equal(sinPagar.total_egresos, pagados.total_egresos)
  assert.equal(sinPagar.total_ingresos, pagados.total_ingresos)
  // Lo que cambia es dónde está esa plata y cuánto queda sin cerrar.
  assert.equal(sinPagar.total_pendiente, 1400)
  assert.equal(pagados.total_pendiente, 0)
})

test('los netos por eje suman pagado y sin pagar', () => {
  const t = totalesCuentaCorriente([gastoPendiente(100), gasto(200), aCobrar(30), ingreso(70)])
  assert.equal(t.total_egresos, 300)
  assert.equal(t.total_ingresos, 100)
})

test('cuenta cuántos movimientos hay en cada cuadrante', () => {
  const t = totalesCuentaCorriente([gastoPendiente(1), gastoPendiente(2), ingreso(3)])
  assert.equal(t.cantidad.gastos_pendientes, 2)
  assert.equal(t.cantidad.ingresos, 1)
  assert.equal(t.cantidad.gastos, 0)
  assert.equal(t.cantidad.a_cobrar, 0)
})

test('el monto se toma en positivo: la dirección la lleva ingresa_egreso', () => {
  // Un importe negativo cargado por error no tiene que invertir la dirección.
  const t = totalesCuentaCorriente([{ importe: -500, ingresa_egreso: false, pagado: true }])
  assert.equal(t.gastos, 500)
  assert.equal(t.total_egresos, 500)
})

test('los importes vienen como string o Decimal de Prisma y suman igual', () => {
  const t = totalesCuentaCorriente([
    { importe: '1000.50', ingresa_egreso: false, pagado: true },
    { importe: '0.50', ingresa_egreso: false, pagado: true },
  ])
  assert.equal(t.gastos, 1001)
})

test('un importe basura no rompe la cuenta ni la contamina con NaN', () => {
  const t = totalesCuentaCorriente([gasto(100), { importe: 'ocho', ingresa_egreso: false, pagado: true }])
  assert.equal(t.gastos, 100)
  assert.ok(Number.isFinite(t.total_egresos))
  assert.ok(Number.isFinite(t.debe_cliente))
})

test('sin movimientos todo queda en cero, no en null', () => {
  for (const entrada of [[], null, undefined]) {
    const t = totalesCuentaCorriente(entrada)
    assert.equal(t.debe_cliente, 0)
    assert.equal(t.falta_pagar, 0)
    assert.equal(t.gastos_pendientes, 0)
    assert.equal(t.a_cobrar, 0)
    assert.equal(t.total_pendiente, 0)
  }
})

// ── totales del listado (groupBy) ───────────────────────────────────────────

// Como los devuelve Prisma: una fila por combinación, con el importe ya sumado.
const fila = (id_cliente, ingresa_egreso, pagado, importe) =>
  ({ id_cliente, ingresa_egreso, pagado, _sum: { importe } })

test('el groupBy da los mismos cuadrantes que sumar los pagos uno por uno', () => {
  const desdeGroupBy = totalesPorCliente([
    fila('a', false, false, 1500),
    fila('a', false, true, 2000),
    fila('a', true, false, 300),
    fila('a', true, true, 750),
  ])
  const desdePagos = totalesCuentaCorriente([
    gastoPendiente(1500), gasto(2000), aCobrar(300), ingreso(750),
  ])
  // Si estas dos discreparan, el tag del listado y el de la ficha mostrarían
  // numeros distintos del mismo cliente.
  assert.equal(desdeGroupBy.a.gastos_pendientes, desdePagos.gastos_pendientes)
  assert.equal(desdeGroupBy.a.gastos, desdePagos.gastos)
  assert.equal(desdeGroupBy.a.a_cobrar, desdePagos.a_cobrar)
  assert.equal(desdeGroupBy.a.ingresos, desdePagos.ingresos)
  assert.equal(desdeGroupBy.a.debe_cliente, desdePagos.debe_cliente)
  assert.equal(desdeGroupBy.a.falta_pagar, desdePagos.falta_pagar)
})

test('separa por cliente y no mezcla', () => {
  const t = totalesPorCliente([fila('a', false, true, 100), fila('b', true, true, 40)])
  assert.equal(t.a.gastos, 100)
  assert.equal(t.a.ingresos, 0)
  assert.equal(t.b.ingresos, 40)
  assert.equal(t.b.gastos, 0)
})

test('las filas sin cliente se ignoran en vez de agruparse bajo null', () => {
  const t = totalesPorCliente([fila(null, false, true, 999), fila('a', false, true, 10)])
  assert.deepEqual(Object.keys(t), ['a'])
})

test('un _sum vacio no rompe', () => {
  const t = totalesPorCliente([{ id_cliente: 'a', ingresa_egreso: false, pagado: true, _sum: {} }])
  assert.equal(t.a.gastos, 0)
})

test('sin filas devuelve un objeto vacio', () => {
  assert.deepEqual(totalesPorCliente([]), {})
  assert.deepEqual(totalesPorCliente(null), {})
})

// ── el filtro ───────────────────────────────────────────────────────────────

test('el filtro NO excluye los no pagados', () => {
  const w = whereMovimientosCliente('cli-1')
  assert.equal(w.id_cliente, 'cli-1')
  assert.equal(w.estado_op, 'CTA_CTE_CLI')
  // Lo importante es lo que NO está: filtrar por pagado mostraba media cuenta.
  assert.equal('pagado' in w, false)
  assert.equal('fecha_pago' in w, false)
})

// ── cliente + estado_op ─────────────────────────────────────────────────────

test('cliente con CTA_CTE_CLI es la combinación válida', () => {
  assert.equal(validarClienteYEstado('cli-1', 'CTA_CTE_CLI'), null)
})

test('un pago común sin cliente no se ve afectado', () => {
  assert.equal(validarClienteYEstado(null, 'CAJA'), null)
  assert.equal(validarClienteYEstado('', 'CUENTA_CTE'), null)
  assert.equal(validarClienteYEstado(undefined, undefined), null)
})

test('cliente con otro estado se rechaza: no entraría en la cuenta', () => {
  for (const estado of ['CAJA', 'CUENTA_CTE', 'MP_PDP', 'PDP']) {
    assert.match(validarClienteYEstado('cli-1', estado), /CTA CTE CLI/)
  }
})

test('CTA_CTE_CLI sin cliente se rechaza: deuda a nombre de nadie', () => {
  assert.match(validarClienteYEstado(null, 'CTA_CTE_CLI'), /elegir el cliente/)
  assert.match(validarClienteYEstado('', 'CTA_CTE_CLI'), /elegir el cliente/)
})

test('la validación exige el mismo estado_op que usa el filtro de la cuenta', () => {
  const estadoDelFiltro = whereMovimientosCliente('cli-1').estado_op
  assert.equal(validarClienteYEstado('cli-1', estadoDelFiltro), null)
})
