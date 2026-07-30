import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  totalContado, calcularComprobacion, arqueoCuadra, describirComprobacion, TOLERANCIA
} from './cuadreArqueo.js'

test('el total contado suma los tres lugares', () => {
  assert.equal(totalContado({ caja_fuerte: 1000, cofre: 500, adicion: 250 }), 1750)
})

test('el total contado tolera nulos y strings de Decimal', () => {
  assert.equal(totalContado({ caja_fuerte: '1000.50', cofre: null, adicion: undefined }), 1000.5)
  assert.equal(totalContado({}), 0)
})

test('cuadra cuando la plata cambio lo que el sistema esperaba', () => {
  // Entraron 1000, salieron 200: la plata tenia que subir 800.
  const c = calcularComprobacion({ ingresos: 1000, gastos: 200, contado: 1800, contadoAnterior: 1000 })
  assert.equal(c, 0)
  assert.equal(arqueoCuadra(c), true)
})

test('positivo = falta plata', () => {
  // El sistema esperaba +800 y la plata solo subio 500.
  const c = calcularComprobacion({ ingresos: 1000, gastos: 200, contado: 1500, contadoAnterior: 1000 })
  assert.equal(c, 300)
  assert.equal(describirComprobacion(c).estado, 'falta')
  assert.equal(describirComprobacion(c).monto, 300)
})

test('negativo = sobra plata', () => {
  // El sistema esperaba +800 y la plata subio 1000.
  const c = calcularComprobacion({ ingresos: 1000, gastos: 200, contado: 2000, contadoAnterior: 1000 })
  assert.equal(c, -200)
  assert.equal(describirComprobacion(c).estado, 'sobra')
  assert.equal(describirComprobacion(c).monto, 200)
})

test('el primer arqueo del local compara contra cero', () => {
  const c = calcularComprobacion({ ingresos: 5000, gastos: 0, contado: 5000, contadoAnterior: 0 })
  assert.equal(c, 0)
})

test('un centavo de redondeo no es descuadre', () => {
  // Era el bug de antes: con tolerancia 0.01 estricta, esto salia en rojo.
  const c = calcularComprobacion({ ingresos: 1000.01, gastos: 0, contado: 1000, contadoAnterior: 0 })
  assert.equal(arqueoCuadra(c), true)
  assert.equal(describirComprobacion(c).estado, 'cuadra')
})

test('la tolerancia es un peso, igual que en cajas', () => {
  assert.equal(TOLERANCIA, 1)
  assert.equal(arqueoCuadra(1), true)      // el limite entra
  assert.equal(arqueoCuadra(-1), true)
  assert.equal(arqueoCuadra(1.01), false)  // pasado el limite, no
})

test('describir no miente cerca del cero: 1,50 ya es descuadre', () => {
  const d = describirComprobacion(1.5)
  assert.equal(d.estado, 'falta')
  assert.equal(d.monto, 1.5)
})

test('sin comprobacion no se afirma nada', () => {
  assert.equal(arqueoCuadra(null), null)
  assert.equal(describirComprobacion(null).estado, null)
  assert.equal(describirComprobacion(null).texto, '—')
})

test('los gastos restan de lo esperado, no suman', () => {
  // Si los gastos se sumaran, este arqueo daria -400 en vez de 0.
  const c = calcularComprobacion({ ingresos: 1000, gastos: 200, contado: 800, contadoAnterior: 0 })
  assert.equal(c, 0)
})

test('acepta los strings que devuelve Prisma para Decimal', () => {
  const c = calcularComprobacion({ ingresos: '1000.00', gastos: '200.00', contado: '1500.00', contadoAnterior: '1000.00' })
  assert.equal(c, 300)
})

test('el primer arqueo del local es linea de base, no descuadre', () => {
  // GRAN-DANZON: "sobra $142.159.607" contra una caja de $89.530, porque sin
  // arqueo anterior el periodo barre todo el historial del local.
  const d = describirComprobacion(-142159607.51, { esPrimero: true })
  assert.equal(d.estado, 'base')
  assert.equal(d.monto, null)
  assert.equal(d.texto, 'Línea de base')
})

test('esPrimero gana incluso si el numero cuadraria', () => {
  assert.equal(describirComprobacion(0, { esPrimero: true }).estado, 'base')
})

test('sin esPrimero se comporta como antes', () => {
  assert.equal(describirComprobacion(-142159607.51).estado, 'sobra')
  assert.equal(describirComprobacion(300, { esPrimero: false }).estado, 'falta')
})
