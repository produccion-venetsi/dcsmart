// Fudo no tiene cierres de turno: la caja de un dia se arma juntando las ventas
// de una ventana fija. El corte a las 06:00 es lo que hace que una noche que
// termina a las 3 AM quede en el dia que le corresponde y no en el siguiente.
'use strict'

// Argentina es UTC-3 todo el año (no hay horario de verano desde 2009).
const OFFSET_AR_HORAS = 3
const HORA_CORTE_DEFAULT = 6

const sinMilisegundos = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

// '2026-08-13' + corte 6 -> 2026-08-13T09:00:00Z (06:00 AR) .. +24 h
export function ventanaDia(fecha, horaCorte = HORA_CORTE_DEFAULT) {
  const desde = new Date(`${fecha}T00:00:00Z`)
  desde.setUTCHours(horaCorte + OFFSET_AR_HORAS)
  const hasta = new Date(desde.getTime() + 24 * 3600e3)
  return { desde: sinMilisegundos(desde), hasta: sinMilisegundos(hasta) }
}

// Ultimo dia comercial ya cerrado en el instante `ahora`. Restarle el offset y
// la hora de corte al UTC resuelve las dos cosas de una: pasar a hora argentina
// y mandar la madrugada al dia anterior.
function ultimoDiaCerrado(ahora, horaCorte) {
  const corrido = new Date(ahora.getTime() - (OFFSET_AR_HORAS + horaCorte) * 3600e3)
  corrido.setUTCDate(corrido.getUTCDate() - 1) // el dia de hoy todavia esta abierto
  return corrido.toISOString().slice(0, 10)
}

// Los ultimos `cantidad` dias cerrados, del mas viejo al mas nuevo. Se reprocesa
// mas de uno porque una venta tardia o una anulacion pueden cambiar un dia que
// ya se habia sincronizado.
export function diasAProcesar(ahora, cantidad = 4, horaCorte = HORA_CORTE_DEFAULT) {
  const ultimo = new Date(`${ultimoDiaCerrado(ahora, horaCorte)}T12:00:00Z`)
  const dias = []
  for (let i = cantidad - 1; i >= 0; i--) {
    const d = new Date(ultimo.getTime() - i * 24 * 3600e3)
    dias.push(d.toISOString().slice(0, 10))
  }
  return dias
}
