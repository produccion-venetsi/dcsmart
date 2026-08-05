// Diferencia de caja: UNA sola definicion para todo el sistema.
//
// Antes esto vivia en el frontend, duplicado en CajaList y CajaDetail, y las dos
// copias habian divergido: la misma caja mostraba diferencias distintas segun
// desde donde se la mirara. Ademas ni el backend ni la reporteria podian
// aplicar la regla. Ahora se calcula aca y viaja en la respuesta.
//
// LA REGLA
//
//   diferencia = total - (efectivo + cobros - gastos)
//
// `total` es la VENTA del turno y `efectivo` es lo COBRADO en efectivo (no el
// saldo del cajon: se verifico contra produccion que `efectivo` coincide con la
// suma de los cobros en efectivo en 135 de 135 cajas TapTap). Por eso el fondo
// inicial, los retiros y los vaciados no participan: mueven plata del cajon,
// no cambian lo vendido.
//
// De donde salen los cobros depende de como carga el local:
//   - por DETALLES: los tipos con rol de cobro o gasto (origen DCSMART)
//   - por MOVIMIENTOS: los cobros que NO son en efectivo, porque el efectivo
//     ya esta en el campo `efectivo` y contarlo dos veces lo duplicaria
//     (origen TAPTAP)
//
// Los tipos con rol informativo no entran nunca: son desglose de algo que ya
// esta contado (canales de venta, "Total Tarjetas", ajustes internos de TapTap).

// Un peso. La tolerancia anterior era de un centavo y marcaba como descuadre
// diferencias de $0,01 que son redondeo de Decimal, no errores de carga: no
// circulan centavos. Diferencias reales de tipeo empiezan en la unidad.
export const TOLERANCIA = 1

// Rol de cada clasificacion de detalle. Las tres primeras son las vigentes; el
// resto son valores historicos que siguen en la base y se mapean para que las
// cajas viejas se sigan calculando igual.
export const ROL_POR_CLASIFICACION = {
  cobro: 'cobro',
  gasto: 'gasto',
  informativo: 'informativo',
  // historicos
  ingreso: 'cobro',      // MP Point, MP QR, Transferencia: cobros no-efectivo
  medio_pago: 'cobro',
  egreso: 'gasto',       // "Gastos"
  canal: 'informativo',  // Delivery, Rappi, Mostrador: desglose de venta
  otro: 'informativo',
  calculo: 'informativo'
}

// Rol de cada tipo de movimiento. INICIAL, RETIRO y VACIADO mueven plata del
// cajon sin afectar la venta, asi que no entran en la diferencia.
export const ROL_POR_TIPO_MOVIMIENTO = {
  COBRO: 'cobro',
  GASTO: 'gasto',
  INICIAL: 'informativo',
  RETIRO: 'informativo',
  VACIADO: 'informativo',
  INGRESO: 'informativo',
  EGRESO: 'informativo'
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Se exporta porque el reporte de Pagos separa "en efectivo" del resto de las
// formas de pago y tiene que usar la MISMA regla: si algun dia entra un metodo
// "Efectivo USD", el cuadre de caja y la reporteria cambian juntos.
export const esEfectivo = (nombreMetodo) => /efectivo/i.test(String(nombreMetodo ?? ''))

// La clasificacion del propio detalle gana sobre la de su tipo: el usuario la
// elige al cargar el detalle y puede diferir a proposito (un "Rappi" que en una
// caja se carga como cobro y en otra como informativo porque ya venia sumado).
// El tipo solo aporta el valor propuesto y queda como respaldo para los detalles
// viejos que no tienen clasificacion propia.
export function rolDeDetalle(detalle) {
  const clasif = detalle?.tipo ?? detalle?.detalle_tipo?.clasificacion ?? null
  // Sin clasificacion se asume cobro: es lo que carga la mayoria y evita que un
  // detalle sin clasificar desaparezca del calculo sin aviso.
  if (!clasif) return 'cobro'
  return ROL_POR_CLASIFICACION[clasif] ?? 'cobro'
}

export function rolDeMovimiento(movimiento) {
  return ROL_POR_TIPO_MOVIMIENTO[movimiento?.tipo] ?? 'informativo'
}

// Devuelve el desglose completo, no solo el numero: la UI necesita explicar
// contra que se comparo cuando algo no cuadra.
export function calcularCuadre(caja) {
  if (!caja) return null

  const detalles = caja.detalles ?? []
  const movimientos = caja.movimientos ?? []

  // Se valida por movimientos solo si hay cobros o gastos cargados ahi. Si el
  // local carga en detalles (o si los movimientos son todos informativos, como
  // una caja que solo tiene el fondo inicial), se valida por detalles.
  const movimientosUtiles = movimientos.filter((m) => rolDeMovimiento(m) !== 'informativo')
  const fuente = movimientosUtiles.length > 0 ? 'movimientos' : 'detalles'

  let cobros = 0
  let gastos = 0
  let informativos = 0

  if (fuente === 'movimientos') {
    for (const m of movimientos) {
      const rol = rolDeMovimiento(m)
      const monto = num(m.monto)
      if (rol === 'informativo') { informativos += monto; continue }
      // El efectivo ya viene en caja.efectivo: sumarlo de nuevo lo duplicaria
      if (esEfectivo(m.metodo_pago?.nombre)) { informativos += monto; continue }
      if (rol === 'cobro') cobros += monto
      else if (rol === 'gasto') gastos += monto
    }
  } else {
    for (const d of detalles) {
      const rol = rolDeDetalle(d)
      const monto = num(d.monto)
      if (rol === 'cobro') cobros += monto
      else if (rol === 'gasto') gastos += monto
      else informativos += monto
    }
  }

  const efectivo = num(caja.efectivo)
  const esperado = efectivo + cobros - gastos

  // Sin total cargado no hay nada contra que comparar
  if (caja.total == null) {
    return { fuente, efectivo, cobros, gastos, informativos, esperado, total: null, diferencia: null, cuadra: null }
  }

  const total = num(caja.total)
  const diferencia = total - esperado

  return {
    fuente,
    efectivo,
    cobros,
    gastos,
    informativos,
    esperado,
    total,
    diferencia,
    // Positiva = el total declarado es mayor que lo que suman los componentes
    cuadra: Math.abs(diferencia) <= TOLERANCIA
  }
}
