// Los TRES estados de una caja, definidos por el usuario (2026-08-19):
//
//   correcto   -> diferencia 0 (con $1 de tolerancia por redondeo de Decimal)
//   menor      -> hasta $2.000: un vuelto, una propina, un redondeo
//   incorrecto -> más de $2.000: hay que revisarla
//
// Es UNA regla para todo el sistema: la pantalla de carga, el detalle, el
// listado y los reportes leen de acá. Si el umbral cambia, cambia en un solo
// lugar y todos cuentan lo mismo.

export const UMBRAL_MENOR = 2000
export const TOLERANCIA_CERO = 1

export function estadoDescuadre(diferencia) {
  if (diferencia === null || diferencia === undefined) return 'sin_total'
  const abs = Math.abs(Number(diferencia))
  if (!Number.isFinite(abs)) return 'sin_total'
  if (abs <= TOLERANCIA_CERO) return 'correcto'
  if (abs <= UMBRAL_MENOR) return 'menor'
  return 'incorrecto'
}

// Cómo se le dice a la persona, según el estado. El de "menor" es
// deliberadamente tranquilizador: a prueba de tontos también es no asustar
// por $1.230.
export function describirEstado(estado, diferencia) {
  const abs = Math.abs(Number(diferencia) || 0)
  const monto = `$${abs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  switch (estado) {
    case 'correcto':
      return { titulo: 'La caja cuadra', detalle: 'Todo lo que vendiste está explicado.', tono: 'ok' }
    case 'menor':
      return {
        titulo: `Descuadre menor: ${monto}`,
        detalle: 'Es un monto chico: puede ser un vuelto o una propina. Si no lo encontrás, guardá igual — queda marcado como menor.',
        tono: 'atencion',
      }
    case 'incorrecto':
      return {
        titulo: `Falta explicar ${monto}`,
        detalle: 'Es más que un redondeo: revisá si falta cargar una tarjeta, una app o algo que quedó a deber.',
        tono: 'alerta',
      }
    default:
      return { titulo: 'Falta cargar el total', detalle: 'Sin el total no se puede saber si la caja cierra.', tono: 'neutro' }
  }
}
