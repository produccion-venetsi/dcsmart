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
