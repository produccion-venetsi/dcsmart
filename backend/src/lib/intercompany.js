// Intercompany: pasar plata de un local a OTRO DEL MISMO GRUPO.
//
// Cómo funciona. Una op de tipo STK cargada en el local que envía se espeja en
// el local que recibe: nace una op
// nueva, con el mismo importe y la misma fecha, pero como INGRESO. Las dos
// quedan unidas por `id_pago_origen`, que es lo que permite saber que una op
// ya se envió, decir de dónde vino la que se recibió, y revertir el envío sin
// tener que adivinar cuál era su espejo.
//
// Por qué una op nueva y no mover la original: la plata sale de un local y
// entra en otro, y cada local tiene que ver el movimiento en SU cuenta. Mover
// la op la haría desaparecer del local que la pagó.
//
// La restricción de grupo NO es una comodidad de la pantalla: dos locales de
// grupos distintos son dos contabilidades distintas, y cruzarlas mezclaría la
// plata de dos clientes. Por eso se valida acá y en el backend, no en el
// select del formulario.

// Quién puede enviar plata a otro local. Espeja ROLES_OPERATIVOS del frontend;
// el guard de la ruta usa fastify.requireOperativo, y el POST de pagos lo
// comprueba con esta lista porque ahí el guard es el de pagos (más amplio).
export const ROLES_OPERATIVOS_IC = ['super_admin', 'dcsmart', 'admin', 'externo']

// El tipo de comprobante de una transferencia entre locales.
//
// Antes el envío se marcaba usando "Intercompany" como MÉTODO DE PAGO. Era
// confuso: el método dice CÓMO se pagó (efectivo, transferencia) y ese decía
// QUÉ era la operación, que es justo lo que ya dice el tipo — de hecho el 99%
// de las STK lo tenían y el 97% de sus usos eran STK, o sea que no agregaba
// información. Desde 2026-08-20 el método está desactivado (las 17.173 ops que
// lo tienen lo conservan) y el envío se declara al cargar la op.
export const TIPO_INTERCOMPANY = 'STK'

// Prefijo de la nota que lleva la copia. Se busca por él para no duplicarla si
// alguien edita las observaciones a mano.
export const NOTA_ORIGEN = 'Intercompany: recibido de'

// ¿Esta op se puede enviar a otro local?
//
// Devuelve el motivo cuando NO se puede, y null cuando sí — así el que llama
// tiene el texto para mostrar en vez de un booleano mudo.
export function motivoNoEnviable(pago) {
  if (!pago) return 'La op no existe'
  if (pago.id_tipo !== TIPO_INTERCOMPANY) {
    return `Solo se envían ops de tipo ${TIPO_INTERCOMPANY}`
  }
  if (!pago.id_local) return 'La op no tiene local asignado'
  if (pago.id_pago_origen) {
    return 'Esta op ya es una copia recibida de otro local: no se reenvía'
  }
  const importe = Number(pago.importe ?? 0)
  if (!(importe > 0)) return 'El importe tiene que ser mayor a cero'
  return null
}

export const esEnviable = (pago) => motivoNoEnviable(pago) === null

// ¿El destino es válido? Tiene que ser otro local, del MISMO grupo, y que
// exista. `locales` son los del grupo activo: [{ id, id_app }].
export function motivoDestinoInvalido(pago, idDestino, locales) {
  if (!idDestino) return 'Elegí el local que recibe'
  if (idDestino === pago?.id_local) return 'El local que recibe tiene que ser otro'
  const destino = (locales ?? []).find((l) => l.id === idDestino)
  if (!destino) return 'Ese local no está en el grupo'
  const origen = (locales ?? []).find((l) => l.id === pago?.id_local)
  // Si el origen no está en la lista, quien pregunta no tiene acceso a él: no
  // se puede afirmar que compartan grupo.
  if (!origen) return 'No tenés acceso al local que envía'
  if (origen.id_app !== destino.id_app) {
    return 'Los dos locales tienen que ser del mismo grupo'
  }
  return null
}

// Los datos de la copia que recibe el otro local. Función pura: quien escribe
// es la ruta. Lo que se copia y lo que NO:
//
//   - Importe, fecha, período, rubro/categoría, tipo y método: se copian, para
//     que la op del que recibe sea reconocible como la misma transferencia.
//   - `ingresa_egreso: true`: es plata que ENTRA. Es la línea que hace que el
//     neto del grupo dé cero — sale de un local y entra en el otro.
//   - `pagado`/`fecha_pago`: la copia nace pagada, con la fecha del envío. No
//     hay nada que pagar del lado que recibe.
//   - `estado_op`, `id_pdp`, `id_cliente`, adjuntos: NO se copian. Son del
//     circuito del local que envió; arrastrarlos metería la op del que recibe
//     en un PDP ajeno o en la cuenta corriente de un cliente que no es suyo.
//   - `nro_ord`: lo asigna el local que recibe, con su propia numeración.
export function datosCopiaIntercompany(pago, { idDestino, nombreOrigen, nroOrd, ahora = new Date() }) {
  const nota = `${NOTA_ORIGEN} ${nombreOrigen}${pago.nro_ord != null ? ` (OP-${pago.nro_ord})` : ''}`
  return {
    nro_ord: nroOrd ?? null,
    fecha: pago.fecha ?? null,
    periodo: pago.periodo ?? null,
    cashflow: pago.cashflow ?? ahora,
    id_local: idDestino,
    id_proveedor: pago.id_proveedor ?? null,
    id_rubcat: pago.id_rubcat ?? null,
    id_tipo: pago.id_tipo ?? null,
    id_metodo: pago.id_metodo ?? null,
    pv: pago.pv ?? null,
    nro: pago.nro ?? null,
    importe_neto: pago.importe_neto ?? null,
    importe: pago.importe ?? null,
    // Entra plata: es la contrapartida del egreso del otro local.
    ingresa_egreso: true,
    pagado: true,
    fecha_pago: ahora,
    id_pago_origen: pago.id,
    // La nota queda ADEMÁS del vínculo: el que abre la op en el listado tiene
    // que entender de dónde salió sin abrir esta pantalla.
    observaciones: pago.observaciones ? `${nota} · ${pago.observaciones}` : nota,
  }
}
