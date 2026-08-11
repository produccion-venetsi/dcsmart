import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MODOS_ALTA, TIPO_CM, tieneOp, etiquetaOp, rutaDeLaOp, resolverAlta, RUTA_ALTA_OPERACION,
} from './altaCajaMayor.js'

const raiz = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const leer = (rel) => readFileSync(raiz(rel), 'utf8').replace(/\r\n/g, '\n')

const deGestion = (over = {}) => ({ id: 'm1', origen: 'PAGO', id_pago: 'p1', nro_ord: 1234, ...over })
const manual = (over = {}) => ({ id: 'm2', origen: 'PROPIO', id_pago: null, ...over })

// ── ¿tiene op? ──────────────────────────────────────────────────────────────

test('el movimiento que salio de una op la tiene', () => {
  assert.equal(tieneOp(deGestion()), true)
})

test('el cargado a mano no tiene op que mostrar', () => {
  assert.equal(tieneOp(manual()), false)
  assert.equal(tieneOp(manual({ origen: 'APERTURA' })), false)
})

test('sin movimiento no explota', () => {
  assert.equal(tieneOp(null), false)
  assert.equal(tieneOp({}), false)
})

// ── etiqueta ────────────────────────────────────────────────────────────────

test('muestra el numero de op', () => {
  assert.equal(etiquetaOp(deGestion()), 'OP-1234')
})

test('con op pero sin numero dice "ver op", no "OP-null"', () => {
  // Puede pasar si la op se creo y el nro_ord todavia no se asigno.
  assert.equal(etiquetaOp(deGestion({ nro_ord: null })), 'ver op')
  assert.equal(etiquetaOp(deGestion({ nro_ord: undefined })), 'ver op')
})

test('la op numero 0 se muestra igual', () => {
  // 0 es falsy: con una comprobacion `if (nro_ord)` se perderia.
  assert.equal(etiquetaOp(deGestion({ nro_ord: 0 })), 'OP-0')
})

test('sin op no hay etiqueta', () => {
  assert.equal(etiquetaOp(manual()), null)
})

// ── ruta de la op ───────────────────────────────────────────────────────────

test('lleva al formulario de la op, el mismo destino que el listado de Pagos', () => {
  assert.equal(rutaDeLaOp(deGestion()), '/pagos/p1/editar')
})

test('sin op no hay ruta', () => {
  assert.equal(rutaDeLaOp(manual()), null)
  assert.equal(rutaDeLaOp(null), null)
})

// ── modos de alta ───────────────────────────────────────────────────────────

test('la carga rapida abre el formulario de siempre', () => {
  assert.deepEqual(resolverAlta(MODOS_ALTA.RAPIDA), { accion: 'drawer' })
  // Y no necesita local: el formulario rapido lo pide adentro.
  assert.deepEqual(resolverAlta(MODOS_ALTA.RAPIDA, { idLocal: null }), { accion: 'drawer' })
})

test('la operacion necesita el local elegido', () => {
  const r = resolverAlta(MODOS_ALTA.OPERACION, { idLocal: null })
  assert.equal(r.accion, 'falta-local')
  assert.match(r.mensaje, /local/i)
})

test('con el local elegido, la operacion va al formulario de pagos', () => {
  const r = resolverAlta(MODOS_ALTA.OPERACION, { idLocal: 'BUFGOGEG' })
  assert.equal(r.accion, 'ir-a-pagos')
  assert.equal(r.id_local, 'BUFGOGEG')
  assert.match(r.ruta, /\/pagos\/nuevo/)
})

test('la URL del alta lleva el tipo CM y el volver', () => {
  assert.match(RUTA_ALTA_OPERACION, /tipo=CM/)
  assert.match(RUTA_ALTA_OPERACION, /volver=caja-mayor/)
})

test('la URL NO lleva modo=rapido', () => {
  // Ese modo marca el pago como pagado, genera el numero desde la fecha y fuerza
  // estado CAJA. Una factura trae su propio numero y su propio estado.
  assert.doesNotMatch(RUTA_ALTA_OPERACION, /modo=rapido/)
})

// ── Contrato con el resto del sistema ───────────────────────────────────────

test('el tipo que se precarga es el que el backend manda a caja mayor', () => {
  // Si `vaACajaMayor` mirara otro tipo, la op se crearia y no apareceria en CM.
  const src = leer('../../../backend/src/lib/cajaMayor.js')
  const fn = src.slice(src.indexOf('export function vaACajaMayor'))
  assert.match(fn.slice(0, 400), new RegExp(`'${TIPO_CM}'`))
})

test('el formulario de pagos aplica el ?tipo= sin depender del modo rapido', () => {
  // Es el cambio que habilita este alta: si `tipoParam` volviera a usarse solo dentro
  // de `modoRapido`, la op se crearia sin tipo y no entraria a caja mayor.
  const src = leer('../pages/pagos/PagoForm.jsx')
  assert.match(src, /tipoParam \|\| ''/, 'el tipo ya no se precarga fuera del modo rapido')
})

test('el formulario de pagos sabe volver a caja mayor', () => {
  const src = leer('../pages/pagos/PagoForm.jsx')
  assert.match(src, /volver/, 'PagoForm no lee el parametro volver')
  assert.match(src, /caja-mayor/, 'PagoForm no conoce el destino caja-mayor')
})

test('el movimiento trae id_pago desde el backend', () => {
  // Todo el link depende de este campo.
  const src = leer('../../../backend/src/lib/cajaMayor.js')
  assert.match(src, /id_pago: fila\.id_pago/)
})
