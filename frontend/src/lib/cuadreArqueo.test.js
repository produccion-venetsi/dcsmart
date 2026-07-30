import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as front from './cuadreArqueo.js'
// El backend es el que manda al guardar. Se importa acá para verificar que las
// dos copias dan el mismo numero: es la unica forma de que el duplicado no se
// convierta en dos verdades, que es lo que paso con la formula de cajas.
import * as back from '../../../backend/src/lib/cuadreArqueo.js'

const CASOS = [
  { ingresos: 1000, gastos: 200, contado: 1800, contadoAnterior: 1000 }, // cuadra
  { ingresos: 1000, gastos: 200, contado: 1500, contadoAnterior: 1000 }, // falta
  { ingresos: 1000, gastos: 200, contado: 2000, contadoAnterior: 1000 }, // sobra
  { ingresos: 5000, gastos: 0, contado: 5000, contadoAnterior: 0 },      // primer arqueo
  { ingresos: 1000.01, gastos: 0, contado: 1000, contadoAnterior: 0 },   // redondeo
  { ingresos: '1000.00', gastos: '200.00', contado: '1500.00', contadoAnterior: '1000.00' },
  { ingresos: 0, gastos: 0, contado: 0, contadoAnterior: 0 },
  { ingresos: null, gastos: undefined, contado: '', contadoAnterior: null },
]

test('la copia del frontend da el mismo numero que la del backend', () => {
  for (const c of CASOS) {
    assert.equal(
      front.calcularComprobacion(c), back.calcularComprobacion(c),
      `difieren en ${JSON.stringify(c)}`
    )
  }
})

test('las dos copias etiquetan igual', () => {
  for (const c of CASOS) {
    const v = front.calcularComprobacion(c)
    assert.deepEqual(front.describirComprobacion(v), back.describirComprobacion(v), `difieren en ${v}`)
  }
})

test('las dos copias usan la misma tolerancia', () => {
  assert.equal(front.TOLERANCIA, back.TOLERANCIA)
})

test('el total contado coincide en las dos', () => {
  for (const m of [
    { caja_fuerte: 1000, cofre: 500, adicion: 250 },
    { caja_fuerte: '1000.50', cofre: null, adicion: undefined },
    {},
  ]) {
    assert.equal(front.totalContado(m), back.totalContado(m), `difieren en ${JSON.stringify(m)}`)
  }
})

// ── Comportamiento propio, para que el archivo del frontend no dependa solo de
//    la comparacion con el backend ────────────────────────────────────────────

test('positivo es falta y negativo es sobra', () => {
  assert.equal(front.describirComprobacion(300).estado, 'falta')
  assert.equal(front.describirComprobacion(-200).estado, 'sobra')
  assert.equal(front.describirComprobacion(0).estado, 'cuadra')
})

test('un peso de diferencia todavia cuadra; 1,01 ya no', () => {
  assert.equal(front.arqueoCuadra(1), true)
  assert.equal(front.arqueoCuadra(-1), true)
  assert.equal(front.arqueoCuadra(1.01), false)
})

test('sin comprobacion no se afirma nada', () => {
  assert.equal(front.arqueoCuadra(null), null)
  assert.equal(front.describirComprobacion(null).texto, '—')
})
