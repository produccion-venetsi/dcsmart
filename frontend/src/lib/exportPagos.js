// Armado de las columnas de impuesto y la fila de totales del export de pagos.
// Separado de PagoList para poder testearlo con node --test (es JS puro).

// Orden del enum TipoImpuesto en schema.prisma. Se respeta para que el archivo
// tenga siempre las mismas columnas en el mismo orden entre exports.
const ORDEN_TIPOS = ['IVA21', 'IVA27', 'IVA10', 'RETENCION', 'PERCEPCION']

function montoDe(pago, tipo) {
  return (pago.impuestos ?? [])
    .filter((i) => i.tipo === tipo)
    .reduce((acc, i) => acc + Number(i.monto ?? 0), 0)
}

export function tiposImpuestoPresentes(pagos) {
  const presentes = new Set()
  for (const p of pagos) {
    for (const imp of p.impuestos ?? []) presentes.add(imp.tipo)
  }
  const conocidos = ORDEN_TIPOS.filter((t) => presentes.has(t))
  // Un tipo nuevo en la base que todavia no este en ORDEN_TIPOS igual se
  // exporta, al final y alfabetico, en vez de desaparecer del archivo.
  const desconocidos = [...presentes].filter((t) => !ORDEN_TIPOS.includes(t)).sort()
  return [...conocidos, ...desconocidos]
}

export function columnasImpuesto(tipos) {
  return tipos.map((tipo) => ({
    label: tipo,
    // 0 y no '' para que la columna sume bien en Excel.
    get: (pago) => montoDe(pago, tipo),
    // Columna de plata: entra en la fila TOTAL. Se marca aca y no en el
    // llamador para que un tipo de impuesto nuevo nunca dependa de que
    // alguien se acuerde de marcarlo a mano.
    total: true,
  }))
}

// Que columna se suma en la fila TOTAL es una propiedad de la columna
// (col.total === true), no algo que se adivina mirando si sus valores
// "parecen" numeros. Sniffing por valor sumaba OP/PV/Nro sin cero a la
// izquierda y hasta notas de Observaciones que por casualidad eran solo
// digitos. Declarar la columna evita esos falsos positivos por construccion,
// sin necesidad de casos especiales por tipo de dato.
export function filaTotales(pagos, columns) {
  return columns.map((col, i) => {
    if (i === 0) return 'TOTAL'
    if (!col.total) return ''
    const suma = pagos.reduce((acc, p) => acc + Number(col.get(p) ?? 0), 0)
    // Redondeo a 2 decimales: sumar miles de valores de 2 decimales acumula
    // error de flotante (0.1 + 0.2 + 0.3 = 0.6000000000000001) que Excel a
    // veces muestra tal cual.
    return Math.round(suma * 100) / 100
  })
}
