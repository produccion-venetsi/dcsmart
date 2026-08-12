// La mitad de la cuenta corriente que viene de las cajas.
//
// La cuenta corriente de un cliente ya existía, pero solo con `Pago` (ver
// cuentaCorriente.js, los cuatro cuadrantes). Faltaba lo que se le carga a la cuenta
// desde una caja: la venta que en vez de cobrarse queda anotada en la cuenta de alguien.
// Eso no era representable -- un detalle de caja no tenía a quién atribuirse -- así que la
// deuda de un cliente que consume en el local y firma quedaba solo en la cabeza del
// encargado.
//
// El enganche es `CajaDetalle.id_cliente`, el equivalente del `id_cliente` de Pago.
//
// ── Por qué un CARGO y no un movimiento con dirección ────────────────────────
//
// Un detalle de caja con cliente SIEMPRE sube lo que el cliente debe:
//
//   cobro + cliente  ->  se vendió y quedó en su cuenta (no entró la plata)
//   gasto + cliente  ->  la caja pagó o entregó algo a su nombre
//
// Los dos casos son plata que el cliente pasa a deber. Lo que BAJA la deuda es la
// cobranza, y eso se carga como op ingreso con estado CTA CTE CLI, que ya existe y cae en
// el cuadrante "a cobrar" -> "ingresos" del lado de pagos. Por eso este lado es de cargos
// solamente y no tiene los cuatro cuadrantes: modelar una dirección acá sin que nada la
// distinga terminaría en que una cobranza en efectivo se cuente como venta nueva.
//
// Si algún día hace falta acreditar desde la caja (una devolución, una nota de crédito
// contra la cuenta), lo que falta es un campo de dirección en el detalle, no cambiar esto.
//
// ── El cuadre de caja NO cambia ──────────────────────────────────────────────
//
// Un detalle de cuenta corriente sigue contando en la diferencia de caja exactamente como
// contaba antes. El motivo está en la definición del cuadre (lib/cuadreCaja.js):
//
//   diferencia = total - (efectivo + cobros - gastos)
//
// donde `total` es la VENTA del turno, no la plata que hay en el cajón. Una venta a cuenta
// corriente está dentro de esa venta, así que tiene que sumar como cobro igual que Mercado
// Pago o una tarjeta: la cuenta corriente es un medio de pago más, uno que se cobra
// después. Excluirla dejaría descuadrada toda caja que tuviera una.
//
// Los `informativo` no mueven la cuenta: son desglose de algo ya contado (un canal de
// venta), no plata que alguien deba.

import { normalizarClasificacion } from './clasificaciones.js'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Monto siempre positivo: la dirección no la lleva el signo (misma convención que el resto
// del proyecto -- ver la nota de signos de las migraciones).
const monto = (d) => Math.abs(num(d?.monto))

// Clasificaciones que mueven una cuenta corriente. `informativo` no: es desglose de algo
// que ya está contado, no plata que alguien deba.
export const CLASIFICACIONES_QUE_CARGAN = ['cobro', 'gasto']

// La clasificación efectiva de un detalle. Misma precedencia que el cuadre
// (lib/cuadreCaja.js): la del propio detalle gana sobre la de su tipo del catálogo.
export function clasificacionDeDetalle(detalle) {
  const cruda = detalle?.tipo ?? detalle?.detalle_tipo?.clasificacion ?? null
  return normalizarClasificacion(cruda)
}

// ¿Este detalle carga una cuenta corriente? Necesita cliente Y una clasificación que
// mueva plata.
export function cargaCuenta(detalle) {
  if (!detalle?.id_cliente) return false
  return CLASIFICACIONES_QUE_CARGAN.includes(clasificacionDeDetalle(detalle))
}

// Cuánto le suma este detalle a la deuda del cliente. 0 si no carga la cuenta.
export function cargoDeDetalle(detalle) {
  return cargaCuenta(detalle) ? monto(detalle) : 0
}

// Los totales del lado caja de una cuenta.
//
// `cargado` es lo que el cliente debe por consumos anotados en cajas. `informativos` se
// cuenta aparte y no suma: es un detalle que quedó con cliente pero con una clasificación
// que no mueve la cuenta, y esconderlo del todo haría que un monto cargado desapareciera
// sin explicación.
export function totalesCajaCliente(detalles) {
  let cargado = 0
  let cantidad = 0
  let informativos = 0
  let cantidad_informativos = 0

  for (const d of detalles ?? []) {
    if (cargaCuenta(d)) {
      cargado += monto(d)
      cantidad += 1
    } else if (d?.id_cliente) {
      informativos += monto(d)
      cantidad_informativos += 1
    }
  }

  return { cargado, cantidad, informativos, cantidad_informativos }
}

// Los mismos totales desde un groupBy de Prisma, para el listado de clientes: traer todos
// los detalles de todos los clientes para sumarlos en JS es traerse la tabla entera (23 mil
// filas y creciendo). Cada fila es { id_cliente, tipo, _sum: { monto } }.
//
// Reusa `totalesCajaCliente` a propósito: si el criterio viviera dos veces, el número del
// listado y el de la ficha podrían discrepar para el mismo cliente.
export function totalesCajaPorCliente(filas) {
  const porCliente = new Map()
  for (const f of filas ?? []) {
    if (!f?.id_cliente) continue
    if (!porCliente.has(f.id_cliente)) porCliente.set(f.id_cliente, [])
    porCliente.get(f.id_cliente).push({
      id_cliente: f.id_cliente,
      tipo: f.tipo,
      monto: f._sum?.monto ?? 0,
    })
  }
  const out = {}
  for (const [id, ds] of porCliente) out[id] = totalesCajaCliente(ds)
  return out
}

// El filtro con el que se traen los detalles de caja de un cliente. Sin recorte por local:
// un cliente puede consumir en cualquier local del grupo, igual que
// `whereMovimientosCliente` de cuentaCorriente.js -- las pantallas de Clientes son para los
// roles que ya alcanzan todos los locales.
export function whereDetallesCliente(idCliente) {
  return { id_cliente: idCliente }
}

// ── Validación al cargar un detalle ─────────────────────────────────────────
//
// Devuelve el mensaje de error, o null si está bien. Es el equivalente de
// `validarClienteYEstado` del lado de pagos, y por el mismo motivo: si la regla no vive en
// un solo lugar, se pueden guardar detalles que después ninguna cuenta cuenta.
export function validarClienteDetalle(id_cliente, clasificacion) {
  if (!id_cliente) return null
  const c = normalizarClasificacion(clasificacion)
  if (!c) {
    return 'Para cargar un detalle a la cuenta de un cliente hay que clasificarlo como cobro o gasto'
  }
  if (!CLASIFICACIONES_QUE_CARGAN.includes(c)) {
    // Sin esto se puede guardar un detalle con cliente que no aparece en ninguna cuenta:
    // la plata queda cargada a nombre de alguien y no figura en su saldo.
    return 'Un detalle informativo no mueve la cuenta corriente: clasificalo como cobro o gasto, o quitá el cliente'
  }
  return null
}
