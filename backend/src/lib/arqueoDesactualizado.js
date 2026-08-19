// Detecta arqueos cuyo número guardado ya no coincide con la realidad.
//
// POR QUÉ HACE FALTA
//
// El arqueo congela ingresos/gastos/comprobación en el momento de crearlo, pero
// las cajas de TapTap y Fudo entran por sync HORAS después (los cierres de un
// día aparecen a la mañana siguiente). Un arqueo hecho al mediodía se calcula
// sobre cajas que todavía no existen, y su número queda mal desde el día uno
// sin que nadie se entere.
//
// Medido en prod (2026-08): 878COOP 31/07 guardó una diferencia de 559.800 y
// hoy el mismo período da 3.090.550 -- dos millones y medio en cajas que
// llegaron tarde. GRAN-DANZON 25/07 guardó -1 (cuadraba) y hoy daría 1.165.684.
// Abrir y volver a guardar cualquiera de esos arqueos les cambia el número solo.
//
// La política es AVISAR, no corregir por atrás: el número guardado se respeta,
// y quien mira el arqueo ve que hay algo nuevo y decide. Un arqueo auditado no
// se puede actualizar sin desauditarlo primero (eso lo aplica la ruta).

import { TOLERANCIA } from './cuadreCaja.js'
import { calcularComprobacion } from './cuadreArqueo.js'
import { cajaEnPeriodo, sumarEfectivoDelPeriodo } from './periodoArqueo.js'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const enRango = (fecha, desde, hasta) => {
  if (!fecha) return false
  const t = new Date(fecha).getTime()
  if (Number.isNaN(t)) return false
  if (desde != null && t <= new Date(desde).getTime()) return false
  return t <= new Date(hasta).getTime()
}

// Cajas del período que se cargaron DESPUÉS de cerrado el arqueo. Es el dato
// que explica la diferencia en términos que el usuario reconoce ("se cargaron 2
// cajas después"), en vez de un número que cambió porque sí.
function contarTardias(cajasDelPeriodo, arqueoCreatedAt) {
  if (!arqueoCreatedAt) return 0
  const corte = new Date(arqueoCreatedAt).getTime()
  return cajasDelPeriodo.filter((c) => {
    if (!c.created_at) return false
    const t = new Date(c.created_at).getTime()
    return !Number.isNaN(t) && t > corte
  }).length
}

// arqueos: del local, ORDENADOS por fecha ascendente.
// cajas: con { fecha_inicio, fecha_cierre, efectivo, created_at }.
// pagos: los que cuentan como gasto (efectivo, pagados, egreso), con { fecha_pago, importe }.
//
// Devuelve un Map id -> { ingresos, gastos, comprobacion, difiere, cajas_tardias, es_primero }.
export function evaluarArqueos(arqueos, cajas, pagos) {
  const out = new Map()
  const lista = arqueos ?? []

  for (let i = 0; i < lista.length; i++) {
    const a = lista[i]
    const esPrimero = i === 0

    // El primero es la línea de base: su período abarca todo el historial y su
    // comprobación nunca significó nada, así que marcarlo sería ruido.
    if (esPrimero) {
      out.set(a.id, {
        ingresos: num(a.ingresos), gastos: num(a.gastos), comprobacion: num(a.comprobacion),
        difiere: false, cajas_tardias: 0, es_primero: true,
      })
      continue
    }

    const desde = lista[i - 1].fecha
    const hasta = a.fecha

    const delPeriodo = (cajas ?? []).filter((c) => cajaEnPeriodo(c, desde, hasta))
    const ingresos = sumarEfectivoDelPeriodo(delPeriodo, desde, hasta)
    const gastos = (pagos ?? [])
      .filter((pg) => enRango(pg.fecha_pago, desde, hasta))
      .reduce((acc, pg) => acc + num(pg.importe), 0)

    const comprobacion = calcularComprobacion({
      ingresos, gastos,
      contado: num(a.total),
      contadoAnterior: num(lista[i - 1].total),
    })

    out.set(a.id, {
      ingresos, gastos, comprobacion,
      difiere: Math.abs(comprobacion - num(a.comprobacion)) > TOLERANCIA,
      cajas_tardias: contarTardias(delPeriodo, a.created_at),
      es_primero: false,
    })
  }

  return out
}
