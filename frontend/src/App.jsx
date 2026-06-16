import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/Layout.jsx'

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

export default function App() {
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
          <Route path="pdp"                        element={<PdpDashboard />} />
          <Route path="proveedores"                element={<ProveedorList />} />
          <Route path="proveedores/nuevo"          element={<ProveedorForm />} />
          <Route path="proveedores/:id/editar"     element={<ProveedorForm />} />
          <Route path="admin/users"                element={<Users />} />
          <Route path="admin/apps"                 element={<Apps />} />
          <Route path="admin/locales"              element={<Locales />} />
          <Route path="admin/rubcat"               element={<RubCat />} />
          <Route path="admin/metodos-pago"         element={<MetodosPago />} />
          <Route path="admin/roles"                element={<Roles />} />
          <Route path="admin/detalle-tipos"        element={<DetalleTipos />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
