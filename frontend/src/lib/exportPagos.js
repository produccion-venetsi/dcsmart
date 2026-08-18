// Armado de las columnas de impuesto y la fila de totales del export de pagos.
// Separado de PagoList para poder testearlo con node --test (es JS puro).

// Orden del enum TipoImpuesto en schema.prisma. Se respeta para que el archivo
// tenga siempre las mismas columnas en el mismo orden entre exports.
const ORDEN_TIPOS = ['IVA21', 'IVA27', 'IVA10', 'RETENCION', 'PERCEPCION', 'PERC_IVA', 'PERC_IIBB']

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

// ── Signo de las notas de crédito en el export ──────────────────────────────
// En la base todos los montos son positivos y la dirección vive en
// `ingresa_egreso` (ver backend/src/lib/deuda.js). Eso funciona adentro de la
// app, pero en una planilla el que mira quiere que la fila TOTAL le dé el neto
// real, y para eso la nota de crédito tiene que restar sola.
//
// El criterio es el TIPO de comprobante, no `ingresa_egreso`: hay 8 notas de
// crédito cargadas como egreso (documentado en deuda.js) que por dirección
// quedarían sumando. Por tipo salen bien igual.
const TIPOS_NOTA_CREDITO = ['NCA', 'NCB']

export function esNotaCredito(pago) {
  return TIPOS_NOTA_CREDITO.includes(pago?.id_tipo)
}

// Envuelve las columnas de plata para que las filas de nota de crédito salgan
// en negativo. "Columna de plata" es exactamente `total: true`, el mismo
// marcador que usa filaTotales: así el signo del detalle y el de la suma no
// pueden divergir, y un tipo de impuesto nuevo lo hereda sin tocar nada.
export function conSignoNotaCredito(columns) {
  return columns.map((col) => {
    if (!col.total) return col
    return {
      ...col,
      get: (pago) => {
        const valor = col.get(pago)
        if (valor === '' || valor == null) return valor
        if (!esNotaCredito(pago)) return valor
        // `|| 0` normaliza el -0 que sale de invertir un 0: Excel lo muestra
        // como 0 pero lo guarda como -0, y en un filtro se lee raro.
        return -Number(valor) || 0
      },
    }
  })
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
