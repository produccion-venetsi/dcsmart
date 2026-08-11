// Caja Mayor: si un movimiento tiene op detrás, y a dónde va cada modo de alta.
//
// Los dos modos existen porque son dos cosas distintas:
//
//   - Carga rápida: plata que se movió, sin comprobante. Un retiro, un envío, el
//     saldo de apertura. Vive como MovimientoCM y nada más.
//   - Operación con factura: necesita proveedor, rubro, impuestos, punto de venta,
//     número y adjunto. Todo eso ya lo tiene `Pago`, así que se carga como una op de
//     gestión con id_tipo = 'CM' y el mecanismo de copia la trae a caja mayor sola.
//     Duplicar esos campos en MovimientoCM habría dejado el movimiento afuera de
//     Pagos y de los reportes del local.

export const MODOS_ALTA = {
  RAPIDA: 'rapida',
  OPERACION: 'operacion',
}

// El tipo de comprobante que hace que un pago entre a la caja mayor. Es el mismo que
// mira `vaACajaMayor` en el backend.
export const TIPO_CM = 'CM'

// Los orígenes que salen de una op de gestión. Uno cargado a mano en el módulo no
// tiene op que mostrar.
export const tieneOp = (mov) => Boolean(mov?.id_pago)

// El número de op para mostrar. Puede haber `id_pago` sin `nro_ord` si la op se creó
// y el número todavía no se asignó: ahí se dice "ver op" en vez de "OP-null".
export function etiquetaOp(mov) {
  if (!tieneOp(mov)) return null
  return mov.nro_ord != null ? `OP-${mov.nro_ord}` : 'ver op'
}

// A dónde lleva el movimiento. El formulario de edición es el mismo destino que usa
// el listado de Pagos: no se inventa una vista de solo lectura.
export function rutaDeLaOp(mov) {
  if (!tieneOp(mov)) return null
  return `/pagos/${mov.id_pago}/editar`
}

// La URL del alta como operación.
//
// `tipo=CM` precarga el comprobante. `volver=caja-mayor` es para que al guardar la
// pantalla de pagos devuelva a la caja mayor y no al listado de pagos: se entró desde
// acá, se vuelve acá.
//
// NO se manda `modo=rapido`: ese modo marca el pago como pagado, genera el número
// desde la fecha y fuerza estado CAJA. Una factura trae su propio número y su propio
// estado, así que ese paquete está mal para este caso.
export const RUTA_ALTA_OPERACION = `/pagos/nuevo?tipo=${TIPO_CM}&volver=caja-mayor`

// Qué hacer al elegir un modo de alta. La pantalla ejecuta; la decisión se testea sin
// renderizar.
//
//   { accion: 'drawer' }                     abrir el formulario rápido de siempre
//   { accion: 'ir-a-pagos', ruta, id_local } cambiar el contexto y navegar
//   { accion: 'falta-local', mensaje }       no se sabe en qué local crear la op
//
// El local es obligatorio para la operación y no para la carga rápida: el formulario
// rápido lo pide adentro, pero el de pagos lo toma del contexto activo, y sin local
// elegido en caja mayor no hay contexto que poner.
export function resolverAlta(modo, { idLocal } = {}) {
  if (modo === MODOS_ALTA.RAPIDA) return { accion: 'drawer' }

  if (!idLocal) {
    return {
      accion: 'falta-local',
      mensaje: 'Elegí primero el local: la operación se carga en su nombre y hay que saber cuál.',
    }
  }
  return { accion: 'ir-a-pagos', ruta: RUTA_ALTA_OPERACION, id_local: idLocal }
}
