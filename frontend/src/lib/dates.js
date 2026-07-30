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

// ── Antigüedad del período de una factura ───────────────────────────────────
//
// A partir de cuántos días de terminado el período se avisa que la factura es
// vieja. No bloquea la carga: solo advierte.
export const DIAS_PERIODO_VIEJO = 20

// Un período representa un MES, no un día: 28.233 de los 28.865 pagos con
// período cargado (97,8%) tienen día 1. Por eso la antigüedad se mide desde el
// FIN del mes del período y no desde la fecha ingresada.
//
// Si se midiera desde la fecha ingresada, una factura del mes corriente con
// período día 1 avisaría siempre a partir del día 20 del mismo mes, que es
// justamente el caso normal y no tiene nada de viejo.

// Pasa una fecha de calendario a milisegundos UTC. Se parsean los componentes a
// mano en lugar de usar `new Date(...)` sobre el string completo, para que el
// huso horario del navegador no pueda correr el resultado un día.
function calendarioAUtcMs(fechaCalendario) {
  const [y, m, d] = fechaCalendario.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// Último día del mes de esa fecha, en ms UTC. Día 0 del mes siguiente.
function finDeMesUtcMs(fechaCalendario) {
  const [y, m] = fechaCalendario.split('-').map(Number)
  return Date.UTC(y, m, 0)
}

// Acepta lo que puede tener el formulario: el string del <input type="date">,
// un ISO ya guardado, o un Date. Devuelve 'YYYY-MM-DD' o null.
function aFechaCalendario(valor) {
  if (!valor) return null
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10)
  const s = String(valor).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// Días transcurridos desde que terminó el mes del período. Negativo si el
// período todavía no cerró (el mes corriente o uno futuro). null si no hay
// período o no se entiende.
export function diasDesdeFinDePeriodo(periodo, hoy = todayInputDate()) {
  const p = aFechaCalendario(periodo)
  const h = aFechaCalendario(hoy)
  if (!p || !h) return null
  return Math.round((calendarioAUtcMs(h) - finDeMesUtcMs(p)) / 86400000)
}

// true si el período cerró hace DIAS_PERIODO_VIEJO días o más.
export function periodoDemasiadoViejo(periodo, hoy = todayInputDate()) {
  const dias = diasDesdeFinDePeriodo(periodo, hoy)
  return dias !== null && dias >= DIAS_PERIODO_VIEJO
}
