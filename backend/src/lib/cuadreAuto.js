// Qué motor de cuadre usar para una caja.
//
// Durante la transición conviven las dos estructuras: las cajas migradas tienen
// líneas y se calculan sumando por categoría; las que todavía no, siguen con el
// motor que lee movimientos y detalles. Elegir acá y no en cada ruta evita que
// una pantalla muestre un número calculado distinto que otra.
//
// La regla es simple a propósito: si la caja tiene líneas, mandan las líneas.
// Una caja migrada tiene TODO en líneas (el migrador convierte movimientos,
// detalles y hasta el efectivo del campo), así que no hay forma de que falte
// algo por mirar la estructura nueva.

import { calcularCuadre as porLineas } from './cuadreLineas.js'
import { calcularCuadre as porTablasViejas } from './cuadreVenta.js'

export function tieneLineas(caja) {
  return Array.isArray(caja?.lineas) && caja.lineas.length > 0
}

export function calcularCuadre(caja) {
  if (!caja) return null
  return tieneLineas(caja) ? porLineas(caja) : porTablasViejas(caja)
}
