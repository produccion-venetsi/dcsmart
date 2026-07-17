import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'
import { useUiStore } from '../store/uiStore.js'
import { authApi } from '../api/auth.js'
import AppLogo from './AppLogo.jsx'

/* ── SVG icons ── */
function IcoDashboard() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  )
}
function IcoCaja() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/>
      <line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  )
}
function IcoPagos() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}
function IcoPdp() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="16 4 16 9 21 9"/>
      <path d="M8 13h6"/><path d="M8 17h4"/>
    </svg>
  )
}
function IcoArqueo() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="16" r="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}
function IcoProveedor() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}
function IcoReportes() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function IcoExternal() {
  return (
    <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}
function IcoApps() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 0-14.14 0"/>
      <path d="M4.93 19.07a10 10 0 0 0 14.14 0"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
    </svg>
  )
}
function IcoLocales() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function IcoUsers() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function IcoRubCat() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>
    </svg>
  )
}
function IcoMetodos() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
function IcoRoles() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}
function IcoImpuestos() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}
function IcoAuditorias() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}
function IcoTag() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  )
}
function IcoLogout() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

function initials(nombre) {
  if (!nombre) return '?'
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

// `roles`: qué roles ven cada ítem. Si se omite, lo ven todos.
const ALL = ['super_admin', 'dcsmart', 'admin', 'cajero']

const NAV_MAIN = [
  { to: '/dashboard',   label: 'Dashboard',   Icon: IcoDashboard, roles: ALL },
  { to: '/cajas',       label: 'Cajas',       Icon: IcoCaja,      roles: ALL },
  { to: '/pagos',       label: 'Pagos',       Icon: IcoPagos,     roles: ALL },
  { to: '/pdp',         label: 'PDP',         Icon: IcoPdp,       roles: ['super_admin', 'dcsmart', 'admin'] },
  { to: '/arqueo',      label: 'Arqueo',      Icon: IcoArqueo,    roles: ALL },
  { to: '/proveedores', label: 'Proveedores', Icon: IcoProveedor, roles: ['super_admin', 'dcsmart', 'admin'] },
  {
    key: 'reportes',
    to: import.meta.env.VITE_ANALYTICS_URL || 'https://analisis.dcsmart.app',
    label: 'Reportes', Icon: IcoReportes, external: true
  },
]

const NAV_ADMIN = [
  { to: '/admin/apps',          label: 'Apps',          Icon: IcoApps,    roles: ['super_admin'] },
  { to: '/admin/locales',       label: 'Locales',       Icon: IcoLocales, roles: ['super_admin'] },
  { to: '/admin/users',         label: 'Usuarios',      Icon: IcoUsers,   roles: ['super_admin'] },
  { to: '/admin/roles',         label: 'Roles',         Icon: IcoRoles,   roles: ['super_admin'] },
  { to: '/admin/rubcat',        label: 'Rubros/Cats',   Icon: IcoRubCat,  roles: ['super_admin'] },
  { to: '/admin/metodos-pago',  label: 'Métodos Pago',  Icon: IcoMetodos, roles: ['super_admin', 'dcsmart'] },
  { to: '/admin/detalle-tipos', label: 'Tipos Detalle', Icon: IcoTag,     roles: ['super_admin', 'dcsmart'] },
  { to: '/auditorias',          label: 'Auditorías',    Icon: IcoAuditorias, roles: ['super_admin'] },
]

export default function Sidebar() {
  const navigate  = useNavigate()
  const logout    = useAuthStore((s) => s.logout)
  const user      = useAuthStore((s) => s.user)
  const sidebarOpen    = useUiStore((s) => s.sidebarOpen)
  const mobileNavOpen  = useUiStore((s) => s.mobileNavOpen)
  const closeMobileNav = useUiStore((s) => s.closeMobileNav)
  const activeApp      = useAppStore((s) => s.activeApp)
  const activeLocal    = useAppStore((s) => s.activeLocal)
  const setActiveLocal = useAppStore((s) => s.setActiveLocal)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // Abre dcsmart-analisis con un ticket de SSO de un solo uso (60s) para que
  // el usuario no tenga que loguearse de nuevo ahí. Si falla (p. ej. el
  // usuario no tiene acceso habilitado), igual abre el link normal para que
  // vea el mensaje de error del login de esa plataforma.
  const openAnalytics = async (url) => {
    if (analyticsLoading) return
    setAnalyticsLoading(true)
    try {
      const { data } = await authApi.analyticsTicket()
      const dest = new URL('/sso', url)
      dest.searchParams.set('ticket', data.ticket)
      window.open(dest.toString(), '_blank', 'noopener')
    } catch {
      window.open(url, '_blank', 'noopener')
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleChangeApp = () => {
    closeMobileNav()
    useAppStore.getState().clearContext()
    navigate('/select-app')
  }

  // Colapsado: rail angosto solo con íconos. En mobile el off-canvas
  // siempre se muestra expandido, independiente de sidebarOpen.
  const collapsed = !sidebarOpen && !mobileNavOpen

  const locales    = activeApp?.locales ?? []
  const multiLocal = locales.length > 1
  const appName    = activeApp?.app?.nombre ?? activeApp?.nombre ?? 'DCSmart'

  const role       = activeApp?.role
  const isGlobal   = role === 'super_admin' || role === 'dcsmart'
  const isReportesOnly = role === 'reportes'

  const visibleFor = (item) => {
    if (item.key === 'reportes') return !!activeApp?.can_reportes
    return !item.roles || item.roles.includes(role)
  }
  const mainItems = isReportesOnly
    ? NAV_MAIN.filter(i => i.key === 'reportes')
    : NAV_MAIN.filter(visibleFor)

  // Admin: independiente de la app activa -- evalúa TODAS las asignaciones
  // de rol del usuario, no la app elegida (para cuando no hay app activa).
  const globalRoleNames = (user?.user_app_roles ?? []).map(r => r.role?.nombre)
  const adminItems = NAV_ADMIN.filter(item => !item.roles || item.roles.some(r => globalRoleNames.includes(r)))

  return (
    <>
      <div
        className={'sidebar-mobile-backdrop' + (mobileNavOpen ? ' open' : '')}
        onClick={closeMobileNav}
      />
      <aside className={'sidebar' + (mobileNavOpen ? ' mobile-open' : '') + (collapsed ? ' collapsed' : '')}>
      {/* Brand */}
      <div className="sidebar-brand">
        <AppLogo variant="horizontal" />
      </div>

      {/* App / Local context */}
      {activeApp && !collapsed && (
        <div className="sidebar-context">
          {isGlobal ? (
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: role === 'super_admin' ? 'var(--gold, #C9B086)' : '#a78bfa',
              marginBottom: 4, opacity: 0.9,
            }}>
              {role === 'super_admin' ? '● Super Admin' : '● DCSmart'} — Acceso global
            </div>
          ) : null}
          <div className="sidebar-app-name" style={isGlobal ? { fontSize: 12, color: 'var(--t2)', fontWeight: 500 } : {}}>
            {isGlobal ? `Viendo: ${appName}` : appName}
          </div>
          {multiLocal ? (
            <select
              className="sidebar-local-select"
              value={activeLocal?.id ?? ''}
              onChange={(e) => {
                const l = locales.find(x => x.id === e.target.value) ?? null
                setActiveLocal(l)
              }}
            >
              <option value="">Todos los locales</option>
              {locales.map(l => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          ) : activeLocal ? (
            <div className="sidebar-local-single">
              <span className="sidebar-local-dot" />
              {activeLocal.nombre}
            </div>
          ) : null}
          <button className="sidebar-change-link" onClick={handleChangeApp}>
            {isGlobal ? 'Cambiar vista' : 'Cambiar grupo'}
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        {mainItems.map(({ to, label, Icon, external }) => (
          external ? (
            <a
              key={to}
              href={to}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-item"
              onClick={(e) => { e.preventDefault(); closeMobileNav(); openAnalytics(to) }}
              title={collapsed ? label : undefined}
            >
              <Icon />
              <span className="nav-item-label">{label}</span>
              {!collapsed && <IcoExternal />}
            </a>
          ) : (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
              onClick={closeMobileNav}
              title={collapsed ? label : undefined}
            >
              <Icon />
              <span className="nav-item-label">{label}</span>
            </NavLink>
          )
        ))}

        {adminItems.length > 0 && (
          <>
            <div className="nav-section-label">Admin</div>
            {adminItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                title={collapsed ? label : undefined}
              >
                <Icon />
                <span className="nav-item-label">{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="sidebar-user">
        <div className="sidebar-user-avatar" title={collapsed ? user?.nombre : undefined}>
          {user?.avatar_url && !avatarFailed
            ? <img src={user.avatar_url} alt={user.nombre} onError={() => setAvatarFailed(true)} />
            : initials(user?.nombre)}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user?.nombre}</div>
        </div>
        <button className="sidebar-logout" onClick={handleLogout} title="Cerrar sesión">
          <IcoLogout />
        </button>
      </div>
      </aside>
    </>
  )
}
