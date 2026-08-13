// El "seleccionar todo" de las columnas de PDP.
//
// La selección ya existía por fila y por grupo de proveedor; faltaba poder tomar la columna
// entera, que es lo que se hace todos los días: mandar toda la deuda a PDP, o pagar todo lo
// que quedó pendiente.
//
// Dos cosas que no son obvias y por eso esto tiene tests:
//
//   1. "Todo" incluye los grupos COLAPSADOS. Un grupo colapsado sigue estando en la
//      columna: seleccionar solo lo que se ve dejaría afuera filas que el usuario cree
//      incluidas, y eso al mandar a PDP se traduce en órdenes que no se movieron.
//   2. "Todo" es lo que hay en la columna DESPUÉS de los filtros. Los grupos que llegan acá
//      ya vienen filtrados, así que alcanza con no inventar nada: se usan tal cual.

// Todos los ids de una columna, sin importar si el grupo está colapsado.
export function idsDeGrupos(groups) {
  const ids = []
  for (const g of groups ?? []) {
    for (const item of g?.items ?? []) {
      if (item?.id != null) ids.push(item.id)
    }
  }
  return ids
}

// En qué estado está la selección de la columna:
//
//   'vacia'    - no hay nada seleccionado
//   'parcial'  - algunos sí, otros no
//   'completa' - están todos
//
// Se distingue 'parcial' de 'completa' porque el botón tiene que decir qué va a hacer:
// con todo seleccionado, apretarlo deselecciona.
export function estadoSeleccion(groups, selected) {
  const ids = idsDeGrupos(groups)
  if (!ids.length) return 'vacia'
  const tiene = (id) => Boolean(selected?.has?.(id))
  const cuantos = ids.filter(tiene).length
  if (cuantos === 0) return 'vacia'
  return cuantos === ids.length ? 'completa' : 'parcial'
}

// Qué dice el botón. Con todo seleccionado ofrece lo contrario, porque el mismo botón hace
// las dos cosas (usa el toggle de grupo que ya existía).
export const textoSeleccionarTodo = (estado) =>
  estado === 'completa' ? 'Ninguno' : 'Todos'

// La ayuda del botón, que dice cuántos son. "Todos" a secas no aclara si son los 3 que se
// ven o los 120 que hay con los grupos cerrados.
export function ayudaSeleccionarTodo(groups, estado) {
  const n = idsDeGrupos(groups).length
  if (!n) return 'No hay órdenes para seleccionar'
  if (estado === 'completa') return `Deseleccionar las ${n} órdenes`
  return `Seleccionar las ${n} órdenes de la columna, incluidos los grupos cerrados`
}
