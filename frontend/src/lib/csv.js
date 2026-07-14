// Exportador CSV genérico. Usa "," como separador: los números que exportamos
// van siempre en formato plano con punto decimal (nunca coma), así que no hay
// conflicto con el separador de campo, y "," es lo que Excel/Sheets detectan
// automáticamente al abrir el archivo (con ";" quedaba todo en una sola
// columna si la app no reconocía el delimitador).
function escapeCsvField(value) {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// columns: [{ label: string, get: (row) => valor }]
export function downloadCsv(filename, rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',')
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(c.get(row))).join(','))
  // BOM al inicio para que Excel detecte UTF-8 y no rompa acentos/ñ
  const csv = '﻿' + [header, ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
