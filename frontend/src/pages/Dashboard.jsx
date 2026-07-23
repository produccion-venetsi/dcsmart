import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'

function IcoCalendar() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IcoSwitch() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}
function IcoMapPin() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function IcoArrow() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  )
}
function IcoCaja() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  )
}
function IcoPagos() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
function IcoProveedor() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}
function IcoAdmin() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}
function IcoReportes() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-4"/>
    </svg>
  )
}


function fmtDate() {
  const d = new Date()
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
}

export default function Dashboard() {
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const { activeApp } = useAppStore()

  const appNombre = activeApp?.app?.nombre ?? '—'
  const firstName = user?.nombre?.split(' ')[0] ?? ''

  // Acceso rápido. "Reportes" solo si la app activa tiene el permiso.
  const quickActions = [
    { to: '/cajas',       label: 'Cajas',       sub: 'Turnos y movimientos',    Icon: IcoCaja },
    { to: '/pagos',       label: 'Pagos',       sub: 'Facturas y órdenes',      Icon: IcoPagos },
    { to: '/proveedores', label: 'Proveedores', sub: 'Directorio de cuentas',   Icon: IcoProveedor },
    ...(activeApp?.can_reportes ? [{ to: '/reportes', label: 'Reportes', sub: 'Pagos, cajas y CMV', Icon: IcoReportes }] : []),
    { to: '/admin/apps',  label: 'Administrar', sub: 'Apps, locales, usuarios', Icon: IcoAdmin },
  ]

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

      {/* ── quick actions ── */}
      <div className="selector-label" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <IcoMapPin />
        Acceso rápido
      </div>
      <div className="quick-actions-grid">
        {quickActions.map(({ to, label, sub, Icon }, i) => (
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
