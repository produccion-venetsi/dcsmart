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
  // Solo carga datos: ve los formularios de alta y nada mas. No aparece en
  // ROLES_TODOS ni en ROLES_OPERATIVOS a proposito -- esas listas significan
  // "opera la app", y este perfil no opera.
  DATA_ENTRY: 'data_entry',
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

// Crear cajas lo puede hacer también el cajero (es su tarea) y data_entry (es su
// única tarea). Se define una lista propia en vez de ensanchar ROLES_TODOS, que
// significa "todos los que operan la app" y data_entry no opera.
export const ROLES_CREAN_CAJAS = [...ROLES_TODOS, ROLES.DATA_ENTRY]
export const puedeCrearCajas = (rol) => incluye(ROLES_CREAN_CAJAS, rol)

// Agregar movimientos a una caja. El cajero carga su turno (el backend le da
// caja_movimientos view+create), así que entra junto con los operativos;
// data_entry no toca movimientos. Espeja la matriz del seed, igual que el
// resto de este archivo: decide qué se muestra, no qué se puede.
export const puedeCargarMovimientos = (rol) => incluye(ROLES_TODOS, rol)

// Exportar la tabla de pagos (Excel y Google Sheets). Incluye a `externo` -- el rol
// de la gente de afuera que ordena la carga y necesita la planilla -- y a `admin`,
// que es dueño o gerente del local y pidió poder bajarse sus propios pagos. No
// incluye a `cajero`.
//
// Exportar no agrega acceso a nada: el archivo se arma en el navegador con las
// mismas filas que la pantalla ya trae de `GET /pagos`, que va recortado por
// `allowedLocalIds`. Un admin se baja los pagos de SUS locales y de ningún otro; el
// backend no tiene que autorizar nada aparte porque no hay endpoint de export.
//
// Ojo: exportar no es lo mismo que ver los datos internos. La columna "Creado" del
// export sigue saliendo solo para ROLES_DC (ver PAGO_CSV_COLUMNS), porque ni
// externo ni admin la ven en pantalla.
export const puedeExportar = (rol) => incluye([...ROLES_DC, ROLES.EXTERNO, ROLES.ADMIN], rol)

// ── Home por rol ────────────────────────────────────────────────────────────
//
// A dónde va cada rol cuando entra, y a dónde se lo manda si intenta una ruta que
// no le corresponde. Los roles restringidos a una sola pantalla tienen la suya; el
// resto va al dashboard.
//
// Antes esto era un `<Navigate to="/reportes">` hardcodeado dentro de
// ProtectedRoute. Servía mientras `reportes` era el único rol restringido; con el
// segundo (`data_entry`) habría mandado a los cargadores de datos a una pantalla
// de reportes que no pueden ver.

const HOME_POR_ROL = {
  reportes:   '/reportes',
  data_entry: '/cargar',
}

export const HOME_POR_DEFECTO = '/dashboard'

export function homeDeRol(rol) {
  return HOME_POR_ROL[rol] ?? HOME_POR_DEFECTO
}

// Roles que NO operan la app: se los saca de las pantallas operativas y se los
// manda a su home. Sale de HOME_POR_ROL para que agregar un rol restringido sea un
// solo cambio.
export const ROLES_RESTRINGIDOS = Object.keys(HOME_POR_ROL)

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
