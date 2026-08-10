import test from 'node:test'
import assert from 'node:assert/strict'
import { rutaDe, buscarLocal, resolverApertura, mensajeDeCambio } from './destinoAviso.js'

const PERROS = {
  id: 'app-perros', nombre: 'GRUPO PERROS',
  locales: [{ id: 'dogg', nombre: 'DOGG' }, { id: 'evelia', nombre: 'EVELIA' }],
}
const TITA = { id: 'app-tita', nombre: 'GRUPO TITA', locales: [{ id: 'tita', nombre: 'TITA' }] }
const MIS_APPS = [PERROS, TITA]

const aviso = (over = {}) => ({
  id: 'n1', tabla: 'pagos', id_registro: 'p1', id_local: 'dogg', leida: false,
  local: { id: 'dogg', nombre: 'DOGG' }, grupo: { id: 'app-perros', nombre: 'GRUPO PERROS' },
  ...over,
})

// ── ruta ────────────────────────────────────────────────────────────────────

test('un pago va a su formulario y una caja al listado con el drawer', () => {
  assert.equal(rutaDe(aviso()), '/pagos/p1/editar')
  assert.equal(rutaDe(aviso({ tabla: 'cajas', id_registro: 'c9' })), '/cajas?caja=c9')
})

test('sin registro o de una tabla desconocida no hay ruta', () => {
  assert.equal(rutaDe(aviso({ id_registro: null })), null)
  assert.equal(rutaDe(aviso({ tabla: 'arqueos' })), null)
  assert.equal(rutaDe(null), null)
})

// ── buscar el local ─────────────────────────────────────────────────────────

test('encuentra el local y su grupo entre los que maneja el usuario', () => {
  const r = buscarLocal(MIS_APPS, 'evelia')
  assert.equal(r.app.nombre, 'GRUPO PERROS')
  assert.equal(r.local.nombre, 'EVELIA')
})

test('devuelve null si el local no es de ninguna de sus apps', () => {
  assert.equal(buscarLocal(MIS_APPS, 'ajeno'), null)
  assert.equal(buscarLocal([], 'dogg'), null)
  assert.equal(buscarLocal(null, 'dogg'), null)
  assert.equal(buscarLocal(MIS_APPS, null), null)
})

// ── qué hacer al abrir ──────────────────────────────────────────────────────

test('si ya estas en el local del aviso, solo navega', () => {
  const r = resolverApertura(aviso(), {
    misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' },
  })
  assert.deepEqual(r, { accion: 'navegar', ruta: '/pagos/p1/editar' })
})

test('otro local del MISMO grupo: cambia el local, no el grupo', () => {
  const r = resolverApertura(aviso({ id_local: 'evelia' }), {
    misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' },
  })
  assert.equal(r.accion, 'cambiar-contexto')
  assert.equal(r.local.nombre, 'EVELIA')
  assert.equal(r.cambiaGrupo, false)
  assert.equal(r.ruta, '/pagos/p1/editar')
})

test('local de OTRO grupo: cambia grupo y local', () => {
  const r = resolverApertura(aviso({ id_local: 'tita' }), {
    misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' },
  })
  assert.equal(r.accion, 'cambiar-contexto')
  assert.equal(r.app.nombre, 'GRUPO TITA')
  assert.equal(r.cambiaGrupo, true)
})

test('un local que el usuario ya no maneja: no navega y nombra el local', () => {
  // Le llego el aviso y despues perdio el acceso. Nombrarlo es lo que le permite
  // pedirlo; "Sin acceso" a secas no dice a que.
  const r = resolverApertura(
    aviso({ id_local: 'ajeno', local: { nombre: 'GALLOSI' }, grupo: { nombre: 'GRUPO SCOTH&SODA' } }),
    { misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' } }
  )
  assert.equal(r.accion, 'sin-acceso')
  assert.match(r.mensaje, /GRUPO SCOTH&SODA/)
  assert.match(r.mensaje, /GALLOSI/)
})

test('sin acceso y sin el nombre del local, el mensaje sigue siendo entendible', () => {
  const r = resolverApertura(aviso({ id_local: 'ajeno', local: null, grupo: null }), {
    misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' },
  })
  assert.equal(r.accion, 'sin-acceso')
  assert.match(r.mensaje, /no ten[eé]s acceso/i)
})

test('un aviso que no lleva a ningun lado solo se marca leido', () => {
  const r = resolverApertura(aviso({ id_registro: null }), {
    misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' },
  })
  assert.deepEqual(r, { accion: 'solo-marcar' })
})

test('un aviso sin local navega y deja que el backend decida', () => {
  const r = resolverApertura(aviso({ id_local: null }), {
    misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' },
  })
  assert.equal(r.accion, 'navegar')
})

test('sin local activo tambien resuelve: es el primer aviso de la sesion', () => {
  const r = resolverApertura(aviso(), { misApps: MIS_APPS, appActiva: null, localActivo: null })
  assert.equal(r.accion, 'cambiar-contexto')
  assert.equal(r.cambiaGrupo, true)
})

// ── el mensaje ──────────────────────────────────────────────────────────────

test('el mensaje distingue cambiar de grupo de cambiar de local', () => {
  assert.match(
    mensajeDeCambio({ app: TITA, local: { nombre: 'TITA' }, cambiaGrupo: true }),
    /GRUPO TITA \/ TITA/
  )
  const soloLocal = mensajeDeCambio({ app: PERROS, local: { nombre: 'EVELIA' }, cambiaGrupo: false })
  assert.match(soloLocal, /EVELIA/)
  assert.equal(soloLocal.includes('GRUPO PERROS'), false, 'no nombra el grupo si no cambió')
})
