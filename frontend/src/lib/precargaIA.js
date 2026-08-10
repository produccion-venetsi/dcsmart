// Qué campos del formulario se precargan con lo que leyó la IA de la factura.
//
// Vive acá y no dentro del componente porque son reglas de negocio con casos que
// conviene fijar en tests: el relleno con ceros, el período, y qué NO se toca.

// Punto de venta y número de comprobante van con ceros a la izquierda: 5 y 8
// dígitos. Son los mismos largos que aplica el `onBlur` de cada campo cuando se
// escriben a mano.
export const LARGO_PV = 5
export const LARGO_NRO = 8

export function rellenar(valor, largo) {
  const limpio = String(valor ?? '').replace(/\D/g, '')
  if (!limpio) return ''
  // Todo ceros se trata como "no se leyó". No existe el punto de venta 0 ni el
  // comprobante 0, y precargar "00000" muestra un dato falso que parece leído de la
  // factura: es peor que dejar el campo vacío para que la persona lo complete.
  if (Number(limpio) === 0) return ''
  // Más largo que el formato: se deja como vino. Recortar sería inventar otro
  // comprobante, y es mejor que la persona vea el número raro y lo corrija.
  if (limpio.length >= largo) return limpio
  return limpio.padStart(largo, '0')
}

// El patch que se aplica al formulario con lo leído.
//
// `campos` es lo que devuelve el backend en `data.campos`. Solo se tocan las claves
// que vinieron con dato: un `null` de la lectura no tiene que borrar algo que la
// persona ya escribió.
//
// El importe total NO entra a propósito: se calcula solo desde neto + impuestos −
// descuento. Lo que la factura decía como total se usa aparte, para avisar si no
// coincide.
export function patchDesdeLectura(campos) {
  const c = campos ?? {}
  const patch = {}

  if (c.fecha != null) patch.fecha = c.fecha
  if (c.id_tipo != null) patch.id_tipo = c.id_tipo

  // Con los ceros puestos desde el principio. Antes se precargaba el número pelado
  // ("3" en vez de "00003") porque el relleno vivía solo en el onBlur del campo, y
  // cargando con IA nadie pasa por ahí.
  if (c.pv != null) patch.pv = rellenar(c.pv, LARGO_PV)
  if (c.nro != null) patch.nro = rellenar(c.nro, LARGO_NRO)

  if (c.importe_neto != null) patch.importe_neto = String(c.importe_neto)
  if (c.descuento != null) patch.descuento = String(c.descuento)

  // El período es el de la factura: una factura de julio es gasto de julio. Antes
  // quedaba vacío y había que elegirlo a mano al lado de la fecha que la IA ya
  // había leído, que es justo el dato que se necesita.
  //
  // Es editable después: si el gasto corresponde a otro mes, se cambia.
  if (c.fecha != null) patch.periodo = c.fecha

  return patch
}

// ¿La lectura alcanza para que el chequeo de duplicado tenga sentido?
//
// El chequeo pide proveedor + pv + nro. Si la factura no trajo alguno de los tres,
// no es que no haya duplicado: es que no se pudo mirar, y decir "no hay duplicado"
// en ese caso es peor que no decir nada.
export function puedeChequearDuplicado({ id_proveedor, pv, nro } = {}) {
  return Boolean(id_proveedor && pv && nro)
}

// Qué le falta a la lectura para poder chequear duplicado, en texto.
export function faltaParaDuplicado({ id_proveedor, pv, nro } = {}) {
  const falta = []
  if (!id_proveedor) falta.push('el proveedor')
  if (!pv) falta.push('el punto de venta')
  if (!nro) falta.push('el número')
  return falta
}
