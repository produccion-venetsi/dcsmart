import { duracionTurno, cruzaDia, ticketPromedio } from '../lib/turnoInfo.js'

const fmt$ = (n) => Number(n ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

// Lee un valor de <input type="datetime-local"> ("2026-08-19T20:03") como fecha
// local. Sin cierre cargado devuelve null, que es distinto de una fecha inválida.
const leer = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

// Lo que pasa entre "Fecha Inicio" y "Fecha Cierre", dicho abajo de los dos
// campos mientras se cargan.
//
// Dos <input type="datetime-local"> pelados no dicen nada: nadie resta dos
// timestamps de memoria, y el error clásico —cargar el cierre del día anterior,
// o el mismo día cuando el turno cerró a las 3 AM— pasa desapercibido hasta que
// el arqueo del mes no cierra. Acá se ve al tipear.
export default function PistaTurno({ inicio, cierre }) {
  const a = leer(inicio)
  const b = leer(cierre)

  if (!a) {
    return <p className="form-hint" style={{ margin: '6px 0 0' }}>Cargá cuándo abrió el turno.</p>
  }
  if (!b) {
    return <p className="form-hint" style={{ margin: '6px 0 0' }}>Sin fecha de cierre: la caja queda como turno abierto.</p>
  }

  // Cierre anterior a la apertura: es un dato imposible, no una duración rara.
  // Se avisa fuerte porque es la causa de descuadres fantasma en el arqueo.
  if (b.getTime() < a.getTime()) {
    return (
      <p className="form-hint" style={{ margin: '6px 0 0', color: 'var(--red)', fontWeight: 600 }}>
        El cierre es anterior a la apertura. Revisá la fecha: así cargada, la caja no va a entrar en el arqueo del día.
      </p>
    )
  }

  const dur = duracionTurno(a, b)
  const nocturno = cruzaDia(a, b)

  return (
    <p className="form-hint" style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span>El turno duró <strong style={{ color: 'var(--t1)' }}>{dur}</strong>.</span>
      {nocturno && <span className="badge badge-muted">cierra al día siguiente</span>}
    </p>
  )
}

// El promedio por persona, calculado mientras se cargan total y comensales.
// Es el número que el dueño mira siempre y hoy se saca con calculadora; además
// delata un cero de más en el total apenas se tipea.
export function PistaPromedio({ total, comensales }) {
  const p = ticketPromedio(total, comensales)
  if (p == null) return null
  return (
    <p className="form-hint" style={{ margin: '4px 0 0' }}>
      Promedio por persona: <strong style={{ color: 'var(--t1)' }}>{fmt$(p)}</strong>
    </p>
  )
}
