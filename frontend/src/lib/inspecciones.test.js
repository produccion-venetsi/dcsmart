import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ESTADOS, ORDEN_TABLERO, ESTADO_INFO, ESTADOS_ABIERTOS,
  etiquetaEstado, badgeEstado, ayudaEstado, esEstadoAbierto,
  moverEnLista, moverUno, reordenarFolios, subirBajarFolio,
  resumenCarpeta, textoEvento,
  fmtFecha, fmtPeriodo, fmtActualizacion,
} from './inspecciones.js'

const folios = [
  { id: 'a', concepto: 'Habilitación', folio: 1 },
  { id: 'b', concepto: 'Matafuegos', folio: 2 },
  { id: 'c', concepto: 'Libro', folio: 3 },
]

test('los seis estados, cada uno con etiqueta, badge, color y ayuda', () => {
  assert.equal(ESTADOS.length, 6)
  for (const e of ESTADOS) {
    const i = ESTADO_INFO[e]
    assert.ok(i?.label && i?.badge && i?.color && i?.ayuda, `${e} incompleto`)
  }
})

test('el tablero ordena primero lo que pide accion', () => {
  assert.deepEqual([...ORDEN_TABLERO].sort(), [...ESTADOS].sort(), 'el tablero tiene que traer los 6')
  assert.equal(ORDEN_TABLERO[0], 'VENCIDO')
  assert.equal(ORDEN_TABLERO[ORDEN_TABLERO.length - 1], 'OK', 'lo que esta bien va al final')
})

test('un estado desconocido no rompe la pantalla', () => {
  assert.equal(etiquetaEstado('LISTO'), 'LISTO')
  assert.equal(etiquetaEstado(null), '—')
  assert.equal(badgeEstado('LISTO'), 'badge-muted')
  assert.equal(ayudaEstado(null), '')
})

test('abiertos: los que piden accion', () => {
  assert.equal(esEstadoAbierto('VENCIDO'), true)
  assert.equal(esEstadoAbierto('OK'), false)
  assert.equal(esEstadoAbierto('EN_ESPERA'), false)
})

// ── orden ───────────────────────────────────────────────────────────────────

test('mover del medio al principio', () => {
  assert.deepEqual(moverEnLista(['a', 'b', 'c'], 1, 0), ['b', 'a', 'c'])
})

test('mover nunca pierde ni duplica', () => {
  const base = ['a', 'b', 'c', 'd']
  for (let d = 0; d < 4; d++) for (let h = -2; h < 6; h++) {
    const r = moverEnLista(base, d, h)
    assert.deepEqual([...r].sort(), [...base].sort(), `${d}->${h}`)
  }
})

test('reordenar folios reescribe el numero, no solo el orden', () => {
  // Sin esto la fila se mueve pero sigue mostrando el numero viejo hasta que recarga.
  const r = reordenarFolios(folios, 2, 0)
  assert.deepEqual(r.map((f) => f.concepto), ['Libro', 'Habilitación', 'Matafuegos'])
  assert.deepEqual(r.map((f) => f.folio), [1, 2, 3])
})

test('subir y bajar de a uno tambien renumera', () => {
  const r = subirBajarFolio(folios, 'c', 'arriba')
  assert.deepEqual(r.map((f) => f.concepto), ['Habilitación', 'Libro', 'Matafuegos'])
  assert.deepEqual(r.map((f) => f.folio), [1, 2, 3])
})

test('subir el primero no hace nada', () => {
  assert.deepEqual(subirBajarFolio(folios, 'a', 'arriba').map((f) => f.id), ['a', 'b', 'c'])
})

test('reordenar con lista vacia no rompe', () => {
  assert.deepEqual(reordenarFolios([], 0, 1), [])
  assert.deepEqual(subirBajarFolio(null, 'x', 'abajo'), [])
})

// ── textos ──────────────────────────────────────────────────────────────────

test('el resumen dice si hay algo para hacer', () => {
  assert.match(resumenCarpeta({ total: 0 }), /vacía/)
  assert.match(resumenCarpeta({ total: 12, abiertos: 0 }), /todo al día/)
  assert.match(resumenCarpeta({ total: 12, abiertos: 3 }), /3 piden atención/)
  assert.match(resumenCarpeta({ total: 1, abiertos: 1 }), /1 folio, 1 pide atención/)
})

test('el resumen sin datos no queda vacio', () => {
  assert.ok(resumenCarpeta().length > 0)
})

test('el evento del historial dice quien y que', () => {
  assert.equal(
    textoEvento({ accion: 'editado', motivo: 'estado Falta -> OK', user: { nombre: 'Jimena' } }),
    'Jimena editó: estado Falta -> OK'
  )
  assert.equal(textoEvento({ accion: 'creado', user: { nombre: 'Ana' } }), 'Ana creó el folio')
})

test('un evento sin usuario no dice "undefined"', () => {
  const t = textoEvento({ accion: 'editado' })
  assert.ok(!/undefined/.test(t), t)
  assert.match(t, /alguien/)
})

// ── CONTRATO con el backend ─────────────────────────────────────────────────

const backend = () => readFileSync(new URL('../../../backend/src/lib/inspecciones.js', import.meta.url), 'utf8')

test('CONTRATO: los estados son los mismos que en el backend', () => {
  const m = backend().match(/export const ESTADOS = \[([^\]]+)\]/)
  assert.ok(m, 'no se encontro ESTADOS en el backend')
  const del = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
  assert.deepEqual(ESTADOS, del)
})

test('CONTRATO: los abiertos son los mismos', () => {
  // Si difieren, el contador de la cabecera y el del backend dicen numeros distintos.
  const m = backend().match(/export const ESTADOS_ABIERTOS = \[([^\]]+)\]/)
  const del = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
  assert.deepEqual(ESTADOS_ABIERTOS, del)
})

test('CONTRATO: el backend NO deduce el estado de la fecha', () => {
  // La decision del usuario fue que el estado es manual. Si alguien agrega ahi un
  // calculo por vencimiento, la pantalla mostraria un estado que el usuario no eligio.
  const src = backend()
  assert.ok(!/estadoVencimiento|diasParaVencer/.test(src),
    'el lib del backend empezo a deducir el estado de la fecha')
})

// ── fechas y periodo ────────────────────────────────────────────────────────

test('la fecha se muestra DD/MM/AAAA sin construir un Date', () => {
  // `new Date('2026-09-15')` se interpreta en UTC y al imprimirlo en GMT-3 da el 14.
  assert.equal(fmtFecha('2026-09-15'), '15/09/2026')
  assert.equal(fmtFecha('2026-01-01'), '01/01/2026')
  assert.equal(fmtFecha('2026-09-15T00:00:00.000Z'), '15/09/2026')
})

test('el periodo se muestra MM/AAAA', () => {
  assert.equal(fmtPeriodo('2026-09'), '09/2026')
  assert.equal(fmtPeriodo('2026-09-01'), '09/2026')
})

test('sin fecha o con basura muestra un guion, no "Invalid Date"', () => {
  for (const v of [null, '', undefined, 'ayer', '15/09/2026']) {
    assert.equal(fmtFecha(v), '—', `fmtFecha(${v})`)
    assert.equal(fmtPeriodo(v), '—', `fmtPeriodo(${v})`)
  }
})

test('la ultima actualizacion dice cuando y quien', () => {
  const t = fmtActualizacion({ updated_at: '2026-08-13T15:30:00.000Z', updated_by: { nombre: 'Jimena' } })
  assert.match(t, /Jimena/)
  assert.match(t, /\d{2}\/\d{2}\/\d{2}/)
})

test('si no se sabe quien edito, cae en quien lo creo', () => {
  const t = fmtActualizacion({ updated_at: '2026-08-13T15:30:00.000Z', created_by: { nombre: 'Ana' } })
  assert.match(t, /Ana/)
})

test('sin updated_at no muestra "Invalid Date"', () => {
  assert.equal(fmtActualizacion({}), '—')
  assert.equal(fmtActualizacion(null), '—')
})
