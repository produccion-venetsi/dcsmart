import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDescuadre, describirEstado, UMBRAL_MENOR } from './estadoDescuadre.js'

test('cero (con redondeo de un peso) es correcto', () => {
  for (const d of [0, 1, -1, 0.4]) assert.equal(estadoDescuadre(d), 'correcto')
})

test('hasta 2000 pesos es menor, en las dos direcciones', () => {
  for (const d of [2, 1230, 2000, -1999]) assert.equal(estadoDescuadre(d), 'menor')
})

test('mas de 2000 es incorrecto', () => {
  for (const d of [2001, 59400, -1616000]) assert.equal(estadoDescuadre(d), 'incorrecto')
})

test('sin total no hay estado que juzgar', () => {
  assert.equal(estadoDescuadre(null), 'sin_total')
  assert.equal(estadoDescuadre(undefined), 'sin_total')
  assert.equal(estadoDescuadre(NaN), 'sin_total')
})

test('el umbral es uno solo para todo el sistema', () => {
  assert.equal(UMBRAL_MENOR, 2000)
})

test('el mensaje del menor tranquiliza en vez de asustar', () => {
  const d = describirEstado('menor', -1230)
  assert.match(d.detalle, /guardá igual|monto chico/i)
  assert.match(d.titulo, /1\.230/)
})

test('el incorrecto dice que revisar, no solo que esta mal', () => {
  const d = describirEstado('incorrecto', 59400)
  assert.match(d.detalle, /tarjeta|app|deber/i)
})
