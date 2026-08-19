// Diferencia de caja — ESPEJO de backend/src/lib/cuadreCaja.js.
// Si se cambia una, hay que cambiar la otra (mismo patrón que cuadreArqueo.js y
// clasificaciones.js). El test de contrato compara las dos.
//
// ── Por qué existe este espejo ───────────────────────────────────────────────
//
// El backend calcula el cuadre y lo manda en `caja.cuadre`, y esa es la fuente de verdad.
// Pero mientras se cargan los movimientos y los detalles, el número que interesa es el que
// va a quedar DESPUÉS de la carga, y pedirlo al servidor en cada alta significa ver el
// cuadre de hace un movimiento: se cargan cinco cobros seguidos y el descuadre que se
// muestra es el de antes de empezar.
//
// Con esto se recalcula localmente en cada cambio, incluso antes de guardar, y el backend
// lo recalcula igual al guardar. Si los dos no coinciden, manda el backend.
//
// ── La regla ─────────────────────────────────────────────────────────────────
//
//   diferencia = total − (efectivo + cobros − gastos)
//
// `total` es la VENTA del turno. El fondo inicial, los retiros y los vaciados no
// participan: mueven plata del cajón, no cambian lo vendido.
//
// La FUENTE la define `caja.origin`, no lo que la caja tenga cargado:
//   - TAPTAP y FFUDO  -> por MOVIMIENTOS (los cobros en efectivo NO se suman, porque
//     ya están en el campo `efectivo`; los gastos sí restan aunque sean en efectivo).
//     Son los dos orígenes cuyo job/integración escribe los cobros como CajaMovimiento.
//   - el resto (cajas cargadas a mano en DCSmart) -> por DETALLES, porque ahí los
//     cobros se anotan como CajaDetalle.
//
// Elegir la fuente mirando "si tiene movimientos cargados" fue un bug real: una caja
// no-TapTap con un gasto suelto por movimiento hacía ignorar $3.559.398 en detalles.

export const TOLERANCIA = 1

export const ROL_POR_CLASIFICACION = {
  cobro: 'cobro',
  gasto: 'gasto',
  informativo: 'informativo',
  // históricos
  ingreso: 'cobro',
  medio_pago: 'cobro',
  egreso: 'gasto',
  canal: 'informativo',
  otro: 'informativo',
  calculo: 'informativo',
}

// Ojo con INGRESO y EGRESO: son informativos, NO cobro y gasto. El enum los permite y el
// cuadre los contempla, pero hoy no se usan para cargar venta. Copiarlos como cobro/gasto
// haría que la pantalla contara plata que el backend no cuenta — el test de contrato
// justamente agarró eso.
export const ROL_POR_TIPO_MOVIMIENTO = {
  COBRO: 'cobro',
  GASTO: 'gasto',
  INICIAL: 'informativo',
  RETIRO: 'informativo',
  VACIADO: 'informativo',
  INGRESO: 'informativo',
  EGRESO: 'informativo',
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const esEfectivo = (nombreMetodo) => /efectivo/i.test(String(nombreMetodo ?? ''))

// COPIA EXACTA del backend. Lo era en intencion y no en los hechos: leia
// `detalle.tipo.clasificacion` (como si `tipo` fuera un objeto) y caia en 'informativo',
// cuando en la base `tipo` es un String con la clasificacion y el objeto se llama
// `detalle_tipo`. Resultado: TODOS los detalles contaban como informativos y el cuadre en
// vivo ignoraba los cobros. Los tests de este lib usaban `{ tipo: { clasificacion } }`, una
// forma que la API nunca manda, asi que pasaban.
//
// La clasificacion del propio detalle gana sobre la de su tipo del catalogo: la elige quien
// carga y puede diferir a proposito. Sin clasificacion se asume cobro -- es lo que carga la
// mayoria, y tratarlo como informativo lo saca del calculo sin aviso.
export function rolDeDetalle(detalle) {
  const clasif = detalle?.tipo ?? detalle?.detalle_tipo?.clasificacion ?? null
  if (!clasif) return 'cobro'
  return ROL_POR_CLASIFICACION[clasif] ?? 'cobro'
}

export function rolDeMovimiento(movimiento) {
  return ROL_POR_TIPO_MOVIMIENTO[movimiento?.tipo] ?? 'informativo'
}

// Origenes cuyos cobros se escriben como CajaMovimiento (tipo COBRO), no como
// CajaDetalle: TapTap y el job de sincronizacion de Fudo. COPIA EXACTA del
// backend -- ver el comentario ahi.
export const ORIGENES_QUE_CUADRAN_POR_MOVIMIENTOS = ['TAPTAP', 'FFUDO']

export function calcularCuadre(caja) {
  if (!caja) return null

  const detalles = caja.detalles ?? []
  const movimientos = caja.movimientos ?? []
  const fuente = (caja.detalles ?? []).length === 0 && (caja.movimientos ?? []).length > 0 ? 'movimientos' : 'detalles' // modelo simple DEV-82: siempre detalles; movimientos solo como fallback legacy

  let cobros = 0
  let gastos = 0
  let informativos = 0

  if (fuente === 'movimientos') {
    for (const m of movimientos) {
      const rol = rolDeMovimiento(m)
      const monto = num(m.monto)
      if (rol === 'informativo') { informativos += monto; continue }
      // El efectivo ya viene en caja.efectivo: sumar un COBRO en efectivo de nuevo lo
      // duplicaría. Un GASTO en efectivo no duplica nada y no restarlo lo esconde.
      if (rol === 'cobro' && esEfectivo(m.metodo_pago?.nombre)) { informativos += monto; continue }
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

  // Sin total cargado no hay nada contra qué comparar.
  if (caja.total == null || caja.total === '') {
    return { fuente, efectivo, cobros, gastos, informativos, esperado, total: null, diferencia: null, cuadra: null }
  }

  const total = num(caja.total)
  const diferencia = total - esperado

  return {
    fuente, efectivo, cobros, gastos, informativos, esperado, total, diferencia,
    // Positiva = el total declarado es mayor que lo que suman los componentes.
    cuadra: Math.abs(diferencia) <= TOLERANCIA,
  }
}

// ── Cómo se lee ──────────────────────────────────────────────────────────────

// El signo NO se muestra pelado: en cajas, una diferencia positiva significa que el total
// declarado supera a los componentes, o sea que FALTA cargar algo. Decir "+1000" sin
// aclararlo se lee como que sobra plata.
export function describirCuadre(cuadre) {
  if (!cuadre) return { texto: '', tono: 'neutro' }
  if (cuadre.diferencia == null) return { texto: 'Falta cargar el total del turno', tono: 'neutro' }
  if (cuadre.cuadra) return { texto: 'Cuadra', tono: 'ok' }
  return cuadre.diferencia > 0
    ? { texto: 'Falta cargar', tono: 'alerta' }
    : { texto: 'Cargado de más', tono: 'alerta' }
}

// Verde cuando cuadra, ROJO cuando no. Antes el descuadre era ambar, que se lee como
// "ojo" y no como "esto esta mal": pedido del usuario, "a prueba de boludos". El ambar
// queda para nada: o cierra o no cierra.
export const colorCuadre = (tono) =>
  tono === 'ok' ? 'var(--green)' : tono === 'alerta' ? 'var(--red)' : 'var(--t3)'

// Lo que hay que sumar (o sacar) para que cierre. Es la acción, no el diagnóstico: con
// "faltan $1.000" uno sabe qué buscar; con "diferencia -1000" hay que pensarlo.
export function faltaParaCuadrar(cuadre) {
  if (!cuadre || cuadre.diferencia == null || cuadre.cuadra) return 0
  return Math.abs(cuadre.diferencia)
}
