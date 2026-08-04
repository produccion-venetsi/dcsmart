// Exportador a Excel (.xlsx). Misma interfaz que downloadCsv:
//   columns = [{ label, get: (row) => valor }]
//
// xlsx (SheetJS) se carga on-demand (import dinámico) para no sumarlo al
// bundle inicial: recién se descarga cuando el usuario exporta.

// Une el criterio de "esto es numérico" para todo el módulo de export: una
// celda es numérica si ya es number, o si es un string que Number() puede
// parsear sin ser un identificador con cero a la izquierda (PV/Nro tipo
// "00001"). Se exporta para que filaTotales (exportPagos.js) sume exactamente
// las mismas columnas que coerce() vuelve numéricas — si difirieran, el TOTAL
// podría sumar una columna que el archivo dejó como texto, o viceversa.
export function esNumerico(value) {
  if (value == null || value === '') return false
  if (typeof value === 'number') return true
  const s = String(value)
  return !/^0\d/.test(s) && !isNaN(Number(s))
}

// Convierte a número las celdas que son claramente numéricas, para que Excel
// las trate como número (sumas, formato) y no como texto. Preserva los que
// tienen ceros a la izquierda (PV/Nro tipo "00001") dejándolos como texto.
function coerce(value) {
  if (value == null) return ''
  if (typeof value === 'number') return value
  const s = String(value)
  if (esNumerico(s)) return Number(s)
  return s
}

// Arma el workbook en memoria. Lo usan los dos caminos de salida — bajar el
// archivo y subirlo a Google Drive — para que la planilla sea exactamente la
// misma en los dos, incluidos anchos de columna y fila de totales.
async function buildWorkbook(rows, columns, sheetName, totalsRow) {
  const XLSX = await import('xlsx')
  const header = columns.map((c) => c.label)
  const body = rows.map((row) => columns.map((c) => coerce(c.get(row))))
  const aoa = [header, ...body, ...(totalsRow ? [totalsRow] : [])]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Ancho de columna aproximado según el contenido (acotado 8..45).
  ws['!cols'] = columns.map((c, i) => {
    const maxLen = Math.max(
      String(c.label).length,
      ...body.map((r) => String(r[i] ?? '').length)
    )
    return { wch: Math.min(Math.max(maxLen + 2, 8), 45) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return { XLSX, wb }
}

export async function downloadExcel(filename, rows, columns, sheetName = 'Datos', totalsRow = null) {
  const { XLSX, wb } = await buildWorkbook(rows, columns, sheetName, totalsRow)
  XLSX.writeFile(wb, filename)
}

// Mismo workbook, pero como Blob para subirlo por HTTP en vez de bajarlo.
export async function excelBlob(rows, columns, sheetName = 'Datos', totalsRow = null) {
  const { XLSX, wb } = await buildWorkbook(rows, columns, sheetName, totalsRow)
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
