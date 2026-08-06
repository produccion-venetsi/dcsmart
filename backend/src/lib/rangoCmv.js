// Rango del reporte de CMV: qué campo del pago se filtra y con qué fechas.
//
// El bug que esto arregla: el reporte sumaba las VENTAS por día real
// (`caja.fecha_inicio`) y el CMV por PERÍODO (`pago.periodo`), usando el mismo
// par de fechas para los dos. Pero `periodo` es mensual y se guarda como el día
// 1 del mes, así que un rango como "últimos 30 días" (04/07 al 03/08) pedía
// `periodo >= 2026-07-04` y dejaba afuera julio entero, que vive en 2026-07-01.
// Medido en LOS GALGOS: mostraba 1.465.211,80 de CMV (5 pagos, solo agosto)
// cuando julio solo ya suma 57.115.386,50 en 247 pagos. El porcentaje de CMV
// sobre ventas comparaba un mes incompleto contra 30 días de ventas.
//
// Ahora hay tres modos y en ninguno se mezclan las unidades:
//
// - `periodoDesde`/`periodoHasta`: el CMV va por `periodo`, igual criterio
//   contable que el mes, pero acotado a un rango de días específico (una
//   quincena, una semana) en vez de forzar el mes completo.
// - `mes` (YYYY-MM): el CMV va por `periodo` acotado a ese mes completo, que es
//   la lectura contable (una factura de junio cargada en julio pertenece a
//   junio). Las ventas se toman de los días de ese mismo mes.
// - `desde`/`hasta`: el CMV va por `fecha`, la misma unidad que las ventas, así
//   un rango de días arbitrario da exactamente los días pedidos.
//
// Prioridad si viene más de uno: periodoDesde/periodoHasta > mes > desde/hasta.
// En la pantalla, el rango de período es un campo optativo al lado del mes: si
// se completa, pisa al mes; si no, el mes sigue mandando (ver ReporteCMV.jsx).
//
// Sobre las zonas horarias, que ya mordieron antes en este proyecto:
// `pago.periodo` y `pago.fecha` se guardan a medianoche UTC del día elegido (no
// son instantes reales), así que se comparan en UTC puro. `caja.fecha_inicio` sí
// es un instante real y va con el offset de Argentina.

const AR_OFFSET = '-03:00'

const esDia = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const esMes = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

// Fin del mes sin depender de tablas de días: el día 0 del mes siguiente.
function ultimoDiaDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

function rangoPorDia(desde, hasta, campoPago) {
  return {
    campoPago,
    pagoDesde:   new Date(`${desde}T00:00:00.000Z`),
    pagoHasta:   new Date(`${hasta}T23:59:59.999Z`),
    ventasDesde: new Date(`${desde}T00:00:00.000${AR_OFFSET}`),
    ventasHasta: new Date(`${hasta}T23:59:59.999${AR_OFFSET}`),
  }
}

export function resolverRangoCmv(query) {
  const { mes, desde, hasta, periodoDesde, periodoHasta } = query ?? {}

  if (esDia(periodoDesde) && esDia(periodoHasta)) {
    // Un rango al revés devolvería cero sin decir por qué: mejor un 400.
    if (periodoDesde > periodoHasta) return null
    return rangoPorDia(periodoDesde, periodoHasta, 'periodo')
  }

  if (esMes(mes)) {
    const [anio, m] = mes.split('-').map(Number)
    const ultimo = ultimoDiaDelMes(anio, m)
    const primerDia = `${mes}-01`
    const ultimoDia = `${mes}-${String(ultimo).padStart(2, '0')}`
    return rangoPorDia(primerDia, ultimoDia, 'periodo')
  }

  if (esDia(desde) && esDia(hasta)) {
    if (desde > hasta) return null
    return rangoPorDia(desde, hasta, 'fecha')
  }

  return null
}
