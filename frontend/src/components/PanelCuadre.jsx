// La columna derecha del diseño B+C: el cuadre siempre visible, con los tres
// estados, la cuenta desglosada, qué mirar primero y los gastos aparte.
//
// En escritorio va sticky al costado del formulario; en celular (ver las
// clases .bc-* en app.css) pasa arriba como banner fijo, compacto, con el
// desglose adentro de un <details> para no tapar la carga.

import { estadoDescuadre, describirEstado, UMBRAL_MENOR } from '../lib/estadoDescuadre.js'

const fmt$ = (n) =>
  `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TINTES = {
  correcto:   { bg: 'var(--green-bg)', border: 'var(--green-border)', color: 'var(--green)' },
  menor:      { bg: 'var(--amber-bg)', border: 'var(--amber-border)', color: 'var(--amber)' },
  incorrecto: { bg: 'var(--red-bg)',   border: 'var(--red-border)',   color: 'var(--red)' },
  sin_total:  { bg: 'var(--bg-card)',  border: 'var(--border)',       color: 'var(--t3)' },
}

const SEGMENTOS = [
  { id: 'correcto', label: 'correcto', sub: '$0' },
  { id: 'menor', label: 'menor', sub: `≤ $${UMBRAL_MENOR.toLocaleString('es-AR')}` },
  { id: 'incorrecto', label: 'incorrecto', sub: `> $${UMBRAL_MENOR.toLocaleString('es-AR')}` },
]

export default function PanelCuadre({ cuadre }) {
  if (!cuadre) return null
  const estado = cuadre.estado ?? estadoDescuadre(cuadre.diferencia)
  const leyenda = describirEstado(estado, cuadre.diferencia)
  const t = TINTES[estado] ?? TINTES.sin_total

  return (
    <div className="bc-panel">
      <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 16, padding: '16px 17px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: t.color }}>
          Cuadre del turno
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: t.color, margin: '3px 0 10px', lineHeight: 1.25 }}>
          {leyenda.titulo}
        </div>

        {/* semáforo con los umbrales a la vista */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 4 }} aria-hidden="true">
          {SEGMENTOS.map((s) => (
            <div key={s.id} style={{ flex: 1 }}>
              <div style={{ height: 5, borderRadius: 4, background: estado === s.id ? t.color : 'rgba(255,255,255,0.10)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginTop: 2, color: estado === s.id ? t.color : 'var(--t4)' }}>
                <span>{s.label}</span><span>{s.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* En celular el desglose queda plegado para no tapar el formulario;
            en escritorio el <details> arranca abierto vía CSS (.bc-panel). */}
        <details className="bc-desglose" open>
          <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--t2)', margin: '8px 0 6px', listStyle: 'none' }}>
            La cuenta ▾
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--t2)' }}>Vendiste</span><strong>{cuadre.total != null ? fmt$(cuadre.total) : '—'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--t2)' }}>Efectivo</span><strong>{fmt$(cuadre.efectivo)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--t2)' }}>+ Cobros</span><strong>{fmt$(cuadre.cobros)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${t.border}`, paddingTop: 6 }}>
              <span style={{ color: 'var(--t2)' }}>Explicado</span><strong>{fmt$(cuadre.esperado)}</strong>
            </div>
          </div>
        </details>

        <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--t2)', marginTop: 8 }}>{leyenda.detalle}</div>
      </div>

      {(estado === 'incorrecto' || estado === 'menor') && (
        <div className="bc-quemirar" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 15px', fontSize: 11.5, lineHeight: 1.55, color: 'var(--t2)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>Qué mirar primero</div>
          1. ¿Falta alguna tarjeta o app del turno?<br />
          2. ¿Quedó algo a deber o una mesa sin cerrar? Cargalo como cobro.<br />
          3. ¿El total está bien tipeado?
        </div>
      )}

      {cuadre.gastos > 0 && (
        <div className="bc-gastos" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '10px 15px', display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
          <span style={{ color: 'var(--t3)' }}>Gastos del cajón (aparte)</span>
          <strong>{fmt$(cuadre.gastos)}</strong>
        </div>
      )}
    </div>
  )
}
