// Las DOS preguntas de una caja, separadas.
//
// EL PROBLEMA DE LA FÓRMULA VIEJA
//
// `lib/cuadreCaja.js` responde con un solo número a dos preguntas distintas:
//
//   1. ¿Toda la venta está explicada?  total = efectivo + tarjetas + apps + fiado
//   2. ¿La plata del cajón coincide?   inicial + cobrado − gastos − retiros − vaciados
//
// Los gastos, retiros y vaciados pertenecen SOLO a la segunda: un gasto no
// reduce lo que se vendió, reduce la plata que quedó. Mezclarlos hacía que
// ninguna caja cerrara, y que el equipo fuera y viniera con el signo del gasto
// (ver el historial de c0fdf51) porque cada elección arreglaba un origen y
// rompía el otro.
//
// LA CLAVE: `efectivo` SIGNIFICA DOS COSAS
//
// Medido sobre las cajas de producción:
//   - TAPTAP/FFUDO: es el efectivo COBRADO en el turno (bruto). Coincide con el
//     movimiento COBRO/Efectivo en 356 de 388 cajas de agosto.
//   - Carga manual: es lo que QUEDÓ en el cajón (neto), después de pagar los
//     gastos con esa misma plata. En las cajas manuales CON gastos cargados,
//     sumarlos hace cuadrar 38 y restarlos solo 5.
//
// Por eso el efectivo cobrado se toma del movimiento cuando el origen lo
// informa, y se reconstruye (`efectivo + gastos`) cuando no. Es una sola regla
// conceptual —"lo que entró en efectivo"— que sirve para los tres orígenes.
//
// RESULTADO MEDIDO (cajas desde 01/07, tolerancia $1)
//   TAPTAP  42% → 69% de cajas que cuadran
//   FFUDO   47% → 82%
//   DCSMART 51% → 50% (ahí el problema es otro: no está definido qué se carga
//           en `efectivo`, y cada local lo interpreta distinto)

import { TOLERANCIA, esEfectivo, rolDeDetalle } from './cuadreCaja.js'

export { TOLERANCIA }

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const suma = (arr, fn = () => true) => (arr ?? []).filter(fn).reduce((a, x) => a + num(x.monto), 0)

// Venta que se entregó pero todavía no se cobró: queda a deber. Es venta real
// —está en el total— y hasta ahora no la contaba nadie: TapTap la escribe como
// detalle informativo y el cuadre viejo, en cajas TapTap, solo miraba
// movimientos. 81 cajas descuadraban por exactamente este monto.
const RE_NO_COBRADA = /cta\s*cte|cuenta\s*corriente|mesas?\s*abiert|a\s*cobrar/i
export function esVentaNoCobrada(nombre) {
  return RE_NO_COBRADA.test(String(nombre ?? ''))
}

// Cómo se llama un detalle. Cuando sale del catálogo el nombre vive en el tipo
// y el campo propio queda en null -- que es como los guarda el sync de TapTap.
// Mirar solo `d.nombre` hacía que la venta fiada no se reconociera justo en las
// cajas donde más importa: se descubrió con las cajas de ejemplo de Local
// Testing, donde "Cta Cte" existe como tipo y el detalle quedaba sin nombre.
export function nombreDeDetalle(detalle) {
  return detalle?.nombre ?? detalle?.detalle_tipo?.nombre ?? ''
}

const detalleEsNoCobrado = (d) => esVentaNoCobrada(nombreDeDetalle(d))

const movs = (caja) => caja?.movimientos ?? []
const dets = (caja) => caja?.detalles ?? []

// Lo que entró en efectivo durante el turno, en bruto.
function efectivoCobrado(caja) {
  const porMovimiento = suma(movs(caja), (m) => m.tipo === 'COBRO' && esEfectivo(m.metodo_pago?.nombre))
  if (porMovimiento > 0) return porMovimiento
  // El origen no informa el cobro en efectivo: el campo trae lo que quedó, así
  // que se le devuelven los gastos que salieron de esa misma plata.
  const gastosEnEfectivo =
    suma(movs(caja), (m) => m.tipo === 'GASTO' && esEfectivo(m.metodo_pago?.nombre)) +
    suma(dets(caja), (d) => rolDeDetalle(d) === 'gasto')
  return num(caja?.efectivo) + gastosEnEfectivo
}

// ¿Está toda la venta explicada por alguna forma de pago?
export function calcularCuadreVenta(caja) {
  if (!caja) return null

  const efectivo = efectivoCobrado(caja)

  // Los cobros que no son en efectivo llegan como movimiento (TapTap/Fudo) o
  // como detalle (carga manual). Se suman los dos: un local puede usar ambos y
  // hasta ahora se ignoraba uno entero según el origen.
  const noEfectivoMovs = suma(movs(caja), (m) => m.tipo === 'COBRO' && !esEfectivo(m.metodo_pago?.nombre))
  const noEfectivoDets = suma(dets(caja), (d) => rolDeDetalle(d) === 'cobro' && !detalleEsNoCobrado(d))
  const cobrosNoEfectivo = noEfectivoMovs + noEfectivoDets

  const noCobrado = suma(dets(caja), detalleEsNoCobrado)

  const esperado = efectivo + cobrosNoEfectivo + noCobrado

  if (caja.total == null) {
    return {
      efectivo_cobrado: efectivo, cobros_no_efectivo: cobrosNoEfectivo, no_cobrado: noCobrado,
      esperado, total: null, diferencia: null, cuadra: null,
    }
  }

  const total = num(caja.total)
  const diferencia = total - esperado
  return {
    efectivo_cobrado: efectivo, cobros_no_efectivo: cobrosNoEfectivo, no_cobrado: noCobrado,
    esperado, total, diferencia,
    cuadra: Math.abs(diferencia) <= TOLERANCIA,
  }
}

// ¿Qué pasó con la plata del cajón? Es lo que después alimenta el arqueo.
//
// Solo se puede armar si el origen informa los movimientos de caja: Fudo no
// expone fondo inicial, retiros ni vaciados, y las cajas manuales rara vez los
// cargan (94% no tiene ningún movimiento). Cuando no hay datos se dice, en vez
// de mostrar un cero que parece un dato.
export function calcularEfectivoFisico(caja) {
  if (!caja) return null
  const enEfectivo = (m) => esEfectivo(m.metodo_pago?.nombre)
  const porTipo = (t) => suma(movs(caja), (m) => m.tipo === t && enEfectivo(m))

  const inicial = porTipo('INICIAL')
  const gastos = porTipo('GASTO')
  const retiros = porTipo('RETIRO')
  const vaciados = porTipo('VACIADO')

  // El cobro en efectivo se toma de la MISMA fuente que el cuadre de venta: si
  // solo mirara los movimientos, una caja que anota el retiro como movimiento
  // pero el cobro en el campo daría un cajón negativo (pasó con el ejemplo 908:
  // −150.000, un imposible que nadie sabría interpretar).
  const cobrado = efectivoCobrado(caja)

  // El circuito solo se puede cerrar si el origen informa lo que SACA plata del
  // cajón. Fudo no expone fondo inicial, retiros ni vaciados, y las cajas
  // manuales rara vez los cargan: ahí "lo que queda" sería un número que
  // parece un dato y no lo es.
  const tieneCircuito = movs(caja).some((m) => ['INICIAL', 'RETIRO', 'VACIADO'].includes(m.tipo))

  return {
    disponible: tieneCircuito,
    inicial, cobrado, gastos, retiros, vaciados,
    queda: inicial + cobrado - gastos - retiros - vaciados,
  }
}

// Lo que viaja en la respuesta de la API. Conserva los campos que la pantalla
// ya consume (`diferencia`, `cuadra`, `esperado`…) para no romper nada, y
// agrega el desglose de las dos preguntas por separado.
//
// `diferencia` y `cuadra` pasan a ser los del cuadre de VENTA: es lo que el
// usuario llama "la diferencia de la caja" y lo que decide si la caja está bien
// cargada. El circuito del efectivo va aparte, en `efectivo_fisico`.
export function calcularCuadre(caja) {
  if (!caja) return null

  const venta = calcularCuadreVenta(caja)
  const efectivo_fisico = calcularEfectivoFisico(caja)

  // Los canales de venta y los resúmenes (Takeaway, Tarjetas, diffs…) no entran
  // en ninguna de las dos cuentas: son desglose de algo ya contado. Se informan
  // para poder mostrarlos sin que nadie los sume por error.
  const informativos = suma(
    dets(caja),
    (d) => rolDeDetalle(d) === 'informativo' && !detalleEsNoCobrado(d)
  )

  return {
    // el desglose nuevo
    venta,
    efectivo_fisico,
    informativos,
    // compat con lo que la pantalla ya lee
    efectivo: venta.efectivo_cobrado,
    cobros: venta.cobros_no_efectivo,
    no_cobrado: venta.no_cobrado,
    gastos: efectivo_fisico.gastos,
    esperado: venta.esperado,
    total: venta.total,
    diferencia: venta.diferencia,
    cuadra: venta.cuadra,
  }
}
