// Exportador a Excel (.xlsx). Misma interfaz que downloadCsv:
//   columns = [{ label, get: (row) => valor }]
//
// xlsx (SheetJS) se carga on-demand (import dinámico) para no sumarlo al
// bundle inicial: recién se descarga cuando el usuario exporta.

// Convierte a número las celdas que son claramente numéricas, para que Excel
// las trate como número (sumas, formato) y no como texto. Preserva los que
// tienen ceros a la izquierda (PV/Nro tipo "00001") dejándolos como texto.
function coerce(value) {
  if (value == null) return ''
  if (typeof value === 'number') return value
  const s = String(value)
  if (s !== '' && !/^0\d/.test(s) && !isNaN(Number(s))) return Number(s)
  return s
}

export async function downloadExcel(filename, rows, columns, sheetName = 'Datos') {
  const XLSX = await import('xlsx')
  const header = columns.map((c) => c.label)
  const body = rows.map((row) => columns.map((c) => coerce(c.get(row))))
  const aoa = [header, ...body]

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
  XLSX.writeFile(wb, filename)
}
