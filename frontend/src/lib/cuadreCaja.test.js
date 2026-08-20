import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  calcularCuadre, TOLERANCIA, ROL_POR_CLASIFICACION, ROL_POR_TIPO_MOVIMIENTO,
  ORIGENES_QUE_CUADRAN_POR_MOVIMIENTOS,
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
  // Modelo simple: los gastos no participan de la cuenta de la venta.
  assert.ok(BACK.includes('const esperado = efectivo + cobros'), 'el backend cambio la formula del esperado')
})

test('CONTRATO: la fuente es SIEMPRE detalles, con fallback legacy por movimientos', () => {
  // Modelo simple (DEV-82): los movimientos se convirtieron en detalles de
  // tres tipos, asi que la fuente por origen desaparecio. El fallback existe
  // solo para cajas viejas sin convertir (movimientos y cero detalles).
  assert.ok(/detalles\.length === 0 && movimientos\.length > 0/.test(BACK))
})

test('CONTRATO: los origenes que cuadran por movimientos coinciden', () => {
  // FFUDO se sumo a TAPTAP: el job de Fudo tambien escribe los cobros como
  // CajaMovimiento. Si diverge de un lado, una caja de Fudo cuadraria en la
  // pantalla y descuadraria al guardar (o viceversa).
  const m = BACK.match(/export const ORIGENES_QUE_CUADRAN_POR_MOVIMIENTOS = \[([^\]]*)\]/)
  assert.ok(m, 'no se encontro ORIGENES_QUE_CUADRAN_POR_MOVIMIENTOS en el backend')
  const delBackend = m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
  assert.deepEqual(ORIGENES_QUE_CUADRAN_POR_MOVIMIENTOS, delBackend)
})

// ── la cuenta ───────────────────────────────────────────────────────────────

// La forma REAL que manda la API: `tipo` es un String con la clasificacion y el objeto del
// catalogo se llama `detalle_tipo`. Antes esto era `{ tipo: { clasificacion } }`, una forma
// que la API nunca manda, y por eso los tests pasaban con el lib roto.
const detalle = (monto, clasificacion) => ({ monto, tipo: clasificacion })
const mov = (tipo, monto, metodo) => ({ tipo, monto, metodo_pago: metodo ? { nombre: metodo } : null })

test('por detalles: cuadra cuando el total es efectivo + cobros (los gastos van aparte)', () => {
  const c = calcularCuadre({
    origin: 'DCSMART', efectivo: 1000, total: 1500,
    detalles: [detalle(500, 'cobro'), detalle(100, 'gasto')],
  })
  assert.equal(c.esperado, 1500)
  assert.equal(c.gastos, 100)
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

test('en TAPTAP convertida, la fuente son los detalles', () => {
  const c = calcularCuadre({
    origin: 'TAPTAP', efectivo: 1000, total: 1500,
    movimientos: [],
    detalles: [detalle(500, 'cobro')],
  })
  assert.equal(c.fuente, 'detalles')
  assert.equal(c.esperado, 1500)
  assert.equal(c.cuadra, true)
})

test('una caja TAPTAP sin convertir cae al fallback por movimientos', () => {
  const c = calcularCuadre({
    origin: 'TAPTAP', efectivo: 1000, total: 1500,
    movimientos: [mov('COBRO', 500, 'Mercado Pago')],
    detalles: [],
  })
  assert.equal(c.fuente, 'movimientos')
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

test('un gasto no cambia la venta: el efectivo de TapTap es lo cobrado en bruto', () => {
  // Medido en LUCERO: efectivo + cobros daba el total EXACTO y restar los
  // gastos inventaba una diferencia de 455.328. El gasto se informa aparte.
  const c = calcularCuadre({
    origin: 'TAPTAP', efectivo: 1000, total: 1000,
    movimientos: [mov('GASTO', 100, 'Efectivo')],
  })
  assert.equal(c.gastos, 100)
  assert.equal(c.esperado, 1000)
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

test('en FFUDO convertida, los detalles de tres tipos hacen la cuenta', () => {
  const c = calcularCuadre({
    origin: 'FFUDO', efectivo: 10000, total: 30000,
    movimientos: [],
    detalles: [detalle(20000, 'cobro'), detalle(30000, 'informativo')],
  })
  assert.equal(c.fuente, 'detalles')
  assert.equal(c.cobros, 20000)
  assert.equal(c.esperado, 30000)
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

test('el tono elige el color: verde cuadra, ROJO no cuadra', () => {
  // El descuadre era ambar y se leia como "ojo" en vez de "esto esta mal". Pedido del
  // usuario: rojo si no esta en cero, verde si cuadra.
  assert.equal(colorCuadre('ok'), 'var(--green)')
  assert.equal(colorCuadre('alerta'), 'var(--red)')
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
  assert.equal(rolDeDetalle({ tipo: 'cobro' }), 'cobro')
  // La del propio detalle gana sobre la del tipo del catalogo.
  assert.equal(rolDeDetalle({ tipo: 'gasto', detalle_tipo: { clasificacion: 'cobro' } }), 'gasto')
  // Sin clasificacion propia, la del catalogo.
  assert.equal(rolDeDetalle({ detalle_tipo: { clasificacion: 'gasto' } }), 'gasto')
})

test('una clasificacion desconocida cuenta como cobro, igual que en el backend', () => {
  // Este test decia lo contrario ("es informativa, no cobro") con el argumento de que fallar
  // hacia "no cuenta" es lo seguro. Es defendible, pero el backend es la autoridad: es lo que
  // se guarda y lo que usa la reporteria, y ahi un detalle sin clasificar cuenta como cobro
  // para que no desaparezca del calculo sin aviso. Si la pantalla decidiera distinto,
  // mostraria una diferencia que el servidor no comparte.
  assert.equal(rolDeDetalle({ tipo: 'nueva' }), 'cobro')
  assert.equal(rolDeDetalle({}), 'cobro')
  assert.equal(rolDeMovimiento({ tipo: 'NUEVO' }), 'informativo')
})

test('reconoce el efectivo escrito de cualquier forma', () => {
  assert.equal(esEfectivo('Efectivo'), true)
  assert.equal(esEfectivo('EFECTIVO'), true)
  assert.equal(esEfectivo('efectivo en caja'), true)
  assert.equal(esEfectivo('Mercado Pago'), false)
  // Multi-moneda (DON ALDO): "Efectivo Reales/dolar" es un COBRO en otra
  // moneda, no el efectivo del cajon en pesos.
  assert.equal(esEfectivo('Efectivo Reales'), false)
  assert.equal(esEfectivo('Efectivo dólar'), false)
  assert.equal(esEfectivo('Efectivo dolar'), false)
  assert.equal(esEfectivo('Efectivo USD'), false)
  assert.equal(esEfectivo(null), false)
})

// ── CONTRATO de verdad: las dos funciones, con las mismas entradas ───────────
//
// El contrato anterior comparaba las CONSTANTES (ROL_POR_CLASIFICACION y
// ROL_POR_TIPO_MOVIMIENTO) leyendo el archivo del backend como texto. Las constantes
// coincidian y las FUNCIONES no: este lib leia `detalle.tipo.clasificacion` (como si `tipo`
// fuera un objeto) y caia en 'informativo'. Todos los detalles contaban como informativos y
// el cuadre en vivo ignoraba los cobros, en produccion, desde el 13/08.
//
// Comparar las constantes no alcanza. Estos tests importan la funcion del backend y corren
// las dos con las mismas entradas -- incluida la forma EXACTA que manda la API.

import {
  rolDeDetalle as rolDetalleBackend,
  rolDeMovimiento as rolMovBackend,
  calcularCuadre as calcularBackend,
} from '../../../backend/src/lib/cuadreCaja.js'

test('CONTRATO: rolDeDetalle da lo mismo en los dos lados', () => {
  const casos = [
    // La forma que manda la API: tipo string + detalle_tipo objeto.
    { tipo: 'cobro', detalle_tipo: { clasificacion: 'informativo' } },
    { tipo: 'gasto', detalle_tipo: { clasificacion: 'cobro' } },
    { tipo: 'informativo' },
    { tipo: null, detalle_tipo: { clasificacion: 'cobro' } },
    { tipo: null, detalle_tipo: null },
    {},
    // Clasificaciones historicas que siguen en la base.
    { tipo: 'ingreso' }, { tipo: 'medio_pago' }, { tipo: 'egreso' },
    { tipo: 'canal' }, { tipo: 'otro' }, { tipo: 'calculo' },
    // Basura.
    { tipo: 'nueva' }, { tipo: '' }, { tipo: 0 },
  ]
  for (const c of casos) {
    assert.equal(rolDeDetalle(c), rolDetalleBackend(c), `difieren con ${JSON.stringify(c)}`)
  }
})

test('CONTRATO: rolDeMovimiento da lo mismo en los dos lados', () => {
  for (const t of ['COBRO', 'GASTO', 'INICIAL', 'RETIRO', 'VACIADO', 'INGRESO', 'EGRESO', 'NUEVO', null]) {
    assert.equal(rolDeMovimiento({ tipo: t }), rolMovBackend({ tipo: t }), `difieren con ${t}`)
  }
})

test('CONTRATO: calcularCuadre da el MISMO numero en los dos lados', () => {
  // Lo que de verdad importa: que la pantalla y el servidor digan la misma diferencia.
  const cajas = [
    {
      origin: 'DCSMART', total: 20000, efectivo: 12000,
      detalles: [{ tipo: 'cobro', monto: 5000 }, { tipo: 'cobro', monto: 3000 }],
      movimientos: [],
    },
    {
      origin: 'DCSMART', total: 15000, efectivo: 10000,
      detalles: [{ tipo: 'cobro', monto: 6000 }, { tipo: 'gasto', monto: 1000 }, { tipo: 'informativo', monto: 999 }],
      movimientos: [],
    },
    {
      origin: 'TAPTAP', total: 30000, efectivo: 20000,
      detalles: [{ tipo: 'cobro', monto: 9999 }],
      movimientos: [
        { tipo: 'COBRO', monto: 10000, metodo_pago: { nombre: 'MP QR' } },
        { tipo: 'COBRO', monto: 5000, metodo_pago: { nombre: 'Efectivo' } },
        { tipo: 'GASTO', monto: 1000, metodo_pago: { nombre: 'Efectivo' } },
      ],
    },
    {
      origin: 'FFUDO', total: 30000, efectivo: 10000,
      detalles: [{ tipo: 'informativo', monto: 30000 }],
      movimientos: [
        { tipo: 'COBRO', monto: 10000, metodo_pago: { nombre: 'Efectivo' } },
        { tipo: 'COBRO', monto: 20000, metodo_pago: { nombre: 'Mercado Pago' } },
      ],
    },
    // Caja sin total: no hay con que comparar.
    { origin: 'DCSMART', total: null, efectivo: 500, detalles: [{ tipo: 'cobro', monto: 100 }], movimientos: [] },
    // Detalle sin clasificacion, el caso que la divergencia rompia.
    { origin: 'DCSMART', total: 1000, efectivo: 0, detalles: [{ monto: 1000 }], movimientos: [] },
  ]
  for (const caja of cajas) {
    const a = calcularCuadre(caja)
    const b = calcularBackend(caja)
    assert.equal(a.cobros, b.cobros, `cobros difieren en ${JSON.stringify(caja.detalles)}`)
    assert.equal(a.gastos, b.gastos, 'gastos difieren')
    assert.equal(a.esperado, b.esperado, 'esperado difiere')
    assert.equal(a.diferencia, b.diferencia, 'la diferencia difiere: la pantalla y el servidor dirian numeros distintos')
    assert.equal(a.cuadra, b.cuadra, 'cuadra difiere')
    assert.equal(a.fuente, b.fuente, 'la fuente difiere')
  }
})
