import { useState, useCallback, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { useAppStore } from '../../store/appStore.js'
import { reportesApi } from '../../api/reportes.js'
import './reportes.css'

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})
const fmt = (n) => fmtCurrency.format(n)

function pad(n) { return String(n).padStart(2, '0') }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function prettyDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  const mon = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][+m - 1]
  return `${+d} ${mon} ${y}`
}

function getPresetRange(preset) {
  const now = new Date()
  const hoy = toDateStr(now)
  if (preset === 'hoy') return { desde: hoy, hasta: hoy }
  if (preset === 'semana') {
    const d = new Date(now)
    const day = d.getDay()
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
    return { desde: toDateStr(d), hasta: hoy }
  }
  if (preset === 'mes') {
    return { desde: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: hoy }
  }
  if (preset === 'trimestre') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 3)
    return { desde: toDateStr(d), hasta: hoy }
  }
  return { desde: hoy, hasta: hoy }
}

const PRESETS = [
  { key: 'hoy',       label: 'Hoy' },
  { key: 'semana',    label: 'Semana' },
  { key: 'mes',       label: 'Mes' },
  { key: 'trimestre', label: 'Trimestre' },
]

function IcoCalendar() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3FB6BD" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="4.5" width="18" height="17" rx="2.5"/>
      <path d="M3 9h18M8 2.5v4M16 2.5v4"/>
    </svg>
  )
}
function IcoArrowRight() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#062b2e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  )
}
function IcoTrendUp() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#5FC98C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8M21 7v5M21 7h-5"/>
    </svg>
  )
}
function IcoZ() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3FB6BD" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2"/>
      <path d="M8 8h8l-8 8h8"/>
    </svg>
  )
}
function IcoTicket() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D8B98C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M4 12h16M4 17h10"/>
    </svg>
  )
}
function IcoTrendDown() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#E0938C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l6 6 4-4 8 8M21 17v-5M21 17h-5"/>
    </svg>
  )
}

function SalesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: 'rgba(30,43,58,.95)', border: '1px solid rgba(201,176,134,.18)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#ECEAE6',
      boxShadow: '0 8px 24px rgba(0,0,0,.5)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d?.label}</div>
      <div style={{ color: '#3FB6BD', fontWeight: 600 }}>{fmt(d?.total ?? 0)}</div>
    </div>
  )
}

function PayTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: 'rgba(30,43,58,.95)', border: '1px solid rgba(201,176,134,.18)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#ECEAE6',
      boxShadow: '0 8px 24px rgba(0,0,0,.5)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d?.name}</div>
      <div style={{ fontWeight: 600 }}>{fmt(d?.val ?? 0)}</div>
      <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{d?.pct}%</div>
    </div>
  )
}

export default function Reportes() {
  const { activeApp, activeLocal, setActiveLocal } = useAppStore()
  const locales = activeApp?.locales ?? []
  const multiLocal = locales.length > 1

  const initial = getPresetRange('mes')
  const [preset,  setPreset]  = useState('mes')
  const [desde,   setDesde]   = useState(initial.desde)
  const [hasta,   setHasta]   = useState(initial.hasta)
  const [applied, setApplied] = useState({ desde: initial.desde, hasta: initial.hasta })
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const handlePreset = useCallback((key) => {
    const r = getPresetRange(key)
    setPreset(key)
    setDesde(r.desde)
    setHasta(r.hasta)
    setApplied({ desde: r.desde, hasta: r.hasta })
  }, [])

  const handleGenerate = useCallback(() => {
    setPreset('')
    setApplied({ desde, hasta })
  }, [desde, hasta])

  useEffect(() => {
    setData(null)
    setLoading(true)
    const ctrl = new AbortController()
    const params = {
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal ? { id_local: activeLocal.id } : {})
    }
    reportesApi.get(params, ctrl.signal)
      .then((res) => setData(res.data))
      .catch((err) => { if (!ctrl.signal.aborted) console.error(err) })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied.desde, applied.hasta, activeLocal?.id])

  const kpi       = data?.kpi ?? {}
  const secondary = data?.secondary ?? []
  const weekly    = data?.weekly ?? []
  const fiscal    = data?.fiscal ?? {}
  const payments  = data?.payments ?? []
  const payTotal  = data?.pay_total ?? 0

  const fiscalPct = kpi.total_ventas > 0
    ? Math.round((fiscal.fiscal / kpi.total_ventas) * 100) : 0

  const skel = loading || !data

  return (
    <div className="page">
      <div className="rep-breadcrumb">Reportes — Pagos y cajas por período</div>
      <div className="rep-wrap">

        {/* ── Header ── */}
        <div className="rep-header">
          <div className="rep-header-left">
            <div className="rep-header-titles">
              <div className="rep-supertitle">Reportes</div>
              <div className="rep-title">Pagos y cierres de caja</div>
            </div>
          </div>
        </div>

        {/* ── Local selector ── */}
        {multiLocal && (
          <div className="selector-section" style={{ marginBottom: 16 }}>
            <div className="selector-label">
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              Local activo
            </div>
            <div className="selector-pills">
              <button
                className={'selector-pill' + (!activeLocal ? ' active' : '')}
                onClick={() => setActiveLocal(null)}
              >
                {!activeLocal && <span className="selector-pill-dot" />}
                Todos los locales
              </button>
              {locales.map((local) => {
                const isActive = activeLocal?.id === local.id
                return (
                  <button
                    key={local.id}
                    className={'selector-pill' + (isActive ? ' active' : '')}
                    onClick={() => setActiveLocal(local)}
                  >
                    {isActive && <span className="selector-pill-dot" />}
                    {local.nombre}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Filter bar ── */}
        <div className="rep-filters">
          <div className="rep-filter-col">
            <div className="rep-filter-label">Inicio</div>
            <div className="rep-date-input">
              <IcoCalendar />
              <input type="date" value={desde} max={hasta}
                onChange={(e) => { setDesde(e.target.value); setPreset('') }} />
            </div>
          </div>
          <div className="rep-filter-col">
            <div className="rep-filter-label">Fin</div>
            <div className="rep-date-input">
              <IcoCalendar />
              <input type="date" value={hasta} min={desde}
                onChange={(e) => { setHasta(e.target.value); setPreset('') }} />
            </div>
          </div>
          <div className="rep-presets">
            {PRESETS.map((p) => (
              <button key={p.key}
                className={'rep-preset-btn' + (preset === p.key ? ' active' : '')}
                onClick={() => handlePreset(p.key)}
              >{p.label}</button>
            ))}
          </div>
          <button className="rep-generate-btn" onClick={handleGenerate}>
            <IcoArrowRight />
            Generar reporte
          </button>
        </div>

        {/* ── Period chip ── */}
        <div className="rep-period">
          <span className="rep-period-label">Período analizado</span>
          <span className="rep-period-value">{prettyDate(applied.desde)} — {prettyDate(applied.hasta)}</span>
          <span className="rep-period-z">· {kpi.count_z ?? 0} cierres Z registrados</span>
        </div>

        {/* ── KPI cards ── */}
        <div className="rep-kpi-grid">
          <div className="rep-kpi hero">
            <div className="rep-kpi-head">
              <span className="rep-kpi-label">Total de ventas</span>
              <span className="rep-kpi-icon" style={{ background: 'rgba(95,201,140,.18)' }}><IcoTrendUp /></span>
            </div>
            {skel
              ? <div className="rep-skel" style={{ width: '70%', height: 42, marginBottom: 12 }} />
              : <div className="rep-kpi-value big">{fmt(kpi.total_ventas)}</div>}
            <div className="rep-kpi-sub">
              {!skel && kpi.pct_vs_anterior !== null && (
                <span className={Number(kpi.pct_vs_anterior) >= 0 ? 'up' : 'down'}>
                  {Number(kpi.pct_vs_anterior) >= 0 ? '↑' : '↓'} {Math.abs(Number(kpi.pct_vs_anterior))}%
                </span>
              )}
              <span>vs. período anterior</span>
            </div>
          </div>

          <div className="rep-kpi">
            <div className="rep-kpi-head">
              <span className="rep-kpi-label">Total Z</span>
              <span className="rep-kpi-icon" style={{ background: 'rgba(63,182,189,.16)' }}><IcoZ /></span>
            </div>
            {skel
              ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
              : <div className="rep-kpi-value med">{fmt(kpi.total_z)}</div>}
            <div className="rep-kpi-sub">{kpi.pct_z ?? 0}% del total · fiscal</div>
          </div>

          <div className="rep-kpi">
            <div className="rep-kpi-head">
              <span className="rep-kpi-label">Ticket promedio</span>
              <span className="rep-kpi-icon" style={{ background: 'rgba(206,172,129,.18)' }}><IcoTicket /></span>
            </div>
            {skel
              ? <div className="rep-skel" style={{ width: '55%', height: 32, marginBottom: 12 }} />
              : <div className="rep-kpi-value med">{fmt(kpi.ticket_promedio)}</div>}
            <div className="rep-kpi-sub">{kpi.cubiertos ?? 0} cubiertos servidos</div>
          </div>

          <div className="rep-kpi danger">
            <div className="rep-kpi-head">
              <span className="rep-kpi-label">Total adeudado</span>
              <span className="rep-kpi-icon" style={{ background: 'rgba(196,107,99,.2)' }}><IcoTrendDown /></span>
            </div>
            {skel
              ? <div className="rep-skel" style={{ width: '50%', height: 32, marginBottom: 12 }} />
              : <div className="rep-kpi-value med">{fmt(kpi.total_adeudado)}</div>}
            <div className="rep-kpi-sub">{kpi.pct_adeudado ?? 0}% de la facturación</div>
          </div>
        </div>

        {/* ── Secondary strip ── */}
        <div className="rep-secondary">
          {secondary.map((s, i) => (
            <div className="rep-secondary-item" key={i}>
              <span className="rep-secondary-label">{s.label}</span>
              <span className="rep-secondary-val" style={{ color: s.color }}>
                {typeof s.val === 'number' ? fmt(s.val) : s.val}
              </span>
            </div>
          ))}
        </div>

        {/* ── Charts row 1: Sales evolution + Fiscal donut ── */}
        <div className="rep-charts-row wide">
          <div className="rep-chart-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <div className="rep-chart-title">Evolución de ventas</div>
                <div className="rep-chart-sub">Facturación semanal en el período</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                <span style={{ width: 18, height: 3, borderRadius: 2, background: '#3FB6BD', display: 'inline-block' }} />
                Total ventas
              </div>
            </div>
            {skel ? (
              <div className="rep-skel" style={{ width: '100%', height: 230 }} />
            ) : weekly.length === 0 ? (
              <div style={{ height: 230, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.35)', fontSize: 13 }}>
                Sin datos para el período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={weekly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="repAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3FB6BD" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="#3FB6BD" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tickLine={false} axisLine={false}
                    tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 10, fontFamily: 'Montserrat' }} />
                  <YAxis tickLine={false} axisLine={false} width={60}
                    tick={{ fill: 'rgba(255,255,255,.3)', fontSize: 10, fontFamily: 'Montserrat' }}
                    tickFormatter={(v) => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                  <Tooltip content={<SalesTooltip />} />
                  <Area type="monotone" dataKey="total" stroke="#3FB6BD" strokeWidth={2.5}
                    fill="url(#repAreaGrad)" dot={{ r: 3, fill: '#19232f', stroke: '#3FB6BD', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rep-chart-card">
            <div className="rep-chart-title">Composición fiscal</div>
            <div className="rep-chart-sub">Distribución del total facturado</div>
            {skel ? (
              <div className="rep-skel" style={{ width: 152, height: 152, borderRadius: '50%', margin: '20px auto' }} />
            ) : (
              <>
                <div className="rep-donut-wrap">
                  <div style={{
                    width: 152, height: 152, borderRadius: '50%',
                    background: `conic-gradient(#159199 0 ${fiscalPct}%, #CEAC81 ${fiscalPct}% 100%)`,
                    display: 'grid', placeItems: 'center'
                  }}>
                    <div style={{
                      width: 104, height: 104, borderRadius: '50%', background: 'var(--bg-app)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>Fiscal</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 22, fontWeight: 700, color: '#F4F2EE', lineHeight: 1.1 }}>{fiscalPct}%</span>
                    </div>
                  </div>
                </div>
                <div className="rep-donut-legend">
                  <div className="rep-donut-row">
                    <span className="rep-donut-dot" style={{ background: '#159199' }} />
                    <span className="rep-donut-name">Z fiscal</span>
                    <span className="rep-donut-val">{fmt(fiscal.fiscal)}</span>
                  </div>
                  <div className="rep-donut-row">
                    <span className="rep-donut-dot" style={{ background: '#CEAC81' }} />
                    <span className="rep-donut-name">No fiscal</span>
                    <span className="rep-donut-val">{fmt(fiscal.no_fiscal)}</span>
                  </div>
                  <div className="rep-donut-sep" />
                  <div className="rep-donut-row">
                    <span className="rep-donut-dot" style={{ background: '#3FB6BD' }} />
                    <span className="rep-donut-name">Digitales</span>
                    <span className="rep-donut-val">{fmt(fiscal.digital)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Charts row 2: Payment bar chart + detail table ── */}
        <div className="rep-charts-row mid">
          <div className="rep-chart-card">
            <div className="rep-chart-title">Medios de pago</div>
            <div className="rep-chart-sub">Monto cobrado por medio en el período</div>
            {skel ? (
              <div className="rep-skel" style={{ width: '100%', height: 220 }} />
            ) : payments.length === 0 ? (
              <div style={{ height: 220, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.35)', fontSize: 13 }}>
                Sin datos
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={payments} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false}
                    tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 9, fontFamily: 'Montserrat' }}
                    interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tickLine={false} axisLine={false} width={60}
                    tick={{ fill: 'rgba(255,255,255,.3)', fontSize: 10, fontFamily: 'Montserrat' }}
                    tickFormatter={(v) => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                  <Tooltip content={<PayTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)', radius: 6 }} />
                  <Bar dataKey="val" radius={[5, 5, 0, 0]}>
                    {payments.map((p, i) => (
                      <Cell key={i} fill={p.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rep-chart-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span className="rep-chart-title" style={{ marginBottom: 0 }}>Detalle por medio</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>% del total</span>
            </div>
            {skel ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rep-skel" style={{ width: '100%', height: 36, marginBottom: 2 }} />
              ))
            ) : (
              <>
                {payments.map((p, i) => (
                  <div className="rep-pay-row" key={i}>
                    <span className="rep-pay-dot" style={{ background: p.color }} />
                    <span className="rep-pay-name">{p.name}</span>
                    <span className="rep-pay-amount">{fmt(p.val)}</span>
                    <span className="rep-pay-pct">{p.pct}%</span>
                  </div>
                ))}
                <div className="rep-pay-total">
                  <span>Total cobrado</span>
                  <span>{fmt(payTotal)}</span>
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
