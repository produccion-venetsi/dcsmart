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

// Crear cajas lo puede hacer también el cajero: es su tarea.
export const puedeCrearCajas = (rol) => incluye(ROLES_TODOS, rol)
