// Comprobación de arqueo — ESPEJO de backend/src/lib/cuadreArqueo.js.
// Si se cambia una, hay que cambiar la otra (mismo patrón que clasificaciones.js).
//
// Existe duplicado a propósito: el usuario tipea los montos contados y ve la
// comprobación cambiar en vivo, así que pedirla al servidor en cada tecla sería
// peor. El backend la recalcula antes de guardar y es el que manda.
//
// EL SIGNO
//
// Positivo = FALTA plata (el sistema esperaba más movimiento del que apareció en
// el conteo). Negativo = SOBRA. Ojo: en cajas el signo significa lo contrario,
// así que la comprobación nunca se muestra pelada — siempre con la etiqueta que
// devuelve describirComprobacion().

export const TOLERANCIA = 1

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function totalContado({ caja_fuerte, cofre, adicion }) {
  return num(caja_fuerte) + num(cofre) + num(adicion)
}

export function calcularComprobacion({ ingresos, gastos, contado, contadoAnterior }) {
  const esperado = num(ingresos) - num(gastos)
  const real = num(contado) - num(contadoAnterior)
  return esperado - real
}

export function arqueoCuadra(comprobacion) {
  if (comprobacion == null) return null
  return Math.abs(num(comprobacion)) <= TOLERANCIA
}

// `esPrimero`: el primer arqueo de un local no tiene contra qué compararse (su
// contadoAnterior es 0 y el período barre todo el historial), así que se muestra
// como línea de base y no como descuadre. El backend lo marca en `es_primero`.
export function describirComprobacion(comprobacion, { esPrimero = false } = {}) {
  if (esPrimero) return { estado: 'base', monto: null, texto: 'Línea de base' }
  if (comprobacion == null) return { estado: null, monto: null, texto: '—' }
  const valor = num(comprobacion)
  const monto = Math.abs(valor)
  if (arqueoCuadra(valor)) return { estado: 'cuadra', monto: 0, texto: 'Cuadra' }
  if (valor > 0) return { estado: 'falta', monto, texto: 'Falta' }
  return { estado: 'sobra', monto, texto: 'Sobra' }
}
