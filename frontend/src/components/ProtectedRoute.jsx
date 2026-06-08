import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'

export default function ProtectedRoute({ children, requireApp = true }) {
  const token = useAuthStore((s) => s.token)
  const activeApp = useAppStore((s) => s.activeApp)

  if (!token) return <Navigate to="/login" replace />
  if (requireApp && !activeApp) return <Navigate to="/select-app" replace />
  return children
}
