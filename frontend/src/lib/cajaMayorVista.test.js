import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dividirPorDireccion, enviadoPorLocal, recibidoPorLocal, netoDeFila, proporcion,
} from './cajaMayorVista.js'

const raiz = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const leer = (rel) => readFileSync(raiz(rel), 'utf8').replace(/\r\n/g, '\n')

// Como los devuelve GET /caja-mayor/saldos: la direccion viene desde la CAJA MAYOR.
const saldo = (local, ingresos, egresos, over = {}) =>
  ({ id_local: local, local, grupo: 'G', moneda: 'ARS', ingresos, egresos, ops: 1, en_estudio: 0, ...over })

// ── la traducción cruzada ───────────────────────────────────────────────────

test('lo que el local ENVIO son los ingresos de la caja mayor', () => {
  // Es lo cruzado del modelo: un egreso del local es un ingreso a la caja mayor.
  // Leerlo al derecho mostraria los dos totales invertidos.
  assert.equal(enviadoPorLocal(saldo('ATTE', 1000, 200)), 1000)
  assert.equal(recibidoPorLocal(saldo('ATTE', 1000, 200)), 200)
})

test('los montos se toman en positivo', () => {
  assert.equal(enviadoPorLocal({ ingresos: -500 }), 500)
  assert.equal(recibidoPorLocal({ egresos: -300 }), 300)
})

test('valores faltantes cuentan como cero, no como NaN', () => {
  assert.equal(enviadoPorLocal({}), 0)
  assert.equal(enviadoPorLocal(null), 0)
  assert.equal(recibidoPorLocal({ egresos: 'ocho' }), 0)
})

// ── las dos mitades ─────────────────────────────────────────────────────────

test('arma las dos columnas con su total', () => {
  const r = dividirPorDireccion([
    saldo('ATTE', 1240000, 80000),
    saldo('LOS GALGOS', 890500, 120000),
    saldo('LUCERO', 450000, 0),
  ])
  assert.equal(r.totalEnviado, 2580500)
  assert.equal(r.totalRecibido, 200000)
  assert.equal(r.neto, 2380500)
  assert.equal(r.locales, 3)
})

test('un local con cero de un lado NO se filtra: las filas tienen que alinearse', () => {
  // Si se filtraran los ceros, las dos columnas quedarian desalineadas y habria que
  // buscar el local en la otra lista para comparar.
  const r = dividirPorDireccion([saldo('LUCERO', 450000, 0)])
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].recibido, 0)
})

test('ordena por lo enviado, de mayor a menor', () => {
  const r = dividirPorDireccion([
    saldo('CHICO', 100, 0),
    saldo('GRANDE', 9000, 0),
    saldo('MEDIO', 500, 0),
  ])
  assert.deepEqual(r.filas.map(f => f.local), ['GRANDE', 'MEDIO', 'CHICO'])
})

test('con lo mismo enviado, desempata por nombre', () => {
  const r = dividirPorDireccion([saldo('ZETA', 100, 0), saldo('ALFA', 100, 0)])
  assert.deepEqual(r.filas.map(f => f.local), ['ALFA', 'ZETA'])
})

test('suma las ops y lo que falta confirmar', () => {
  const r = dividirPorDireccion([
    saldo('A', 100, 0, { ops: 5, en_estudio: 2 }),
    saldo('B', 200, 0, { ops: 3, en_estudio: 1 }),
  ])
  assert.equal(r.sinRecibir, 3)
  assert.equal(r.filas.reduce((a, f) => a + f.ops, 0), 8)
})

test('sin saldos no explota y todo queda en cero', () => {
  for (const entrada of [[], null, undefined]) {
    const r = dividirPorDireccion(entrada)
    assert.deepEqual(r.filas, [])
    assert.equal(r.totalEnviado, 0)
    assert.equal(r.totalRecibido, 0)
    assert.equal(r.neto, 0)
    assert.equal(r.locales, 0)
  }
})

test('un local sin nombre se muestra con guion, no como "null"', () => {
  const r = dividirPorDireccion([{ id_local: 'x', local: null, ingresos: 10, egresos: 0 }])
  assert.equal(r.filas[0].local, '—')
})

// ── neto ────────────────────────────────────────────────────────────────────

test('el neto de una fila es enviado menos recibido', () => {
  assert.equal(netoDeFila({ enviado: 1000, recibido: 200 }), 800)
  assert.equal(netoDeFila({ enviado: 100, recibido: 900 }), -800)
  assert.equal(netoDeFila({}), 0)
})

test('el neto total es la suma de los netos de las filas', () => {
  const r = dividirPorDireccion([saldo('A', 1000, 200), saldo('B', 500, 900)])
  assert.equal(r.neto, r.filas.reduce((a, f) => a + netoDeFila(f), 0))
})

// ── proporción ──────────────────────────────────────────────────────────────

test('la proporcion es el peso dentro de la columna', () => {
  assert.equal(proporcion(250, 1000), 25)
  assert.equal(proporcion(1000, 1000), 100)
})

test('sin total no se divide por cero', () => {
  assert.equal(proporcion(100, 0), 0)
  assert.equal(proporcion(0, 0), 0)
})

test('nunca pasa de 100, ni con montos negativos', () => {
  assert.equal(proporcion(2000, 1000), 100)
  assert.equal(proporcion(-500, 1000), 50)
})

// ── Contrato con el backend ─────────────────────────────────────────────────

test('el backend sigue mandando `ingresos` y `egresos` por local', () => {
  // Si se renombraran, las dos columnas quedarian en cero sin ningun error visible.
  const src = leer('../../../backend/src/lib/cajaMayor.js')
  const fn = src.slice(src.indexOf('export function saldosDeAgregados'))
  assert.match(fn, /ingresos:\s*0/)
  assert.match(fn, /egresos:\s*0/)
})

test('y sigue contando un ingreso de CM cuando el movimiento tiene ingreso=true', () => {
  // Es la mitad cruzada: si el backend invirtiera esto, "enviado" y "recibido"
  // aparecerian al reves y los numeros parecerian correctos.
  const src = leer('../../../backend/src/lib/cajaMayor.js')
  assert.match(src, /if \(g\.ingreso === true\) acc\.ingresos \+=/)
})
