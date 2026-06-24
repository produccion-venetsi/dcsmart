import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/Layout.jsx'
import { useAuthStore } from './store/authStore.js'

const Login         = lazy(() => import('./pages/Login.jsx'))
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
const Users         = lazy(() => import('./pages/admin/Users.jsx'))
const Apps          = lazy(() => import('./pages/admin/Apps.jsx'))
const Locales       = lazy(() => import('./pages/admin/Locales.jsx'))
const RubCat        = lazy(() => import('./pages/admin/RubCat.jsx'))
const MetodosPago   = lazy(() => import('./pages/admin/MetodosPago.jsx'))
const Roles         = lazy(() => import('./pages/admin/Roles.jsx'))
const DetalleTipos  = lazy(() => import('./pages/admin/DetalleTipos.jsx'))

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
  return <ProtectedRoute requireApp={false} roles={roles}>{children}</ProtectedRoute>
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
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"                  element={<Dashboard />} />
          <Route path="cajas"                      element={<CajaList />} />
          <Route path="cajas/:id"                  element={<CajaDetail />} />
          <Route path="pagos"                      element={<PagoList />} />
          <Route path="pagos/nuevo"                element={<PagoForm />} />
          <Route path="pagos/:id/editar"           element={<PagoForm />} />
          <Route path="pdp"                        element={<Guard roles={OPERATIVE}><PdpDashboard /></Guard>} />
          <Route path="proveedores"                element={<Guard roles={OPERATIVE}><ProveedorList /></Guard>} />
          <Route path="proveedores/nuevo"          element={<Guard roles={OPERATIVE}><ProveedorForm /></Guard>} />
          <Route path="proveedores/:id/editar"     element={<Guard roles={OPERATIVE}><ProveedorForm /></Guard>} />
          <Route path="reportes"                    element={<Guard roles={OPERATIVE}><Reportes /></Guard>} />
          <Route path="admin/users"                element={<Guard roles={SUPER}><Users /></Guard>} />
          <Route path="admin/apps"                 element={<Guard roles={ADMIN_PANEL}><Apps /></Guard>} />
          <Route path="admin/locales"              element={<Guard roles={ADMIN_PANEL}><Locales /></Guard>} />
          <Route path="admin/rubcat"               element={<Guard roles={SUPER}><RubCat /></Guard>} />
          <Route path="admin/metodos-pago"         element={<Guard roles={ADMIN_PANEL}><MetodosPago /></Guard>} />
          <Route path="admin/roles"                element={<Guard roles={SUPER}><Roles /></Guard>} />
          <Route path="admin/detalle-tipos"        element={<Guard roles={ADMIN_PANEL}><DetalleTipos /></Guard>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
