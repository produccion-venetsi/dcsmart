// Reglas del formulario de detalle de caja.
//
// Vive acá y no dentro de CajaList.jsx para poder testear la regla que sigue,
// que es una decisión de negocio y no un detalle de la pantalla.

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
