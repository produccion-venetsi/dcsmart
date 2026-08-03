// Descuento automático de MovStock, del lado del formulario.
//
// El cálculo está duplicado con backend/src/lib/descuentoMovstock.js a
// propósito: no hay paquete compartido entre los dos lados (mismo criterio que
// clasificaciones, filtros y dates). El backend es el que valida y guarda; esto
// existe para que el campo se complete mientras se escribe, sin ida y vuelta.
//
// Si cambia la regla, hay que tocar los dos y los dos tienen tests.

export const DESCUENTO_MOVSTOCK_DEFAULT = 30

// El porcentaje que le corresponde a un local. Sin nada configurado, el
// general. Un local en 0 NO cae al 30: 0 es un descuento pactado en cero.
export function porcentajeDelLocal(local) {
  const pct = local?.descuento_movstock
  return pct == null ? DESCUENTO_MOVSTOCK_DEFAULT : Number(pct)
}

// Monto a descontar sobre el neto, a dos decimales (el importe termina en una
// columna Decimal(12,2)).
export function calcularDescuento(neto, porcentaje) {
  const n = Number(neto)
  const p = Number(porcentaje)
  if (!Number.isFinite(n) || !Number.isFinite(p) || n === 0 || p === 0) return 0
  return Math.round(n * p) / 100
}

// Lo que se escribe en el input: string con dos decimales, o '' si no hay nada
// que descontar. Devolver '0.00' dejaría el campo con un cero que parece
// escrito a mano.
export function descuentoParaInput(neto, porcentaje) {
  const monto = calcularDescuento(neto, porcentaje)
  return monto === 0 ? '' : monto.toFixed(2)
}
