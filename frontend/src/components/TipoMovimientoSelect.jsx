import { TIPOS_MOVIMIENTO_ALTA, labelMovimiento } from '../lib/tiposMovimiento.js'

// Select de tipo de movimiento. Existe para que la lista de opciones viva en un
// solo lugar: estaba repetida a mano en siete lugares (alta y edición del drawer,
// del panel de edición y de la pantalla individual) y las siete ofrecían
// APERTURA y CIERRE, que el backend rechaza con 400.
//
// Muestra la etiqueta legible pero manda el valor del enum: el usuario elige
// "Vaciado" y viaja VACIADO.
export default function TipoMovimientoSelect({ value, onChange, className, style }) {
  return (
    <select
      className={className}
      style={style}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      {TIPOS_MOVIMIENTO_ALTA.map((tipo) => (
        <option key={tipo} value={tipo}>{labelMovimiento(tipo)}</option>
      ))}
    </select>
  )
}
