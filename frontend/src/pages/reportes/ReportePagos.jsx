import { useState, useEffect } from 'react'
import { reportesApi } from '../../api/reportes.js'

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
export default function ReportePagos({ applied, activeLocal, prettyDate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setData(null)
    setLoading(true)
    const ctrl = new AbortController()
    const params = {
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal ? { id_local: activeLocal.id } : {})
    }
    reportesApi.pagos(params, ctrl.signal)
      .then((res) => setData(res.data))
      .catch((err) => { if (!ctrl.signal.aborted) console.error(err) })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied.desde, applied.hasta, activeLocal?.id])

  const skel = loading || !data
  const d = data ?? {}

  return (
    <>
      {/* ── Period chip ── */}
      <div className="rep-period">
        <span className="rep-period-label">Período analizado</span>
        <span className="rep-period-value">{prettyDate(applied.desde)} — {prettyDate(applied.hasta)}</span>
      </div>

      {/* ── KPI cards ── */}
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
            <span className="rep-kpi-label">En efectivo</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(63,182,189,.16)' }}><IcoCash /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '55%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_efectivo)}</div>}
          <div className="rep-kpi-sub">{d.count_efectivo ?? 0} pagos en efectivo</div>
        </div>
      </div>
    </>
  )
}
