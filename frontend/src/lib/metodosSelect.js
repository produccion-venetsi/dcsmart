// Options para los selects de método de pago.
//
// El catálogo que sirve el backend trae solo los métodos activos. Pero un
// movimiento/pago existente puede tener un método que ya no está en esa lista
// (desactivado después de cargarlo, o el catálogo no cargó). Si el value del
// <select> no está entre las options, React lo muestra EN BLANCO y parece que
// el dato se perdió. Acá se antepone una option con el método seleccionado
// para que siempre se vea lo que hay guardado.
export function opcionesMetodos(metodos, idSeleccionado, nombreSeleccionado) {
  const lista = metodos ?? []
  if (idSeleccionado && !lista.some((m) => m.id === idSeleccionado)) {
    return [
      { id: idSeleccionado, nombre: nombreSeleccionado ? `${nombreSeleccionado} (inactivo)` : '(método actual)' },
      ...lista,
    ]
  }
  return lista
}
