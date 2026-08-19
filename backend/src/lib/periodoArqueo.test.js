import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechaEfectivaCaja, cajaEnPeriodo, sumarEfectivoDelPeriodo } from './periodoArqueo.js'

const d = (s) => new Date(s)

// ── fechaEfectivaCaja ─────────────────────────────────────────────────────

test('con cierre posterior a la apertura, manda el cierre', () => {
  const caja = { fecha_inicio: d('2026-08-18T13:59:00Z'), fecha_cierre: d('2026-08-18T20:00:00Z') }
  assert.deepEqual(fechaEfectivaCaja(caja), d('2026-08-18T20:00:00Z'))
})

test('sin cierre cargado, cae a la apertura', () => {
  const caja = { fecha_inicio: d('2026-08-18T13:59:00Z'), fecha_cierre: null }
  assert.deepEqual(fechaEfectivaCaja(caja), d('2026-08-18T13:59:00Z'))
})

test('cierre igual a la apertura (no se cargó) devuelve la apertura', () => {
  const f = d('2026-08-18T13:59:00Z')
  assert.deepEqual(fechaEfectivaCaja({ fecha_inicio: f, fecha_cierre: f }), f)
})

// El caso GRAN-DANZON t218: abre el 19 a las 00:16 y "cierra" el 18 a las 04:16.
// Un cierre anterior a la apertura es un dato imposible: se ignora.
test('cierre ANTERIOR a la apertura se descarta y vale la apertura', () => {
  const caja = { fecha_inicio: d('2026-08-19T00:16:00Z'), fecha_cierre: d('2026-08-18T04:16:00Z') }
  assert.deepEqual(fechaEfectivaCaja(caja), d('2026-08-19T00:16:00Z'))
})

test('fecha_cierre inválida se descarta', () => {
  const caja = { fecha_inicio: d('2026-08-19T00:16:00Z'), fecha_cierre: new Date('no-es-fecha') }
  assert.deepEqual(fechaEfectivaCaja(caja), d('2026-08-19T00:16:00Z'))
})

// ── cajaEnPeriodo ─────────────────────────────────────────────────────────

test('el periodo es (desde, hasta]: desde es exclusivo, hasta inclusivo', () => {
  const desde = d('2026-08-18T14:21:00Z'), hasta = d('2026-08-19T13:42:00Z')
  const justoEnDesde = { fecha_inicio: desde, fecha_cierre: desde }
  const justoEnHasta = { fecha_inicio: hasta, fecha_cierre: hasta }
  assert.equal(cajaEnPeriodo(justoEnDesde, desde, hasta), false)
  assert.equal(cajaEnPeriodo(justoEnHasta, desde, hasta), true)
})

// El turno 528 de TOGNIS-PIZZA: abre ANTES del arqueo, cierra DESPUÉS. Su plata
// entra al cofre al cerrar, así que pertenece al período siguiente.
test('turno que abre antes del corte pero cierra despues cuenta en el periodo siguiente', () => {
  const t528 = { fecha_inicio: d('2026-08-18T13:59:00Z'), fecha_cierre: d('2026-08-18T20:00:00Z'), efectivo: 164400 }
  const periodoAnterior = [d('2026-08-17T15:53:00Z'), d('2026-08-18T14:21:00Z')]
  const periodoSiguiente = [d('2026-08-18T14:21:00Z'), d('2026-08-19T13:42:00Z')]
  assert.equal(cajaEnPeriodo(t528, ...periodoAnterior), false)
  assert.equal(cajaEnPeriodo(t528, ...periodoSiguiente), true)
})

test('sin desde (primer arqueo) cuenta todo lo anterior a hasta', () => {
  const caja = { fecha_inicio: d('2024-01-01T00:00:00Z'), fecha_cierre: d('2024-01-01T06:00:00Z') }
  assert.equal(cajaEnPeriodo(caja, null, d('2026-08-19T00:00:00Z')), true)
})

// ── sumarEfectivoDelPeriodo ───────────────────────────────────────────────

test('suma solo las cajas cuya fecha efectiva cae en el periodo', () => {
  const desde = d('2026-08-18T14:21:00Z'), hasta = d('2026-08-19T13:42:00Z')
  const cajas = [
    // t528: abre antes del corte, cierra dentro -> cuenta
    { fecha_inicio: d('2026-08-18T13:59:00Z'), fecha_cierre: d('2026-08-18T20:00:00Z'), efectivo: 164400 },
    // t529: abre y cierra dentro -> cuenta
    { fecha_inicio: d('2026-08-18T20:03:00Z'), fecha_cierre: d('2026-08-19T03:00:00Z'), efectivo: 153500 },
    // t527: cerró antes del corte -> no cuenta
    { fecha_inicio: d('2026-08-17T20:00:00Z'), fecha_cierre: d('2026-08-18T03:00:00Z'), efectivo: 765100 },
  ]
  assert.equal(sumarEfectivoDelPeriodo(cajas, desde, hasta), 317900)
})

test('efectivo null o vacio suma cero, no rompe', () => {
  const cajas = [
    { fecha_inicio: d('2026-08-18T20:00:00Z'), fecha_cierre: null, efectivo: null },
    { fecha_inicio: d('2026-08-18T21:00:00Z'), fecha_cierre: null, efectivo: '1500.50' },
  ]
  assert.equal(sumarEfectivoDelPeriodo(cajas, d('2026-08-18T00:00:00Z'), d('2026-08-19T00:00:00Z')), 1500.5)
})
