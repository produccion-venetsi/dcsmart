// Regla de estado_op al marcar un pago como pagado: si el pago no venia del
// flujo PDP, la plata salio de la caja, asi que queda en CAJA. Los que si
// venian de PDP conservan su estado para no perder esa trazabilidad.
export const ESTADOS_QUE_CONSERVAN = ['PDP', 'MP_PDP']

export function debeQuedarEnCaja(estadoActual) {
  return !ESTADOS_QUE_CONSERVAN.includes(estadoActual)
}

export function partirIdsPorEstado(pagos) {
  const idsCaja = []
  const idsConservan = []
  for (const p of pagos) {
    if (debeQuedarEnCaja(p.estado_op)) idsCaja.push(p.id)
    else idsConservan.push(p.id)
  }
  return { idsCaja, idsConservan }
}
