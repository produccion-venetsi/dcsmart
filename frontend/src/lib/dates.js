// Utilidades centralizadas de fecha/hora para toda la app.
//
// Hay dos familias de campos de fecha en el sistema, y cada una se maneja
// distinto:
//
// 1. "Fecha de calendario" (fecha de pago, período, cashflow): se cargan con
//    <input type="date"> y se guardan como medianoche UTC del día elegido
//    (`new Date('2026-07-21')` -> `2026-07-21T00:00:00.000Z`). Para que el
//    día mostrado sea siempre el mismo que se guardó, sin importar en qué
//    huso horario esté el navegador de quien mira, SIEMPRE hay que forzar
//    `timeZone: 'UTC'` al mostrarlas. Usar fmtDateUTC/fmtMonthUTC.
//
// 2. Instante real con hora (apertura/cierre de caja, fecha de arqueo, fecha
//    de pago con hora): representan un momento real de reloj. Esta app es de
//    uso exclusivo en Argentina, así que esos instantes SIEMPRE se
//    interpretan y muestran en hora de Argentina (America/Argentina/Buenos_Aires,
//    UTC-3 fijo, sin horario de verano) -- no en la hora local del navegador
//    de quien mira, para que dos personas en distintos husos (o un server
//    corriendo en UTC) vean/guarden siempre lo mismo. Usar
//    toDateTimeLocalInput/toUtcIsoFromDateTimeLocal/fmtDateTimeArg.
//
// Nunca usar `new Date().toISOString().slice(0, 10 o 16)` para construir un
// default de "hoy/ahora" ni para precargar un input -- eso da el día/hora en
// UTC, que se corre respecto al día/hora real de Argentina (ej. después de
// las 21:00 ART, toISOString() ya cayó en el día siguiente).

const TZ = 'America/Argentina/Buenos_Aires'

// Devuelve los componentes (año, mes, día, hora, minuto) de un instante,
// SIEMPRE en hora de Argentina, sin importar el huso horario del navegador
// o del servidor donde corra este código.
function argParts(value) {
  const d = value instanceof Date ? value : new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(d)
  return parts.reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {})
}

// Día calendario "hoy" en Argentina, para el default de <input type="date">.
export function todayInputDate() {
  const p = argParts(new Date())
  return `${p.year}-${p.month}-${p.day}`
}

// "Ahora" en Argentina, para precargar un <input type="datetime-local">.
export function nowDateTimeLocalInput() {
  const p = argParts(new Date())
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

// Convierte un instante ya guardado (Date, ISO string, o falsy) al string
// que espera un <input type="datetime-local">, en hora de Argentina.
export function toDateTimeLocalInput(value) {
  if (!value) return ''
  const p = argParts(value)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

// Convierte el string crudo de un <input type="datetime-local"> (que el
// usuario tipeó pensando en hora de Argentina) a un ISO real, con el offset
// de Argentina (-03:00, fijo todo el año) marcado explícitamente -- así el
// backend lo interpreta siempre igual sin depender del huso horario del
// proceso donde corra `new Date(...)`.
export function toUtcIsoFromDateTimeLocal(value) {
  if (!value) return null
  const withSeconds = value.length === 16 ? `${value}:00` : value
  return new Date(`${withSeconds}-03:00`).toISOString()
}

// Fecha "de calendario" (día de pago, período, etc.) -- fuerza timeZone UTC
// para que el día mostrado sea siempre el mismo que se guardó.
export function fmtDateUTC(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { timeZone: 'UTC' })
}

export function fmtMonthUTC(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { year: 'numeric', month: 'short', timeZone: 'UTC' })
}

// Instante real con hora -- siempre en hora de Argentina, sin importar el
// huso horario de quien lo esté mirando.
export function fmtDateTimeArg(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-AR', { hour12: false, timeZone: TZ })
}

// Solo el día (sin hora) de un instante real, en hora de Argentina -- para
// mostrar "qué día fue" un turno de caja, un arqueo, etc. (distinto de
// fmtDateUTC, que es para fechas-de-calendario guardadas a medianoche UTC).
export function fmtDateArg(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { timeZone: TZ })
}
