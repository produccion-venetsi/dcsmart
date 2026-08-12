// Los tipos de comprobante de un pago (el enum `TipoPago` del backend).
//
// Existe porque la lista estaba escrita a mano en dos lugares —el select del formulario y
// el filtro del listado— y agregar un tipo obligaba a acordarse de los dos. Al sumar NDC
// el select lo iba a ofrecer y el filtro no, o al revés.
//
// El test de contrato lee `schema.prisma` y falla si el enum tiene un valor que no está
// acá (o al revés): un tipo que existe en la base y no en esta lista es un pago que se
// puede guardar pero no se puede filtrar.

export const TIPOS_PAGO = [
  'A', 'B', 'C',
  'CM',
  'DC_1', 'DC_2',
  'DDJJ',
  'FF',
  'LF',
  'M',
  'NCA', 'NCB',
  'NDA', 'ND', 'NDC',
  'STK',
  'X',
]

// Cómo se lee cada uno. Solo los que no son evidentes: los que faltan se muestran con su
// propia clave, que es como los nombra el negocio (una factura A es "A").
//
// DC_1 y DC_2 se guardan con paréntesis en la base (`DC (1)`, ver el @map del enum) pero
// en la app se escriben con guión bajo.
export const ETIQUETA_TIPO = {
  CM: 'CM (caja mayor)',
  DC_1: 'DC (1)',
  DC_2: 'DC (2)',
  DDJJ: 'DDJJ',
  NCA: 'NCA (nota de crédito A)',
  NCB: 'NCB (nota de crédito B)',
  NDA: 'NDA (nota de débito A)',
  ND: 'ND (nota de débito)',
  NDC: 'NDC (nota de débito C)',
  STK: 'STK (stock)',
}

export const etiquetaTipo = (t) => ETIQUETA_TIPO[t] ?? t

// Los que restan en vez de sumar. Son las notas de CRÉDITO: las de débito suman.
// Ver `esNotaCredito` en exportPagos.js, que usa la misma idea para el export.
export const TIPOS_QUE_RESTAN = ['NCA', 'NCB']

export const resta = (t) => TIPOS_QUE_RESTAN.includes(t)
