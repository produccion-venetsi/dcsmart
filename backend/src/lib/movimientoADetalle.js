// La regla de conversión del modelo simple: cómo un movimiento (tipo + método
// de pago) se vuelve un detalle de tres tipos (cobro / gasto / informativo).
//
// UNA sola definición, usada por:
//   - el script de migración que convierte los movimientos históricos
//   - el sync de TapTap (los turnos nuevos nacen ya como detalles)
//   - el sync de Fudo (ídem)
//
// Si la regla vive en tres lugares, diverge — es exactamente lo que pasó con el
// cuadre antes de lib/cuadreCaja.js.
//
// REGLAS (definidas por el usuario, 2026-08-19):
//   - COBRO            -> `cobro`, nombre = el método de pago.
//     EXCEPTO el cobro en Efectivo: su plata ya está en el campo caja.efectivo,
//     así que queda `informativo` para no contarla dos veces.
//   - GASTO / EGRESO   -> `gasto`, nombre "Gasto · <método>".
//   - INICIAL          -> `informativo`, "Fondo inicial".
//   - RETIRO           -> `informativo`, "Retiro".
//   - VACIADO          -> `informativo`, "Vaciado · <método>".
//   - INGRESO (y cualquier tipo desconocido) -> `informativo`, "Ingreso".

import { esEfectivo } from './cuadreCaja.js'

export const NOMBRE_EFECTIVO_INFORMATIVO = 'Efectivo (ya contado en el campo Efectivo)'

// `tipo` es el enum del movimiento (COBRO, GASTO...), `metodo` el NOMBRE del
// método de pago (o null: hay 61 movimientos sin método en prod — quedan con
// el nombre genérico de su tipo, no con "null" pegado en el string).
export function movimientoADetalle({ tipo, metodo }) {
  switch (tipo) {
    case 'COBRO':
      if (esEfectivo(metodo)) return { tipo: 'informativo', nombre: NOMBRE_EFECTIVO_INFORMATIVO }
      return { tipo: 'cobro', nombre: metodo ?? 'Cobro' }
    case 'GASTO':
    case 'EGRESO':
      return { tipo: 'gasto', nombre: metodo && !esEfectivo(metodo) ? `Gasto · ${metodo}` : 'Gasto' }
    case 'INICIAL':
      return { tipo: 'informativo', nombre: 'Fondo inicial' }
    case 'RETIRO':
      return { tipo: 'informativo', nombre: 'Retiro' }
    case 'VACIADO':
      return { tipo: 'informativo', nombre: metodo ? `Vaciado · ${metodo}` : 'Vaciado' }
    default:
      return { tipo: 'informativo', nombre: 'Ingreso' }
  }
}
