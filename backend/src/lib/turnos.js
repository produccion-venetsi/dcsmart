// Desglose del reporte de cajas por turno.
//
// El reporte ya permitía FILTRAR por turno, pero para comparar los turnos entre
// sí había que mirar el reporte una vez por turno y anotar los números. Esto
// devuelve una fila por turno con lo mismo que el reporte muestra arriba, más
// el desglose de métodos y detalles de cada uno.

import { fromTipoTurnoEnum } from './tipoTurno.js'

// Las cajas viejas y las importadas pueden no tener turno. Se muestran igual,
// agrupadas bajo esta etiqueta: sacarlas haría que la suma de los turnos no dé
// el total del reporte, y esa diferencia sin explicación es peor que la fila.
export const SIN_TURNO = 'Sin turno'

// Orden en que se muestran: el del día, no alfabético ni por monto. Un reporte
// que cambia de orden según cuál turno vendió más es imposible de comparar
// entre períodos.
export const ORDEN_TURNOS = ['Mañana', 'Tarde', 'Noche', 'Trasnoche', 'Evento', 'Otros', SIN_TURNO]

// Prisma devuelve la clave del enum (MANANA); el SQL crudo, la etiqueta
// ("Mañana") por el @map. Esto acepta las dos y siempre devuelve la etiqueta.
export function etiquetaTurno(valor) {
  if (valor == null || valor === '') return SIN_TURNO
  return fromTipoTurnoEnum(valor)
}

// Venta promedio por cubierto (comensal). Distinto del ticket promedio, que
// divide por tickets: dos personas en una mesa son un ticket y dos cubiertos.
//
// Sin cubiertos cargados devuelve null y NO 0: son datos que muchas cajas no
// llenan, y un 0 se lee como "cada comensal gastó cero" en vez de "no se sabe".
export function promedioPorCubierto(total, cubiertos) {
  const c = Number(cubiertos ?? 0)
  if (!c) return null
  return Math.round(Number(total ?? 0) / c)
}

// Qué parte de la venta se declaró. Devuelve number (no string) para que el
// frontend decida cómo mostrarlo. Sin ventas no es 0%: no se puede calcular.
export function pctFiscal(fiscal, total) {
  const t = Number(total ?? 0)
  if (!t) return null
  return Math.round((Number(fiscal ?? 0) / t) * 100)
}

// Ordena cualquier lista que tenga `turno` según ORDEN_TURNOS. Un turno que no
// esté en la lista (enum nuevo sin actualizar acá) va al final en vez de
// desaparecer.
export function ordenarPorTurno(items) {
  return [...items].sort((a, b) => {
    const ia = ORDEN_TURNOS.indexOf(a.turno)
    const ib = ORDEN_TURNOS.indexOf(b.turno)
    return (ia === -1 ? ORDEN_TURNOS.length : ia) - (ib === -1 ? ORDEN_TURNOS.length : ib)
  })
}

// Agrupa filas { turno, nombre, total, ... } en un Map turno -> lista ordenada
// por monto desc, con el porcentaje calculado SOBRE EL TOTAL DEL TURNO (no del
// período): dentro de la fila de un turno, lo que se quiere leer es su propia
// composición.
export function desglosarPorTurno(rows, extra = () => ({})) {
  const porTurno = new Map()

  for (const r of rows) {
    const turno = etiquetaTurno(r.turno)
    if (!porTurno.has(turno)) porTurno.set(turno, [])
    // `cant` solo si la fila la trae: cuantas operaciones componen la linea
    // (los groupCount de TapTap). null y no 0 -- "no sabemos" no es "cero".
    const cant = r.cantidad != null ? Number(r.cantidad) : null
    porTurno.get(turno).push({ name: r.nombre, val: Number(r.total ?? 0), cant, ...extra(r) })
  }

  for (const [turno, lista] of porTurno) {
    const suma = lista.reduce((s, x) => s + x.val, 0)
    lista.sort((a, b) => b.val - a.val)
    for (const x of lista) {
      x.pct = suma > 0 ? ((x.val / suma) * 100).toFixed(1) : '0.0'
    }
    porTurno.set(turno, lista)
  }

  return porTurno
}

// Suma las filas por nombre, sin mirar el turno. Sirve para reconstruir el
// total del período a partir de la misma consulta que trae el desglose, en vez
// de repetir la query agrupando distinto.
export function totalizarPorNombre(rows, extra = () => ({})) {
  const acc = new Map()

  for (const r of rows) {
    const nombre = r.nombre
    const previo = acc.get(nombre)
    const cant = r.cantidad != null ? Number(r.cantidad) : null
    if (previo) {
      previo.val += Number(r.total ?? 0)
      // Las cantidades se suman entre turnos; si ninguna fila la trae, la linea
      // queda sin cantidad en vez de mostrar un cero inventado.
      if (cant != null) previo.cant = (previo.cant ?? 0) + cant
      // Un mismo nombre marcado como egreso en algún turno lo es siempre: el
      // dato viene de la clasificación del tipo, no de la fila.
      const e = extra(r)
      if (e.egreso) previo.egreso = true
    } else {
      acc.set(nombre, { name: nombre, val: Number(r.total ?? 0), cant, ...extra(r) })
    }
  }

  return [...acc.values()].sort((a, b) => b.val - a.val)
}
