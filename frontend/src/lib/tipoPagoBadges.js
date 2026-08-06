// Color de badge por Tipo de Comprobante (id_tipo del Pago). Vive acá y no en
// PagoList.jsx porque el PDP también lo usa (dashboard de PDP) y necesitan
// verse igual: un mismo tipo no puede ser azul en un lado y gris en el otro.
export const TIPO_BADGE = {
  A: 'badge-blue', B: 'badge-green', C: 'badge-muted', CM: 'badge-amber',
  'DC (1)': 'badge-purple', 'DC (2)': 'badge-purple',
  DC_1: 'badge-purple', DC_2: 'badge-purple',
  DDJJ: 'badge-red', FF: 'badge-purple', LF: 'badge-blue', M: 'badge-muted', NCA: 'badge-amber',
  NCB: 'badge-amber', NDA: 'badge-amber', ND: 'badge-amber', STK: 'badge-blue', X: 'badge-muted',
}
