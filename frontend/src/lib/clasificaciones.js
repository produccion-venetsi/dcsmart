// Clasificaciones de los tipos de detalle de caja.
// Fuente única para el valor que se guarda y la etiqueta que se muestra.
//
// La clasificación define cómo participa el detalle en la diferencia de caja.
// El cálculo vive en backend/src/lib/cuadreCaja.js.

export const CLASIFICACIONES = [
  { value: 'cobro',       label: 'Cobro',       ayuda: 'Suma a la venta del turno (MP, transferencia, tarjeta…)' },
  { value: 'gasto',       label: 'Gasto',       ayuda: 'Resta de la venta del turno' },
  { value: 'informativo', label: 'Informativo', ayuda: 'No entra en la diferencia: desglosa algo ya contado (canales, totales)' }
]

// Valores anteriores que siguen apareciendo en cajas históricas. Se mapean para
// que la etiqueta no quede vacía al mirar una caja vieja.
const HISTORICOS = {
  ingreso: 'Cobro',
  medio_pago: 'Cobro',
  egreso: 'Gasto',
  canal: 'Informativo',
  otro: 'Informativo',
  calculo: 'Informativo'
}

// Devuelve la etiqueta legible de una clasificación.
// - value vacío/null → `fallback` (por defecto '—')
// - tolera valores legacy en mayúsculas (p.ej. 'CANAL')
// - valor desconocido → se devuelve tal cual
export function clasificacionLabel(value, fallback = '—') {
  if (!value) return fallback
  const v = String(value).toLowerCase()
  const found = CLASIFICACIONES.find((c) => c.value === v)
  if (found) return found.label
  return HISTORICOS[v] ?? value
}
