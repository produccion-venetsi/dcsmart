import test from 'node:test'
import assert from 'node:assert/strict'
import {
  esSesionExpirada, debeNavegarALogin, limpiarSesionLocal, CLAVES_SESION, debeSincronizarUsuario,
} from './sesionExpirada.js'

// El bug que arregla esto: el interceptor de axios expulsaba y recargaba la
// pagina ante CUALQUIER 401, incluido el del propio login. La recarga borraba
// el estado de React y con el el mensaje "Email o contraseña incorrectos", asi
// que un login fallido se veia como un formulario que se limpia solo.

test('un 401 en el login NO es sesion expirada: hay que mostrar el error', () => {
  assert.equal(esSesionExpirada(401, '/auth/login'), false)
})

test('un 401 en el login con Google tampoco expulsa', () => {
  assert.equal(esSesionExpirada(401, '/auth/google'), false)
})

test('un 401 en una ruta autenticada SI es sesion expirada', () => {
  assert.equal(esSesionExpirada(401, '/pagos'), true)
  assert.equal(esSesionExpirada(401, '/auth/me'), true)
  assert.equal(esSesionExpirada(401, '/reportes/pagos'), true)
})

test('otros codigos nunca expulsan', () => {
  assert.equal(esSesionExpirada(403, '/pagos'), false)
  assert.equal(esSesionExpirada(500, '/auth/login'), false)
  assert.equal(esSesionExpirada(200, '/pagos'), false)
})

test('tolera url ausente o rara sin romper', () => {
  assert.equal(esSesionExpirada(401, undefined), true)
  assert.equal(esSesionExpirada(401, ''), true)
  assert.equal(esSesionExpirada(undefined, '/auth/login'), false)
})

test('matchea aunque la url venga absoluta o con querystring', () => {
  assert.equal(esSesionExpirada(401, 'https://gestion.dcsmart.app/api/auth/login'), false)
  assert.equal(esSesionExpirada(401, '/auth/login?x=1'), false)
})

test('no confunde una ruta que apenas contiene el texto', () => {
  // /auth/login-historial es una ruta autenticada distinta: debe expulsar
  assert.equal(esSesionExpirada(401, '/auth/login-historial'), true)
})

// ── el bucle de recargas ─────────────────────────────────────────────────────
//
// Incidente del 03/08/2026: "la pantalla se vuelve loca, recargan y sigue
// igual, no pueden loguearse". Eran dos defectos que se alimentaban:
//
// 1. El token vivía en DOS lugares: `localStorage.token` (lo lee el interceptor
//    de requests) y `dcsmart-auth` (el persist de zustand, lo lee App.jsx para
//    decidir si llamar a /auth/me). El interceptor limpiaba solo el primero, así
//    que después de la recarga zustand rehidrataba el token viejo, App.jsx veía
//    "hay sesión", pedía /auth/me sin Authorization → 401 → a recargar de nuevo.
// 2. Se navegaba a /login incluso estando YA en /login, y asignar la misma URL
//    recarga la página. El ciclo no tenía salida: la recarga llegaba antes de
//    que la persona pudiera tipear la contraseña.

test('limpiarSesionLocal borra TODAS las claves de sesion, no solo el token', () => {
  const store = new Map([
    ['token', 'jwt-viejo'],
    ['dcsmart-auth', JSON.stringify({ state: { token: 'jwt-viejo', user: { id: 'u1' } } })],
    ['otra-cosa', 'se-queda'],
  ])
  const storage = {
    removeItem: (k) => store.delete(k),
    getItem:    (k) => store.get(k) ?? null,
  }

  limpiarSesionLocal(storage)

  assert.equal(storage.getItem('token'), null)
  // Esta es la que faltaba: si sobrevive, App.jsx vuelve a disparar el ciclo.
  assert.equal(storage.getItem('dcsmart-auth'), null)
  assert.equal(storage.getItem('otra-cosa'), 'se-queda')
})

test('CLAVES_SESION incluye el persist de zustand', () => {
  // Si alguien renombra el store de zustand y no toca esto, el bucle vuelve.
  assert.ok(CLAVES_SESION.includes('token'))
  assert.ok(CLAVES_SESION.includes('dcsmart-auth'))
})

test('limpiarSesionLocal no explota si no hay storage', () => {
  assert.doesNotThrow(() => limpiarSesionLocal(undefined))
  assert.doesNotThrow(() => limpiarSesionLocal(null))
})

test('estando ya en /login no se navega: eso era la recarga en bucle', () => {
  assert.equal(debeNavegarALogin('/login'), false)
  assert.equal(debeNavegarALogin('/login/'), false)
})

test('desde cualquier otra pantalla si se navega al login', () => {
  assert.equal(debeNavegarALogin('/pagos'), true)
  assert.equal(debeNavegarALogin('/'), true)
  assert.equal(debeNavegarALogin('/cajas/123'), true)
  assert.equal(debeNavegarALogin('/start'), true)
})

test('debeNavegarALogin tolera un pathname ausente', () => {
  assert.equal(debeNavegarALogin(undefined), true)
  assert.equal(debeNavegarALogin(''), true)
})

test('debeSincronizarUsuario exige las DOS copias del token', () => {
  assert.equal(debeSincronizarUsuario('jwt', 'jwt'), true)
  // El caso del bucle: el store rehidrató el token viejo pero localStorage está
  // limpio, así que /auth/me saldría sin Authorization.
  assert.equal(debeSincronizarUsuario('jwt', null), false)
  assert.equal(debeSincronizarUsuario(null, 'jwt'), false)
  assert.equal(debeSincronizarUsuario(null, null), false)
  assert.equal(debeSincronizarUsuario('', ''), false)
})

// ── el ciclo completo ────────────────────────────────────────────────────────
//
// Modela lo que pasaba en el navegador para probar que ahora CONVERGE en vez de
// recargar para siempre. Cada vuelta del while es un arranque de la app.

function simularArranques({ conFix, maxVueltas = 25 }) {
  // Estado inicial: sesión vencida. El persist tiene el token viejo y
  // localStorage.token ya fue borrado por un 401 anterior.
  const storage = new Map([
    ['dcsmart-auth', JSON.stringify({ state: { token: 'jwt-vencido', user: { id: 'u1' } } })],
  ])
  const store = { removeItem: (k) => storage.delete(k), getItem: (k) => storage.get(k) ?? null }

  let recargas = 0
  let pathname = '/login'   // la persona quedó en el login intentando entrar

  for (let vuelta = 0; vuelta < maxVueltas; vuelta++) {
    // Al arrancar, zustand rehidrata el token del persist (si sobrevivió).
    const persistido = store.getItem('dcsmart-auth')
    const tokenStore = persistido ? JSON.parse(persistido).state.token : null
    const tokenLocal = store.getItem('token')

    const pide = conFix
      ? debeSincronizarUsuario(tokenStore, tokenLocal)
      : Boolean(tokenStore)              // el chequeo viejo: solo el store

    if (!pide) return { recargas, convergio: true, vueltas: vuelta }

    // /auth/me responde 401 (token vencido, o request sin Authorization).
    if (!esSesionExpirada(401, '/auth/me')) return { recargas, convergio: true, vueltas: vuelta }

    if (conFix) {
      limpiarSesionLocal(store)
      if (debeNavegarALogin(pathname)) { recargas++; pathname = '/login' }
    } else {
      store.removeItem('token')          // el viejo limpiaba solo esta
      recargas++                          // y navegaba siempre, incluso en /login
      pathname = '/login'
    }
  }
  return { recargas, convergio: false, vueltas: maxVueltas }
}

test('SIN el fix el ciclo no termina: una recarga por vuelta, para siempre', () => {
  const r = simularArranques({ conFix: false })
  assert.equal(r.convergio, false)
  assert.equal(r.recargas, 25)   // seguiría indefinidamente
})

test('CON el fix converge en la primera vuelta y sin recargar', () => {
  const r = simularArranques({ conFix: true })
  assert.equal(r.convergio, true)
  // Lo importante: cero recargas. La pantalla de login queda quieta y se puede
  // tipear la contraseña.
  assert.equal(r.recargas, 0)
  assert.equal(r.vueltas, 0)
})
