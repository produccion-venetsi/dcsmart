import test from 'node:test'
import assert from 'node:assert/strict'
import { DIAS_INACTIVIDAD, diasDesdeUltimoLogin, requiereResetPorInactividad } from './inactividad.js'

const ahora = new Date('2026-08-03T12:00:00.000Z')
const haceDias = (d) => new Date(ahora.getTime() - d * 86400000)

// ── diasDesdeUltimoLogin ────────────────────────────────────────────────────

test('diasDesdeUltimoLogin: cuenta dias completos', () => {
  assert.equal(diasDesdeUltimoLogin(haceDias(0), ahora), 0)
  assert.equal(diasDesdeUltimoLogin(haceDias(1), ahora), 1)
  assert.equal(diasDesdeUltimoLogin(haceDias(30), ahora), 30)
})

test('diasDesdeUltimoLogin: unas horas todavia es el mismo dia', () => {
  const haceUnasHoras = new Date(ahora.getTime() - 5 * 3600000)
  assert.equal(diasDesdeUltimoLogin(haceUnasHoras, ahora), 0)
})

test('diasDesdeUltimoLogin: sin fecha no se sabe', () => {
  assert.equal(diasDesdeUltimoLogin(null, ahora), null)
  assert.equal(diasDesdeUltimoLogin(undefined, ahora), null)
  assert.equal(diasDesdeUltimoLogin('cualquiera', ahora), null)
})

test('diasDesdeUltimoLogin: acepta el string ISO que devuelve el JSON', () => {
  assert.equal(diasDesdeUltimoLogin('2026-07-04T12:00:00.000Z', ahora), 30)
})

// ── requiereResetPorInactividad ─────────────────────────────────────────────

test('requiereResetPorInactividad: entro hoy o hace poco, entra normal', () => {
  assert.equal(requiereResetPorInactividad(haceDias(0), ahora), false)
  assert.equal(requiereResetPorInactividad(haceDias(7), ahora), false)
})

test('requiereResetPorInactividad: el dia 14 todavia entra', () => {
  assert.equal(requiereResetPorInactividad(haceDias(14), ahora), false)
})

test('requiereResetPorInactividad: a los 15 dias se frena', () => {
  assert.equal(requiereResetPorInactividad(haceDias(15), ahora), true)
  assert.equal(requiereResetPorInactividad(haceDias(60), ahora), true)
  assert.equal(DIAS_INACTIVIDAD, 15)
})

test('requiereResetPorInactividad: SIN last_login no se bloquea', () => {
  // El caso que importa: la columna arranca vacia para todos los usuarios que
  // ya existen. Bloquear con null dejaria afuera a toda la empresa el dia del
  // despliegue.
  assert.equal(requiereResetPorInactividad(null, ahora), false)
  assert.equal(requiereResetPorInactividad(undefined, ahora), false)
})

test('requiereResetPorInactividad: una fecha futura no bloquea', () => {
  // Reloj mal puesto o dato raro: no es motivo para dejar a alguien afuera.
  const manana = new Date(ahora.getTime() + 86400000)
  assert.equal(requiereResetPorInactividad(manana, ahora), false)
})

test('requiereResetPorInactividad: el umbral se puede cambiar', () => {
  assert.equal(requiereResetPorInactividad(haceDias(10), ahora, 30), false)
  assert.equal(requiereResetPorInactividad(haceDias(10), ahora, 5), true)
})
