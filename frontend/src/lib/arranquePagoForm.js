// Arranque del formulario de pagos: resuelve las llamadas iniciales sin que una
// secundaria se lleve puesta a las demás.
//
// Antes las tres iban en un `Promise.all`, así que el 403 de la ficha del local
// (los roles admin y cajero no tienen `locales:view`) rechazaba todo el bloque:
// no se cargaban los métodos de pago, el <select> quedaba sin opciones y no se
// aplicaba el default de Efectivo, con lo que guardar terminaba en "El método
// de pago es obligatorio". Solo pasaba en Carga Avión y MovStock, los únicos
// modos que piden la ficha del local.
//
// Los métodos de pago sí son críticos: sin ellos el formulario no se puede
// completar, así que esa falla se propaga y la maneja el `catch` de la página.

const METODO_DEFAULT = 'Efectivo'

// `pago` y `contexto` son opcionales: se pasa null cuando no corresponde
// pedirlos (crear en vez de editar, o un modo que no necesita el local).
export async function cargarArranquePago({ metodos, pago, contexto }) {
  const [metRes, pagoRes, ctxRes] = await Promise.allSettled([
    metodos,
    pago     ?? Promise.resolve(null),
    contexto ?? Promise.resolve(null),
  ])

  if (metRes.status === 'rejected') throw metRes.reason

  return {
    metodos:  metRes.value?.data ?? [],
    pago:     pagoRes.status === 'fulfilled' ? (pagoRes.value?.data ?? null) : null,
    contexto: ctxRes.status  === 'fulfilled' ? (ctxRes.value?.data  ?? null) : null,
    // Una llamada que no se pidió no es una falla: `pago: null` de entrada y un
    // pago que devolvió 500 son casos distintos para quien decide si avisar.
    fallas: {
      pago:     Boolean(pago)     && pagoRes.status === 'rejected',
      contexto: Boolean(contexto) && ctxRes.status  === 'rejected',
    },
  }
}

// El método con el que arrancan los modos rápidos. Devuelve null si no está en
// la lista: es el llamador el que decide qué hacer, no se inventa un id.
export function metodoPorDefecto(metodos, nombre = METODO_DEFAULT) {
  return (metodos ?? []).find((m) => m.nombre === nombre) ?? null
}
