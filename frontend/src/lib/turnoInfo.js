// Los datos del turno que NO son plata: cuándo empezó y terminó, cuánto duró,
// quién lo cargó, cuánta gente pasó.
//
// Estaban mezclados con los montos en la misma grilla de tarjetas, así que
// "Comensales 142" competía visualmente con "Total $2.151.215". Son preguntas
// distintas y se leen aparte.

const dosDigitos = (n) => String(n).padStart(2, '0')

const valida = (f) => {
  if (!f) return null
  const d = f instanceof Date ? f : new Date(f)
  return Number.isNaN(d.getTime()) ? null : d
}

// "6 h 40 min" — el dato que nadie calcula a ojo mirando dos timestamps.
export function duracionTurno(inicio, cierre) {
  const a = valida(inicio)
  const b = valida(cierre)
  if (!a || !b) return null
  const ms = b.getTime() - a.getTime()
  // Un cierre anterior a la apertura es un dato imposible (pasa con cajas
  // migradas): no se muestra una duración negativa.
  if (ms < 0) return null
  const min = Math.round(ms / 60000)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

// La hora sola, para cuando la fecha ya está dicha en el encabezado.
export function soloHora(fecha) {
  const d = valida(fecha)
  if (!d) return null
  return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`
}

// ¿El turno cruzó la medianoche? Sirve para avisar "cerró al día siguiente",
// que es lo que confunde al leer "inicio 20:03 · cierre 03:00".
export function cruzaDia(inicio, cierre) {
  const a = valida(inicio)
  const b = valida(cierre)
  if (!a || !b) return false
  return a.toDateString() !== b.toDateString()
}

// Promedio por persona: el número que el dueño mira siempre y hoy hay que
// sacar con calculadora.
export function ticketPromedio(total, comensales) {
  // null/'' se descartan antes de Number(): Number(null) es 0, que pasaría el
  // chequeo de finito y devolvería un promedio de cero pesos.
  if (total == null || total === '' || comensales == null || comensales === '') return null
  const t = Number(total)
  const c = Number(comensales)
  if (!Number.isFinite(t) || !Number.isFinite(c) || c <= 0) return null
  return t / c
}
