import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ventanaDia, diasAProcesar } from './dias.js'

test('la ventana del dia va de las 06:00 a las 06:00 hora Argentina', () => {
  // 06:00 en Argentina (UTC-3) son las 09:00 UTC.
  assert.deepEqual(ventanaDia('2026-08-13'), {
    desde: '2026-08-13T09:00:00Z',
    hasta: '2026-08-14T09:00:00Z',
  })
})

test('la hora de corte es configurable por local', () => {
  assert.deepEqual(ventanaDia('2026-08-13', 4), {
    desde: '2026-08-13T07:00:00Z',
    hasta: '2026-08-14T07:00:00Z',
  })
})

test('una hora de corte de 0 deja el dia calendario', () => {
  assert.deepEqual(ventanaDia('2026-08-13', 0), {
    desde: '2026-08-13T03:00:00Z',
    hasta: '2026-08-14T03:00:00Z',
  })
})

test('la ventana cruza fin de mes sin romperse', () => {
  assert.deepEqual(ventanaDia('2026-07-31'), {
    desde: '2026-07-31T09:00:00Z',
    hasta: '2026-08-01T09:00:00Z',
  })
})

test('a las 11 de la mañana el ultimo dia cerrado es el de ayer', () => {
  // 2026-08-14 11:00 AR = 14:00 UTC. El dia comercial del 14 todavia esta abierto.
  const dias = diasAProcesar(new Date('2026-08-14T14:00:00Z'), 4)
  assert.deepEqual(dias, ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'])
})

test('a las 03 de la madrugada todavia estamos en el dia comercial anterior', () => {
  // 2026-08-14 03:00 AR = 06:00 UTC: antes del corte, o sea dia comercial 13,
  // que sigue abierto. El ultimo cerrado es el 12.
  const dias = diasAProcesar(new Date('2026-08-14T06:00:00Z'), 2)
  assert.deepEqual(dias, ['2026-08-11', '2026-08-12'])
})

test('pide siempre la cantidad de dias que se le pasa', () => {
  assert.equal(diasAProcesar(new Date('2026-08-14T14:00:00Z'), 1).length, 1)
  assert.equal(diasAProcesar(new Date('2026-08-14T14:00:00Z'), 10).length, 10)
})
