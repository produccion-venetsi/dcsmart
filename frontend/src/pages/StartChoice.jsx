import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import AppLogo from '../components/AppLogo.jsx'
import './auth.css'

const GLOBAL_ROLES = ['super_admin', 'dcsmart']

export default function StartChoice() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const roleNames = (user?.user_app_roles ?? []).map(r => r.role?.nombre)
  const hasGlobalRole = GLOBAL_ROLES.some(r => roleNames.includes(r))
  const isSuperAdmin = roleNames.includes('super_admin')

  // Sin rol global: nunca debería ver esta pantalla -- sigue directo al selector,
  // sin ningún flash visible (la redirección ocurre antes de pintar nada más).
  if (!hasGlobalRole) return <Navigate to="/select-app" replace />

  // super_admin entra directo a Usuarios; dcsmart no tiene esa ruta (solo super_admin),
  // así que entra por Apps -- primer panel de Admin al que sí tiene acceso.
  const adminLanding = isSuperAdmin ? '/admin/users' : '/admin/apps'

  return (
    <div className="auth-root">
      <div className="auth-grid-veil" />
      <main className="sel-main" style={{ justifyContent: 'center' }}>
        <div className="sel-heading">
          <AppLogo variant="horizontal" />
          <h1 style={{ marginTop: '1.5rem' }}>¿Qué querés hacer?</h1>
          <p>Elegí si querés administrar el sistema o entrar a operar un grupo</p>
        </div>
        <div className="app-grid" style={{ maxWidth: 640 }}>
          <button className="app-card" onClick={() => navigate(adminLanding)}>
            <div className="app-card-body">
              <h2>Administrar</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                Usuarios, apps, locales, roles y configuración global
              </p>
            </div>
          </button>
          <button className="app-card" onClick={() => navigate('/select-app')}>
            <div className="app-card-body">
              <h2>Entrar a un grupo</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                Operar Cajas, Pagos y Reportes de un grupo puntual
              </p>
            </div>
          </button>
        </div>
      </main>
    </div>
  )
}
