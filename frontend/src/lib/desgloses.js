// Desglose de las tablas internas de una caja (detalles y movimientos).
//
// Una caja de LATINO PASEO llega a 48 movimientos y 18 detalles. Planos, en una
// sola lista, no se puede leer nada: los 6 VACIADO quedan mezclados entre los
// COBRO y no hay forma de ver cuánto se vació en total sin sumar a mano.
//
// Acá se agrupa en dos niveles, cada uno con su total:
//   - movimientos: por tipo (VACIADO, COBRO, RETIRO…) y dentro por método de pago
//   - detalles:    por clasificación (Cobro, Gasto, Informativo) y dentro por nombre
//
// Es lógica pura y sin React a propósito: el componente que la dibuja
// (components/TablaDesglose.jsx) no decide nada sobre los números.

import { clasificacionDeDetalle, clasificacionLabel, normalizarClasificacion } from './clasificaciones.js'

// Orden del flujo de la caja, no alfabético: primero lo que entra, después lo
// que sale, y el vaciado al final porque es el cierre del circuito. Un tipo que
// no esté acá (o que se agregue al enum más adelante) va al final.
const ORDEN_MOVIMIENTOS = ['INICIAL', 'COBRO', 'INGRESO', 'GASTO', 'EGRESO', 'RETIRO', 'VACIADO']

// Espejo de `TipoMovimiento` en prisma/schema.prisma.
const LABEL_MOVIMIENTOS = {
  INICIAL: 'Inicial',
  COBRO:   'Cobro',
  INGRESO: 'Ingreso',
  GASTO:   'Gasto',
  EGRESO:  'Egreso',
  RETIRO:  'Retiro',
  VACIADO: 'Vaciado',
}

// Orden de las clasificaciones de detalle: primero lo que suma, después lo que
// resta, y lo informativo al final porque no entra en la diferencia de caja.
const ORDEN_CLASIFICACIONES = ['cobro', 'gasto', 'informativo']

export const SIN_DATO = '—'

// Los montos llegan como Decimal de Prisma, que viaja en el JSON como string.
export function montoDe(item) {
  const n = Number(item?.monto ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function sumaMontos(items) {
  return (items ?? []).reduce((acc, i) => acc + montoDe(i), 0)
}

function capitalizar(texto) {
  const s = String(texto)
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// Ordena por una lista fija; lo que no está en la lista queda al final y entre
// sí alfabético, para que el orden no dependa de cómo vino el array.
function porOrdenFijo(orden) {
  return (a, b) => {
    const ia = orden.indexOf(a.clave)
    const ib = orden.indexOf(b.clave)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return String(a.label).localeCompare(String(b.label), 'es')
  }
}

// Agrupador base. `clave`/`label` definen el nivel 1 y `subclave`/`sublabel` el
// nivel 2. Preserva el orden de llegada de los items dentro de cada grupo: son
// asientos de un turno y el orden cronológico es el que le sirve al cajero.
function agrupar(items, { clave, label, subclave, sublabel, orden = [] }) {
  const grupos = new Map()

  for (const item of items ?? []) {
    const k = clave(item)
    if (!grupos.has(k)) grupos.set(k, { clave: k, label: label(item, k), items: [] })
    grupos.get(k).items.push(item)
  }

  const resultado = [...grupos.values()].map((g) => {
    const subs = new Map()
    for (const item of g.items) {
      const sk = subclave(item)
      if (!subs.has(sk)) subs.set(sk, { clave: sk, label: sublabel(item, sk), items: [] })
      subs.get(sk).items.push(item)
    }
    const subgrupos = [...subs.values()].map((s) => ({
      ...s, total: sumaMontos(s.items), cantidad: s.items.length,
    }))

    return {
      ...g,
      total: sumaMontos(g.items),
      cantidad: g.items.length,
      subgrupos,
      // El segundo nivel sólo aporta si agrupa algo: con un subgrupo por item
      // serían las mismas filas con una cabecera de más en el medio.
      subdividir: subgrupos.length > 1 && subgrupos.some((s) => s.cantidad > 1),
    }
  })

  return resultado.sort(porOrdenFijo(orden))
}

// Movimientos: nivel 1 el tipo, nivel 2 el método de pago.
export function agruparMovimientos(movimientos) {
  return agrupar(movimientos, {
    clave:    (m) => m?.tipo ?? SIN_DATO,
    label:    (_m, k) => LABEL_MOVIMIENTOS[k] ?? (k === SIN_DATO ? 'Sin tipo' : capitalizar(k)),
    subclave: (m) => m?.metodo_pago?.nombre ?? SIN_DATO,
    sublabel: (_m, k) => (k === SIN_DATO ? 'Sin método' : k),
    orden:    ORDEN_MOVIMIENTOS,
  })
}

// Detalles: nivel 1 la clasificación efectiva, nivel 2 el nombre del tipo.
//
// La clasificación se normaliza porque las cajas históricas traen valores viejos
// ('ingreso', 'medio_pago', 'canal'…) que son el mismo concepto que uno de los
// tres vigentes; sin normalizar, la misma caja mostraba "Ingreso" y "Cobro" como
// dos grupos separados. Un detalle sin clasificación propia ni en su tipo cae en
// su propio grupo en vez de asumirle una.
export function agruparDetalles(detalles) {
  return agrupar(detalles, {
    clave:    (d) => {
      const propia = clasificacionDeDetalle(d)
      return propia ? normalizarClasificacion(propia) : SIN_DATO
    },
    label:    (_d, k) => (k === SIN_DATO ? 'Sin clasificar' : clasificacionLabel(k)),
    subclave: (d) => d?.detalle_tipo?.nombre ?? d?.nombre ?? SIN_DATO,
    sublabel: (_d, k) => (k === SIN_DATO ? 'Sin nombre' : k),
    orden:    ORDEN_CLASIFICACIONES,
  })
}

// Cuántas filas hay que dibujar si todo estuviera abierto. Sirve para decidir si
// conviene arrancar expandido: en una caja de 3 movimientos esconderlos detrás
// de un grupo es peor que mostrarlos.
export const LIMITE_AUTOEXPANDIR = 8

export function arrancaExpandido(grupos) {
  const filas = (grupos ?? []).reduce((acc, g) => acc + g.cantidad, 0)
  return filas <= LIMITE_AUTOEXPANDIR
}
