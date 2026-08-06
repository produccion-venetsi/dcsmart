const MESES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function sumarMes(mes, delta) {
  const [anio, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(anio, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

// Selector de mes con flechas (‹ Julio 2026 ›), en vez del <input type="month">
// nativo: su selector de calendario lo pone el navegador/sistema operativo y no
// se puede restylear para combinar con el resto de la UI (oscura, con acentos
// dorados/teal). `value`/`min`/`max` son 'YYYY-MM'.
export default function MesPicker({ value, onChange, min, max }) {
  const [anio, m] = value.split('-').map(Number)
  const texto = `${MESES_NOMBRE[m - 1]} ${anio}`

  const anterior = sumarMes(value, -1)
  const siguiente = sumarMes(value, 1)
  const puedeRetroceder = !min || anterior >= min
  const puedeAvanzar = !max || siguiente <= max

  return (
    <div className="rep-date-input mes-picker">
      <button type="button" className="mes-picker-arrow" disabled={!puedeRetroceder}
        onClick={() => onChange(anterior)} aria-label="Mes anterior">‹</button>
      <span className="mes-picker-value">{texto}</span>
      <button type="button" className="mes-picker-arrow" disabled={!puedeAvanzar}
        onClick={() => onChange(siguiente)} aria-label="Mes siguiente">›</button>
    </div>
  )
}
