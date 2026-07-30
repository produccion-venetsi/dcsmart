// Comprobacion de un arqueo: una sola definicion, para las tres que habia.
//
// La formula estaba escrita en POST /arqueo, en PUT /arqueo/:id y otra vez en el
// frontend para el preview en vivo. Tres copias de la misma regla: si una se
// tocaba, el numero que veias antes de confirmar dejaba de coincidir con el que
// quedaba guardado.
//
// QUE COMPARA
//
// Un arqueo cuenta la plata que hay (caja fuerte + cofre + adicion) y la compara
// contra lo que el sistema dice que tendria que haber cambiado desde el arqueo
// anterior:
//
//   comprobacion = (ingresos - gastos) - (contado - contadoAnterior)
//                   \_ lo que el sistema  \_ lo que la plata realmente cambio
//                      dice que entro
//
// EL SIGNO
//
// Positivo = FALTA plata: el sistema esperaba mas movimiento del que aparecio en
// el conteo. Negativo = SOBRA. Cero = cuadra.
//
// OJO: en cajas (lib/cuadreCaja.js) el signo significa lo contrario -- ahi
// positivo es que el total declarado supera lo registrado, y la pantalla lo
// muestra como "(sobra)". Los dos numeros se calculan distinto a proposito
// porque comparan cosas distintas, pero por eso NUNCA hay que mostrar la
// comprobacion pelada: siempre con su etiqueta de falta/sobra, que es para lo
// que esta describirComprobacion().

// La misma tolerancia que cajas, y por el mismo motivo: no circulan centavos, y
// un centavo de diferencia es redondeo de Decimal, no un error de carga.
import { TOLERANCIA } from './cuadreCaja.js'

export { TOLERANCIA }

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// El total contado de un arqueo: lo que hay fisicamente en los tres lugares.
export function totalContado({ caja_fuerte, cofre, adicion }) {
  return num(caja_fuerte) + num(cofre) + num(adicion)
}

// ingresos/gastos vienen de los movimientos del periodo; contadoAnterior es el
// total del arqueo anterior (0 si es el primero del local).
export function calcularComprobacion({ ingresos, gastos, contado, contadoAnterior }) {
  const esperado = num(ingresos) - num(gastos)
  const real = num(contado) - num(contadoAnterior)
  return esperado - real
}

export function arqueoCuadra(comprobacion) {
  if (comprobacion == null) return null
  return Math.abs(num(comprobacion)) <= TOLERANCIA
}

// Traduce el numero a algo que se pueda leer sin saber de que lado esta el signo.
// La UI muestra esto, no la comprobacion cruda.
//
// `esPrimero`: el primer arqueo de un local no tiene contra que compararse. Su
// contadoAnterior es 0 y el periodo de ingresos/gastos arranca sin fecha desde,
// asi que barre TODO el historial del local: en GRAN-DANZON eso daba "sobra
// $142.159.607" contra una caja de $89.530. No es un descuadre, es que no hay
// medicion previa. Se muestra como linea de base.
export function describirComprobacion(comprobacion, { esPrimero = false } = {}) {
  if (esPrimero) return { estado: 'base', monto: null, texto: 'Línea de base' }
  if (comprobacion == null) return { estado: null, monto: null, texto: '—' }
  const valor = num(comprobacion)
  const monto = Math.abs(valor)
  if (arqueoCuadra(valor)) return { estado: 'cuadra', monto: 0, texto: 'Cuadra' }
  if (valor > 0) return { estado: 'falta', monto, texto: 'Falta' }
  return { estado: 'sobra', monto, texto: 'Sobra' }
}
