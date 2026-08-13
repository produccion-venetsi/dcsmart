import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  calcularCuadre, TOLERANCIA, ROL_POR_CLASIFICACION, ROL_POR_TIPO_MOVIMIENTO,
  rolDeDetalle, rolDeMovimiento, esEfectivo,
  describirCuadre, colorCuadre, faltaParaCuadrar,
} from './cuadreCaja.js'

const BACK = readFileSync(
  new URL('../../../backend/src/lib/cuadreCaja.js', import.meta.url), 'utf8'
).replace(/\r\n/g, '\n')

// ── contrato con el backend ─────────────────────────────────────────────────
//
// Este archivo es un ESPEJO. El backend es la fuente de verdad y recalcula al guardar; si
// las dos formulas se separan, la pantalla muestra un descuadre que al guardar cambia.

test('CONTRATO: la tolerancia es la misma', () => {
  const m = BACK.match(/export const TOLERANCIA = (\d+)/)
  assert.ok(m, 'no se encontro TOLERANCIA en el backend')
  assert.equal(TOLERANCIA, Number(m[1]))
})

const mapaDelBackend = (nombre) => {
  const m = BACK.match(new RegExp(`export const ${nombre} = \\{([\\s\\S]*?)\\n\\}`))
  assert.ok(m, `no se encontro ${nombre} en el backend`)
  return Object.fromEntries(
    [...m[1].matchAll(/^\s*(\w+):\s*'(\w+)'/gm)].map(x => [x[1], x[2]])
  )
}

test('CONTRATO: los roles por clasificacion coinciden', () => {
  // Un rol distinto de un lado cambia si un detalle suma, resta o no cuenta.
  assert.deepEqual(ROL_POR_CLASIFICACION, mapaDelBackend('ROL_POR_CLASIFICACION'))
})

test('CONTRATO: los roles por tipo de movimiento coinciden', () => {
  assert.deepEqual(ROL_POR_TIPO_MOVIMIENTO, mapaDelBackend('ROL_POR_TIPO_MOVIMIENTO'))
})

test('CONTRATO: la formula del esperado es la misma', () => {
  assert.ok(BACK.includes('efectivo + cobros - gastos'), 'el backend cambio la formula del esperado')
})

test('CONTRATO: la fuente se elige por origin, no por lo que tenga cargado', () => {
  // Elegirla mirando "si tiene movimientos" fue un bug real: una caja no-TapTap con un
  // gasto suelto por movimiento hacia ignorar $3.559.398 en detalles.
  assert.ok(/origin === 'TAPTAP' \? 'movimientos' : 'detalles'/.test(BACK))
})

// ── la cuenta ───────────────────────────────────────────────────────────────

const detalle = (monto, clasificacion) => ({ monto, tipo: { clasificacion } })
const mov = (tipo, monto, metodo) => ({ tipo, monto, metodo_pago: metodo ? { nombre: metodo } : null })

test('por detalles: cuadra cuando el total es efectivo + cobros - gastos', () => {
  const c = calcularCuadre({
    origin: 'DCSMART', efectivo: 1000, total: 1400,
    detalles: [detalle(500, 'cobro'), detalle(100, 'gasto')],
  })
  assert.equal(c.esperado, 1400)
  assert.equal(c.diferencia, 0)
  assert.equal(c.cuadra, true)
  assert.equal(c.fuente, 'detalles')
})

test('los informativos no entran en la cuenta', () => {
  // Son desglose de algo ya contado (canales de venta, totales de tarjeta).
  const c = calcularCuadre({
    origin: 'DCSMART', efectivo: 1000, total: 1000,
    detalles: [detalle(9999, 'canal'), detalle(8888, 'informativo')],
  })
  assert.equal(c.esperado, 1000)
  assert.equal(c.cuadra, true)
  assert.equal(c.informativos, 9999 + 8888)
})

test('una diferencia de un peso todavia cuadra', () => {
  // No circulan centavos: las diferencias de $0,01 son redondeo de Decimal, no errores.
  assert.equal(calcularCuadre({ origin: 'DCSMART', efectivo: 0, total: 1, detalles: [] }).cuadra, true)
  assert.equal(calcularCuadre({ origin: 'DCSMART', efectivo: 0, total: 2, detalles: [] }).cuadra, false)
})

test('en TAPTAP la fuente son los movimientos', () => {
  const c = calcularCuadre({
    origin: 'TAPTAP', efectivo: 1000, total: 1500,
    movimientos: [mov('COBRO', 500, 'Mercado Pago')],
    detalles: [detalle(99999, 'cobro')], // se ignoran
  })
  assert.equal(c.fuente, 'movimientos')
  assert.equal(c.esperado, 1500)
  assert.equal(c.cuadra, true)
})

test('en TAPTAP un cobro en EFECTIVO no se suma dos veces', () => {
  // Ya esta en caja.efectivo; sumarlo de nuevo inventaria plata.
  const c = calcularCuadre({
    origin: 'TAPTAP', efectivo: 1000, total: 1000,
    movimientos: [mov('COBRO', 1000, 'Efectivo')],
  })
  assert.equal(c.cobros, 0)
  assert.equal(c.esperado, 1000)
  assert.equal(c.cuadra, true)
})

test('en TAPTAP un gasto en efectivo SI resta', () => {
  // No duplica nada: salio del cajon igual que cualquier gasto, y no restarlo lo esconde.
  const c = calcularCuadre({
    origin: 'TAPTAP', efectivo: 1000, total: 900,
    movimientos: [mov('GASTO', 100, 'Efectivo')],
  })
  assert.equal(c.gastos, 100)
  assert.equal(c.esperado, 900)
  assert.equal(c.cuadra, true)
})

test('el fondo inicial, los retiros y los vaciados no cambian la venta', () => {
  const c = calcularCuadre({
    origin: 'TAPTAP', efectivo: 1000, total: 1000,
    movimientos: [mov('INICIAL', 5000), mov('RETIRO', 300), mov('VACIADO', 700)],
  })
  assert.equal(c.esperado, 1000)
  assert.equal(c.cuadra, true)
})

test('sin total cargado no hay diferencia, y no dice que cuadra', () => {
  // `cuadra: null` y no `false`: no se sabe todavia, y mostrar "no cuadra" mientras se
  // esta cargando seria mentir.
  const c = calcularCuadre({ origin: 'DCSMART', efectivo: 500, total: null, detalles: [] })
  assert.equal(c.diferencia, null)
  assert.equal(c.cuadra, null)
  assert.equal(c.esperado, 500)
})

test('un total vacio se trata como sin cargar, no como cero', () => {
  // El input manda '' mientras se escribe: tratarlo como 0 marca un descuadre falso.
  const c = calcularCuadre({ origin: 'DCSMART', efectivo: 500, total: '', detalles: [] })
  assert.equal(c.cuadra, null)
})

test('aguanta caja nula, montos raros y listas que faltan', () => {
  assert.equal(calcularCuadre(null), null)
  const c = calcularCuadre({ origin: 'DCSMART', efectivo: 'abc', total: 0 })
  assert.equal(c.efectivo, 0)
  assert.equal(c.esperado, 0)
  assert.equal(c.cuadra, true)
})

// ── el signo, que se lee al reves de lo que parece ──────────────────────────

test('diferencia POSITIVA significa que falta cargar', () => {
  // El total declarado supera a los componentes: hay venta sin respaldo cargado.
  const c = calcularCuadre({ origin: 'DCSMART', efectivo: 0, total: 1000, detalles: [] })
  assert.equal(c.diferencia, 1000)
  assert.equal(describirCuadre(c).texto, 'Falta cargar')
})

test('diferencia NEGATIVA significa que se cargo de mas', () => {
  const c = calcularCuadre({ origin: 'DCSMART', efectivo: 2000, total: 1000, detalles: [] })
  assert.equal(c.diferencia, -1000)
  assert.equal(describirCuadre(c).texto, 'Cargado de más')
})

test('el texto nunca deja el numero pelado', () => {
  // En cajas el signo se lee al reves que en arqueo: "+1000" solo se entiende con etiqueta.
  assert.equal(describirCuadre({ diferencia: 0, cuadra: true }).texto, 'Cuadra')
  assert.equal(describirCuadre({ diferencia: null }).texto, 'Falta cargar el total del turno')
  assert.equal(describirCuadre(null).texto, '')
})

test('el tono elige el color', () => {
  assert.equal(colorCuadre('ok'), 'var(--green)')
  assert.equal(colorCuadre('alerta'), 'var(--amber)')
  assert.equal(colorCuadre('neutro'), 'var(--t3)')
})

test('faltaParaCuadrar dice CUANTO, en positivo', () => {
  // Es la accion: "faltan $1.000" dice que buscar; "diferencia -1000" hay que pensarlo.
  assert.equal(faltaParaCuadrar({ diferencia: -1000, cuadra: false }), 1000)
  assert.equal(faltaParaCuadrar({ diferencia: 1000, cuadra: false }), 1000)
  assert.equal(faltaParaCuadrar({ diferencia: 0, cuadra: true }), 0)
  assert.equal(faltaParaCuadrar({ diferencia: null }), 0)
  assert.equal(faltaParaCuadrar(null), 0)
})

// ── roles ───────────────────────────────────────────────────────────────────

test('el rol del detalle sale del tipo, o del detalle si viene plano', () => {
  assert.equal(rolDeDetalle({ tipo: { clasificacion: 'cobro' } }), 'cobro')
  assert.equal(rolDeDetalle({ clasificacion: 'gasto' }), 'gasto')
})

test('una clasificacion desconocida es informativa, no cobro', () => {
  // Fallar hacia "no cuenta" es lo seguro: contarla como cobro inventa plata.
  assert.equal(rolDeDetalle({ tipo: { clasificacion: 'nueva' } }), 'informativo')
  assert.equal(rolDeDetalle({}), 'informativo')
  assert.equal(rolDeMovimiento({ tipo: 'NUEVO' }), 'informativo')
})

test('reconoce el efectivo escrito de cualquier forma', () => {
  assert.equal(esEfectivo('Efectivo'), true)
  assert.equal(esEfectivo('EFECTIVO'), true)
  assert.equal(esEfectivo('efectivo en caja'), true)
  assert.equal(esEfectivo('Mercado Pago'), false)
  assert.equal(esEfectivo(null), false)
})
