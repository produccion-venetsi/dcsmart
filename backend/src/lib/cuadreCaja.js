// Diferencia de caja: UNA sola definicion para todo el sistema.
//
// Antes esto vivia en el frontend, duplicado en CajaList y CajaDetail, y las dos
// copias habian divergido: la misma caja mostraba diferencias distintas segun
// desde donde se la mirara. Ademas ni el backend ni la reporteria podian
// aplicar la regla. Ahora se calcula aca y viaja en la respuesta.
//
// LA REGLA
//
//   por DETALLES:     diferencia = total - (efectivo + cobros + gastos)
//   por MOVIMIENTOS:  diferencia = total - (efectivo + cobros - gastos)
//
// `total` es la VENTA del turno. El fondo inicial, los retiros y los vaciados no
// participan: mueven plata del cajon, no cambian lo vendido.
//
// De donde salen los cobros depende de como carga el local:
//   - por DETALLES: los tipos con rol de cobro o gasto (origen DCSMART)
//   - por MOVIMIENTOS: los cobros que NO son en efectivo, porque el efectivo
//     ya esta en el campo `efectivo` y contarlo dos veces lo duplicaria
//     (origen TAPTAP)
//
// EL SIGNO DE LOS GASTOS ES DISTINTO SEGUN LA FUENTE, y no es un descuido:
//
//   - Cargando por DETALLES, `efectivo` es la plata CONTADA en el cajon al
//     cerrar, y los gastos del turno ya salieron de ahi. Para reconstruir la
//     venta hay que devolverlos. Ejemplo real de LOS GALGOS: venta 7.954.340,
//     contado 361.050, cobros no-efectivo 7.229.300, gastos 364.000 ->
//     361.050 + 7.229.300 + 364.000 = 7.954.350. Restandolos daba 727.990 de
//     diferencia sobre una caja que en realidad cuadra.
//
//   - Cargando por MOVIMIENTOS, `efectivo` es lo COBRADO en efectivo (se
//     verifico contra produccion: coincide con la suma de los cobros en
//     efectivo en 135 de 135 cajas TapTap), y los gastos son salidas que no
//     son venta, asi que restan.
//
// Este modulo restaba los gastos en las dos ramas. La verificacion de las 135
// cajas TapTap no lo detecto porque NINGUNA caja TapTap tiene gastos: el
// termino siempre valia cero y nunca se ejercito. Medido sobre las 6.434 cajas
// con total cargado, sumar los gastos en la rama de detalles deja 302 cajas mas
// cuadrando exacto y baja el desvio absoluto total un 14%. Hay 9 cajas de LOS
// GALGOS que cuadraban con el signo viejo y dejan de cuadrar; estan todas entre
// el 26/1 y el 2/2 de 2025, o sea son de una epoca de carga distinta, no una
// regla que compita.
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
  // Ver "EL SIGNO DE LOS GASTOS" arriba: por detalles el efectivo es el contado
  // al cierre (ya neto de los gastos) y hay que devolverlos; por movimientos es
  // lo cobrado en efectivo y los gastos son salidas que restan.
  const esperado = fuente === 'detalles'
    ? efectivo + cobros + gastos
    : efectivo + cobros - gastos

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
