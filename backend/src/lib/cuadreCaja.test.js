import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCuadre, rolDeDetalle, rolDeMovimiento, TOLERANCIA } from './cuadreCaja.js'

const det = (monto, clasificacion) => ({ monto, detalle_tipo: clasificacion ? { clasificacion } : null })
const mov = (tipo, monto, metodo) => ({ tipo, monto, metodo_pago: metodo ? { nombre: metodo } : null })

// ── Roles ───────────────────────────────────────────────────────────────────

test('las clasificaciones vigentes mapean a su rol', () => {
  assert.equal(rolDeDetalle(det(1, 'cobro')), 'cobro')
  assert.equal(rolDeDetalle(det(1, 'gasto')), 'gasto')
  assert.equal(rolDeDetalle(det(1, 'informativo')), 'informativo')
})

test('las clasificaciones historicas siguen calculando igual', () => {
  // Los 6444 detalles "ingreso" de produccion son cobros no-efectivo
  assert.equal(rolDeDetalle(det(1, 'ingreso')), 'cobro')
  assert.equal(rolDeDetalle(det(1, 'medio_pago')), 'cobro')
  assert.equal(rolDeDetalle(det(1, 'egreso')), 'gasto')
  // canal (Delivery, Rappi) es desglose de venta: ya esta dentro del total
  assert.equal(rolDeDetalle(det(1, 'canal')), 'informativo')
  assert.equal(rolDeDetalle(det(1, 'otro')), 'informativo')
  assert.equal(rolDeDetalle(det(1, 'calculo')), 'informativo')
})

test('un detalle sin tipo se cuenta como cobro, no se descarta en silencio', () => {
  assert.equal(rolDeDetalle(det(1, null)), 'cobro')
  assert.equal(rolDeDetalle({ monto: 1 }), 'cobro')
})

test('una clasificacion desconocida cae en cobro', () => {
  assert.equal(rolDeDetalle(det(1, 'algo_nuevo')), 'cobro')
})

test('la clasificacion elegida en el detalle gana sobre la del tipo', () => {
  // El caso real: un tipo "Rappi" clasificado como cobro, que en esta caja se
  // carga como informativo porque el monto ya venia incluido en el total.
  const conOverride = { monto: 1, tipo: 'informativo', detalle_tipo: { clasificacion: 'cobro' } }
  assert.equal(rolDeDetalle(conOverride), 'informativo')

  // Y al reves: un tipo informativo que en esta caja si suma.
  const alReves = { monto: 1, tipo: 'cobro', detalle_tipo: { clasificacion: 'informativo' } }
  assert.equal(rolDeDetalle(alReves), 'cobro')
})

test('sin clasificacion propia se usa la del tipo', () => {
  // Detalles viejos: se cargaron antes de que la clasificacion fuera elegible.
  assert.equal(rolDeDetalle({ monto: 1, tipo: null, detalle_tipo: { clasificacion: 'gasto' } }), 'gasto')
  assert.equal(rolDeDetalle({ monto: 1, detalle_tipo: { clasificacion: 'informativo' } }), 'informativo')
})

test('el override tambien acepta valores historicos', () => {
  assert.equal(rolDeDetalle({ monto: 1, tipo: 'egreso', detalle_tipo: { clasificacion: 'cobro' } }), 'gasto')
  assert.equal(rolDeDetalle({ monto: 1, tipo: 'canal', detalle_tipo: { clasificacion: 'cobro' } }), 'informativo')
})

test('solo COBRO y GASTO participan de los movimientos', () => {
  assert.equal(rolDeMovimiento(mov('COBRO', 1)), 'cobro')
  assert.equal(rolDeMovimiento(mov('GASTO', 1)), 'gasto')
  for (const t of ['INICIAL', 'RETIRO', 'VACIADO', 'INGRESO', 'EGRESO']) {
    assert.equal(rolDeMovimiento(mov(t, 1)), 'informativo', `${t} no deberia participar`)
  }
})

// ── Cuadre por detalles (origen DCSMART) ────────────────────────────────────

test('cuadra: efectivo + cobros = total', () => {
  const r = calcularCuadre({
    total: 576450, efectivo: 127300,
    detalles: [det(449150, 'cobro')]
  })
  assert.equal(r.fuente, 'detalles')
  assert.equal(r.diferencia, 0)
  assert.equal(r.cuadra, true)
})

test('detecta el descuadre chico de tipeo (caso real de 878: $40)', () => {
  const r = calcularCuadre({
    total: 576410, efectivo: 127300,
    detalles: [det(449150, 'cobro')]
  })
  assert.equal(r.diferencia, -40)
  assert.equal(r.cuadra, false)
})

test('los gastos de un detalle RESTAN', () => {
  const r = calcularCuadre({
    total: 900, efectivo: 100,
    detalles: [det(1000, 'cobro'), det(200, 'gasto')]
  })
  assert.equal(r.cobros, 1000)
  assert.equal(r.gastos, 200)
  assert.equal(r.esperado, 900)
  assert.equal(r.cuadra, true)
})

test('caja real de produccion: LOS GALGOS ya no cuadra restando los gastos', () => {
  // La misma caja cuadraba exacto cuando los gastos SUMABAN (fix c0fdf51). Con
  // la resta vuelve a dar una diferencia de 74.800, que es 2x los gastos -- la
  // firma de un signo de gasto invertido respecto de lo esperado. Documentado
  // a proposito: es la consecuencia conocida y aceptada de este cambio.
  const r = calcularCuadre({
    total: 3284530, efectivo: 789030,
    detalles: [det(2458100, 'ingreso'), det(37400, 'egreso')]
  })
  assert.equal(r.cobros, 2458100)
  assert.equal(r.gastos, 37400)
  assert.equal(r.esperado, 3209730)
  assert.equal(r.diferencia, 74800)
  assert.equal(r.cuadra, false)
})

test('sin gastos la formula no cambia', () => {
  // Todas las cajas TapTap caen aca: tienen cero gastos. El arreglo no las toca.
  const r = calcularCuadre({
    total: 1100, efectivo: 100, detalles: [det(1000, 'cobro')]
  })
  assert.equal(r.gastos, 0)
  assert.equal(r.esperado, 1100)
  assert.equal(r.cuadra, true)
})

test('los informativos no mueven la diferencia', () => {
  const conInformativos = calcularCuadre({
    total: 1100, efectivo: 100,
    detalles: [det(1000, 'cobro'), det(500, 'canal'), det(300, 'informativo')]
  })
  assert.equal(conInformativos.cuadra, true)
  assert.equal(conInformativos.informativos, 800)
  // El mismo caso sin los informativos da idéntico
  const sinEllos = calcularCuadre({ total: 1100, efectivo: 100, detalles: [det(1000, 'cobro')] })
  assert.equal(conInformativos.diferencia, sinEllos.diferencia)
})

test('funciona sin efectivo cargado (null o cero)', () => {
  const conNull = calcularCuadre({ total: 1000, efectivo: null, detalles: [det(1000, 'cobro')] })
  assert.equal(conNull.cuadra, true)
  const conCero = calcularCuadre({ total: 1000, efectivo: 0, detalles: [det(1000, 'cobro')] })
  assert.equal(conCero.cuadra, true)
})

// ── Cuadre por movimientos (origen TAPTAP) ──────────────────────────────────

test('con origin TAPTAP se valida por movimientos, sin importar los detalles', () => {
  const r = calcularCuadre({
    total: 1000, efectivo: 300, origin: 'TAPTAP',
    detalles: [det(999999, 'informativo')],
    movimientos: [mov('COBRO', 300, 'Efectivo'), mov('COBRO', 700, 'Mercado Pago')]
  })
  assert.equal(r.fuente, 'movimientos')
  // El cobro en efectivo NO se suma: ya esta en caja.efectivo
  assert.equal(r.cobros, 700)
  assert.equal(r.esperado, 1000)
  assert.equal(r.cuadra, true)
})

test('el fondo inicial y los vaciados no afectan la diferencia', () => {
  const base = [mov('COBRO', 800, 'Mercado Pago')]
  const sinRuido = calcularCuadre({ total: 800, efectivo: 0, origin: 'TAPTAP', movimientos: base })
  const conRuido = calcularCuadre({
    total: 800, efectivo: 0, origin: 'TAPTAP',
    movimientos: [...base, mov('INICIAL', 5000, 'Efectivo'), mov('VACIADO', 3000, 'Mercado Pago'), mov('RETIRO', 900, 'Efectivo')]
  })
  assert.equal(sinRuido.diferencia, conRuido.diferencia)
  assert.equal(conRuido.cuadra, true)
})

test('con origin distinto de TAPTAP se valida por detalles, aunque haya movimientos cargados', () => {
  // Caso real: ATTE 04/08/2026 turno 1 (origin DCSMART) tenia un gasto suelto
  // cargado como movimiento ademas de los cobros por detalle. Antes, ese
  // movimiento activaba la fuente 'movimientos' e ignoraba los detalles
  // enteros. Ahora la fuente depende solo del origin.
  const r = calcularCuadre({
    total: 500, efectivo: 100,
    detalles: [det(400, 'cobro')],
    movimientos: [mov('GASTO', 5000, 'Efectivo')]
  })
  assert.equal(r.fuente, 'detalles')
  assert.equal(r.cuadra, true)
})

test('los gastos en movimientos restan siempre, incluso en efectivo', () => {
  // A diferencia de un cobro (que duplicaria caja.efectivo), un gasto en
  // efectivo no duplica nada: salio del cajon igual que cualquier otro gasto.
  const enEfectivo = calcularCuadre({
    total: 600, efectivo: 0, origin: 'TAPTAP',
    movimientos: [mov('COBRO', 700, 'Mercado Pago'), mov('GASTO', 100, 'Efectivo')]
  })
  assert.equal(enEfectivo.gastos, 100)
  assert.equal(enEfectivo.cuadra, true)

  const conTarjeta = calcularCuadre({
    total: 600, efectivo: 0, origin: 'TAPTAP',
    movimientos: [mov('COBRO', 700, 'Mercado Pago'), mov('GASTO', 100, 'Credito')]
  })
  assert.equal(conTarjeta.gastos, 100)
  assert.equal(conTarjeta.cuadra, true)
})

// ── Bordes ──────────────────────────────────────────────────────────────────

test('sin total cargado no se marca descuadre', () => {
  const r = calcularCuadre({ total: null, efectivo: 100, detalles: [det(50, 'cobro')] })
  assert.equal(r.diferencia, null)
  assert.equal(r.cuadra, null)
})

test('una caja vacia no explota', () => {
  const r = calcularCuadre({ total: 0, efectivo: null })
  assert.equal(r.esperado, 0)
  assert.equal(r.cuadra, true)
})

test('caja nula devuelve null', () => {
  assert.equal(calcularCuadre(null), null)
  assert.equal(calcularCuadre(undefined), null)
})

test('montos basura se tratan como cero en vez de propagar NaN', () => {
  const r = calcularCuadre({ total: 100, efectivo: 100, detalles: [det('no-es-numero', 'cobro'), det(undefined, 'cobro')] })
  assert.equal(r.cobros, 0)
  assert.equal(r.cuadra, true)
})

test('la tolerancia absorbe el redondeo de centavos', () => {
  const r = calcularCuadre({ total: 1000.005, efectivo: 1000, detalles: [] })
  assert.ok(Math.abs(r.diferencia) <= TOLERANCIA)
  assert.equal(r.cuadra, true)
})

test('los montos vienen como Decimal string desde Prisma', () => {
  // Prisma devuelve Decimal, que serializa como string en JSON
  const r = calcularCuadre({
    total: '1100.00', efectivo: '100.00',
    detalles: [{ monto: '1000.00', detalle_tipo: { clasificacion: 'cobro' } }]
  })
  assert.equal(r.cuadra, true)
})

test('una diferencia de un peso o menos no es descuadre (redondeo)', () => {
  const r = calcularCuadre({ total: 1000.5, efectivo: 1000, detalles: [] })
  assert.equal(r.cuadra, true)
})

test('una diferencia mayor a un peso si es descuadre', () => {
  const r = calcularCuadre({ total: 1002, efectivo: 1000, detalles: [] })
  assert.equal(r.cuadra, false)
  assert.equal(r.diferencia, 2)
})
