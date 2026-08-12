// Reglas del formulario de detalle de caja.
//
// Viven acá y no dentro de CajaList.jsx para poder testearlas: son decisiones de
// negocio y no detalles de la pantalla. Además el formulario de detalle aparece
// cuatro veces (alta y edición, en dos paneles distintos) y una copia por lugar se
// desincroniza sola.

import { cargaLaCuenta } from './cuentaCorrienteCaja.js'

// Elegir un nombre NO toca la clasificación: la decide la persona que carga.
//
// Antes se pisaba con la clasificación del tipo del catálogo ("Mostrador" ponía
// informativo, "MP QR" ponía cobro). Suena cómodo, pero decide por el usuario
// algo que cambia la diferencia de caja: el mismo nombre se carga como cobro en
// una caja y como informativo en otra porque ya venía sumado, y eso sólo lo sabe
// quien está cargando. Que el formulario lo cambie solo es peor que escribirlo,
// porque pasa desapercibido.
//
// La clasificación del tipo sigue siendo el respaldo para los detalles viejos que
// no tienen una propia (ver clasificacionDeDetalle en lib/clasificaciones.js);
// lo que se saca es que el formulario la imponga.
export function conTipoElegido(form, _tipos, id_tipo, nombre) {
  return { ...form, id_tipo, nombre }
}

// Cambiar la clasificación puede dejar el detalle sin poder llevar cuenta corriente (un
// informativo no mueve ninguna cuenta, ver lib/cuentaCorrienteCaja.js). En ese caso el
// cliente se suelta acá y no al guardar: si no, el campo queda con un nombre puesto, el
// backend rechaza el POST y el error aparece recién al apretar Guardar.
//
// Es lo contrario de la regla de arriba y no la contradice: ahí lo que NO se toca es un dato
// que la persona eligió y sigue siendo válido. Acá el dato dejó de ser guardable.
export function conClasificacionElegida(form, clasificacion) {
  const next = { ...form, clasificacion }
  if (!cargaLaCuenta(clasificacion)) {
    next.id_cliente = ''
    next.cliente = null
  }
  return next
}
