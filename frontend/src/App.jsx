import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import ActualizarApp from './components/ActualizarApp.jsx'
import { ROLES, ROLES_DC, ROLES_OPERATIVOS, ROLES_RESTRINGIDOS } from './lib/roles.js'
import Layout from './components/Layout.jsx'
import { useAuthStore } from './store/authStore.js'
import { debeSincronizarUsuario } from './lib/sesionExpirada.js'

// Carga perezosa que se recupera del típico fallo post-deploy: el index.html
// viejo referencia un chunk hasheado que el build nuevo ya borró (404), el
// import() rechaza y -- sin esto -- se desmontaba todo dejando la pantalla en
// blanco/azul. Ante el fallo recargamos UNA vez (máx. cada 10s) para traer el
// index.html nuevo; si aun así falla, el error sube al ErrorBoundary.
function lazyWithReload(factory) {
  return lazy(() =>
    factory().catch((err) => {
      const KEY = 'chunk-reload-at'
      const last = Number(sessionStorage.getItem(KEY) || 0)
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()))
        window.location.reload()
        return new Promise(() => {}) // no resuelve: la página se está recargando
      }
      throw err
    })
  )
}

const Login         = lazyWithReload(() => import('./pages/Login.jsx'))
const StartChoice   = lazyWithReload(() => import('./pages/StartChoice.jsx'))
const AppSelector   = lazyWithReload(() => import('./pages/AppSelector.jsx'))
const Dashboard     = lazyWithReload(() => import('./pages/Dashboard.jsx'))
const CajaList      = lazyWithReload(() => import('./pages/cajas/CajaList.jsx'))
const CajaDetail    = lazyWithReload(() => import('./pages/cajas/CajaDetail.jsx'))
const PagoList      = lazyWithReload(() => import('./pages/pagos/PagoList.jsx'))
const PagoForm      = lazyWithReload(() => import('./pages/pagos/PagoForm.jsx'))
const PdpDashboard  = lazyWithReload(() => import('./pages/pdp/PdpDashboard.jsx'))
const ProveedorList = lazyWithReload(() => import('./pages/proveedores/ProveedorList.jsx'))
const ProveedorForm = lazyWithReload(() => import('./pages/proveedores/ProveedorForm.jsx'))
const ClienteList   = lazyWithReload(() => import('./pages/clientes/ClienteList.jsx'))
const ClienteForm   = lazyWithReload(() => import('./pages/clientes/ClienteForm.jsx'))
const ClienteCuenta = lazyWithReload(() => import('./pages/clientes/ClienteCuentaCorriente.jsx'))
const DocumentoList = lazyWithReload(() => import('./pages/documentos/DocumentoList.jsx'))
const Reportes      = lazyWithReload(() => import('./pages/reportes/Reportes.jsx'))
const Auditorias    = lazyWithReload(() => import('./pages/auditorias/Auditorias.jsx'))
const ActivityLog   = lazyWithReload(() => import('./pages/activity-log/ActivityLog.jsx'))
const CajaMayor     = lazyWithReload(() => import('./pages/caja-mayor/CajaMayor.jsx'))
const Users         = lazyWithReload(() => import('./pages/admin/Users.jsx'))
const Apps          = lazyWithReload(() => import('./pages/admin/Apps.jsx'))
const Locales       = lazyWithReload(() => import('./pages/admin/Locales.jsx'))
const RubCat        = lazyWithReload(() => import('./pages/admin/RubCat.jsx'))
const MetodosPago   = lazyWithReload(() => import('./pages/admin/MetodosPago.jsx'))
const Roles         = lazyWithReload(() => import('./pages/admin/Roles.jsx'))
const DetalleTipos  = lazyWithReload(() => import('./pages/admin/DetalleTipos.jsx'))
const ArqueoList    = lazyWithReload(() => import('./pages/arqueo/ArqueoList.jsx'))
const Avisos        = lazyWithReload(() => import('./pages/avisos/Avisos.jsx'))
const Cargar        = lazyWithReload(() => import('./pages/cargar/Cargar.jsx'))
const CajaNueva     = lazyWithReload(() => import('./pages/cajas/CajaNueva.jsx'))

function PageFallback() {
  return (
    <div className="page-loading">
      <div className="spinner" />
    </div>
  )
}

// Grupos de roles para guardar rutas. Salen de lib/roles.js para que agregar un
// rol sea un solo cambio y no una búsqueda por todo el frontend.
const SUPER       = [ROLES.SUPER]
const ADMIN_PANEL = ROLES_DC
const OPERATIVE   = ROLES_OPERATIVOS

// Guard de rol dentro del Layout: la app ya está garantizada por el ProtectedRoute padre.
function Guard({ roles, children }) {
  return <ProtectedRoute requireApp roles={roles}>{children}</ProtectedRoute>
}
// Dashboard/Cajas/Pagos: requieren app activa, pero los roles restringidos a una
// sola tarea (`reportes`, `data_entry`) no pueden entrar -- se los manda a su home
// (ver homeDeRol en lib/roles.js).
function OperativeGuard({ children }) {
  return <ProtectedRoute requireApp excludeRoles={ROLES_RESTRINGIDOS}>{children}</ProtectedRoute>
}
// Pantallas de carga: las ven los operativos, el cajero y data_entry. No usan
// OperativeGuard justamente porque data_entry tiene que poder entrar.
const CARGAN = [...ROLES_OPERATIVOS, ROLES.CAJERO, ROLES.DATA_ENTRY]
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

  // Sincroniza roles/datos del usuario al iniciar la app si hay sesión activa.
  //
  // Se exige el token del store Y el de localStorage: son dos copias distintas y
  // el interceptor manda al backend la de localStorage. Cuando quedaban
  // desincronizadas (persist de zustand con el token viejo, localStorage vacío),
  // esto pedía /auth/me sin Authorization, el 401 limpiaba y recargaba, zustand
  // rehidrataba el token viejo otra vez y volvía a entrar acá: recarga infinita,
  // sin poder ni loguearse. Ver lib/sesionExpirada.js.
  useEffect(() => {
    if (debeSincronizarUsuario(token, localStorage.getItem('token'))) refreshUser()
  }, [])

  return (
    <ErrorBoundary>
      {/* Fuera del Suspense y de las rutas: el aviso de versión nueva tiene que
          poder aparecer en cualquier pantalla, incluido el login. */}
      <ActualizarApp />
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
          {/* `cajas/nueva` va ANTES de `cajas/:id`: si no, :id la captura y se
              intenta abrir una caja con id "nueva". */}
          <Route path="cajas/nueva"                element={<Guard roles={CARGAN}><CajaNueva /></Guard>} />
          <Route path="cajas/:id"                  element={<OperativeGuard><CajaDetail /></OperativeGuard>} />
          <Route path="pagos"                      element={<OperativeGuard><PagoList /></OperativeGuard>} />
          <Route path="pagos/nuevo"                element={<Guard roles={CARGAN}><PagoForm /></Guard>} />
          <Route path="cargar"                     element={<Guard roles={[ROLES.DATA_ENTRY]}><Cargar /></Guard>} />
          {/* Avisos no exige app activa ni rol: son del usuario, no de la app. */}
          <Route path="avisos"                     element={<ProtectedRoute requireApp={false}><Avisos /></ProtectedRoute>} />
          <Route path="pagos/:id/editar"           element={<OperativeGuard><PagoForm /></OperativeGuard>} />
          <Route path="pdp"                        element={<Guard roles={OPERATIVE}><PdpDashboard /></Guard>} />
          <Route path="proveedores"                element={<Guard roles={OPERATIVE}><ProveedorList /></Guard>} />
          <Route path="proveedores/nuevo"          element={<Guard roles={OPERATIVE}><ProveedorForm /></Guard>} />
          <Route path="proveedores/:id/editar"     element={<Guard roles={OPERATIVE}><ProveedorForm /></Guard>} />
          {/* Clientes: a nombre de quién se generó un gasto, y su cuenta corriente.
              Mismo guard que Proveedores -- ROLES_OPERATIVOS son justo los que
              alcanzan todos los locales del grupo, y el saldo de un cliente los
              cruza. El cajero no entra acá pero sí puede elegir cliente al cargar
              un pago (tiene clientes:view). */}
          <Route path="clientes"                   element={<Guard roles={OPERATIVE}><ClienteList /></Guard>} />
          <Route path="clientes/nuevo"             element={<Guard roles={OPERATIVE}><ClienteForm /></Guard>} />
          <Route path="clientes/:id/editar"        element={<Guard roles={OPERATIVE}><ClienteForm /></Guard>} />
          <Route path="clientes/:id/cuenta-corriente" element={<Guard roles={OPERATIVE}><ClienteCuenta /></Guard>} />
          {/* Documentos: contratos, habilitaciones y demas, por grupo y local. Sin
              guard de rol -- el permiso del modulo `documentos` ya decide quien entra,
              y el cajero SI entra (ve los marcados como visibles para todos). */}
          <Route path="documentos"                 element={<DocumentoList />} />
          <Route path="reportes"                    element={<ReportesGuard><Reportes /></ReportesGuard>} />
          <Route path="arqueo"                      element={<OperativeGuard><ArqueoList /></OperativeGuard>} />
          <Route path="auditorias"                  element={<GlobalGuard roles={SUPER}><Auditorias /></GlobalGuard>} />
          <Route path="actividad"                   element={<GlobalGuard roles={SUPER}><ActivityLog /></GlobalGuard>} />
          {/* Caja Mayor es global a propósito: se ven todos los grupos juntos, sin
              depender de la app activa (ver routes/caja_mayor.js en el backend). */}
          <Route path="caja-mayor"                  element={<GlobalGuard roles={SUPER}><CajaMayor /></GlobalGuard>} />
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
    </ErrorBoundary>
  )
}
