// La dirección que el TIPO de comprobante impone al pago.
//
// Una nota de crédito (NCA) es plata que el proveedor te acredita: SIEMPRE es
// un ingreso. Una nota de débito (NDA) es al revés. No es una preferencia de
// carga: es la definición del comprobante — y en producción había 272 NCA
// cargadas como egreso sumando $10M de gasto fantasma (2026-08-20).
//
// El resto de los tipos (A, B, C...) no fija dirección: la elige quien carga.

export function direccionPorTipo(idTipo) {
  if (idTipo === 'NCA' || idTipo === 'NCB') return true   // ingreso
  if (idTipo === 'NDA' || idTipo === 'NDB') return false  // egreso
  return null // el tipo no manda: vale lo que se cargó
}

// El importe con el signo de su dirección, para TOTALIZAR como gasto: un
// egreso suma, un ingreso (nota de crédito, reintegro) resta. Los montos se
// guardan siempre positivos y la dirección aparte — regla del proyecto.
export function importeFirmado(pago) {
  const monto = Number(pago?.importe ?? 0)
  return pago?.ingresa_egreso === true ? -monto : monto
}

// El mismo criterio para SQL crudo: úsese en lugar de SUM(p.importe) en toda
// agregación de gasto. `p` tiene que ser el alias de la tabla pagos.
export const SQL_IMPORTE_FIRMADO =
  `CASE WHEN p.ingresa_egreso THEN -COALESCE(p.importe, 0) ELSE COALESCE(p.importe, 0) END`
