import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { rutaDe, buscarLocal, resolverApertura, mensajeDeCambio, idDeGrupo } from './destinoAviso.js'

const raiz = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const leer = (rel) => readFileSync(raiz(rel), 'utf8').replace(/\r\n/g, '\n')

// La forma REAL de GET /auth/my-apps: la app va ANIDADA dentro del item, y el store
// guarda el item completo en `activeApp`. Los fixtures de antes usaban
// { id, nombre, locales } -- una forma inventada -- y por eso los tests pasaban
// mientras la pantalla fallaba con 403.
const PERROS = {
  app: { id: 'app-perros', nombre: 'GRUPO PERROS', slug: 'perros' },
  role: 'admin',
  locales: [{ id: 'dogg', nombre: 'DOGG' }, { id: 'evelia', nombre: 'EVELIA' }],
}
const TITA = {
  app: { id: 'app-tita', nombre: 'GRUPO TITA', slug: 'tita' },
  role: 'admin',
  locales: [{ id: 'tita', nombre: 'TITA' }],
}
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
  // Un documento que vence abre su panel en el listado: no hay ruta por documento.
  assert.equal(rutaDe(aviso({ tabla: 'documentos', id_registro: 'd7' })), '/documentos?doc=d7')
})

test('sin registro o de una tabla desconocida no hay ruta', () => {
  assert.equal(rutaDe(aviso({ id_registro: null })), null)
  assert.equal(rutaDe(aviso({ tabla: 'arqueos' })), null)
  assert.equal(rutaDe(null), null)
})

// ── buscar el local ─────────────────────────────────────────────────────────

test('encuentra el local y su grupo entre los que maneja el usuario', () => {
  const r = buscarLocal(MIS_APPS, 'evelia')
  // `r.app` es el ITEM de my-apps, asi que el nombre del grupo esta en r.app.app.
  assert.equal(r.app.app.nombre, 'GRUPO PERROS')
  assert.equal(idDeGrupo(r.app), 'app-perros')
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
  assert.equal(idDeGrupo(r.app), 'app-tita')
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


// ─── Contrato con la API y con el store ─────────────────────────────────────
// Estos tests existen por el bug que arreglaron: este archivo leia `item.id` de
// my-apps, que es undefined porque la app va anidada. `cambiaGrupo` daba false
// siempre, el grupo no se cambiaba nunca y el backend cortaba con 403.

test('el backend devuelve la app ANIDADA en cada item de my-apps', () => {
  const src = leer('../../../backend/src/routes/auth.js')
  const bloque = src.slice(src.indexOf("fastify.get('/my-apps'"))
  // Las dos ramas (super_admin/dcsmart y usuarios normales) armar el item igual.
  const items = [...bloque.matchAll(/app:\s*\{\s*id:/g)]
  assert.ok(items.length >= 2, `se esperaban las dos ramas armando { app: { id... } }, hay ${items.length}`)
})

test('el interceptor manda X-App-Id desde activeApp.app.id, no activeApp.id', () => {
  // Si esto cambiara, `idDeGrupo` tiene que cambiar con el.
  const src = leer('../api/client.js')
  assert.match(src, /activeApp\?\.app\?\.id/)
})

test('idDeGrupo lee el id real, y tolera que venga plano', () => {
  assert.equal(idDeGrupo(PERROS), 'app-perros')
  assert.equal(idDeGrupo({ id: 'suelto' }), 'suelto')
  assert.equal(idDeGrupo(null), null)
  assert.equal(idDeGrupo({}), null)
})

test('un aviso de OTRO grupo cambia el grupo, no solo el local', () => {
  // El bug: cambiaGrupo daba false, se llamaba solo setActiveLocal y el header
  // X-App-Id seguia siendo el del grupo viejo -> 403.
  const plan = resolverApertura(
    { tabla: 'pagos', id_registro: 'p9', id_local: 'tita', local: { nombre: 'TITA' }, grupo: { nombre: 'GRUPO TITA' } },
    { misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' } }
  )
  assert.equal(plan.accion, 'cambiar-contexto')
  assert.equal(plan.cambiaGrupo, true)
  assert.equal(idDeGrupo(plan.app), 'app-tita')
  assert.equal(plan.local.id, 'tita')
})

test('un aviso de otro local del MISMO grupo no cambia el grupo', () => {
  const plan = resolverApertura(
    { tabla: 'pagos', id_registro: 'p9', id_local: 'evelia' },
    { misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' } }
  )
  assert.equal(plan.accion, 'cambiar-contexto')
  assert.equal(plan.cambiaGrupo, false)
  assert.equal(plan.local.id, 'evelia')
})

test('el plan devuelve el ITEM de my-apps, que es lo que espera setActiveApp', () => {
  // setActiveApp guarda el item tal cual (ver AppSelector: setActiveApp(item)), asi
  // que pasarle la app suelta dejaria el store sin `.app` y sin `.locales`.
  const plan = resolverApertura(
    { tabla: 'pagos', id_registro: 'p9', id_local: 'tita' },
    { misApps: MIS_APPS, appActiva: PERROS, localActivo: { id: 'dogg' } }
  )
  assert.ok(plan.app.app, 'el plan tiene que traer el item con .app adentro')
  assert.ok(Array.isArray(plan.app.locales), 'y con .locales')
})

test('el mensaje nombra el grupo de verdad, no "undefined"', () => {
  const msg = mensajeDeCambio({ app: TITA, local: { nombre: 'TITA' }, cambiaGrupo: true })
  assert.match(msg, /GRUPO TITA/)
  assert.doesNotMatch(msg, /undefined/)
})

test('sin nombre de grupo el mensaje sigue siendo legible', () => {
  const msg = mensajeDeCambio({ app: {}, local: { nombre: 'X' }, cambiaGrupo: true })
  assert.doesNotMatch(msg, /undefined/)
})
