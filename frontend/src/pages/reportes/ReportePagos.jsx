import { useState, useEffect } from 'react'
import { reportesApi } from '../../api/reportes.js'
import Donut from '../../components/Donut.jsx'

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})
const fmt = (n) => fmtCurrency.format(n)

function IcoTrendDown() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#E0938C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l6 6 4-4 8 8M21 17v-5M21 17h-5"/>
    </svg>
  )
}
function IcoCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5FC98C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  )
}
function IcoAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4952A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01"/>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    </svg>
  )
}
function IcoCash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3FB6BD" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
      <path d="M6 6v.01M18 18v-.01"/>
    </svg>
  )
}
function IcoWallet() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9B086" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
    </svg>
  )
}
function IcoLayers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5FC98C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
    </svg>
  )
}
export default function ReportePagos({ applied, activeLocal, campoFecha }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setData(null)
    setLoading(true)
    const ctrl = new AbortController()
    const params = {
      desde: applied.desde,
      hasta: applied.hasta,
      campo_fecha: campoFecha,
      ...(activeLocal ? { id_local: activeLocal.id } : {})
    }
    reportesApi.pagos(params, ctrl.signal)
      .then((res) => setData(res.data))
      .catch((err) => { if (!ctrl.signal.aborted) console.error(err) })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied.desde, applied.hasta, campoFecha, activeLocal?.id])

  const skel = loading || !data
  const d = data ?? {}

  return (
    <>
      {/* ── Dirección: lo que entra y lo que sale ──
          `ingresa_egreso` es la dirección de la operación; los importes son
          siempre positivos. Antes acá había una sola tarjeta "En efectivo" que
          sumaba las dos direcciones en un número, y ningún total de ingresos. */}
      <div className="rep-kpi-grid cols-4">
        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Total ingresos</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(95,201,140,.18)' }}><IcoCheck /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_ingresos)}</div>}
          <div className="rep-kpi-sub">operaciones que ingresan, en el período</div>
        </div>

        <div className="rep-kpi danger">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Total egresos</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(196,107,99,.2)' }}><IcoTrendDown /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_egresos)}</div>}
          <div className="rep-kpi-sub">operaciones que egresan, en el período</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">En efectivo</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(63,182,189,.16)' }}><IcoCash /></span>
          </div>
          {skel ? (
            <div className="rep-skel" style={{ width: '70%', height: 32, marginBottom: 12 }} />
          ) : (
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Ingresos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.efectivo?.ingresos)}</div>
              </div>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Egresos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.efectivo?.egresos)}</div>
              </div>
            </div>
          )}
          <div className="rep-kpi-sub">método de pago Efectivo</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Resto de las formas</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(201,176,134,.18)' }}><IcoWallet /></span>
          </div>
          {skel ? (
            <div className="rep-skel" style={{ width: '70%', height: 32, marginBottom: 12 }} />
          ) : (
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Ingresos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.resto?.ingresos)}</div>
              </div>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Egresos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.resto?.egresos)}</div>
              </div>
            </div>
          )}
          <div className="rep-kpi-sub">todo lo que no es efectivo, incluye sin método</div>
        </div>
      </div>

      {/* ── Deuda y auditoría ── */}
      <div className="rep-kpi-grid cols-4">
        <div className="rep-kpi danger">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Total adeudado</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(196,107,99,.2)' }}><IcoTrendDown /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_adeudado)}</div>}
          <div className="rep-kpi-sub">{d.count_adeudado ?? 0} pagos pendientes</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Auditados</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(95,201,140,.18)' }}><IcoCheck /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '40%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{d.count_auditados ?? 0}</div>}
          <div className="rep-kpi-sub">pagos auditados en el período</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">No auditados</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(212,149,42,.18)' }}><IcoAlert /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '40%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{d.count_no_auditados ?? 0}</div>}
          <div className="rep-kpi-sub">pagos sin auditar en el período</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Gastos</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(201,176,134,.18)' }}><IcoWallet /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_gastos)}</div>}
          <div className="rep-kpi-sub">total de egresos del período</div>
        </div>
      </div>

      {/* ── Pendientes por rubro ── */}
      <div className="rep-kpi-grid cols-4">
        <div className="rep-kpi" style={{ gridColumn: 'span 4' }}>
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Pendientes</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(212,149,42,.18)' }}><IcoAlert /></span>
          </div>
          {skel ? (
            <div className="rep-skel" style={{ width: '70%', height: 32, marginBottom: 12 }} />
          ) : (
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Impuestos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.pendientes_impuestos)}</div>
              </div>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Sueldos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.pendientes_sueldos)}</div>
              </div>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Proveedores</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.pendientes_proveedores)}</div>
              </div>
            </div>
          )}
          <div className="rep-kpi-sub">no pagados del período, excluye NCA/NCB y CMV</div>
        </div>
      </div>

      {/* ── Rubros: Impuestos / Sueldos / Resto ── */}
      <div className="rep-kpi-grid cols-4">
        <div className="rep-kpi" style={{ gridColumn: 'span 4' }}>
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Rubros</span>
          </div>
          {skel ? (
            <div className="rep-skel" style={{ width: '70%', height: 32, marginBottom: 12 }} />
          ) : (
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Impuestos</div>
                <div className="rep-kpi-value" style={{ fontSize: 20 }}>{fmt(d.total_impuestos)}</div>
              </div>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Sueldos</div>
                <div className="rep-kpi-value" style={{ fontSize: 20 }}>{fmt(d.total_sueldos)}</div>
              </div>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Resto</div>
                <div className="rep-kpi-value" style={{ fontSize: 20 }}>{fmt(d.total_resto)}</div>
              </div>
            </div>
          )}
          <div className="rep-kpi-sub">todos los egresos del período (pagados o no), sin CMV</div>
        </div>
      </div>

      {/* ── Rubros completos, en torta, separados por dirección ──
          Se dibujan hasta 7 gajos y la cola va a "Otros", que se puede desplegar
          para ver los rubros que quedaron agrupados. Ver components/Donut.jsx. */}
      <div className="rep-kpi-grid cols-2">
        {skel ? (
          <>
            <div className="rep-kpi"><div className="rep-skel" style={{ width: '100%', height: 170 }} /></div>
            <div className="rep-kpi"><div className="rep-skel" style={{ width: '100%', height: 170 }} /></div>
          </>
        ) : (
          <>
            <Donut titulo="Rubros — Egresos"  segmentos={d.rubros?.egresos}  vacioLabel="Sin egresos en el período" />
            <Donut titulo="Rubros — Ingresos" segmentos={d.rubros?.ingresos} vacioLabel="Sin ingresos en el período" />
          </>
        )}
      </div>
    </>
  )
}
