// Armado de las columnas de impuesto y la fila de totales del export de pagos.
// Separado de PagoList para poder testearlo con node --test (es JS puro).

import { esNumerico } from './excel.js'

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
  }))
}

export function filaTotales(pagos, columns) {
  return columns.map((col, i) => {
    if (i === 0) return 'TOTAL'
    const valores = pagos.map((p) => col.get(p))
    // Mismo criterio que excel.js usa para decidir que celdas volver number
    // al armar el archivo (esNumerico), asi PV/Nro (identificadores con cero
    // a la izquierda, ej. "00001") quedan en blanco aca igual que en el resto
    // de sus filas, en vez de sumarse como si fueran montos.
    const numericos = valores.filter((v) => esNumerico(v))
    // Si ninguna celda de la columna es numerica, es texto o fecha: no se suma.
    if (numericos.length === 0) return ''
    return numericos.reduce((acc, v) => acc + Number(v), 0)
  })
}
