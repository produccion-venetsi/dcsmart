import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MODOS, esRutaAdmin, esRutaOperar, modoDeRuta, modoACorregir,
  destinoDeModo, modoInicial,
} from './modoTrabajo.js'

// ── a qué modo pertenece cada ruta ──────────────────────────────────────────

test('las pantallas que cambian cosas de todos los grupos son de ADMIN', () => {
  for (const r of ['/admin/users', '/admin/rubcat', '/admin/roles', '/admin/apps',
    '/admin/locales', '/admin/metodos-pago', '/admin/detalle-tipos',
    '/auditorias', '/actividad', '/caja-mayor']) {
    assert.equal(modoDeRuta(r), MODOS.ADMIN, `${r} debería ser de admin`)
  }
})

test('las pantallas de trabajo del dia a dia son de OPERAR', () => {
  for (const r of ['/dashboard', '/cajas', '/pagos', '/pdp', '/proveedores',
    '/reportes', '/arqueo', '/cargar']) {
    assert.equal(modoDeRuta(r), MODOS.OPERAR, `${r} debería ser de operar`)
  }
})

test('las rutas con id o query siguen perteneciendo a su modo', () => {
  assert.equal(modoDeRuta('/pagos/abc-123/editar'), MODOS.OPERAR)
  assert.equal(modoDeRuta('/cajas?caja=xyz'), MODOS.OPERAR)
  assert.equal(modoDeRuta('/admin/users'), MODOS.ADMIN)
})

test('lo que se abre desde cualquier lado no pertenece a ningun modo', () => {
  // Avisos llega a cualquiera y se abre desde donde esté; el selector tampoco es
  // de un modo. Forzar un modo acá sacaría al usuario de donde estaba.
  for (const r of ['/avisos', '/select-app', '/start', '/']) {
    assert.equal(modoDeRuta(r), null, `${r} no debería forzar modo`)
  }
})

test('un prefijo parecido no cuenta como la ruta', () => {
  // "/administradores" no es "/admin", y "/pagosviejos" no es "/pagos".
  assert.equal(esRutaAdmin('/administradores'), false)
  assert.equal(esRutaOperar('/pagosviejos'), false)
})

// ── corregir el modo por la ruta ────────────────────────────────────────────

test('entrar a una ruta de admin estando en operar corrige el modo', () => {
  // Pasa con un link guardado o con el botón atrás: mejor cambiar el modo que
  // mostrar una pantalla que el menú dice que no existe.
  assert.equal(modoACorregir('/admin/users', MODOS.OPERAR), MODOS.ADMIN)
})

test('entrar a una ruta operativa estando en admin corrige el modo', () => {
  assert.equal(modoACorregir('/pagos', MODOS.ADMIN), MODOS.OPERAR)
})

test('si la ruta ya es del modo actual no se corrige nada', () => {
  assert.equal(modoACorregir('/admin/users', MODOS.ADMIN), null)
  assert.equal(modoACorregir('/pagos', MODOS.OPERAR), null)
})

test('una ruta neutra nunca cambia el modo', () => {
  assert.equal(modoACorregir('/avisos', MODOS.ADMIN), null)
  assert.equal(modoACorregir('/avisos', MODOS.OPERAR), null)
})

// ── a dónde lleva cada modo ─────────────────────────────────────────────────

test('ADMIN aterriza en Usuarios, y en Apps para dcsmart que no tiene Usuarios', () => {
  assert.equal(destinoDeModo(MODOS.ADMIN, { esSuperAdmin: true, hayGrupo: true }), '/admin/users')
  assert.equal(destinoDeModo(MODOS.ADMIN, { esSuperAdmin: false, hayGrupo: true }), '/admin/apps')
})

test('OPERAR va al dashboard con grupo elegido y al selector sin grupo', () => {
  // Sin grupo las pantallas operativas no tienen de dónde leer.
  assert.equal(destinoDeModo(MODOS.OPERAR, { esSuperAdmin: true, hayGrupo: true }), '/dashboard')
  assert.equal(destinoDeModo(MODOS.OPERAR, { esSuperAdmin: true, hayGrupo: false }), '/select-app')
})

// ── modo inicial ────────────────────────────────────────────────────────────

test('se respeta el modo guardado', () => {
  assert.equal(modoInicial(MODOS.ADMIN, { hayGrupo: true }), MODOS.ADMIN)
  assert.equal(modoInicial(MODOS.OPERAR, { hayGrupo: false }), MODOS.OPERAR)
})

test('sin modo guardado, quien tenia un grupo elegido sigue operando', () => {
  assert.equal(modoInicial(null, { hayGrupo: true }), MODOS.OPERAR)
  assert.equal(modoInicial(undefined, { hayGrupo: false }), MODOS.ADMIN)
  assert.equal(modoInicial('cualquier-cosa', { hayGrupo: true }), MODOS.OPERAR)
})
