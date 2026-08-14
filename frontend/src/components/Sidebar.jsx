import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'
import { useUiStore } from '../store/uiStore.js'
import { ROLES_TODOS, ROLES_OPERATIVOS, ROLES } from '../lib/roles.js'
import BotonTema from './BotonTema.jsx'
import { authApi } from '../api/auth.js'
import { avisosApi } from '../api/notificaciones.js'
import AppLogo from './AppLogo.jsx'
import { MODOS, modoACorregir, destinoDeModo, modoInicial } from '../lib/modoTrabajo.js'

// URL de dcsmart-costos (plataforma de costos, backend/base separados).
const COSTOS_URL = import.meta.env.VITE_COSTOS_URL || 'https://costos.dcsmart.app'
// URL de DC-PLATAFORMA (seguimiento de tareas por departamento, backend/base
// separados). Default a localhost: todavia no tiene deploy propio.
const TAREAS_URL = import.meta.env.VITE_TAREAS_URL || 'http://localhost:5173'

// Versión visible de la app. En producción se muestra solo la version de
// package.json (__APP_VERSION__); el commit corto (VITE_GIT_SHA) se agrega
// SOLO fuera de producción (dev/preview) para identificar el build exacto.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'
const IS_PROD = import.meta.env.VITE_APP_ENV === 'production'
const GIT_SHA = import.meta.env.VITE_GIT_SHA ? String(import.meta.env.VITE_GIT_SHA).slice(0, 7) : ''
const APP_VERSION_LABEL = `v${APP_VERSION}${(!IS_PROD && GIT_SHA) ? ' · ' + GIT_SHA : ''}`

/* ── SVG icons ── */
function IcoDashboard() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  )
}
function IcoCaja() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/>
      <line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  )
}
function IcoPagos() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}
function IcoPdp() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="16 4 16 9 21 9"/>
      <path d="M8 13h6"/><path d="M8 17h4"/>
    </svg>
  )
}
function IcoArqueo() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="16" r="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}
function IcoProveedor() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}
// Documentos: una hoja con la esquina doblada. Es el mismo dibujo que el tipo
// "documento" de IconoDocumento, para que el item del menu y las filas de la tabla se
// lean como lo mismo.
function IcoDocumentos() {
  return (
    <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

// Clientes: dos personas. Proveedor es una casa (a quién le pagamos), cliente es
// alguien a nombre de quien se generó un gasto.
function IcoClientes() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="3.5"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.5a4 4 0 0 1 0 7"/>
    </svg>
  )
}
function IcoReportes() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function IcoCalculator() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2"/>
      <line x1="8" y1="6" x2="16" y2="6"/>
      <line x1="8" y1="11" x2="8" y2="11.01"/>
      <line x1="12" y1="11" x2="12" y2="11.01"/>
      <line x1="16" y1="11" x2="16" y2="11.01"/>
      <line x1="8" y1="15" x2="8" y2="15.01"/>
      <line x1="12" y1="15" x2="12" y2="15.01"/>
      <line x1="16" y1="15" x2="16" y2="15.01"/>
      <line x1="8" y1="19" x2="8" y2="19.01"/>
      <line x1="12" y1="19" x2="12" y2="19.01"/>
      <line x1="16" y1="19" x2="16" y2="19.01"/>
    </svg>
  )
}
function IcoTareas() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M3 9h18"/>
      <path d="M8 2v4"/>
      <path d="M16 2v4"/>
      <path d="m8 15 2 2 4-4"/>
    </svg>
  )
}
function IcoApps() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 0-14.14 0"/>
      <path d="M4.93 19.07a10 10 0 0 0 14.14 0"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
    </svg>
  )
}
function IcoLocales() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function IcoUsers() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function IcoRubCat() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>
    </svg>
  )
}
function IcoMetodos() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
function IcoRoles() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}
function IcoImpuestos() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}
function IcoAuditorias() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}
function IcoActivity() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
}
// Caja fuerte: la caja mayor es donde se junta la plata que sale de los locales.
function IcoCajaMayor() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <circle cx="12" cy="12" r="3.5"/>
      <line x1="12" y1="4" x2="12" y2="8.5"/>
      <line x1="12" y1="15.5" x2="12" y2="20"/>
    </svg>
  )
}
function IcoTag() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  )
}
function IcoCampana() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
function IcoLogout() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

function initials(nombre) {
  if (!nombre) return '?'
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

// `roles`: qué roles ven cada ítem. Si se omite, lo ven todos.
const ALL = ROLES_TODOS

const NAV_MAIN = [
  { to: '/dashboard',   label: 'Dashboard',   Icon: IcoDashboard, roles: ALL },
  { to: '/cajas',       label: 'Cajas',       Icon: IcoCaja,      roles: ALL },
  { to: '/pagos',       label: 'Pagos',       Icon: IcoPagos,     roles: ALL },
  { to: '/pdp',         label: 'PDP',         Icon: IcoPdp,       roles: ROLES_OPERATIVOS },
  { to: '/arqueo',      label: 'Arqueo',      Icon: IcoArqueo,    roles: ALL },
  { to: '/proveedores', label: 'Proveedores', Icon: IcoProveedor, roles: ROLES_OPERATIVOS },
  { to: '/clientes',    label: 'Clientes',    Icon: IcoClientes,  roles: ROLES_OPERATIVOS },
  // Sin `roles`: lo ven todos. El permiso del modulo `documentos` decide quien entra, y
  // el cajero SI entra -- ve los marcados como visibles para todos.
  { to: '/documentos',  label: 'Documentos',  Icon: IcoDocumentos },
  // Reportes internos de la app de gestión (/reportes). El Analytics externo
  // se abre desde un botón dentro de esa pantalla, no desde el sidebar.
  { key: 'reportes', to: '/reportes', label: 'Reportes', Icon: IcoReportes },
  // Costos es OTRA app (backend/base separados): no navega con NavLink, abre
  // en pestaña nueva vía SSO (ver openCostos). Visible para todos — Costos
  // rechaza con 403 a quien no tenga grant habilitado del lado de Costos.
  { key: 'costos', label: 'Costos', Icon: IcoCalculator, external: true },
  // Tareas (DC-PLATAFORMA) es OTRA app tambien (backend/base separados),
  // mismo patron SSO que Costos. Visible para todos: el departamento
  // (o su ausencia) se resuelve del lado de Tareas, no aca.
  { key: 'tareas', label: 'Tareas', Icon: IcoTareas, external: true },
]

const NAV_ADMIN = [
  { to: '/admin/apps',          label: 'Apps',          Icon: IcoApps,    roles: ['super_admin'] },
  { to: '/admin/locales',       label: 'Locales',       Icon: IcoLocales, roles: ['super_admin'] },
  { to: '/admin/users',         label: 'Usuarios',      Icon: IcoUsers,   roles: ['super_admin'] },
  { to: '/admin/roles',         label: 'Roles',         Icon: IcoRoles,   roles: ['super_admin'] },
  { to: '/admin/rubcat',        label: 'Rubros/Cats',   Icon: IcoRubCat,  roles: ['super_admin'] },
  { to: '/admin/metodos-pago',  label: 'Métodos Pago',  Icon: IcoMetodos, roles: ['super_admin', 'dcsmart'] },
  { to: '/admin/detalle-tipos', label: 'Tipos Detalle', Icon: IcoTag,     roles: ['super_admin', 'dcsmart'] },
  { to: '/auditorias',          label: 'Auditorías',    Icon: IcoAuditorias, roles: ['super_admin'] },
  { to: '/actividad',           label: 'Actividad',     Icon: IcoActivity,   roles: ['super_admin'] },
  { to: '/caja-mayor',          label: 'Caja Mayor',    Icon: IcoCajaMayor,  roles: ['super_admin'] },
]

export default function Sidebar() {
  const navigate  = useNavigate()
  const logout    = useAuthStore((s) => s.logout)
  const user      = useAuthStore((s) => s.user)
  const sidebarOpen    = useUiStore((s) => s.sidebarOpen)
  const mobileNavOpen  = useUiStore((s) => s.mobileNavOpen)
  const closeMobileNav = useUiStore((s) => s.closeMobileNav)
  const activeApp      = useAppStore((s) => s.activeApp)
  const activeLocal    = useAppStore((s) => s.activeLocal)
  const setActiveLocal = useAppStore((s) => s.setActiveLocal)
  const modo           = useAppStore((s) => s.modo)
  const setModo        = useAppStore((s) => s.setModo)
  const location       = useLocation()
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [avisosSinLeer, setAvisosSinLeer] = useState(0)

  // Contador de avisos sin leer. Polling cada 60s, no websockets: para un aviso de
  // auditoria un minuto de demora no cambia nada, y no justifica una conexion
  // abierta. Con la pestana oculta no se pide nada, para no pegarle a la API de
  // fondo en las pestanas que quedan abiertas todo el dia.
  //
  // Y se pide tambien al volver a ser visible: si no, una pestana que arranca en
  // segundo plano se saltea el primer pedido y muestra el contador en cero hasta
  // que pase un minuto entero despues de que la miren.
  useEffect(() => {
    let cancelado = false
    const traer = () => {
      if (document.hidden) return
      avisosApi.list({ limit: 1 })
        // Se cuenta lo que falta HACER, no lo que falta leer: el aviso se marca leido
        // solo al abrirlo, asi que el contador viejo bajaba con solo mirar y dejaba de
        // avisar que la tarea seguia pendiente. `?? no_leidas` es el fallback si el
        // backend todavia no manda `pendientes`.
        .then((r) => { if (!cancelado) setAvisosSinLeer(r.data?.pendientes ?? r.data?.no_leidas ?? 0) })
        .catch(() => { /* sin contador no se rompe nada */ })
    }
    traer()
    const id = setInterval(traer, 60000)
    document.addEventListener('visibilitychange', traer)
    return () => {
      cancelado = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', traer)
    }
  }, [])

  // El modo arranca según lo guardado, o se deduce de si ya había un grupo elegido.
  useEffect(() => {
    if (modo == null) setModo(modoInicial(modo, { hayGrupo: Boolean(activeApp) }))
  }, [modo, activeApp, setModo])

  // Y se corrige si la ruta pertenece al otro modo: pasa con un link guardado o con
  // el botón atrás, y mostrar una pantalla que el menú niega es peor que cambiar.
  useEffect(() => {
    const corregido = modoACorregir(location.pathname, modo)
    if (corregido) setModo(corregido)
  }, [location.pathname, modo, setModo])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleChangeApp = () => {
    closeMobileNav()
    useAppStore.getState().clearContext()
    navigate('/select-app')
  }

  // Abre dcsmart-costos con un ticket SSO de un solo uso para no volver a
  // loguearse. Si falla, abre el link igual para ver el error (calcado de
  // openAnalytics en pages/reportes/Reportes.jsx).
  const openCostos = async () => {
    try {
      // Se manda el local activo para que Costos abra en el mismo local y no
      // haya que volver a elegirlo. Si no hay ninguno, Costos lo pide.
      const { data } = await authApi.costosTicket(activeLocal?.id)
      const dest = new URL('/sso', COSTOS_URL)
      dest.searchParams.set('ticket', data.ticket)
      window.open(dest.toString(), '_blank', 'noopener')
    } catch {
      window.open(COSTOS_URL, '_blank', 'noopener')
    }
  }

  // Abre DC-PLATAFORMA (seguimiento de tareas por departamento) con un ticket
  // SSO de un solo uso -- mismo patron que openCostos.
  const openTareas = async () => {
    try {
      const { data } = await authApi.tareasTicket()
      const dest = new URL('/sso', TAREAS_URL)
      dest.searchParams.set('ticket', data.ticket)
      window.open(dest.toString(), '_blank', 'noopener')
    } catch {
      window.open(TAREAS_URL, '_blank', 'noopener')
    }
  }

  const ABRIR_EXTERNO = { costos: openCostos, tareas: openTareas }

  // Colapsado: rail angosto solo con íconos. En mobile el off-canvas
  // siempre se muestra expandido, independiente de sidebarOpen.
  const collapsed = !sidebarOpen && !mobileNavOpen

  const locales    = activeApp?.locales ?? []
  const multiLocal = locales.length > 1
  const appName    = activeApp?.app?.nombre ?? activeApp?.nombre ?? 'DCSmart'

  const role       = activeApp?.role
  const isGlobal   = role === 'super_admin' || role === 'dcsmart'

  const visibleFor = (item) => {
    if (item.key === 'reportes') return !!activeApp?.can_reportes
    return !item.roles || item.roles.includes(role)
  }

  // Los roles restringidos a una sola tarea ven SOLO su propia navegacion, no el
  // menu operativo filtrado: `reportes` no opera y `data_entry` solo carga.
  const NAV_RESTRINGIDA = {
    reportes: NAV_MAIN.filter(i => i.key === 'reportes'),
    [ROLES.DATA_ENTRY]: [
      { to: '/cargar',      label: 'Cargar',      Icon: IcoDashboard },
      { to: '/pagos/nuevo', label: 'Cargar pago', Icon: IcoPagos },
      { to: '/cajas/nueva', label: 'Cargar caja', Icon: IcoCaja },
    ],
  }
  const mainItems = NAV_RESTRINGIDA[role] ?? NAV_MAIN.filter(visibleFor)

  // Admin: independiente de la app activa -- evalúa TODAS las asignaciones
  // de rol del usuario, no la app elegida (para cuando no hay app activa).
  const globalRoleNames = (user?.user_app_roles ?? []).map(r => r.role?.nombre)
  const adminItemsPermitidos = NAV_ADMIN.filter(item => !item.roles || item.roles.some(r => globalRoleNames.includes(r)))

  // Quien puede administrar ve el switch y un solo bloque a la vez. Quien no tiene
  // acceso a nada de admin no cambia de comportamiento: ve lo operativo, como antes.
  const puedeAdministrar = adminItemsPermitidos.length > 0
  const enModoAdmin = puedeAdministrar && modo === MODOS.ADMIN

  const adminItems = enModoAdmin ? adminItemsPermitidos : []
  const itemsOperativos = puedeAdministrar && enModoAdmin ? [] : mainItems

  const esSuperAdmin = globalRoleNames.includes('super_admin')
  const cambiarModo = (nuevo) => {
    if (nuevo === modo) return
    setModo(nuevo)
    closeMobileNav()
    navigate(destinoDeModo(nuevo, { esSuperAdmin, hayGrupo: Boolean(activeApp) }))
  }

  return (
    <>
      <div
        className={'sidebar-mobile-backdrop' + (mobileNavOpen ? ' open' : '')}
        onClick={closeMobileNav}
      />
      <aside className={'sidebar' + (mobileNavOpen ? ' mobile-open' : '') + (collapsed ? ' collapsed' : '')}>
      {/* Brand */}
      <div className="sidebar-brand">
        <AppLogo variant="horizontal" />
      </div>

      {/* Switch de modo. Va arriba del contexto y se ve incluso sin grupo elegido:
          es lo que permite volver a operar desde admin sin pasar por el selector.
          Solo para quien tiene algo de admin: al resto no le cambia nada. */}
      {puedeAdministrar && !collapsed && (
        <div className="sidebar-modo">
          <button
            type="button"
            className={'sidebar-modo-btn' + (enModoAdmin ? ' active' : '')}
            onClick={() => cambiarModo(MODOS.ADMIN)}
          >
            Administrar
          </button>
          <button
            type="button"
            className={'sidebar-modo-btn' + (!enModoAdmin ? ' active' : '')}
            onClick={() => cambiarModo(MODOS.OPERAR)}
            title={activeApp ? undefined : 'Vas a elegir un grupo'}
          >
            Operar
          </button>
        </div>
      )}

      {/* App / Local context. En modo admin no se muestra: lo que se administra no
          depende del grupo ni del local elegido, y dejarlo a la vista era justo lo
          que hacía creer que sí. */}
      {activeApp && !enModoAdmin && !collapsed && (
        <div className="sidebar-context">
          {isGlobal ? (
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: role === 'super_admin' ? 'var(--gold, #C9B086)' : '#a78bfa',
              marginBottom: 4, opacity: 0.9,
            }}>
              {role === 'super_admin' ? '● Super Admin' : '● DCSmart'} — Acceso global
            </div>
          ) : null}
          <div className="sidebar-app-name" style={isGlobal ? { fontSize: 12, color: 'var(--t2)', fontWeight: 500 } : {}}>
            {isGlobal ? `Viendo: ${appName}` : appName}
          </div>
          {multiLocal ? (
            <select
              className="sidebar-local-select"
              value={activeLocal?.id ?? ''}
              onChange={(e) => {
                const l = locales.find(x => x.id === e.target.value) ?? null
                setActiveLocal(l)
              }}
            >
              <option value="">Todos los locales</option>
              {locales.map(l => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          ) : activeLocal ? (
            <div className="sidebar-local-single">
              <span className="sidebar-local-dot" />
              {activeLocal.nombre}
            </div>
          ) : null}
          <button className="sidebar-change-link" onClick={handleChangeApp}>
            {isGlobal ? 'Cambiar vista' : 'Cambiar grupo'}
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        {/* Avisos va primero y fuera del filtro por rol: cualquiera puede recibir
            uno, incluidos `reportes` y `data_entry`. */}
        <NavLink
          to="/avisos"
          className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          onClick={closeMobileNav}
          title={collapsed ? 'Avisos' : undefined}
        >
          <IcoCampana />
          <span className="nav-item-label">Avisos</span>
          {avisosSinLeer > 0 && (
            <span className="nav-item-badge" title={`${avisosSinLeer} sin leer`}>{avisosSinLeer}</span>
          )}
        </NavLink>

        {itemsOperativos.map(({ key, to, label, Icon, external }) => external ? (
          <button
            key={key}
            type="button"
            className="nav-item nav-item-btn"
            onClick={() => { closeMobileNav(); ABRIR_EXTERNO[key]?.() }}
            title={collapsed ? label : undefined}
          >
            <Icon />
            <span className="nav-item-label">{label}</span>
          </button>
        ) : (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            onClick={closeMobileNav}
            title={collapsed ? label : undefined}
          >
            <Icon />
            <span className="nav-item-label">{label}</span>
          </NavLink>
        ))}

        {adminItems.length > 0 && (
          <>
            <div className="nav-section-label">Admin</div>
            {adminItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                title={collapsed ? label : undefined}
              >
                <Icon />
                <span className="nav-item-label">{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* El tema va con lo personal (avatar, cerrar sesion) y no entre los modulos: es una
          preferencia de quien mira, no una seccion de la app. */}
      <div className="sidebar-tema">
        <BotonTema colapsado={collapsed} />
      </div>

      {/* User footer */}
      <div className="sidebar-user">
        <div className="sidebar-user-avatar" title={collapsed ? user?.nombre : undefined}>
          {user?.avatar_url && !avatarFailed
            ? <img src={user.avatar_url} alt={user.nombre} onError={() => setAvatarFailed(true)} />
            : initials(user?.nombre)}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user?.nombre}</div>
          {!collapsed && <div className="sidebar-version" title="Versión de la app">{APP_VERSION_LABEL}</div>}
        </div>
        <button className="sidebar-logout" onClick={handleLogout} title="Cerrar sesión">
          <IcoLogout />
        </button>
      </div>
      </aside>
    </>
  )
}
