import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'

// `roles`: si se pasa, solo esos roles (de la app activa) pueden entrar; el resto
// se redirige al dashboard. Sin `roles`, cualquier usuario autenticado con app entra.
export default function ProtectedRoute({ children, requireApp = true, roles = null }) {
  const token = useAuthStore((s) => s.token)
  const activeApp = useAppStore((s) => s.activeApp)

  if (!token) return <Navigate to="/login" replace />
  if (requireApp && !activeApp) return <Navigate to="/select-app" replace />
  if (roles && !roles.includes(activeApp?.role)) return <Navigate to="/dashboard" replace />
  return children
}
