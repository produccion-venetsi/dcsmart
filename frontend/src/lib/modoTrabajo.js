// Modo de trabajo del super_admin: ADMINISTRAR o OPERAR.
//
// El problema que resuelve: operando un local, el sidebar mostraba también las
// pantallas de administración (usuarios, roles, rubros, métodos de pago, tipos de
// detalle, apps, locales). Esas pantallas cambian cosas de TODOS los grupos, así que
// tocarlas mientras uno cree estar dentro de un local puntual es fácil de hacer por
// error y difícil de notar. Separar los modos hace que administrar sea algo que se
// elige, no algo que está siempre a un click de distancia.
//
// No es un permiso: el super_admin sigue pudiendo todo. Es el alcance de lo que
// tiene a mano en cada momento.

export const MODOS = { ADMIN: 'admin', OPERAR: 'operar' }

// Prefijos de las rutas que pertenecen a cada modo. Lo que no está en ninguna lista
// (avisos, el detalle de un pago) se ve en los dos: son cosas que uno abre desde
// donde esté.
const RUTAS_ADMIN = ['/admin', '/auditorias', '/actividad', '/caja-mayor']
const RUTAS_OPERAR = ['/dashboard', '/cajas', '/pagos', '/pdp', '/proveedores', '/reportes', '/arqueo', '/cargar']

const empiezaCon = (ruta, prefijos) =>
  prefijos.some(p => ruta === p || ruta.startsWith(p + '/') || ruta.startsWith(p + '?'))

export const esRutaAdmin  = (ruta) => empiezaCon(String(ruta ?? ''), RUTAS_ADMIN)
export const esRutaOperar = (ruta) => empiezaCon(String(ruta ?? ''), RUTAS_OPERAR)

// A qué modo pertenece una ruta, o null si da igual (se ve en los dos).
export function modoDeRuta(ruta) {
  if (esRutaAdmin(ruta)) return MODOS.ADMIN
  if (esRutaOperar(ruta)) return MODOS.OPERAR
  return null
}

// ¿Hay que corregir el modo por la ruta en la que está el usuario?
//
// Pasa cuando entra por un link guardado o por el historial: si está en modo OPERAR
// y abre /admin/users, se cambia el modo en vez de mostrarle una pantalla que su
// menú dice que no existe. Devuelve el modo nuevo, o null si no hay que tocar nada.
export function modoACorregir(ruta, modoActual) {
  const propio = modoDeRuta(ruta)
  if (!propio || propio === modoActual) return null
  return propio
}

// Dónde aterriza cada modo al cambiar con el switch.
//
// ADMIN va a Usuarios (o Apps para dcsmart, que no tiene Usuarios). OPERAR va al
// dashboard si ya hay un grupo elegido, y al selector si no: sin grupo, las
// pantallas operativas no tienen de dónde leer.
export function destinoDeModo(modo, { esSuperAdmin, hayGrupo }) {
  if (modo === MODOS.ADMIN) return esSuperAdmin ? '/admin/users' : '/admin/apps'
  return hayGrupo ? '/dashboard' : '/select-app'
}

// El modo con el que arranca la sesión. Se respeta el guardado; si no hay ninguno,
// se deduce de si tiene un grupo elegido: quien venía operando sigue operando.
export function modoInicial(guardado, { hayGrupo }) {
  if (guardado === MODOS.ADMIN || guardado === MODOS.OPERAR) return guardado
  return hayGrupo ? MODOS.OPERAR : MODOS.ADMIN
}
