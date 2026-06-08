import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'
import { cajasApi } from '../api/cajas.js'
import { pagosApi } from '../api/pagos.js'

// hex colors for recharts (CSS vars don't work inside recharts props)
const C = {
  green:  '#4CAF7D',
  amber:  '#D4952A',
  purple: '#B5A7EA',
  teal:   '#34d399',
  orange: '#fb923c',
  gold:   '#E1CBA0',
  border: 'rgba(255,255,255,0.08)',
  t3:     'rgba(240,237,232,0.40)',
  t4:     'rgba(240,237,232,0.26)',
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})
const fmt = (n) => fmtCurrency.format(n)

function pad(n) { return String(n).padStart(2, '0') }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

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
    const d = new Date(now.getFullYear(), now.getMonth(), 1)
    return { desde: toDateStr(d), hasta: hoy }
  }
  if (preset === 'año') {
    const d = new Date(now.getFullYear(), 0, 1)
    return { desde: toDateStr(d), hasta: hoy }
  }
  if (preset === '12m') {
    const d = new Date(now)
    d.setFullYear(d.getFullYear() - 1)
    return { desde: toDateStr(d), hasta: hoy }
  }
  return { desde: hoy, hasta: hoy }
}

const currentMes = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
})()

const PRESETS = [
  { key: '12m',    label: 'Últ. 12 meses' },
  { key: 'año',    label: 'Este año' },
  { key: 'mes',    label: 'Este mes' },
  { key: 'hoy',    label: 'Hoy' },
]

/* ── icons ── */
function IcoCaja() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/>
      <line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  )
}
function IcoPagos() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
function IcoProveedor() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}
function IcoAdmin() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 0-14.14 0M4.93 19.07a10 10 0 0 0 14.14 0M12 2v2M12 20v2M2 12h2M20 12h2"/>
    </svg>
  )
}
function IcoCalendar() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IcoMapPin() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function IcoArrow() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  )
}
function IcoSwitch() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}
function IcoClock() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function IcoCash() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <circle cx="12" cy="12" r="3"/>
      <path d="M6 12H2M22 12h-4"/>
    </svg>
  )
}
function IcoTicket() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V22H4V12"/>
      <path d="M22 7H2v5h20V7z"/>
      <path d="M12 22V7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  )
}
function IcoWarning() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}
function IcoCheck() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IcoBarChart() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}

/* ── quick actions ── */
const QUICK_ACTIONS = [
  { to: '/cajas',       label: 'Cajas',       sub: 'Turnos y movimientos',    Icon: IcoCaja,      i: 0 },
  { to: '/pagos',       label: 'Pagos',       sub: 'Facturas y órdenes',      Icon: IcoPagos,     i: 1 },
  { to: '/proveedores', label: 'Proveedores', sub: 'Directorio de cuentas',   Icon: IcoProveedor, i: 2 },
  { to: '/admin/apps',  label: 'Administrar', sub: 'Apps, locales, usuarios', Icon: IcoAdmin,     i: 3 },
]

/* ── stat card ── */
function StatCard({ colorClass = '', Icon, label, value, sub, loading }) {
  return (
    <div className={`stat-card ${colorClass}`}>
      <div className="stat-icon"><Icon /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : value}
      </div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

/* ── chart tooltip ── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const pagados    = payload.find(p => p.dataKey === 'pagados')?.value   ?? 0
  const pendientes = payload.find(p => p.dataKey === 'pendientes')?.value ?? 0
  const [y, m]     = (label || '').split('-')
  const mesLabel   = y && m ? `${MESES[parseInt(m, 10) - 1]} ${y}` : label
  return (
    <div style={{
      background: '#0f1923', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'rgba(240,237,232,0.80)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#F0EDE8' }}>{mesLabel}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 9, height: 9, background: C.green, borderRadius: 2, flexShrink: 0 }} />
          <span>Pagados</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: C.green }}>{fmt(pagados)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 9, height: 9, background: C.amber, borderRadius: 2, flexShrink: 0 }} />
          <span>Pendientes</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: C.amber }}>{fmt(pendientes)}</span>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>Total</span>
          <span style={{ fontWeight: 700 }}>{fmt(pagados + pendientes)}</span>
        </div>
      </div>
    </div>
  )
}

/* ── pagos chart ── */
function PagosChart({ data, loading }) {
  if (loading) {
    return (
      <div className="chart-card">
        <div className="chart-head">
          <span className="chart-title">Pagos por mes</span>
        </div>
        <div className="chart-empty"><div className="spinner" /></div>
      </div>
    )
  }
  if (!data.length) {
    return (
      <div className="chart-card">
        <div className="chart-head">
          <span className="chart-title">Pagos por mes</span>
        </div>
        <div className="chart-empty">
          <IcoBarChart />
          <p>Sin datos para el período seleccionado</p>
        </div>
      </div>
    )
  }
  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">Pagos por mes</span>
        <div className="chart-legend">
          <div className="legend-item">
            <span className="legend-dot" style={{ background: C.green }} />
            Pagados
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: C.amber }} />
            Pendientes
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={28} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="mes"
            tickLine={false}
            axisLine={false}
            tick={{ fill: C.t3, fontSize: 11, fontFamily: 'Montserrat, system-ui, sans-serif', fontWeight: 600 }}
            tickFormatter={(v) => {
              const [, m] = v.split('-')
              return m ? MESES[parseInt(m, 10) - 1] : v
            }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)', radius: 6 }} />
          <Bar dataKey="pagados" stackId="a" fill={C.green} radius={[0, 0, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.mes} opacity={entry.mes === currentMes ? 0.45 : 1} />
            ))}
          </Bar>
          <Bar dataKey="pendientes" stackId="a" fill={C.amber} radius={[5, 5, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.mes} opacity={entry.mes === currentMes ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {data.some(d => d.mes === currentMes) && (
        <div style={{ fontSize: 10, color: C.t4, textAlign: 'right', marginTop: 6 }}>
          {MESES[parseInt(currentMes.split('-')[1], 10) - 1]} = mes en curso (datos parciales)
        </div>
      )}
    </div>
  )
}

function fmtDate() {
  return new Date().toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
}

/* ═══════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════ */
export default function Dashboard() {
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const { activeApp, activeLocal, setActiveLocal } = useAppStore()

  const locales    = activeApp?.locales ?? []
  const multiLocal = locales.length > 1
  const appNombre  = activeApp?.app?.nombre ?? '—'
  const firstName  = user?.nombre?.split(' ')[0] ?? ''

  // ── period state ──
  const initialRange = getPresetRange('12m')
  const [preset,        setPreset]        = useState('12m')
  const [desde,         setDesde]         = useState(initialRange.desde)
  const [hasta,         setHasta]         = useState(initialRange.hasta)
  const [appliedDesde,  setAppliedDesde]  = useState(initialRange.desde)
  const [appliedHasta,  setAppliedHasta]  = useState(initialRange.hasta)

  const pendingChange = desde !== appliedDesde || hasta !== appliedHasta

  const handlePreset = useCallback((key) => {
    const r = getPresetRange(key)
    setPreset(key)
    setDesde(r.desde)
    setHasta(r.hasta)
    setAppliedDesde(r.desde)
    setAppliedHasta(r.hasta)
  }, [])

  const handleDesde = (v) => { setDesde(v); setPreset('') }
  const handleHasta = (v) => { setHasta(v); setPreset('') }
  const handleApply = () => { setAppliedDesde(desde); setAppliedHasta(hasta) }

  // ── data state ──
  const [pagosStats, setPagosStats] = useState(null)
  const [cajaStats,  setCajaStats]  = useState(null)
  const [chartData,  setChartData]  = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (!appliedDesde || !appliedHasta) return
    setLoading(true)
    const ctrl   = new AbortController()
    const params = {
      desde: appliedDesde,
      hasta: appliedHasta,
      ...(activeLocal ? { id_local: activeLocal.id } : {})
    }

    Promise.all([
      pagosApi.stats(params, ctrl.signal),
      cajasApi.stats(params, ctrl.signal),
      pagosApi.chart(params, ctrl.signal),
    ])
      .then(([pRes, cRes, chRes]) => {
        setPagosStats(pRes.data)
        setCajaStats(cRes.data)
        setChartData(chRes.data)
      })
      .catch((err) => { if (!ctrl.signal.aborted) console.error(err) })
      .finally(() => setLoading(false))

    return () => ctrl.abort()
  }, [appliedDesde, appliedHasta, activeLocal?.id])

  // derived caja stats
  const totalRecaudado  = cajaStats?.total_recaudado  ?? 0
  const totalEfectivo   = cajaStats?.total_efectivo   ?? 0
  const countTurnos     = cajaStats?.count_turnos     ?? 0
  const totalTickets    = cajaStats?.total_tickets    ?? 0
  const totalComensales = cajaStats?.total_comensales ?? 0
  const pctEfectivo     = totalRecaudado > 0
    ? ((totalEfectivo / totalRecaudado) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="page">
      {/* ── header ── */}
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div className="page-head-left">
          <h1 className="page-title">Bienvenido, {firstName}</h1>
          <p className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoCalendar />
            {fmtDate()}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              useAppStore.getState().clearContext()
              navigate('/select-app')
            }}
          >
            <IcoSwitch />
            {appNombre}
          </button>
        </div>
      </div>

      {/* ── local selector ── */}
      {multiLocal && (
        <div className="selector-section">
          <div className="selector-label">
            <IcoMapPin />
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

      {/* ── period bar ── */}
      <div className="period-bar">
        <div className="period-pills">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              className={'period-pill' + (preset === key ? ' active' : '')}
              onClick={() => handlePreset(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="period-sep" />
        <input
          type="date"
          className="period-input"
          value={desde}
          max={hasta}
          onChange={(e) => handleDesde(e.target.value)}
        />
        <span style={{ color: 'var(--t4)', fontSize: 12 }}>→</span>
        <input
          type="date"
          className="period-input"
          value={hasta}
          min={desde}
          onChange={(e) => handleHasta(e.target.value)}
        />
        {pendingChange && (
          <button className="btn btn-primary btn-sm" onClick={handleApply}>
            Aplicar
          </button>
        )}
      </div>

      {/* ── pagos KPIs ── */}
      <div className="section-label">Pagos</div>
      <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
        <StatCard
          colorClass="gold"
          Icon={IcoPagos}
          label="Importe total"
          value={fmt(pagosStats?.importe_total ?? 0)}
          sub={`${pagosStats?.count_total ?? 0} comprobantes`}
          loading={loading}
        />
        <StatCard
          colorClass="amber"
          Icon={IcoWarning}
          label="Pendientes"
          value={fmt(pagosStats?.importe_pendientes ?? 0)}
          sub={`${pagosStats?.count_pendientes ?? 0} comprobantes`}
          loading={loading}
        />
        <StatCard
          colorClass="green"
          Icon={IcoCheck}
          label="Pagados"
          value={fmt(pagosStats?.importe_pagados ?? 0)}
          sub={`${pagosStats?.count_pagados ?? 0} comprobantes`}
          loading={loading}
        />
      </div>

      {/* ── cajas KPIs ── */}
      <div className="section-label">Cajas</div>
      <div className="stats-grid" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          colorClass="purple"
          Icon={IcoCaja}
          label="Total recaudado"
          value={fmt(totalRecaudado)}
          sub={`${countTurnos} turno${countTurnos !== 1 ? 's' : ''}`}
          loading={loading}
        />
        <StatCard
          colorClass="teal"
          Icon={IcoCash}
          label="Efectivo"
          value={fmt(totalEfectivo)}
          sub={`${pctEfectivo}% del total`}
          loading={loading}
        />
        <StatCard
          colorClass="orange"
          Icon={IcoTicket}
          label="Tickets / Comensales"
          value={(totalTickets + totalComensales).toLocaleString('es-AR')}
          sub={`${totalTickets} tickets · ${totalComensales} comensales`}
          loading={loading}
        />
      </div>

      {/* ── chart ── */}
      <PagosChart data={chartData} loading={loading} />

      {/* ── quick actions ── */}
      <div className="selector-label" style={{ marginBottom: 14 }}>Acceso rápido</div>
      <div className="quick-actions-grid">
        {QUICK_ACTIONS.map(({ to, label, sub, Icon, i }) => (
          <button
            key={to}
            className="quick-action-card"
            style={{ '--i': i }}
            onClick={() => navigate(to)}
          >
            <div className="qac-icon"><Icon /></div>
            <div>
              <div className="qac-title">{label}</div>
              <div className="qac-sub">{sub}</div>
            </div>
            <div className="qac-arrow"><IcoArrow /></div>
          </button>
        ))}
      </div>
    </div>
  )
}
