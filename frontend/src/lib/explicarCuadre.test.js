import { test } from 'node:test'
import assert from 'node:assert/strict'
import { explicarDiferencia, sospechasDeDiferencia } from './explicarCuadre.js'

const cuadre = (over = {}) => ({
  total: 1000, efectivo: 400, cobros: 600, no_cobrado: 0,
  esperado: 1000, diferencia: 0, cuadra: true, ...over,
})

test('cuando cuadra lo dice sin rodeos y no inventa sospechas', () => {
  const r = explicarDiferencia(cuadre())
  assert.equal(r.estado, 'cuadra')
  assert.match(r.titulo, /cuadra/i)
  assert.equal(r.sospechas.length, 0)
})

test('sin total cargado no se juzga la caja', () => {
  const r = explicarDiferencia(cuadre({ total: null, diferencia: null, cuadra: null }))
  assert.equal(r.estado, 'incompleta')
  assert.match(r.titulo, /falta.*total|total.*falta/i)
})

test('falta plata: el titulo dice cuanto y en plata, no el signo', () => {
  const r = explicarDiferencia(cuadre({ total: 1200, diferencia: 200, cuadra: false }))
  assert.equal(r.estado, 'falta')
  assert.match(r.titulo, /\$\s?200/)
  assert.doesNotMatch(r.titulo, /-/)
})

test('sobra plata: se dice como sobrante, no como negativo', () => {
  const r = explicarDiferencia(cuadre({ total: 800, diferencia: -200, cuadra: false }))
  assert.equal(r.estado, 'sobra')
  assert.match(r.titulo, /\$\s?200/)
  assert.match(r.titulo, /m[áa]s/i)
})

test('la explicacion muestra la cuenta con la que se llego al numero', () => {
  const r = explicarDiferencia(cuadre({ total: 1200, diferencia: 200, cuadra: false }))
  assert.match(r.cuenta, /1\.200/)
  assert.match(r.cuenta, /400/)
  assert.match(r.cuenta, /600/)
})

// ── Sospechas: qué mirar primero ──────────────────────────────────────────

test('si falta plata, la primera sospecha es un cobro sin cargar', () => {
  const s = sospechasDeDiferencia(cuadre({ total: 1200, diferencia: 200, cuadra: false }))
  assert.ok(s.length > 0)
  assert.match(s[0], /cobro/i)
})

test('si sobra plata, sugiere revisar el total y los cobros duplicados', () => {
  const s = sospechasDeDiferencia(cuadre({ total: 800, diferencia: -200, cuadra: false }))
  assert.ok(s.some((x) => /total/i.test(x)))
  assert.ok(s.some((x) => /dos veces|duplicad/i.test(x)))
})

test('con venta fiada cargada, avisa que ya esta contada para que no la carguen de nuevo', () => {
  const s = sospechasDeDiferencia(cuadre({ total: 1200, diferencia: 200, cuadra: false, no_cobrado: 150 }))
  assert.ok(s.some((x) => /fiad|cobrar|cuenta corriente/i.test(x)))
})

test('si la diferencia es exactamente el doble de los gastos, lo marca', () => {
  // La firma clásica del signo invertido: pasó de verdad en LOS GALGOS.
  const s = sospechasDeDiferencia(cuadre({ total: 1200, diferencia: 200, cuadra: false, gastos: 100 }))
  assert.ok(s.some((x) => /gasto/i.test(x)))
})

test('una diferencia chica se atribuye a vuelto o redondeo', () => {
  const s = sospechasDeDiferencia(cuadre({ total: 1050, diferencia: 50, cuadra: false }))
  assert.ok(s.some((x) => /vuelto|redondeo|propina/i.test(x)))
})

test('una diferencia grande no se explica como vuelto', () => {
  const s = sospechasDeDiferencia(cuadre({ total: 900000, diferencia: 500000, cuadra: false }))
  assert.equal(s.some((x) => /vuelto|redondeo/i.test(x)), false)
})

test('sin cuadre no explota', () => {
  assert.equal(explicarDiferencia(null).estado, 'incompleta')
  assert.deepEqual(sospechasDeDiferencia(null), [])
})
