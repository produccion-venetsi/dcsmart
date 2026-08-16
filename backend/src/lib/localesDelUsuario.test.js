import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sinRecorte, appsQueVenTodosLosLocales, resolverLocalesPermitidos,
  ROLES_TODOS_LOS_LOCALES, ROLES_SIN_RECORTE,
} from './localesDelUsuario.js'

// La semántica de estas funciones calca la de GET /api/auth/my-apps
// (routes/auth.js): cualquier cambio acá tiene que mirar ese precedente.

// ── sinRecorte ──────────────────────────────────────────────────────────────

test('sinRecorte: super_admin y dcsmart ven todo', () => {
  assert.equal(sinRecorte(['super_admin']), true)
  assert.equal(sinRecorte(['dcsmart']), true)
  assert.equal(sinRecorte(['cajero', 'dcsmart']), true)
})

test('sinRecorte: los demás roles no', () => {
  assert.equal(sinRecorte(['admin', 'externo', 'cajero', 'reportes']), false)
  assert.equal(sinRecorte([]), false)
})

test('las constantes coinciden con el criterio de my-apps', () => {
  assert.deepEqual(ROLES_TODOS_LOS_LOCALES, ['admin', 'externo'])
  assert.deepEqual(ROLES_SIN_RECORTE, ['super_admin', 'dcsmart'])
})

// ── appsQueVenTodosLosLocales ───────────────────────────────────────────────

test('admin/externo sin filas explícitas necesitan todos los locales de su app', () => {
  const roles = [
    { id_app: 'a1', rol: 'admin' },
    { id_app: 'a2', rol: 'externo' },
    { id_app: 'a3', rol: 'cajero' },
  ]
  assert.deepEqual(appsQueVenTodosLosLocales(roles, []), ['a1', 'a2'])
})

test('con filas explícitas en esa app, NO se piden todos', () => {
  const roles = [{ id_app: 'a1', rol: 'admin' }]
  const accesos = [{ id_app: 'a1', id_local: 'l1' }]
  assert.deepEqual(appsQueVenTodosLosLocales(roles, accesos), [])
})

test('un rol con id_app null no pide nada (no hay app que expandir)', () => {
  const roles = [{ id_app: null, rol: 'admin' }]
  assert.deepEqual(appsQueVenTodosLosLocales(roles, []), [])
})

// ── resolverLocalesPermitidos ───────────────────────────────────────────────

test('super_admin: null = sin recorte', () => {
  const roles = [{ id_app: 'a1', rol: 'super_admin' }]
  assert.equal(resolverLocalesPermitidos(roles, []), null)
})

test('dcsmart: null = sin recorte, aunque tenga otros roles', () => {
  const roles = [
    { id_app: 'a1', rol: 'cajero' },
    { id_app: 'a2', rol: 'dcsmart' },
  ]
  assert.equal(resolverLocalesPermitidos(roles, [{ id_app: 'a1', id_local: 'l1' }]), null)
})

test('cajero con filas explícitas: solo esos locales', () => {
  const roles = [{ id_app: 'a1', rol: 'cajero' }]
  const accesos = [
    { id_app: 'a1', id_local: 'l1' },
    { id_app: 'a1', id_local: 'l2' },
  ]
  assert.deepEqual(resolverLocalesPermitidos(roles, accesos).sort(), ['l1', 'l2'])
})

test('cajero sin filas: no accede a ningún local (lista vacía, no null)', () => {
  const roles = [{ id_app: 'a1', rol: 'cajero' }]
  assert.deepEqual(resolverLocalesPermitidos(roles, []), [])
})

test('admin sin filas: todos los locales activos de SU app', () => {
  const roles = [{ id_app: 'a1', rol: 'admin' }]
  const localesPorApp = { a1: ['l1', 'l2'], a2: ['l9'] }
  assert.deepEqual(resolverLocalesPermitidos(roles, [], localesPorApp).sort(), ['l1', 'l2'])
})

test('admin CON filas explícitas: las filas mandan, no se expande a toda la app', () => {
  const roles = [{ id_app: 'a1', rol: 'admin' }]
  const accesos = [{ id_app: 'a1', id_local: 'l1' }]
  // Aunque localesPorApp traiga más, con filas explícitas se respetan esas.
  const localesPorApp = { a1: ['l1', 'l2', 'l3'] }
  assert.deepEqual(resolverLocalesPermitidos(roles, accesos, localesPorApp), ['l1'])
})

test('varias apps: la unión de todas, deduplicada', () => {
  const roles = [
    { id_app: 'a1', rol: 'cajero' },
    { id_app: 'a2', rol: 'admin' },
  ]
  const accesos = [
    { id_app: 'a1', id_local: 'l1' },
    // l1 repetido desde otra app: no se duplica.
    { id_app: 'a2', id_local: 'l1' },
    { id_app: 'a2', id_local: 'l3' },
  ]
  assert.deepEqual(resolverLocalesPermitidos(roles, accesos).sort(), ['l1', 'l3'])
})

test('accesos de una app en la que NO hay rol se ignoran (igual que my-apps)', () => {
  const roles = [{ id_app: 'a1', rol: 'cajero' }]
  const accesos = [
    { id_app: 'a1', id_local: 'l1' },
    { id_app: 'a9', id_local: 'l9' }, // sin user_app_role en a9
  ]
  assert.deepEqual(resolverLocalesPermitidos(roles, accesos), ['l1'])
})
