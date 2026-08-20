// A qué período de arqueo pertenece una caja.
//
// EL PROBLEMA QUE RESUELVE
//
// El arqueo compara la plata contada contra lo que el sistema dice que entró
// desde el conteo anterior. Los ingresos salían de las cajas cuyo
// `fecha_inicio` caía en el período -- pero el efectivo entra al cofre cuando
// el turno CIERRA, no cuando abre. Un turno que arranca antes del arqueo y
// cierra después quedaba en un agujero: no lo contaba ningún período, y su
// plata aparecía en el conteo siguiente como sobrante fantasma.
//
// Medido en TOGNIS-PIZZA (2026-08): el arqueo del 18/08 marcaba -523.700 y el
// del 19/08 -163.100. Contando por cierre dan 0,00 y +1.300 respectivamente.
// Los "sobrantes" eran el efectivo de los turnos 526 y 528, que abrieron
// minutos antes de cada conteo y cerraron horas después.
//
// POR QUÉ NO ALCANZA CON USAR fecha_cierre A SECAS
//
// 6.480 de las 14.806 cajas no tienen `fecha_cierre` cargada, y otras 3.435 la
// tienen igual al inicio. En EVELIA son 77 de 85 cajas y en LOS GALGOS 55 de
// 92: filtrar por cierre los dejaría sin ingresos y les inventaría descuadres
// enormes. Además hay cajas con el cierre ANTERIOR a la apertura (dato
// imposible; la t218 de GRAN-DANZON abre el 19 a las 00:16 y "cierra" el 18 a
// las 04:16).
//
// Por eso la regla es: vale el cierre cuando es un dato usable, y si no, la
// apertura -- que es exactamente el comportamiento viejo. Ningún local pierde
// ingresos por no cargar el cierre.

// La fecha en la que la plata de esta caja entró al cofre.
export function fechaEfectivaCaja(caja) {
  const inicio = caja?.fecha_inicio
  const cierre = caja?.fecha_cierre
  if (!cierre) return inicio
  const tc = cierre instanceof Date ? cierre.getTime() : new Date(cierre).getTime()
  if (Number.isNaN(tc)) return inicio
  const ti = inicio instanceof Date ? inicio.getTime() : new Date(inicio).getTime()
  // Un cierre anterior a la apertura no describe nada real: se ignora.
  return tc >= ti ? cierre : inicio
}

// El período es (desde, hasta]: `desde` exclusivo -- es el instante del arqueo
// anterior, ya contado por él -- y `hasta` inclusivo. `desde` null es el primer
// arqueo del local, que barre todo el historial.
export function cajaEnPeriodo(caja, desde, hasta) {
  const f = fechaEfectivaCaja(caja)
  if (!f) return false
  const t = f instanceof Date ? f.getTime() : new Date(f).getTime()
  if (Number.isNaN(t)) return false
  if (desde != null && t <= new Date(desde).getTime()) return false
  return t <= new Date(hasta).getTime()
}

export function sumarEfectivoDelPeriodo(cajas, desde, hasta) {
  return (cajas ?? [])
    .filter((c) => cajaEnPeriodo(c, desde, hasta))
    .reduce((acc, c) => {
      const n = Number(c.efectivo ?? 0)
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)
}

// Filtro de Prisma que trae las cajas CANDIDATAS del período.
//
// Prisma no compara dos columnas del mismo registro en un `where`, así que el
// recorte fino (cuál de las dos fechas vale) se hace en JS con las funciones de
// arriba. Esto acota la lectura a las que pueden llegar a entrar: si la fecha
// efectiva de una caja cae en el rango, entonces su apertura o su cierre
// también, porque la efectiva es siempre una de las dos.
export function whereCajasCandidatas(id_local, desde, hasta) {
  const rango = { ...(desde ? { gt: desde } : {}), lte: hasta }
  return {
    id_local,
    OR: [
      { fecha_inicio: rango },
      { fecha_cierre: rango },
    ],
  }
}
