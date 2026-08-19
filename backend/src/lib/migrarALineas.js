// Convierte lo que hoy son dos tablas (CajaMovimiento y CajaDetalle) en las
// líneas únicas de una caja.
//
// La conversión es puro mapeo salvo en tres puntos, que son los que deciden si
// la estructura nueva sirve o no:
//
//  1. LA VENTA FIADA pasa a ser una categoría (FIADO) en vez de adivinarse por
//     el texto del nombre. Hoy se detecta con una expresión regular sobre
//     `nombre`, que falla cuando el nombre vive en el tipo del catálogo y la
//     fila lo tiene en null -- justo como los guarda el sync de TapTap.
//
//  2. EL COBRO EN EFECTIVO se materializa como línea. Hoy en las cajas
//     manuales vive en el campo `caja.efectivo`, que además es NETO de gastos:
//     por eso el cuadre tenía que reconstruirlo sumando los gastos. Con una
//     línea explícita el campo pasa a ser lo declarado, y se puede comparar
//     contra la suma en vez de tener que interpretarlo.
//
//  3. LOS DETALLES SIN CLASIFICAR (el 78%) se resuelven por el nombre del tipo,
//     que es la única pista que hay. Lo que no se puede clasificar queda
//     INFORMATIVO, que es el default seguro: no suma en ninguna cuenta.

import { esEfectivo } from './cuadreCaja.js'
import { esResumenDeMovimientos } from './cuadreVenta.js'

// Tipo de movimiento -> categoría. EGRESO es el histórico de GASTO.
const POR_TIPO_MOVIMIENTO = {
  COBRO: 'COBRO',
  GASTO: 'GASTO',
  EGRESO: 'GASTO',
  INICIAL: 'INICIAL',
  RETIRO: 'RETIRO',
  VACIADO: 'VACIADO',
  INGRESO: 'INGRESO',
}

// Clasificación de detalle -> categoría, incluyendo los valores históricos que
// siguen en la base (ingreso/medio_pago eran cobros; canal/otro, informativos).
const POR_CLASIFICACION = {
  cobro: 'COBRO',
  ingreso: 'COBRO',
  medio_pago: 'COBRO',
  gasto: 'GASTO',
  egreso: 'GASTO',
  informativo: 'INFORMATIVO',
  canal: 'INFORMATIVO',
  otro: 'INFORMATIVO',
  calculo: 'INFORMATIVO',
}

const RE_FIADO = /cta\s*cte|cuenta\s*corriente|mesas?\s*abiert|a\s*cobrar/i
const RE_DIFERENCIA = /^diffs?\b|^ajustes?\b/i

export function nombreDeDetalle(d) {
  return d?.nombre ?? d?.detalle_tipo?.nombre ?? ''
}

// La categoría de un detalle. El nombre gana sobre la clasificación cuando
// identifica un concepto que el cuadre trata distinto: una "Cta Cte" es venta
// fiada aunque venga marcada como informativa, que es como la manda TapTap.
export function categoriaDeDetalle(detalle, { sumaMovsNoEfectivo = 0 } = {}) {
  const nombre = nombreDeDetalle(detalle)
  if (RE_FIADO.test(nombre)) return 'FIADO'
  if (RE_DIFERENCIA.test(nombre)) return 'DIFERENCIA'
  const clasif = detalle?.tipo ?? detalle?.detalle_tipo?.clasificacion ?? null
  const cat = POR_CLASIFICACION[clasif] ?? 'INFORMATIVO'
  // Un detalle-cobro que es el RESUMEN de los movimientos de la misma caja
  // (el "Tarjetas" de DON ALDO) migra como informativo: su plata ya esta en
  // las lineas que vienen de los movimientos. Sin esto, la caja migrada
  // duplicaba el cobro y descuadraba por exactamente ese monto.
  if (cat === 'COBRO' && esResumenDeMovimientos(detalle, sumaMovsNoEfectivo)) return 'INFORMATIVO'
  return cat
}

export function categoriaDeMovimiento(mov) {
  return POR_TIPO_MOVIMIENTO[mov?.tipo] ?? 'INFORMATIVO'
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Devuelve las líneas que le corresponden a una caja. No escribe nada: quien
// llama decide qué hacer con ellas, así se puede simular la migración entera
// antes de tocar una fila.
export function lineasDeCaja(caja) {
  if (!caja) return []
  const lineas = []

  for (const m of caja.movimientos ?? []) {
    lineas.push({
      id_caja: caja.id,
      categoria: categoriaDeMovimiento(m),
      monto: num(m.monto),
      id_metodo: m.id_metodo ?? null,
      cantidad: m.cantidad ?? null,
      id_tipo: null,
      nombre: null,
      id_cliente: null,
      observaciones: null,
      migrada_de: `movimiento:${m.id}`,
    })
  }

  const sumaMovsNoEfectivo = (caja.movimientos ?? [])
    .filter((m) => m.tipo === 'COBRO' && !esEfectivo(m.metodo_pago?.nombre))
    .reduce((a, m) => a + num(m.monto), 0)

  for (const d of caja.detalles ?? []) {
    lineas.push({
      id_caja: caja.id,
      categoria: categoriaDeDetalle(d, { sumaMovsNoEfectivo }),
      monto: num(d.monto),
      id_metodo: null,
      cantidad: null,
      id_tipo: d.id_tipo ?? null,
      nombre: d.nombre ?? null,
      id_cliente: d.id_cliente ?? null,
      observaciones: d.observaciones ?? null,
      migrada_de: `detalle:${d.id}`,
    })
  }

  // El cobro en efectivo, cuando no existe como línea. En las cajas manuales
  // vive en el campo y está NETO de los gastos que se pagaron con esa plata,
  // así que se le devuelven para que la línea represente lo que realmente
  // entró (es la misma regla que hoy aplica el cuadre, ver lib/cuadreVenta.js).
  const hayCobroEfectivo = (caja.movimientos ?? []).some(
    (m) => m.tipo === 'COBRO' && esEfectivo(m.metodo_pago?.nombre)
  )
  const efectivoDeclarado = num(caja.efectivo)
  if (!hayCobroEfectivo && efectivoDeclarado !== 0) {
    // Solo los gastos que vienen de un DETALLE: son los del flujo manual, donde
    // el cajero resta el gasto antes de contar. Los gastos por movimiento no
    // salieron del efectivo declarado (medido en LOS GALGOS).
    const gastos = lineas
      .filter((l) => l.categoria === 'GASTO' && String(l.migrada_de).startsWith('detalle:'))
      .reduce((a, l) => a + l.monto, 0)
    lineas.push({
      id_caja: caja.id,
      categoria: 'COBRO',
      monto: efectivoDeclarado + gastos,
      id_metodo: null,
      cantidad: null,
      id_tipo: null,
      nombre: 'Efectivo',
      id_cliente: null,
      observaciones: null,
      migrada_de: 'campo:efectivo',
    })
  }

  return lineas
}
