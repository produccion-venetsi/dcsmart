import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duracionTurno, soloHora, cruzaDia, ticketPromedio } from './turnoInfo.js'

const d = (s) => new Date(s)

test('la duracion se dice en horas y minutos', () => {
  assert.equal(duracionTurno(d('2026-08-19T20:03:00'), d('2026-08-20T03:00:00')), '6 h 57 min')
  assert.equal(duracionTurno(d('2026-08-19T20:00:00'), d('2026-08-19T23:00:00')), '3 h')
  assert.equal(duracionTurno(d('2026-08-19T20:00:00'), d('2026-08-19T20:45:00')), '45 min')
})

test('sin cierre no hay duracion que mostrar', () => {
  assert.equal(duracionTurno(d('2026-08-19T20:00:00'), null), null)
  assert.equal(duracionTurno(null, null), null)
})

// Pasa con cajas migradas: cierre anterior a la apertura (la t218 de GRAN-DANZON).
test('un cierre anterior a la apertura no muestra duracion negativa', () => {
  assert.equal(duracionTurno(d('2026-08-19T00:16:00'), d('2026-08-18T04:16:00')), null)
})

test('la hora sale con dos digitos', () => {
  assert.equal(soloHora(d('2026-08-19T03:05:00')), '03:05')
  assert.equal(soloHora(null), null)
})

test('detecta el turno que cierra al dia siguiente', () => {
  assert.equal(cruzaDia(d('2026-08-19T20:03:00'), d('2026-08-20T03:00:00')), true)
  assert.equal(cruzaDia(d('2026-08-19T13:00:00'), d('2026-08-19T20:00:00')), false)
  assert.equal(cruzaDia(d('2026-08-19T13:00:00'), null), false)
})

test('el ticket promedio divide la venta entre la gente', () => {
  assert.equal(ticketPromedio(100000, 40), 2500)
})

test('sin comensales no se inventa un promedio', () => {
  assert.equal(ticketPromedio(100000, 0), null)
  assert.equal(ticketPromedio(100000, null), null)
  assert.equal(ticketPromedio(null, 40), null)
})
