// Cómo se le explica al usuario que el número de un arqueo quedó viejo.
//
// El backend manda `recalculo: { comprobacion, cajas_tardias, difiere }`. Acá
// se traduce a una frase que diga QUÉ pasó y QUÉ number corresponde, sin pedirle
// a nadie que entienda de qué lado está el signo.

import { describirComprobacion } from './cuadreArqueo.js'

const fmt$ = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// El motivo, en términos de lo que el usuario hizo o vio pasar.
export function motivoDesactualizado({ cajas_tardias = 0 } = {}) {
  if (cajas_tardias === 1) return 'Se cargó 1 caja de este período después de cerrar el arqueo.'
  if (cajas_tardias > 1) return `Se cargaron ${cajas_tardias} cajas de este período después de cerrar el arqueo.`
  // Sin cajas tardías la diferencia viene de otro lado: una caja o un pago del
  // período que se editó después, o un arqueo calculado con el criterio viejo.
  return 'Cambiaron las cajas o los pagos de este período desde que se cerró el arqueo.'
}

// Qué diferencia corresponde hoy, dicha como la dice el resto de la pantalla
// ("Cuadra" / "Falta $X" / "Sobra $X").
export function resultadoRecalculado(recalculo) {
  if (!recalculo) return '—'
  const d = describirComprobacion(recalculo.comprobacion, { esPrimero: false })
  if (d.estado === 'cuadra') return 'Cuadra'
  return `${d.texto} ${fmt$(d.monto)}`
}

// Frase completa para el tooltip del badge y el cartel del detalle.
export function textoDesactualizado(recalculo) {
  if (!recalculo?.difiere) return ''
  return `${motivoDesactualizado(recalculo)} La diferencia que corresponde hoy es: ${resultadoRecalculado(recalculo)}.`
}
