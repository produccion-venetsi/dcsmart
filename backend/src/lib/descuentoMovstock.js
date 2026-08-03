// Descuento automático de MovStock.
//
// Cuando un local carga un MovStock, el importe va con un descuento fijo sobre
// el neto. Es 30% para todos salvo que el local tenga otro pactado, así que el
// 30 es el valor por defecto de la columna y cada local puede pisarlo.
//
// El descuento se calcula, no se escribe a mano: la persona carga el neto que
// dice el remito y el sistema descuenta. Va al campo `descuento` que el pago ya
// tiene, así el total sigue saliendo de la misma fórmula de siempre
// (neto + impuestos − descuento) y no hay dos maneras de llegar al importe.

export const DESCUENTO_MOVSTOCK_DEFAULT = 30

// Un porcentaje fuera de 0–100 no es un caso raro que convenga tolerar: 130%
// dejaría el importe en negativo y -10 lo subiría. Se rechaza y se dice por qué.
export function validarPorcentaje(valor) {
  if (valor === '' || valor === null || valor === undefined) {
    // Vaciar el campo devuelve el local al 30% general, que es lo que significa
    // "este local no tiene nada pactado aparte".
    return { ok: true, value: null }
  }

  const n = Number(valor)
  if (!Number.isFinite(n)) return { ok: false, error: 'Tiene que ser un número' }
  if (n < 0 || n > 100) return { ok: false, error: 'Tiene que estar entre 0 y 100' }

  // Dos decimales: alcanza para un 12,5% y evita guardar un 33,333333 que
  // después no cierra contra lo que se ve en pantalla.
  return { ok: true, value: Math.round(n * 100) / 100 }
}

// El porcentaje que le corresponde a un local. Sin nada configurado, el general.
export function porcentajeDelLocal(local) {
  const pct = local?.descuento_movstock
  return pct == null ? DESCUENTO_MOVSTOCK_DEFAULT : Number(pct)
}

// Monto a descontar sobre el neto. Redondeado a dos decimales porque es plata y
// termina en una columna Decimal(12,2): dejar más decimales hace que el total
// guardado no coincida con el que se mostró.
export function calcularDescuento(neto, porcentaje) {
  const n = Number(neto)
  const p = Number(porcentaje)
  if (!Number.isFinite(n) || !Number.isFinite(p) || n === 0 || p === 0) return 0
  return Math.round(n * p) / 100
}
