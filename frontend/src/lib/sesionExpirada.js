// ¿Este 401 significa "tu sesión venció" (y hay que expulsar al login), o es
// simplemente "las credenciales que mandaste están mal"?
//
// La distinción importa porque el interceptor de axios responde al primer caso
// con `window.location.href = '/login'`, que es una navegación completa: borra
// todo el estado de React. Si eso corre ante el 401 del propio login, se lleva
// puesto el mensaje de error antes de que el usuario lo pueda leer, y un login
// con la contraseña mal tipeada se ve como un formulario que se limpia solo.
//
// Los endpoints donde el 401 es una respuesta esperada del negocio -- no una
// sesión vencida -- son los de autenticación: ahí todavía no hay sesión que
// expirar.
const ENDPOINTS_SIN_SESION = ['/auth/login', '/auth/google']

export function esSesionExpirada(status, url) {
  if (status !== 401) return false

  // Se compara solo el path (sin querystring) y se exige que el endpoint esté
  // al final, para no confundir `/auth/login` con `/auth/login-historial`.
  const path = String(url ?? '').split('?')[0]
  return !ENDPOINTS_SIN_SESION.some(ep => path.endsWith(ep))
}

// Todo lo que guarda sesión en el navegador.
//
// El token está en dos lugares y esa fue la causa del bucle de recargas del
// 03/08/2026: `token` lo lee el interceptor de requests, y `dcsmart-auth` es el
// persist de zustand que lee App.jsx para decidir si pedir /auth/me. Limpiar
// solo el primero dejaba a zustand rehidratando el token viejo después de la
// recarga: App.jsx creía que había sesión, pedía /auth/me sin Authorization,
// recibía 401 y se volvía a recargar, para siempre.
//
// Si se renombra el store de zustand (la clave `name` del persist), hay que
// actualizar esta lista. Hay un test que lo recuerda.
export const CLAVES_SESION = ['token', 'dcsmart-auth']

export function limpiarSesionLocal(storage) {
  if (!storage) return
  for (const clave of CLAVES_SESION) {
    try { storage.removeItem(clave) } catch { /* modo privado / storage lleno */ }
  }
}

// ¿Hay que navegar al login, o ya estamos ahí?
//
// `window.location.href = '/login'` estando en /login no es un no-op: recarga la
// página. Con el 401 llegando en cada arranque, eso era una recarga cada pocos
// cientos de milisegundos y nadie llegaba a tipear la contraseña.
export function debeNavegarALogin(pathname) {
  const path = String(pathname ?? '')
  return path !== '/login' && path !== '/login/'
}

// ¿Corresponde pedir /auth/me al arrancar la app?
//
// Hacen falta las DOS copias del token: la del store (que dice "había sesión") y
// la de localStorage (que es la que el interceptor manda en el header). Con solo
// la primera, la request sale sin Authorization, vuelve 401, se limpia y se
// recarga... y el persist de zustand la rehidrata y arranca de nuevo.
export function debeSincronizarUsuario(tokenStore, tokenLocal) {
  return Boolean(tokenStore) && Boolean(tokenLocal)
}
