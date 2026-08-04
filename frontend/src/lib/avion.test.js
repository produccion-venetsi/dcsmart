import test from 'node:test'
import assert from 'node:assert/strict'
import { porcentajeAvion, fmtPorcentajeAvion, claseAvion } from './avion.js'

test('porcentajeAvion: la mitad declarada es 50%', () => {
  assert.equal(porcentajeAvion(3267000, 1633500), 50)
})

test('porcentajeAvion: nada declarado es 100%', () => {
  // 1275 de las 6482 cajas están así: es un dato válido, no un faltante.
  assert.equal(porcentajeAvion(2580000, 0), 100)
})

test('porcentajeAvion: todo declarado es 0%', () => {
  assert.equal(porcentajeAvion(1000, 1000), 0)
})

test('porcentajeAvion: acepta el Decimal que viaja como string en el JSON', () => {
  assert.equal(porcentajeAvion('1000.00', '250.00'), 75)
})

test('porcentajeAvion: sin total no se sabe', () => {
  assert.equal(porcentajeAvion(null, 500), null)
  assert.equal(porcentajeAvion(undefined, 500), null)
})

test('porcentajeAvion: total en 0 no se sabe (no divide por cero)', () => {
  assert.equal(porcentajeAvion(0, 0), null)
})

test('porcentajeAvion: sin fiscal cargado no se sabe, no es 100%', () => {
  // Distinto de fiscal = 0. Suponer 100% en una caja sin cargar sería inventar.
  assert.equal(porcentajeAvion(1000, null), null)
  assert.equal(porcentajeAvion(1000, undefined), null)
})

test('porcentajeAvion: un fiscal mayor que el total se acota en 0, no da negativo', () => {
  assert.equal(porcentajeAvion(1000, 1500), 0)
})

test('porcentajeAvion: un total negativo no se calcula', () => {
  assert.equal(porcentajeAvion(-1000, 100), null)
})

test('porcentajeAvion: basura no rompe', () => {
  assert.equal(porcentajeAvion('hola', 100), null)
  assert.equal(porcentajeAvion(1000, 'hola'), null)
})

test('fmtPorcentajeAvion: redondea al entero y agrega el signo', () => {
  assert.equal(fmtPorcentajeAvion(3000, 1000), '67%')
  assert.equal(fmtPorcentajeAvion(1000, 0), '100%')
  assert.equal(fmtPorcentajeAvion(1000, 1000), '0%')
})

test('fmtPorcentajeAvion: lo que no se sabe es guión, no 0%', () => {
  assert.equal(fmtPorcentajeAvion(null, 100), '—')
  assert.equal(fmtPorcentajeAvion(1000, null), '—')
  assert.equal(fmtPorcentajeAvion(0, 0), '—')
})

test('claseAvion: sólo el 100% se destaca', () => {
  assert.equal(claseAvion(1000, 0), 'td-avion-alto')
  assert.equal(claseAvion(1000, 1), 'td-muted')
  assert.equal(claseAvion(1000, 1000), 'td-muted')
  assert.equal(claseAvion(null, null), 'td-muted')
})
