import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useUiStore } from '../store/uiStore.js'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/cajas', label: 'Cajas', icon: '💰' },
  { to: '/pagos', label: 'Pagos', icon: '📄' },
  { to: '/proveedores', label: 'Proveedores', icon: '🏪' },
  { to: '/admin/apps', label: 'Apps', icon: '⚙️' },
  { to: '/admin/locales', label: 'Locales', icon: '📍' },
  { to: '/admin/users', label: 'Usuarios', icon: '👥' }
]

export default function Sidebar() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  if (!sidebarOpen) return null

  return (
    <aside style={{
      width: 220, minHeight: '100vh', background: '#1e40af',
      color: '#fff', display: 'flex', flexDirection: 'column',
      padding: '1rem 0', flexShrink: 0
    }}>
      <div style={{ padding: '0 1rem 1.5rem', fontWeight: 700, fontSize: '1.25rem' }}>
        DCSmart
      </div>

      <nav style={{ flex: 1 }}>
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 1rem', color: '#fff', textDecoration: 'none',
              background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderRadius: 4, margin: '0 0.5rem 0.25rem'
            })}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
        <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}>
          {user?.nombre}
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '0.4rem', background: 'rgba(255,255,255,0.15)',
            color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer'
          }}
        >
          Salir
        </button>
      </div>
    </aside>
  )
}
