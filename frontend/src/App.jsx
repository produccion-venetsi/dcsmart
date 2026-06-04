import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CajaList from './pages/cajas/CajaList.jsx'
import CajaDetail from './pages/cajas/CajaDetail.jsx'
import PagoList from './pages/pagos/PagoList.jsx'
import PagoForm from './pages/pagos/PagoForm.jsx'
import ProveedorList from './pages/proveedores/ProveedorList.jsx'
import ProveedorForm from './pages/proveedores/ProveedorForm.jsx'
import Users from './pages/admin/Users.jsx'
import Apps from './pages/admin/Apps.jsx'
import Locales from './pages/admin/Locales.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="cajas" element={<CajaList />} />
        <Route path="cajas/:id" element={<CajaDetail />} />
        <Route path="pagos" element={<PagoList />} />
        <Route path="pagos/nuevo" element={<PagoForm />} />
        <Route path="pagos/:id/editar" element={<PagoForm />} />
        <Route path="proveedores" element={<ProveedorList />} />
        <Route path="proveedores/nuevo" element={<ProveedorForm />} />
        <Route path="proveedores/:id/editar" element={<ProveedorForm />} />
        <Route path="admin/users" element={<Users />} />
        <Route path="admin/apps" element={<Apps />} />
        <Route path="admin/locales" element={<Locales />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
