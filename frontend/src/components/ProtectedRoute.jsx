import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'
import { homeDeRol, HOME_POR_DEFECTO } from '../lib/roles.js'

// `roles`: si se pasa, solo esos roles (de la app activa) pueden entrar.
// `globalRoles`: independiente de la app activa -- evalúa TODAS las
//   asignaciones de rol del usuario (para zonas globales como Admin).
// `reportesOnly`: exige que la app activa tenga el permiso real de Reportes
//   (activeApp.can_reportes), no un nombre de rol.
// `cajaMayorOnly`: como reportesOnly pero para Caja Mayor, que es global (no
//   depende de la app activa): super_admin entra siempre, cualquier otro por
//   can_caja_mayor de my-apps (el override individual del módulo caja_mayor).
// `excludeRoles`: si el rol de la app activa está en esta lista, se lo manda a SU
//   home en vez de dejarlo pasar.
//
// El destino del rechazo sale de homeDeRol (lib/roles.js) y no de una ruta fija.
// Antes acá había un `<Navigate to="/reportes">` hardcodeado: servía mientras
// `reportes` era el único rol restringido, pero con `data_entry` habría mandado a
// los cargadores de datos a una pantalla de reportes que no pueden ver.
export default function ProtectedRoute({
  children, requireApp = true, roles = null,
  globalRoles = null, reportesOnly = false, cajaMayorOnly = false, excludeRoles = null
}) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const activeApp = useAppStore((s) => s.activeApp)

  if (!token) return <Navigate to="/login" replace />

  if (globalRoles) {
    const userRoleNames = (user?.user_app_roles ?? []).map(r => r.role?.nombre)
    if (!globalRoles.some(r => userRoleNames.includes(r))) return <Navigate to={HOME_POR_DEFECTO} replace />
    return children
  }

  // Se evalúa antes del requireApp: la ruta es global y el super_admin puede
  // entrar sin app activa (igual que antes con GlobalGuard roles={SUPER}).
  if (cajaMayorOnly) {
    const userRoleNames = (user?.user_app_roles ?? []).map(r => r.role?.nombre)
    if (userRoleNames.includes('super_admin') || activeApp?.can_caja_mayor) return children
    return <Navigate to={activeApp ? homeDeRol(activeApp.role) : HOME_POR_DEFECTO} replace />
  }

  if (requireApp && !activeApp) return <Navigate to="/select-app" replace />

  const home = homeDeRol(activeApp?.role)

  if (excludeRoles && excludeRoles.includes(activeApp?.role)) return <Navigate to={home} replace />
  if (reportesOnly && !activeApp?.can_reportes) return <Navigate to={home} replace />
  if (roles && !roles.includes(activeApp?.role)) return <Navigate to={home} replace />
  return children
}
