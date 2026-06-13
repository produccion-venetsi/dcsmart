// Clasificaciones de los tipos de detalle de caja.
// Fuente única para el valor que se guarda y la etiqueta que se muestra.

export const CLASIFICACIONES = [
  { value: 'canal',      label: 'Canal' },
  { value: 'medio_pago', label: 'Medio de pago' },
  { value: 'calculo',    label: 'Cálculo' },
  { value: 'otro',       label: 'Otro' }
]

// Devuelve la etiqueta legible de una clasificación.
// - value vacío/null → `fallback` (por defecto '—')
// - tolera valores legacy en mayúsculas (p.ej. 'CANAL')
// - valor desconocido → se devuelve tal cual
export function clasificacionLabel(value, fallback = '—') {
  if (!value) return fallback
  const found = CLASIFICACIONES.find(
    (c) => c.value === value || c.value === String(value).toLowerCase()
  )
  return found ? found.label : value
}
