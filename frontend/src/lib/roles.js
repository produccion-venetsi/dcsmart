// Quién puede hacer qué, según el rol activo en la app.
//
// Estaba repetido como listas sueltas en App.jsx, Sidebar.jsx, PagoList.jsx y
// CajaList.jsx. Con cuatro roles se podía vivir con eso; agregar el quinto
// significaba encontrar las ocho listas y no olvidarse de ninguna, y olvidarse
// de una no rompe nada visible: simplemente el rol nuevo no ve un botón.
//
// El backend NO confía en esto. Cada endpoint valida contra role_permissions
// (ver plugins/permissions.js). Esto decide qué se muestra, no qué se puede.

export const ROLES = {
  SUPER:   'super_admin',
  DCSMART: 'dcsmart',
  ADMIN:   'admin',
  EXTERNO: 'externo',
  CAJERO:  'cajero',
}

// Roles internos de DCSmart. Ven el circuito DC, la fecha de creación de las
// OP, el historial de actividad y demás información de control.
export const ROLES_DC = [ROLES.SUPER, ROLES.DCSMART]

// Cargan y editan: todo menos el cajero, que solo maneja su caja.
//
// `externo` es un admin que además puede borrar (ver puedeBorrar*). Se agregó
// para gente de afuera que ordena la carga de un local y necesita deshacer, no
// solo corregir.
export const ROLES_OPERATIVOS = [ROLES.SUPER, ROLES.DCSMART, ROLES.ADMIN, ROLES.EXTERNO]

// Todos los que entran a la app.
export const ROLES_TODOS = [...ROLES_OPERATIVOS, ROLES.CAJERO]

const incluye = (lista, rol) => lista.includes(rol)

export const esRolDc      = (rol) => incluye(ROLES_DC, rol)
export const puedeOperar  = (rol) => incluye(ROLES_OPERATIVOS, rol)
export const puedeEditar  = (rol) => incluye(ROLES_OPERATIVOS, rol)

// Borrar un pago o una caja es distinto de editarlo: no deja rastro en la
// pantalla, solo en el log de actividad. Por eso no lo tiene `admin`, que es el
// rol de la gente del local.
//
// Antes el botón de borrar caja se le mostraba a `admin` y el backend lo
// rechazaba con 403: el rol nunca tuvo can_delete en la base. Acá quedan
// alineados.
export const ROLES_BORRAN = [ROLES.SUPER, ROLES.DCSMART, ROLES.EXTERNO]

export const puedeBorrarPagos = (rol) => incluye(ROLES_BORRAN, rol)
export const puedeBorrarCajas = (rol) => incluye(ROLES_BORRAN, rol)

// Los movimientos van con la caja: quien puede borrar una caja entera puede
// borrar sus movimientos. El botón no tenía ninguna condición y se le mostraba
// hasta al cajero, que recibía un 403 disfrazado de "Error al eliminar".
export const puedeBorrarMovimientos = (rol) => incluye(ROLES_BORRAN, rol)

// Crear cajas lo puede hacer también el cajero: es su tarea.
export const puedeCrearCajas = (rol) => incluye(ROLES_TODOS, rol)

// ── Alcance de locales ──────────────────────────────────────────────────────
// Espeja ROLES_TODOS_LOS_LOCALES de backend/src/plugins/appContext.js, que es
// quien decide de verdad. Acá sirve para describir el alcance en la pantalla de
// usuarios sin volver a hardcodear nombres de rol sueltos.

// Ven todos los locales de todas las apps, siempre. Da la misma lista que
// ROLES_DC pero responde otra pregunta (alcance, no "es interno de DC"), así
// que se expresa aparte aunque hoy coincidan.
export const esAlcanceGlobal = (rol) => incluye(ROLES_DC, rol)

// Roles de app cuyos locales son opcionales: sin ninguno asignado ven todos los
// del grupo, y asignarles uno los limita a esos. `externo` entra acá igual que
// `admin` — es un admin que además borra, no un rol con acceso global.
export const ROLES_LOCALES_OPCIONALES = [ROLES.ADMIN, ROLES.EXTERNO]
export const sinLocalesVeTodos = (rol) => incluye(ROLES_LOCALES_OPCIONALES, rol)
