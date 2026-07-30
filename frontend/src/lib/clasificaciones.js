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

// Valores anteriores que siguen apareciendo en cajas históricas, mapeados al
// vigente equivalente. Espejo de backend/src/lib/clasificaciones.js.
const EQUIVALENCIAS = {
  ingreso: 'cobro',
  medio_pago: 'cobro',
  egreso: 'gasto',
  canal: 'informativo',
  otro: 'informativo',
  calculo: 'informativo'
}

// La clasificación efectiva de un detalle: la que eligió el usuario en el
// detalle gana sobre la de su tipo, que solo es el valor propuesto. Mismo orden
// que rolDeDetalle() en el backend — si acá se invierte, la pantalla muestra una
// cosa y el cálculo hace otra.
export function clasificacionDeDetalle(detalle) {
  return detalle?.tipo ?? detalle?.detalle_tipo?.clasificacion ?? null
}

// Traduce cualquier valor (vigente o histórico) al vigente equivalente. Sirve
// para precargar un <select> que solo ofrece las tres opciones actuales sin que
// una caja vieja con 'canal' termine mostrando otra cosa.
export function normalizarClasificacion(valor, fallback = 'cobro') {
  if (!valor) return fallback
  const v = String(valor).toLowerCase()
  if (CLASIFICACIONES.some((c) => c.value === v)) return v
  return EQUIVALENCIAS[v] ?? fallback
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
  // Histórico: se muestra la etiqueta del vigente equivalente. Un valor que no
  // se reconoce se devuelve tal cual, para que se note en pantalla.
  const equiv = EQUIVALENCIAS[v]
  if (!equiv) return value
  return CLASIFICACIONES.find((c) => c.value === equiv)?.label ?? value
}
