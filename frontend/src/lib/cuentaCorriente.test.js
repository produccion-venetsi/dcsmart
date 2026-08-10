import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CUADRANTES, ORDEN_CUADRANTES, CUADRANTE_INFO, cuadranteDe, sumaALaDeuda,
  filtrarPorCuadrante, FILTRO_TODOS, FILTRO_ABIERTOS, etiquetaCuadrante, badgeCuadrante,
} from './cuentaCorriente.js'

const raiz = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const leer = (rel) => readFileSync(raiz(rel), 'utf8').replace(/\r\n/g, '\n')

const mov = (ingresa_egreso, pagado) => ({ ingresa_egreso, pagado })

// ─── Contrato con el backend ────────────────────────────────────────────────
// Las claves de los cuadrantes viajan en la respuesta (`cuenta.a_cobrar`,
// `p.cuadrante`). Si el backend renombra uno, la pantalla mostraría "—" y $0 sin
// error visible: el tag simplemente diría cero y nadie se enteraría.

test('los cuadrantes son exactamente los del backend', () => {
  const src = leer('../../../backend/src/lib/cuentaCorriente.js')
  const bloque = src.match(/export const CUADRANTES = \{([^}]*)\}/)
  assert.ok(bloque, 'no se encontró CUADRANTES en el lib del backend')
  const delBackend = [...bloque[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

  assert.deepEqual(
    Object.values(CUADRANTES).sort(), delBackend.sort(),
    `el front usa [${Object.values(CUADRANTES)}] y el backend [${delBackend}]`
  )
})

test('el backend NO filtra por pagado: los cuatro cuadrantes tienen que llegar', () => {
  // Es la corrección de fondo. Si alguien vuelve a poner `pagado: true` en el
  // filtro, "A cobrar" y "Gastos pendientes" quedan siempre en cero.
  const src = leer('../../../backend/src/lib/cuentaCorriente.js')
  const fn = src.match(/export function whereMovimientosCliente[\s\S]*?\n\}/)[0]
  assert.doesNotMatch(fn, /pagado:/, 'whereMovimientosCliente volvió a filtrar por pagado')
  assert.doesNotMatch(fn, /fecha_pago:/, 'whereMovimientosCliente volvió a filtrar por fecha_pago')
})

test('la clasificación del front da lo mismo que la del backend', () => {
  // Las dos existen: el backend manda `cuadrante` calculado, y el front tiene el
  // fallback para respuestas viejas. Tienen que coincidir.
  // Se mira el orden de los ternarios y no la condicion exacta: al backend le da
  // igual llamarla `pagado` o `estaPagado(pago)`, lo que no puede cambiar es que
  // pagado vaya a INGRESOS/GASTOS y sin pagar a A_COBRAR/GASTOS_PENDIENTES.
  const src = leer('../../../backend/src/lib/cuentaCorriente.js')
  assert.match(src, /\?\s*CUADRANTES\.INGRESOS\s*:\s*CUADRANTES\.A_COBRAR/)
  assert.match(src, /\?\s*CUADRANTES\.GASTOS\s*:\s*CUADRANTES\.GASTOS_PENDIENTES/)
})

// ─── Clasificación ──────────────────────────────────────────────────────────

test('cada combinación cae donde tiene que caer', () => {
  assert.equal(cuadranteDe(mov(true, false)), CUADRANTES.A_COBRAR)
  assert.equal(cuadranteDe(mov(true, true)), CUADRANTES.INGRESOS)
  assert.equal(cuadranteDe(mov(false, false)), CUADRANTES.GASTOS_PENDIENTES)
  assert.equal(cuadranteDe(mov(false, true)), CUADRANTES.GASTOS)
})

test('null y undefined se tratan como egreso sin pagar', () => {
  assert.equal(cuadranteDe(mov(null, null)), CUADRANTES.GASTOS_PENDIENTES)
  assert.equal(cuadranteDe({}), CUADRANTES.GASTOS_PENDIENTES)
})

test('los egresos suman a la deuda y los ingresos la bajan', () => {
  assert.equal(sumaALaDeuda(CUADRANTES.GASTOS), true)
  assert.equal(sumaALaDeuda(CUADRANTES.GASTOS_PENDIENTES), true)
  assert.equal(sumaALaDeuda(CUADRANTES.INGRESOS), false)
  assert.equal(sumaALaDeuda(CUADRANTES.A_COBRAR), false)
})

// ─── Etiquetas y colores ────────────────────────────────────────────────────

test('ningún cuadrante se queda sin etiqueta, ayuda, color ni badge', () => {
  for (const c of Object.values(CUADRANTES)) {
    const info = CUADRANTE_INFO[c]
    assert.ok(info, `${c} sin info`)
    assert.ok(info.label && info.ayuda && info.color && info.badge, `${c} incompleto`)
    assert.equal(typeof info.abierto, 'boolean', `${c} sin marcar abierto/cerrado`)
  }
})

test('el orden de lectura muestra los cuatro, sin repetir', () => {
  assert.equal(ORDEN_CUADRANTES.length, Object.keys(CUADRANTES).length)
  assert.equal(new Set(ORDEN_CUADRANTES).size, ORDEN_CUADRANTES.length)
})

test('lo abierto va primero: es lo que hay que hacer algo con', () => {
  const abiertos = ORDEN_CUADRANTES.filter((c) => CUADRANTE_INFO[c].abierto)
  assert.deepEqual(ORDEN_CUADRANTES.slice(0, abiertos.length), abiertos)
})

test('los dos pendientes son A cobrar y Gastos pendientes', () => {
  const abiertos = Object.values(CUADRANTES).filter((c) => CUADRANTE_INFO[c].abierto)
  assert.deepEqual(abiertos.sort(), [CUADRANTES.A_COBRAR, CUADRANTES.GASTOS_PENDIENTES].sort())
})

test('un cuadrante desconocido no rompe la pantalla', () => {
  assert.equal(etiquetaCuadrante('lo_que_sea'), '—')
  assert.equal(badgeCuadrante(undefined), 'badge-muted')
})

// ─── Filtros ────────────────────────────────────────────────────────────────

const lista = [
  { id: 1, cuadrante: CUADRANTES.A_COBRAR },
  { id: 2, cuadrante: CUADRANTES.GASTOS_PENDIENTES },
  { id: 3, cuadrante: CUADRANTES.INGRESOS },
  { id: 4, cuadrante: CUADRANTES.GASTOS },
]

test('todos no filtra nada', () => {
  assert.equal(filtrarPorCuadrante(lista, FILTRO_TODOS).length, 4)
})

test('abiertos trae solo lo que falta cerrar', () => {
  assert.deepEqual(filtrarPorCuadrante(lista, FILTRO_ABIERTOS).map((p) => p.id), [1, 2])
})

test('un cuadrante puntual trae solo el suyo', () => {
  assert.deepEqual(filtrarPorCuadrante(lista, CUADRANTES.GASTOS).map((p) => p.id), [4])
})

test('si el movimiento no trae cuadrante se deduce, no se descarta', () => {
  const sinCuadrante = [{ id: 9, ingresa_egreso: true, pagado: false }]
  assert.deepEqual(filtrarPorCuadrante(sinCuadrante, CUADRANTES.A_COBRAR).map((p) => p.id), [9])
  assert.deepEqual(filtrarPorCuadrante(sinCuadrante, FILTRO_ABIERTOS).map((p) => p.id), [9])
})

test('una lista vacía o nula no rompe', () => {
  assert.deepEqual(filtrarPorCuadrante([], FILTRO_ABIERTOS), [])
  assert.deepEqual(filtrarPorCuadrante(null, FILTRO_TODOS), [])
})
