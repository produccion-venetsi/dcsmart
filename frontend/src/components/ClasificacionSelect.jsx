import { CLASIFICACIONES, normalizarClasificacion } from '../lib/clasificaciones.js'

// Selector de clasificación de un detalle de caja. Decide si el detalle suma,
// resta o no entra en la diferencia, así que el usuario lo elige a mano: al
// elegir un tipo se propone la clasificación de ese tipo, pero puede cambiarla.
//
// `compact` es para la fila de la tabla en modo edición, donde no hay lugar
// para el ancho completo del formulario.
export default function ClasificacionSelect({ value, onChange, compact = false, ayuda = false }) {
  // Una caja vieja puede traer 'canal' o 'medio_pago', que ya no son opciones:
  // se traducen al vigente para que el select no muestre otra cosa que la real.
  const actual = normalizarClasificacion(value)

  return (
    <>
      <div className="form-input-wrap">
        <select
          value={actual}
          onChange={(e) => onChange(e.target.value)}
          style={compact ? { maxWidth: 132 } : undefined}
        >
          {CLASIFICACIONES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      {ayuda && (
        <p className="td-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
          {CLASIFICACIONES.find((c) => c.value === actual)?.ayuda}
        </p>
      )}
    </>
  )
}
