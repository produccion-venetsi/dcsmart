// Rango del reporte de CMV: el CMV se lee SIEMPRE por período contable.
//
// La historia de esto, en dos capas.
//
// Primero el reporte sumaba las VENTAS por día real (`caja.fecha_inicio`) y el
// CMV por PERÍODO (`pago.periodo`) usando el mismo par de fechas para los dos.
// Como `periodo` es mensual y se guarda como el día 1 del mes, un rango como
// "últimos 30 días" (04/07 al 03/08) pedía `periodo >= 2026-07-04` y dejaba
// julio entero afuera. En LOS GALGOS mostraba 1.465.211,80 de CMV (5 pagos,
// solo agosto) cuando julio solo ya suma 57.115.386,50 en 247 pagos.
//
// El arreglo de entonces fue partir en dos modos: por mes el CMV iba por
// `periodo`, por rango de días iba por `fecha`. Eso sacó los ceros pero dejó una
// trampa peor: el mismo "julio" daba dos números según por dónde lo pidieras. En
// 878COOP, julio 2026 daba 10.989.797,80 (96 pagos) filtrando por fecha y
// 11.758.312,04 (100 pagos) filtrando por período — el modo fecha sumaba un pago
// de período mayo cargado en julio y perdía 5 pagos de período julio cargados en
// junio. Ninguno de los dos números estaba "mal": medían cosas distintas.
//
// Ahora hay una sola unidad y un solo criterio: el CMV es mensual y se filtra
// por `periodo`, que es la lectura contable (una factura de junio cargada en
// julio pertenece a junio). Las ventas se toman de los días de esos mismos meses
// completos, así el numerador y el denominador del % hablan del mismo tiempo.
//
// La entrada acepta un mes, un rango de meses, o un rango de días. Un rango de
// días de MESES ENTEROS va por período (es la misma pregunta contable); un
// rango parcial ("esta semana") no la puede responder un campo mensual, así
// que va por `fecha` de carga del pago — y el resultado declara `modo` para
// que la pantalla diga qué está midiendo (2026-08-20, pedido del usuario:
// antes el rango parcial se redondeaba al mes y "una semana" mostraba julio
// entero).
//
// Sobre las zonas horarias, que ya mordieron antes en este proyecto:
// `pago.periodo` se guarda a medianoche UTC del día elegido (no es un instante
// real), así que se compara en UTC puro. `caja.fecha_inicio` sí es un instante
// real y va con el offset de Argentina.

const AR_OFFSET = '-03:00'

// El querystring manda `mes_hasta=` vacío cuando el input está sin llenar: eso
// es ausencia, no un valor inválido.
const vino = (v) => v !== undefined && v !== null && v !== ''
const esDia = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const esMes = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

// Fin del mes sin depender de tablas de días: el día 0 del mes siguiente.
function ultimoDiaDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

// Los dos extremos del rango, ya normalizados a meses (YYYY-MM). Devuelve null
// si no hay con qué armarlo o si el rango está invertido.
function resolverMeses({ mes, mes_desde, mes_hasta, desde, hasta }) {
  // Ausente y mal escrito no son lo mismo. Un extremo que no vino se tolera (el
  // otro vale como mes único: dejar la pantalla vacía por un input a medio
  // llenar es peor que asumir lo obvio), pero un extremo presente y malformado
  // es un error del que pide y se responde como tal.
  const md = vino(mes_desde) ? (esMes(mes_desde) ? mes_desde : false) : null
  const mh = vino(mes_hasta) ? (esMes(mes_hasta) ? mes_hasta : false) : null
  if (md === false || mh === false) return null
  if (md || mh) {
    const a = md || mh
    const b = mh || md
    return a <= b ? [a, b] : null
  }

  if (esMes(mes)) return [mes, mes]

  if (esDia(desde) && esDia(hasta)) {
    // Se valida por día antes de redondear: 31/07 a 01/07 colapsaría al mismo
    // mes y pasaría como válido, pero el input está mal y conviene decirlo.
    if (desde > hasta) return null
    return [desde.slice(0, 7), hasta.slice(0, 7)]
  }

  return null
}

// ¿El par de días cubre meses enteros exactos (del 1 al último)?
function esMesesEnteros(desde, hasta) {
  if (!desde.endsWith('-01')) return false
  const [anio, mes] = hasta.slice(0, 7).split('-').map(Number)
  return hasta === `${hasta.slice(0, 7)}-${String(ultimoDiaDelMes(anio, mes)).padStart(2, '0')}`
}

export function resolverRangoCmv(query) {
  const q = query ?? {}

  // Un rango de días que NO es de meses enteros pide otra pregunta: "¿cuánto
  // CMV se cargó ESTA SEMANA?". El período contable es mensual y no puede
  // responderla — redondearla a los meses que toca (lo que se hacía antes)
  // devolvía el mes entero aunque pidieras siete días. En ese caso se filtra
  // por `fecha` de carga del pago, y la respuesta declara el modo para que la
  // pantalla diga qué está midiendo. Los meses completos y los parámetros de
  // mes siguen yendo por `periodo`, la lectura contable de siempre.
  const pidioDias = !vino(q.mes) && !vino(q.mes_desde) && !vino(q.mes_hasta) && esDia(q.desde) && esDia(q.hasta)
  if (pidioDias) {
    if (q.desde > q.hasta) return null
    if (!esMesesEnteros(q.desde, q.hasta)) {
      return {
        modo: 'fecha',
        mesDesde: q.desde.slice(0, 7),
        mesHasta: q.hasta.slice(0, 7),
        diaDesde: q.desde,
        diaHasta: q.hasta,
        campoPago: 'fecha',
        // `fecha` se guarda a medianoche UTC del día elegido, igual que periodo.
        pagoDesde:   new Date(`${q.desde}T00:00:00.000Z`),
        pagoHasta:   new Date(`${q.hasta}T23:59:59.999Z`),
        ventasDesde: new Date(`${q.desde}T00:00:00.000${AR_OFFSET}`),
        ventasHasta: new Date(`${q.hasta}T23:59:59.999${AR_OFFSET}`),
      }
    }
  }

  const meses = resolverMeses(q)
  if (!meses) return null

  const [mesDesde, mesHasta] = meses
  const [anioFin, mFin] = mesHasta.split('-').map(Number)
  const primerDia = `${mesDesde}-01`
  const ultimoDia = `${mesHasta}-${String(ultimoDiaDelMes(anioFin, mFin)).padStart(2, '0')}`

  return {
    modo: 'periodo',
    mesDesde,
    mesHasta,
    diaDesde: primerDia,
    diaHasta: ultimoDia,
    campoPago: 'periodo',
    pagoDesde:   new Date(`${primerDia}T00:00:00.000Z`),
    pagoHasta:   new Date(`${ultimoDia}T23:59:59.999Z`),
    ventasDesde: new Date(`${primerDia}T00:00:00.000${AR_OFFSET}`),
    ventasHasta: new Date(`${ultimoDia}T23:59:59.999${AR_OFFSET}`),
  }
}
