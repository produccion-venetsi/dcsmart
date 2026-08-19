// Sub-formularios adentro de un <form> grande (los bloques "agregar detalle" /
// "agregar movimiento" de los paneles de caja).
//
// El problema: apretar Enter en el Monto de un detalle a medio cargar no
// agregaba el detalle -- disparaba el submit del form padre y CREABA LA CAJA
// ENTERA. La regla acá: Enter sobre un input o select del sub-form se
// intercepta y ejecuta la acción del sub-form; textarea y botones siguen con
// su comportamiento nativo.
export function esEnterDeSubForm(key, tagName) {
  if (key !== 'Enter') return false
  return tagName === 'INPUT' || tagName === 'SELECT'
}

// Handler listo para colgar en el onKeyDown del contenedor del sub-form.
export function enterEjecuta(accion) {
  return (e) => {
    if (!esEnterDeSubForm(e.key, e.target.tagName)) return
    e.preventDefault()
    accion()
  }
}
