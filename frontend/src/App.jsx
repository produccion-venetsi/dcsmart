import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/Layout.jsx'
import { useAuthStore } from './store/authStore.js'

const Login         = lazy(() => import('./pages/Login.jsx'))
const StartChoice   = lazy(() => import('./pages/StartChoice.jsx'))
const AppSelector   = lazy(() => import('./pages/AppSelector.jsx'))
const Dashboard     = lazy(() => import('./pages/Dashboard.jsx'))
const CajaList      = lazy(() => import('./pages/cajas/CajaList.jsx'))
const CajaDetail    = lazy(() => import('./pages/cajas/CajaDetail.jsx'))
const PagoList      = lazy(() => import('./pages/pagos/PagoList.jsx'))
const PagoForm      = lazy(() => import('./pages/pagos/PagoForm.jsx'))
const PdpDashboard  = lazy(() => import('./pages/pdp/PdpDashboard.jsx'))
const ProveedorList = lazy(() => import('./pages/proveedores/ProveedorList.jsx'))
const ProveedorForm = lazy(() => import('./pages/proveedores/ProveedorForm.jsx'))
const Reportes      = lazy(() => import('./pages/reportes/Reportes.jsx'))
const Auditorias    = lazy(() => import('./pages/auditorias/Auditorias.jsx'))
const ActivityLog   = lazy(() => import('./pages/activity-log/ActivityLog.jsx'))
const Users         = lazy(() => import('./pages/admin/Users.jsx'))
const Apps          = lazy(() => import('./pages/admin/Apps.jsx'))
const Locales       = lazy(() => import('./pages/admin/Locales.jsx'))
const RubCat        = lazy(() => import('./pages/admin/RubCat.jsx'))
const MetodosPago   = lazy(() => import('./pages/admin/MetodosPago.jsx'))
const Roles         = lazy(() => import('./pages/admin/Roles.jsx'))
const DetalleTipos  = lazy(() => import('./pages/admin/DetalleTipos.jsx'))
const ArqueoList    = lazy(() => import('./pages/arqueo/ArqueoList.jsx'))

function PageFallback() {
  return (
    <div className="page-loading">
      <div className="spinner" />
    </div>
  )
}

// Grupos de roles para guardar rutas
const SUPER       = ['super_admin']
const ADMIN_PANEL = ['super_admin', 'dcsmart']
const OPERATIVE   = ['super_admin', 'dcsmart', 'admin']

// Guard de rol dentro del Layout: la app ya está garantizada por el ProtectedRoute padre.
function Guard({ roles, children }) {
  return <ProtectedRoute requireApp roles={roles}>{children}</ProtectedRoute>
}
// Dashboard/Cajas/Pagos: requieren app activa, pero el rol "reportes"
// (restringido a Reportes) no puede entrar -- se lo manda a /reportes.
function OperativeGuard({ children }) {
  return <ProtectedRoute requireApp excludeRoles={['reportes']}>{children}</ProtectedRoute>
}
// Reportes: requiere app activa + el permiso real (no el nombre del rol).
function ReportesGuard({ children }) {
  return <ProtectedRoute requireApp reportesOnly>{children}</ProtectedRoute>
}
// Zonas globales (Admin): independientes de la app activa -- evalúa TODAS
// las asignaciones de rol del usuario, no la app elegida.
function GlobalGuard({ roles, children }) {
  return <ProtectedRoute requireApp={false} globalRoles={roles}>{children}</ProtectedRoute>
}

export default function App() {
  const token = useAuthStore((s) => s.token)
  const refreshUser = useAuthStore((s) => s.refreshUser)

  // Sincroniza roles/datos del usuario al iniciar la app si hay sesión activa
  useEffect(() => {
    if (token) refreshUser()
  }, [])

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/start"
          element={
            <ProtectedRoute requireApp={false}>
              <StartChoice />
            </ProtectedRoute>
          }
        />
        <Route
          path="/select-app"
          element={
            <ProtectedRoute requireApp={false}>
              <AppSelector />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute requireApp={false}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"                  element={<OperativeGuard><Dashboard /></OperativeGuard>} />
          <Route path="cajas"                      element={<OperativeGuard><CajaList /></OperativeGuard>} />
          <Route path="cajas/:id"                  element={<OperativeGuard><CajaDetail /></OperativeGuard>} />
          <Route path="pagos"                      element={<OperativeGuard><PagoList /></OperativeGuard>} />
          <Route path="pagos/nuevo"                element={<OperativeGuard><PagoForm /></OperativeGuard>} />
          <Route path="pagos/:id/editar"           element={<OperativeGuard><PagoForm /></OperativeGuard>} />
          <Route path="pdp"                        element={<Guard roles={OPERATIVE}><PdpDashboard /></Guard>} />
          <Route path="proveedores"                element={<Guard roles={OPERATIVE}><ProveedorList /></Guard>} />
          <Route path="proveedores/nuevo"          element={<Guard roles={OPERATIVE}><ProveedorForm /></Guard>} />
          <Route path="proveedores/:id/editar"     element={<Guard roles={OPERATIVE}><ProveedorForm /></Guard>} />
          <Route path="reportes"                    element={<ReportesGuard><Reportes /></ReportesGuard>} />
          <Route path="arqueo"                      element={<OperativeGuard><ArqueoList /></OperativeGuard>} />
          <Route path="auditorias"                  element={<GlobalGuard roles={SUPER}><Auditorias /></GlobalGuard>} />
          <Route path="actividad"                   element={<GlobalGuard roles={SUPER}><ActivityLog /></GlobalGuard>} />
          <Route path="admin/users"                element={<GlobalGuard roles={SUPER}><Users /></GlobalGuard>} />
          <Route path="admin/apps"                 element={<GlobalGuard roles={ADMIN_PANEL}><Apps /></GlobalGuard>} />
          <Route path="admin/locales"              element={<GlobalGuard roles={ADMIN_PANEL}><Locales /></GlobalGuard>} />
          <Route path="admin/rubcat"               element={<GlobalGuard roles={SUPER}><RubCat /></GlobalGuard>} />
          <Route path="admin/metodos-pago"         element={<GlobalGuard roles={ADMIN_PANEL}><MetodosPago /></GlobalGuard>} />
          <Route path="admin/roles"                element={<GlobalGuard roles={SUPER}><Roles /></GlobalGuard>} />
          <Route path="admin/detalle-tipos"        element={<GlobalGuard roles={ADMIN_PANEL}><DetalleTipos /></GlobalGuard>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
