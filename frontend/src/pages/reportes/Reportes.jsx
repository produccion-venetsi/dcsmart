import { useState, useCallback } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { authApi } from '../../api/auth.js'
import { todayInputDate } from '../../lib/dates.js'
import ReportePagos from './ReportePagos.jsx'
import ReporteCajas from './ReporteCajas.jsx'
import ReporteCMV from './ReporteCMV.jsx'
import './reportes.css'

const ANALYTICS_URL = import.meta.env.VITE_ANALYTICS_URL || 'https://analisis.dcsmart.app'

function IcoSparkles() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/>
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"/>
    </svg>
  )
}
function IcoExternal() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

// Aritmética de día calendario sobre un 'YYYY-MM-DD', operando en UTC para no
// depender del huso del navegador de quien mira (el "hoy" ya viene en hora
// Argentina desde todayInputDate()).
function addDaysStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
function addMonthsStr(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10)
}

function getPresetRange(preset) {
  const hoy = todayInputDate()
  if (preset === '7d')  return { desde: addDaysStr(hoy, -6),   hasta: hoy }
  if (preset === '30d') return { desde: addDaysStr(hoy, -29),  hasta: hoy }
  if (preset === '12m') return { desde: addMonthsStr(hoy, -12), hasta: hoy }
  return { desde: hoy, hasta: hoy }
}

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d',  label: 'Últimos 7 días' },
  { key: '30d', label: 'Últimos 30 días' },
  { key: '12m', label: 'Últimos 12 meses' },
]

const TABS = [
  { key: 'pagos', label: 'Pagos' },
  { key: 'cajas', label: 'Cajas' },
  { key: 'cmv',   label: 'CMV' },
]

// Solo el reporte de Pagos permite elegir sobre qué campo de fecha se arma
// (igual que el filtro de la página de Pagos) -- Cajas/CMV siempre usan
// fecha_inicio, no tienen otro campo de fecha real para elegir.
const CAMPO_FECHA_OPTIONS = [
  { value: 'fecha',      label: 'Fecha' },
  { value: 'fecha_pago', label: 'Fecha de Pago' },
  { value: 'cashflow',   label: 'Cashflow' },
  { value: 'periodo',    label: 'Período' },
]

// Mismas 6 opciones que el filtro de Tipo en la tabla de Cajas (ver
// frontend/src/pages/cajas/CajaList.jsx, TIPOS_TURNO).
const TIPOS_TURNO = ['Mañana', 'Tarde', 'Noche', 'Trasnoche', 'Evento', 'Otros']

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

export default function Reportes() {
  const { activeApp, activeLocal, setActiveLocal } = useAppStore()
  const locales = activeApp?.locales ?? []
  const multiLocal = locales.length > 1

  const [tab, setTab] = useState('pagos')
  const [campoFecha, setCampoFecha] = useState('fecha')
  const [tipoTurno, setTipoTurno] = useState('')
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // Abre la Analytics App (dcsmart-analisis) con un ticket SSO de un solo uso
  // para no volver a loguearse. Si falla, abre el link igual para ver el error.
  const openAnalytics = async () => {
    if (analyticsLoading) return
    setAnalyticsLoading(true)
    try {
      const { data } = await authApi.analyticsTicket()
      const dest = new URL('/sso', ANALYTICS_URL)
      dest.searchParams.set('ticket', data.ticket)
      window.open(dest.toString(), '_blank', 'noopener')
    } catch {
      window.open(ANALYTICS_URL, '_blank', 'noopener')
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const initial = getPresetRange('30d')
  const [preset,  setPreset]  = useState('30d')
  const [desde,   setDesde]   = useState(initial.desde)
  const [hasta,   setHasta]   = useState(initial.hasta)
  const [applied, setApplied] = useState({ desde: initial.desde, hasta: initial.hasta })

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

  return (
    <div className="page">
      <div className="rep-breadcrumb">Reportes</div>
      <div className="rep-wrap">

        {/* ── Header with tabs ── */}
        <div className="rep-header">
          <div className="rep-header-left">
            <div className="rep-tabs">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={'rep-tab' + (tab === t.key ? ' active' : '')}
                  onClick={() => setTab(t.key)}
                >{t.label}</button>
              ))}
            </div>
          </div>
          {activeApp?.can_reportes && (
            <div className="rep-analytics-wrap">
              <button className="rep-analytics-btn" onClick={openAnalytics} disabled={analyticsLoading}>
                <IcoSparkles />
                <span>Analytics App</span>
                <IcoExternal />
              </button>
              <span className="rep-analytics-beta">beta</span>
            </div>
          )}
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
          <div className="rep-filters-main">
            <div className="rep-filters-row">
              {tab === 'pagos' && (
                <div className="rep-filter-col" style={{ maxWidth: 180 }}>
                  <div className="rep-filter-label">Tipo de fecha</div>
                  <div className="rep-date-input">
                    <select
                      value={campoFecha}
                      onChange={(e) => setCampoFecha(e.target.value)}
                      style={{ backgroundColor: 'transparent', border: 'none', outline: 'none', color: 'var(--t1)', fontSize: 15, fontWeight: 600, width: '100%', fontFamily: 'Montserrat, sans-serif', appearance: 'none', WebkitAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' stroke='rgba(240,237,232,0.55)' stroke-width='1.5' stroke-linecap='round' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', paddingRight: 16, cursor: 'pointer' }}
                    >
                      {CAMPO_FECHA_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {tab === 'cajas' && (
                <div className="rep-filter-col" style={{ maxWidth: 180 }}>
                  <div className="rep-filter-label">Tipo de turno</div>
                  <div className="rep-date-input">
                    <select
                      value={tipoTurno}
                      onChange={(e) => setTipoTurno(e.target.value)}
                      style={{ backgroundColor: 'transparent', border: 'none', outline: 'none', color: 'var(--t1)', fontSize: 15, fontWeight: 600, width: '100%', fontFamily: 'Montserrat, sans-serif', appearance: 'none', WebkitAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' stroke='rgba(240,237,232,0.55)' stroke-width='1.5' stroke-linecap='round' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', paddingRight: 16, cursor: 'pointer' }}
                    >
                      <option value="">Todos</option>
                      {TIPOS_TURNO.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
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
            </div>
            <div className="rep-presets">
              {PRESETS.map((p) => (
                <button key={p.key}
                  className={'rep-preset-btn' + (preset === p.key ? ' active' : '')}
                  onClick={() => handlePreset(p.key)}
                >{p.label}</button>
              ))}
            </div>
          </div>
          <div className="rep-filters-side">
            <button className="rep-generate-btn" onClick={handleGenerate}>
              <IcoArrowRight />
              Generar reporte
            </button>
          </div>
        </div>

        {/* ── Active report ── */}
        {tab === 'pagos' && (
          <ReportePagos applied={applied} activeLocal={activeLocal} campoFecha={campoFecha} />
        )}
        {tab === 'cajas' && (
          <ReporteCajas applied={applied} activeLocal={activeLocal} tipoTurno={tipoTurno} />
        )}
        {tab === 'cmv' && (
          <ReporteCMV applied={applied} activeLocal={activeLocal} />
        )}

      </div>
    </div>
  )
}
