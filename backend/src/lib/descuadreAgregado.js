// Agregados de caja para el reporte: descuadre del periodo y desglose de detalles.
//
// El descuadre NO se recalcula aca: se reusa calcularCuadre de cuadreCaja.js, que
// es la unica definicion de la diferencia de caja del sistema. Ese modulo existe
// justamente porque antes habia dos copias divergentes de esta regla y la misma
// caja mostraba diferencias distintas segun desde donde se la mirara.

import { calcularCuadre, TOLERANCIA, ROL_POR_CLASIFICACION } from './cuadreCaja.js'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Suma en VALOR ABSOLUTO a proposito: un faltante de 5000 y un sobrante de 5000
// no se cancelan. La suma neta daria cero y esconderia dos errores de carga.
export function agregarDescuadre(cajas) {
  let absoluto = 0
  let cantidad_cajas = 0
  let sin_total = 0

  for (const caja of cajas ?? []) {
    const cuadre = calcularCuadre(caja)
    // Sin total declarado no hay contra que comparar: no entra en el desvio ni
    // cuenta como descuadre, pero se informa aparte para que la tarjeta pueda
    // aclarar que hay cajas sin verificar. Si no, un "0 descuadres" miente.
    if (!cuadre || cuadre.diferencia == null) { sin_total++; continue }

    const dif = Math.abs(cuadre.diferencia)
    // Misma tolerancia que el resto del sistema: abajo de un peso es redondeo de
    // Decimal, no un error de carga (no circulan centavos).
    if (dif > TOLERANCIA) {
      absoluto += dif
      cantidad_cajas++
    }
  }

  return { absoluto, cantidad_cajas, sin_total }
}

// ── Desglose de detalles ────────────────────────────────────────────────────
//
// Mismo criterio que frontend/src/lib/desgloses.js: nivel 1 la clasificacion
// efectiva, nivel 2 el nombre. Asi el numero del reporte coincide con el que se ve
// abriendo la caja. Las clasificaciones historicas ('ingreso', 'medio_pago',
// 'canal', 'egreso', 'otro', 'calculo') se normalizan con la misma tabla que usa
// el cuadre, para que la misma caja no muestre "Ingreso" y "Cobro" como dos
// grupos separados.

const ORDEN = ['cobro', 'gasto', 'informativo']
const LABEL = { cobro: 'Cobros', gasto: 'Gastos', informativo: 'Informativos' }
const SIN_NOMBRE = 'Sin nombre'

// Espeja rolDeDetalle de cuadreCaja.js: la clasificacion del propio detalle gana
// sobre la de su tipo, y sin ninguna de las dos se asume cobro (es lo que carga la
// mayoria, y evita que un detalle sin clasificar desaparezca del calculo).
function clasificacionDe(detalle) {
  const propia = detalle?.tipo ?? detalle?.detalle_tipo?.clasificacion ?? null
  if (!propia) return 'cobro'
  return ROL_POR_CLASIFICACION[propia] ?? 'cobro'
}

const nombreDe = (detalle) => detalle?.detalle_tipo?.nombre ?? detalle?.nombre ?? SIN_NOMBRE

export function agruparDetallesReporte(detalles) {
  const grupos = new Map()

  for (const d of detalles ?? []) {
    const clave = clasificacionDe(d)
    if (!grupos.has(clave)) grupos.set(clave, { total: 0, cantidad: 0, subs: new Map() })
    const g = grupos.get(clave)
    const monto = num(d?.monto)
    g.total += monto
    g.cantidad++

    const nombre = nombreDe(d)
    if (!g.subs.has(nombre)) g.subs.set(nombre, { total: 0, cantidad: 0 })
    const s = g.subs.get(nombre)
    s.total += monto
    s.cantidad++
  }

  return [...grupos.entries()]
    .map(([clasificacion, g]) => ({
      clasificacion,
      label: LABEL[clasificacion] ?? clasificacion,
      total: g.total,
      cantidad: g.cantidad,
      subgrupos: [...g.subs.entries()]
        .map(([nombre, s]) => ({ nombre, total: s.total, cantidad: s.cantidad }))
        .sort((a, b) => b.total - a.total),
    }))
    // Primero lo que suma, despues lo que resta, y lo informativo al final porque
    // no entra en la diferencia de caja.
    .sort((a, b) => ORDEN.indexOf(a.clasificacion) - ORDEN.indexOf(b.clasificacion))
}
