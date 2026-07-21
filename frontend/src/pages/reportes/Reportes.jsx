import { useState, useCallback } from 'react'
import { useAppStore } from '../../store/appStore.js'
import ReportePagos from './ReportePagos.jsx'
import ReporteCajas from './ReporteCajas.jsx'
import ReporteCMV from './ReporteCMV.jsx'
import './reportes.css'

function pad(n) { return String(n).padStart(2, '0') }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function getPresetRange(preset) {
  const now = new Date()
  const hoy = toDateStr(now)
  if (preset === 'hoy') return { desde: hoy, hasta: hoy }
  if (preset === '7d') {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    return { desde: toDateStr(d), hasta: hoy }
  }
  if (preset === '30d') {
    const d = new Date(now)
    d.setDate(d.getDate() - 29)
    return { desde: toDateStr(d), hasta: hoy }
  }
  if (preset === '12m') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 12)
    return { desde: toDateStr(d), hasta: hoy }
  }
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
                      style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--t1)', fontSize: 15, fontWeight: 600, width: '100%', fontFamily: 'Montserrat, sans-serif' }}
                    >
                      {CAMPO_FECHA_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
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
          <ReporteCajas applied={applied} activeLocal={activeLocal} />
        )}
        {tab === 'cmv' && (
          <ReporteCMV applied={applied} activeLocal={activeLocal} />
        )}

      </div>
    </div>
  )
}
