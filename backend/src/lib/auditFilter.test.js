import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtroPorAuditoria } from './auditFilter.js'

test('sin filtro elegido no agrega ninguna condicion', () => {
  assert.deepEqual(filtroPorAuditoria(undefined, ['a', 'b']), {})
})

test('auditado = solo los ids auditados', () => {
  assert.deepEqual(filtroPorAuditoria('true', ['a', 'b']), { id: { in: ['a', 'b'] } })
})

test('no auditado = todos menos los auditados', () => {
  assert.deepEqual(filtroPorAuditoria('false', ['a', 'b']), { id: { notIn: ['a', 'b'] } })
})

test('deduplica los ids repetidos del historial append-only', () => {
  assert.deepEqual(filtroPorAuditoria('true', ['a', 'a', 'b', 'a']), { id: { in: ['a', 'b'] } })
})

test('auditado sin ningun id auditado no devuelve nada (no "devuelve todo")', () => {
  assert.deepEqual(filtroPorAuditoria('true', []), { id: { in: [] } })
})

test('no auditado sin ningun id auditado no filtra: son todos', () => {
  // Se devuelve {} y no `notIn: []` para no depender de como Prisma trata una
  // lista vacia en un NOT IN.
  assert.deepEqual(filtroPorAuditoria('false', []), {})
})

// ── Lo que el filtro tiene que garantizar sobre los resultados ───────────────
//
// Simula lo que termina devolviendo la base: aplica el filtro sobre las filas
// del scope, igual que Prisma al combinarlo con id_local.
function aplicar(filtro, delScope) {
  if (!filtro.id) return delScope
  if (filtro.id.in)    return delScope.filter(p => filtro.id.in.includes(p))
  if (filtro.id.notIn) return delScope.filter(p => !filtro.id.notIn.includes(p))
  return delScope
}

const DEL_SCOPE = ['p1', 'p2', 'p3']

test('audit=true devuelve solo los auditados del scope', () => {
  assert.deepEqual(aplicar(filtroPorAuditoria('true', ['p1']), DEL_SCOPE), ['p1'])
})

test('audit=false devuelve los del scope que no estan auditados', () => {
  assert.deepEqual(aplicar(filtroPorAuditoria('false', ['p1']), DEL_SCOPE), ['p2', 'p3'])
})

test('auditados + no auditados = todo el scope, sin solapamiento', () => {
  const auditados = ['p1', 'p3']
  const si = aplicar(filtroPorAuditoria('true',  auditados), DEL_SCOPE)
  const no = aplicar(filtroPorAuditoria('false', auditados), DEL_SCOPE)
  assert.equal(si.length + no.length, DEL_SCOPE.length)
  assert.deepEqual(si.filter(x => no.includes(x)), [])
  assert.deepEqual([...si, ...no].sort(), [...DEL_SCOPE].sort())
})

// ── Por que la lista NO se puede dejar sin recortar ──────────────────────────
//
// Postgres tiene un techo de bind variables por consulta, y Prisma expande
// `notIn` a un parametro por id. Con los 49.486 auditados de toda la base la
// consulta muere (P2035 / P2029); recortada a un local, entra. Este test fija el
// invariante que hay que respetar: el filtro no puede generar mas parametros que
// el techo del motor.
const TECHO_BIND_VARIABLES = 32767

test('un scope de un local genera una lista que entra en el techo del motor', () => {
  const deUnLocal = Array.from({ length: 16649 }, (_, i) => `p${i}`)
  const filtro = filtroPorAuditoria('false', deUnLocal)
  assert.ok(filtro.id.notIn.length < TECHO_BIND_VARIABLES,
    `${filtro.id.notIn.length} parametros no entran en ${TECHO_BIND_VARIABLES}`)
})

test('sin recortar por local la lista se pasa del techo (por eso el recorte se mantiene)', () => {
  const todaLaBase = Array.from({ length: 49486 }, (_, i) => `p${i}`)
  const filtro = filtroPorAuditoria('false', todaLaBase)
  assert.ok(filtro.id.notIn.length > TECHO_BIND_VARIABLES,
    'si esto deja de ser cierto, revisar si el recorte por local sigue siendo necesario')
})
