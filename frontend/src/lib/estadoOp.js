// Los estados de una op, en un solo lugar.
//
// Estaban duplicados en PagoForm y PagoList. Ya pasó una vez con otro enum (el
// ESTUDIO -> ENVIADA de Caja Mayor): se renombró en el backend, el frontend siguió
// mandando el viejo y la pantalla contestaba 400 sin decir por qué. La lista tiene
// que salir de acá y el test de contrato la compara contra el enum de Prisma, así que
// agregar un estado en la base y olvidarse del frontend rompe el test, no la app.
//
// Los nombres con espacio (`CUENTA CTE`) son el @map de Postgres; por el cable viaja
// siempre la clave con guión bajo.

export const ESTADOS_OP = ['CAJA', 'CUENTA_CTE', 'MP_PDP', 'PDP', 'CTA_CTE_CLI']

export const ESTADO_OP_LABEL = {
  CAJA:        'CAJA',
  CUENTA_CTE:  'CUENTA CTE',
  MP_PDP:      'MP PDP',
  PDP:         'PDP',
  CTA_CTE_CLI: 'CTA CTE CLI',
}

// Para los <select> y los filtros multi.
export const ESTADO_OP_OPTIONS = ESTADOS_OP.map(value => ({ value, label: ESTADO_OP_LABEL[value] }))

// Color del badge. CTA CTE CLI va en violeta y no en ámbar como CUENTA CTE: las dos
// son cuenta corriente pero en direcciones opuestas -- una es lo que le debemos al
// proveedor, la otra lo que un cliente nos debe. Compartir color las haría
// confundibles de un vistazo en la lista.
export const ESTADO_OP_BADGE = {
  CAJA:        'badge-muted',
  CUENTA_CTE:  'badge-amber',
  MP_PDP:      'badge-blue',
  PDP:         'badge-green',
  CTA_CTE_CLI: 'badge-purple',
}

// El estado que exige tener un cliente asignado, y al revés: el único con el que un
// cliente se puede guardar. La regla vive en backend/src/lib/cuentaCorriente.js; acá
// está la constante para no repetir el literal por las pantallas.
export const ESTADO_CTA_CTE_CLIENTE = 'CTA_CTE_CLI'

export const etiquetaEstadoOp = (estado) => ESTADO_OP_LABEL[estado] ?? estado ?? ''
export const badgeEstadoOp    = (estado) => ESTADO_OP_BADGE[estado] ?? 'badge-muted'
