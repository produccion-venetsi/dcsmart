// El cuadre de la caja mientras se carga, pegado arriba (sticky): es el banner
// del diseño B+C. En celular queda arriba de todo mientras se scrollea; en
// escritorio acompaña el formulario.
//
// Muestra los TRES estados del descuadre (correcto / menor / incorrecto) como
// semáforo, con el umbral a la vista, y el mensaje de cada estado sale de
// lib/estadoDescuadre.js — la misma regla que usan el backend y los reportes.
//
// El cálculo NO está acá: sale de lib/cuadreCaja.js, espejo del backend.

import { fmtMonto } from '../lib/cajaMayor.js'
import { estadoDescuadre, describirEstado, UMBRAL_MENOR } from '../lib/estadoDescuadre.js'

const SEGMENTOS = [
  { id: 'correcto', label: 'correcto', sub: '$0' },
  { id: 'menor', label: 'menor', sub: `hasta $${UMBRAL_MENOR.toLocaleString('es-AR')}` },
  { id: 'incorrecto', label: 'incorrecto', sub: `+ de $${UMBRAL_MENOR.toLocaleString('es-AR')}` },
]

const COLOR = {
  correcto: 'var(--green)',
  menor: 'var(--amber)',
  incorrecto: 'var(--red)',
  sin_total: 'var(--t3)',
}

export default function CuadreVivo({ cuadre, origin }) {
  if (!cuadre) return null
  const estado = cuadre.estado ?? estadoDescuadre(cuadre.diferencia)
  const leyenda = describirEstado(estado, cuadre.diferencia)
  // Clase histórica del cartel: verde/rojo/gris del CSS existente. "menor" usa
  // el tinte de alerta suave.
  const claseEstado = estado === 'correcto' ? 'cuadra' : estado === 'sin_total' ? 'sin-datos' : 'no-cuadra'

  return (
    <div className={`cuadre-vivo cuadre-vivo-sticky cuadre-${claseEstado}`} style={estado === 'menor' ? { background: 'var(--amber-bg)', borderColor: 'var(--amber-border)' } : undefined}>
      {/* La cuenta de la venta: efectivo + cobros. El gasto no participa (salió
          plata del cajón, no cambia lo vendido) y se informa aparte. */}
      <div className="cuadre-vivo-cuentas">
        <span>Efectivo <strong>{fmtMonto(cuadre.efectivo)}</strong></span>
        <span>+ Cobros <strong>{fmtMonto(cuadre.cobros)}</strong></span>
        <span className="cuadre-vivo-igual">= <strong>{fmtMonto(cuadre.esperado)}</strong></span>
        {cuadre.total != null && <span style={{ opacity: 0.75 }}>vs. vendido <strong>{fmtMonto(cuadre.total)}</strong></span>}
        {cuadre.gastos > 0 && <span style={{ opacity: 0.75 }}>· gastos aparte <strong>{fmtMonto(cuadre.gastos)}</strong></span>}
      </div>

      <div className="cuadre-vivo-estado" style={estado === 'menor' ? { color: 'var(--amber)' } : undefined}>
        <span className="cuadre-vivo-marca" aria-hidden="true">{estado === 'correcto' ? '✓' : estado === 'sin_total' ? '·' : '!'}</span>
        <strong>{leyenda.titulo}</strong>
      </div>

      {/* Semáforo de los tres estados, con el umbral a la vista. */}
      <div style={{ display: 'flex', gap: 4, marginTop: 7 }} aria-hidden="true">
        {SEGMENTOS.map((s) => (
          <div key={s.id} style={{ flex: 1 }}>
            <div style={{ height: 5, borderRadius: 4, background: estado === s.id ? COLOR[s.id] : 'rgba(255,255,255,0.10)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2, color: estado === s.id ? COLOR[s.id] : 'var(--t4)' }}>
              <span>{s.label}</span><span>{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* El mensaje del estado, en lenguaje llano. El de "menor" tranquiliza. */}
      <div className="cuadre-vivo-fuente" style={{ marginTop: 6 }}>{leyenda.detalle}</div>
    </div>
  )
}
