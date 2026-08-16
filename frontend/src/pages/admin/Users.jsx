import { Fragment, useEffect, useMemo, useState } from 'react'
import { usersApi }  from '../../api/users.js'
import { appsApi }   from '../../api/apps.js'
import { localesApi } from '../../api/locales.js'
import { rolesApi }  from '../../api/roles.js'
import { useUiStore } from '../../store/uiStore.js'
import { useAuthStore } from '../../store/authStore.js'
import { fmtDateArg } from '../../lib/dates.js'
import { esAlcanceGlobal, sinLocalesVeTodos } from '../../lib/roles.js'
import DrawerPanel   from '../../components/DrawerPanel.jsx'
import SelectorGrupoLocal from '../../components/SelectorGrupoLocal.jsx'
import DatosPersona from '../../components/DatosPersona.jsx'
import {
  filtrarUsuarios, conteoPorRol, conteoPorDepartamento, agruparUsuarios, AGRUPACIONES,
  bloqueAbierto, subAbierto, alternar, todoAbierto, todasLasClaves, claveSub,
  SIN_DEPARTAMENTO,
} from '../../lib/filtroUsuarios.js'
import {
  OPCIONES_DEPARTAMENTO, etiquetaDepartamento, fechaNacTexto, fechaNacInput,
  edad, errorFechaNac, faltantes,
} from '../../lib/datosUsuario.js'

// ─── Icons ────────────────────────────────────────────────────────────────────

function IcoUsers() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5"  y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    </svg>
  )
}

function IcoShield() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(nombre) {
  if (!nombre) return '?'
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

const ROLE_BADGE = {
  super_admin: 'badge-gold',
  dcsmart:     'badge-purple',
  admin:       'badge-blue',
  cajero:      'badge-green',
}

const GLOBAL_ROLES = new Set(['super_admin', 'dcsmart'])

function roleAppLabel(r) {
  if (GLOBAL_ROLES.has(r.role?.nombre)) return 'Todos los grupos'
  return r.app?.nombre || '—'
}

function isGlobalRole(roles, id_role) {
  const r = roles.find(r => r.id === id_role)
  return r ? GLOBAL_ROLES.has(r.nombre) : false
}

// Los tres datos de la persona arrancan vacíos: son opcionales y se completan
// después, cuando RRHH pasa la planilla.
const EMPTY_PERSONA = { departamento: '', puesto: '', fecha_nac: '' }
const EMPTY_USER = { nombre: '', email: '', password: '', password2: '', activo: true, ...EMPTY_PERSONA }
const EMPTY_ROLE = { id_app: '', id_role: '', id_local: '', all_locals: true }

// Cuántas columnas tiene la tabla, para los colSpan de los encabezados de bloque y de
// la fila de vacío. Se calcula de un solo lugar: con el número escrito a mano en cinco
// lugares, agregar una columna descuadra la tabla en los cuatro que uno se olvida.
const COLUMNAS = 7

// Lo que se muestra en la tabla para un dato de la persona que no se cargó. Un guion
// gris dice "no hay dato"; una celda en blanco parece un error de la pantalla.
const Falta = () => <span style={{ color: 'var(--t4)' }}>—</span>

// Los tres datos, tal como se ven en el panel de detalle.
function valoresPersona(u) {
  return {
    departamento: u?.departamento ?? '',
    puesto: u?.puesto ?? '',
    fecha_nac: fechaNacInput(u?.fecha_nac),
  }
}

// ¿Cambió algo respecto del usuario guardado? Decide si el botón Guardar aparece: sin
// esto habría que apretarlo siempre, sin saber si hacía falta.
function personaCambio(form, u) {
  const orig = valoresPersona(u)
  return Object.keys(orig).some(k => (form?.[k] ?? '') !== orig[k])
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ u, size = 36, radius = 10, fontSize = 13 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: 'rgba(var(--velo-rgb), 0.08)', border: '1px solid rgba(var(--velo-rgb), 0.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize, color: 'var(--t1)', flexShrink: 0, overflow: 'hidden',
    }}>
      {u.avatar_url
        ? <img src={u.avatar_url} alt={u.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
        : initials(u.nombre)}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Users() {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const currentUser = useAuthStore((s) => s.user)
  const amISuperAdmin = currentUser?.user_app_roles?.some(r => r.role?.nombre === 'super_admin') ?? false

  // List state
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  // Filtros de la lista. Grupo y local van en cascada (el local solo dentro del
  // grupo elegido) y `agrupar` separa la tabla en bloques en vez de filtrar.
  const [fApp,     setFApp]     = useState('')
  const [fLocal,   setFLocal]   = useState('')
  const [fRol,     setFRol]     = useState('')
  const [fDepto,   setFDepto]   = useState('')
  const [fEstado,  setFEstado]  = useState('activos')
  const [agrupar,  setAgrupar]  = useState('rol-grupo')
  // Bloques abiertos, por título. Arranca vacío: todo colapsado.
  const [abiertos, setAbiertos] = useState(new Set())

  // Detail drawer
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [selected,   setSelected]   = useState(null)
  const [reloading,  setReloading]  = useState(false)

  // Edit nombre inline
  const [editingNombre, setEditingNombre] = useState(false)
  const [editNombre,    setEditNombre]    = useState('')
  const [editSaving,    setEditSaving]    = useState(false)

  // ── datos de la persona (departamento / rol / fecha de nac.) ──
  // Se editan en el panel con un Guardar propio, no campo por campo: son tres y
  // guardar de a uno serían tres PUT y tres avisos para completar una ficha.
  const [personaForm,   setPersonaForm]   = useState(EMPTY_PERSONA)
  const [personaSaving, setPersonaSaving] = useState(false)
  // Puestos que ya existen, para sugerirlos. El campo es texto libre; las sugerencias
  // son lo que evita tres formas de escribir el mismo cargo.
  const [puestosUsados, setPuestosUsados] = useState([])

  // New-user drawer
  const [newOpen,    setNewOpen]    = useState(false)
  const [newForm,    setNewForm]    = useState(EMPTY_USER)
  const [newSaving,  setNewSaving]  = useState(false)
  const [newErrors,  setNewErrors]  = useState({})

  // Role sub-form (inside detail drawer)
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [roleForm,     setRoleForm]     = useState(EMPTY_ROLE)
  const [roleSaving,   setRoleSaving]   = useState(false)
  const [apps,         setApps]         = useState([])
  const [roles,        setRoles]        = useState([])
  const [locales,      setLocales]      = useState([])
  const [localesByApp, setLocalesByApp] = useState({})  // { [id_app]: [{id,nombre}] }
  const [accessBusy,   setAccessBusy]   = useState(false)

  // Acceso a dcsmart-analisis (plataforma de reportes, backend separado)
  const [analyticsAccess, setAnalyticsAccess] = useState(null) // { enabled, is_admin } | { unavailable: true } | null (cargando)
  const [analyticsBusy,   setAnalyticsBusy]   = useState(false)

  // Acceso a dcsmart-costos (plataforma de costos, backend separado)
  const [costosAccess, setCostosAccess] = useState(null) // { enabled, is_admin } | { unavailable: true } | null (cargando)
  const [costosBusy,   setCostosBusy]   = useState(false)

  // ── load list ──────────────────────────────────────────────────────────────

  const load = () => {
    setLoading(true)
    usersApi.list()
      .then(({ data }) => setUsers(data))
      .catch(() => notify('Error al cargar usuarios', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Los puestos que ya se usaron. Si falla, el campo sigue andando sin sugerencias:
  // no vale la pena un cartel de error por una comodidad.
  const cargarPuestos = () =>
    usersApi.puestos().then(({ data }) => setPuestosUsados(data ?? [])).catch(() => {})

  useEffect(() => { cargarPuestos() }, [])

  // ── load apps + roles when detail drawer opens ────────────────────────────

  useEffect(() => {
    if (!panelOpen) return
    Promise.all([appsApi.list(), rolesApi.list()])
      .then(([aRes, rRes]) => {
        setApps(aRes.data || [])
        setRoles(rRes.data || [])
      })
      .catch(() => {})
  }, [panelOpen])

  // ── acceso a dcsmart-analisis (se consulta al vuelo, otro backend/base) ───

  useEffect(() => {
    if (!panelOpen || !selected?.id) { setAnalyticsAccess(null); return }
    setAnalyticsAccess(null)
    usersApi.getAnalyticsAccess(selected.id)
      .then(({ data }) => setAnalyticsAccess(data))
      .catch(() => setAnalyticsAccess({ unavailable: true }))
  }, [panelOpen, selected?.id])

  // ── acceso a dcsmart-costos (se consulta al vuelo, otro backend/base) ─────

  useEffect(() => {
    if (!panelOpen || !selected?.id) { setCostosAccess(null); return }
    setCostosAccess(null)
    usersApi.getCostosAccess(selected.id)
      .then(({ data }) => setCostosAccess(data))
      .catch(() => setCostosAccess({ unavailable: true }))
  }, [panelOpen, selected?.id])

  // ── load locales when app is selected in role form ────────────────────────

  useEffect(() => {
    if (!roleForm.id_app) { setLocales([]); return }
    localesApi.list({ id_app: roleForm.id_app, limit: 100 })
      .then(r => setLocales(r.data?.data || r.data || []))
      .catch(() => {})
  }, [roleForm.id_app])

  // ── load locales for every app the selected user has a role in ─────────────

  useEffect(() => {
    const appIds = [...new Set((selected?.user_app_roles ?? []).map(r => r.id_app).filter(Boolean))]
    if (appIds.length === 0) { setLocalesByApp({}); return }
    Promise.all(appIds.map(id =>
      localesApi.list({ id_app: id, limit: 100 })
        .then(r => [id, r.data?.data || r.data || []])
        .catch(() => [id, []])
    )).then(pairs => setLocalesByApp(Object.fromEntries(pairs)))
  }, [selected])

  // ── open / close detail drawer ────────────────────────────────────────────

  const openDetail = (u) => {
    // `u` viene de la lista (GET /users), que no trae google_id ni
    // user_permissions -- se abre el panel ya mismo con esos datos parciales
    // (respuesta instantánea) y se reemplaza por el detalle completo
    // (GET /users/:id) apenas llega, para que "Google" y "Puede ver
    // Reportes" reflejen el estado real en vez de quedar siempre en el
    // valor por default de los campos que la lista no incluye.
    setSelected(u)
    setShowRoleForm(false)
    setRoleForm(EMPTY_ROLE)
    setEditingNombre(false)
    setPersonaForm(valoresPersona(u))
    setPanelOpen(true)
    usersApi.get(u.id).then(({ data }) => {
      setSelected(data)
      // El detalle se pisa con lo que llega del server, así que el formulario también:
      // si no, quedaría mostrando lo que traía la lista y "Guardar" mandaría eso.
      setPersonaForm(valoresPersona(data))
    }).catch(() => {})
  }

  const closeDetail = () => {
    setPanelOpen(false)
    setShowRoleForm(false)
    setEditingNombre(false)
  }

  // Reload the selected user after role assignment
  const reloadSelected = async (id) => {
    setReloading(true)
    try {
      const { data } = await usersApi.get(id)
      setSelected(data)
      setPersonaForm(valoresPersona(data))
      // also refresh list
      usersApi.list().then(({ data: all }) => setUsers(all)).catch(() => {})
    } catch {
      // fallback: reload whole list
      load()
    } finally {
      setReloading(false)
    }
  }

  // ── deactivate / reactivate ───────────────────────────────────────────────

  const handleDeactivate = async (id, e) => {
    e?.stopPropagation?.()
    if (!(await showConfirm('¿Desactivar este usuario?'))) return
    try {
      await usersApi.remove(id)
      notify('Usuario desactivado', 'success')
      closeDetail()
      load()
    } catch {
      notify('Error al desactivar', 'error')
    }
  }

  const handleReactivate = async (id) => {
    if (!(await showConfirm('¿Reactivar este usuario?'))) return
    try {
      await usersApi.update(id, { activo: true })
      notify('Usuario reactivado', 'success')
      await reloadSelected(id)
      load()
    } catch {
      notify('Error al reactivar', 'error')
    }
  }

  const handleHardDelete = async (id, e) => {
    e?.stopPropagation?.()
    if (!(await showConfirm('¿Eliminar este usuario definitivamente? No se puede deshacer.'))) return
    try {
      await usersApi.removePermanente(id)
      notify('Usuario eliminado', 'success')
      closeDetail()
      load()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al eliminar', 'error')
    }
  }

  // ── edit nombre ───────────────────────────────────────────────────────────

  const startEditNombre = () => {
    setEditNombre(selected.nombre)
    setEditingNombre(true)
  }

  const handleSaveNombre = async (e) => {
    e.preventDefault()
    if (!editNombre.trim()) return
    setEditSaving(true)
    try {
      await usersApi.update(selected.id, { nombre: editNombre.trim() })
      notify('Nombre actualizado', 'success')
      setEditingNombre(false)
      await reloadSelected(selected.id)
    } catch {
      notify('Error al actualizar', 'error')
    } finally {
      setEditSaving(false)
    }
  }

  // ── datos de la persona ───────────────────────────────────────────────────

  const handleSavePersona = async (e) => {
    e.preventDefault()
    // El backend valida igual; esto es para no mandar un PUT que ya sabemos que va a
    // volver con 400.
    const err = errorFechaNac(personaForm.fecha_nac)
    if (err) { notify(err, 'error'); return }

    setPersonaSaving(true)
    try {
      // Se manda todo, incluidos los vacíos: mandar '' es como se borra un dato mal
      // cargado (el backend lo pasa a null). Ver lib/datosUsuario.js del backend.
      await usersApi.update(selected.id, {
        departamento: personaForm.departamento,
        puesto: personaForm.puesto,
        fecha_nac: personaForm.fecha_nac,
      })
      notify('Datos actualizados', 'success')
      await reloadSelected(selected.id)
      // Un puesto nuevo pasa a ser sugerencia para el próximo.
      cargarPuestos()
    } catch (err2) {
      notify(err2.response?.data?.error || 'Error al actualizar los datos', 'error')
    } finally {
      setPersonaSaving(false)
    }
  }

  // ── assign role ───────────────────────────────────────────────────────────

  const handleAssignRole = async (e) => {
    e.preventDefault()
    const global = isGlobalRole(roles, roleForm.id_role)
    const selectedRole = roles.find(r => r.id === roleForm.id_role)
    const roleName = selectedRole?.nombre

    if (!roleForm.id_role) { notify('El Rol es requerido', 'error'); return }
    if (!global && !roleForm.id_app) { notify('El Grupo es requerido', 'error'); return }
    // Todo rol scoped sin "todos los locales" (cajero, data_entry...) necesita
    // un local sí o sí: sin filas en user_local_access no ve ni carga nada.
    const localObligatorio = !global && !sinLocalesVeTodos(roleName)
    if (localObligatorio && !roleForm.id_local) { notify(`El Local es requerido para ${roleName}`, 'error'); return }

    setRoleSaving(true)
    try {
      const payload = {
        id_role: roleForm.id_role,
        ...(global ? {} : { id_app: roleForm.id_app }),
        // cajero/data_entry: siempre envía local; admin: solo si eligió locales específicos
        ...(!global && roleForm.id_local && (localObligatorio || !roleForm.all_locals)
          ? { id_local: roleForm.id_local }
          : {}),
      }
      await usersApi.assignRole(selected.id, payload)
      notify('Rol asignado', 'success')
      setShowRoleForm(false)
      setRoleForm(EMPTY_ROLE)
      await reloadSelected(selected.id)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al asignar rol', 'error')
    } finally {
      setRoleSaving(false)
    }
  }

  // ── local access (add / remove) + remove role ─────────────────────────────

  const handleAddLocal = async (id_app, id_local, roleName) => {
    if (!id_local) return
    setAccessBusy(true)
    try {
      // cajero: solo puede tener 1 local — reemplazar el existente
      if (roleName === 'cajero') {
        const existing = (selected.local_access ?? []).filter(la => la.id_app === id_app)
        for (const la of existing) {
          await usersApi.removeLocalAccess(selected.id, { id_app, id_local: la.local.id })
        }
      }
      await usersApi.addLocalAccess(selected.id, { id_app, id_local })
      await reloadSelected(selected.id)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al agregar local', 'error')
    } finally {
      setAccessBusy(false)
    }
  }

  const handleRemoveLocal = async (id_app, id_local) => {
    setAccessBusy(true)
    try {
      await usersApi.removeLocalAccess(selected.id, { id_app, id_local })
      await reloadSelected(selected.id)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al quitar local', 'error')
    } finally {
      setAccessBusy(false)
    }
  }

  const handleRemoveRole = async (id_app) => {
    if (!(await showConfirm('¿Quitar este rol y todos sus accesos en esta app?'))) return
    setAccessBusy(true)
    try {
      await usersApi.removeRole(selected.id, id_app)
      await reloadSelected(selected.id)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al quitar rol', 'error')
    } finally {
      setAccessBusy(false)
    }
  }

  // ── new user ──────────────────────────────────────────────────────────────

  const openNew = () => { setNewForm(EMPTY_USER); setNewErrors({}); setNewOpen(true) }
  const closeNew = () => setNewOpen(false)

  const validateNew = () => {
    const errs = {}
    if (!newForm.nombre.trim())  errs.nombre   = 'Requerido'
    if (!newForm.email.trim())   errs.email    = 'Requerido'
    if (!newForm.password)       errs.password = 'Requerido'
    if (newForm.password !== newForm.password2) errs.password2 = 'Las contraseñas no coinciden'
    // Los datos de la persona son opcionales, pero si se cargó una fecha tiene que ser
    // una fecha: mejor acá que un 400 después de completar todo el formulario.
    const errFecha = errorFechaNac(newForm.fecha_nac)
    if (errFecha) errs.fecha_nac = errFecha
    return errs
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    const errs = validateNew()
    if (Object.keys(errs).length) { setNewErrors(errs); return }
    setNewSaving(true)
    try {
      await usersApi.create({
        nombre:   newForm.nombre.trim(),
        email:    newForm.email.trim(),
        password: newForm.password,
        activo:   newForm.activo,
        departamento: newForm.departamento,
        puesto:       newForm.puesto,
        fecha_nac:    newForm.fecha_nac,
      })
      notify('Usuario creado', 'success')
      setNewOpen(false)
      load()
      cargarPuestos()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear usuario', 'error')
    } finally {
      setNewSaving(false)
    }
  }

  // ── local_access grouped by app ───────────────────────────────────────────

  const buildAccessByApp = (user) => {
    const map = {}
    for (const la of (user?.local_access ?? [])) {
      if (!map[la.id_app]) map[la.id_app] = []
      map[la.id_app].push(la.local)
    }
    return map
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  // id_local -> id_app, para poder resolver el filtro por local (un admin sin
  // locales asignados alcanza todos los de su grupo -- ver lib/filtroUsuarios.js).
  const localesPorId = useMemo(
    () => new Map(locales.map(l => [l.id, l.id_app])),
    [locales]
  )

  const filteredUsers = useMemo(
    () => filtrarUsuarios(users, {
      texto: search, idApp: fApp, idLocal: fLocal, rol: fRol, estado: fEstado,
      departamento: fDepto,
    }, localesPorId),
    [users, search, fApp, fLocal, fRol, fEstado, fDepto, localesPorId]
  )

  // Los conteos salen de la lista COMPLETA, no de la filtrada: sirven para saber
  // cuántos hay de cada rol antes de elegirlo, no para describir lo que ya se ve.
  const conteoRoles = useMemo(() => conteoPorRol(users), [users])
  const conteoDeptos = useMemo(() => conteoPorDepartamento(users), [users])

  // Los grupos que existen, para el selector. Salen de la lista de locales porque
  // es la que ya trae el id y el nombre del grupo de cada uno.
  const gruposDeLocales = useMemo(() => {
    const m = new Map()
    for (const l of locales) if (l.id_app && !m.has(l.id_app)) m.set(l.id_app, l.grupo ?? '—')
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }))
  }, [locales])

  const appsPorId = useMemo(() => new Map(apps.map(a => [a.id, a.nombre])), [apps])

  const bloques = useMemo(
    () => agruparUsuarios(filteredUsers, agrupar, { appsPorId }),
    [filteredUsers, agrupar, appsPorId]
  )

  const hayFiltro = Boolean(search || fApp || fLocal || fRol || fDepto || fEstado !== 'activos')
  const limpiarFiltros = () => {
    setSearch(''); setFApp(''); setFLocal(''); setFRol(''); setFDepto(''); setFEstado('activos')
  }

  // Con un filtro puesto se muestran todos abiertos, así que el botón de expandir
  // no tiene nada que hacer: se esconde en vez de quedar sin efecto.
  const abiertoTodo = todoAbierto(bloques, abiertos)
  const alternarTodos = () =>
    setAbiertos(abiertoTodo ? new Set() : new Set(todasLasClaves(bloques)))

  return (
    <div className="page">
      {/* ── Page head ── */}
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Usuarios</h1>
          <p className="page-sub">Gestión de accesos y roles</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>
            <IcoPlus /> Nuevo Usuario
          </button>
        </div>
      </div>

      <div className="filter-bar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Buscar</label>
          <div className="form-input-wrap" style={{ width: 260 }}>
            <input
              type="text"
              placeholder="Nombre, email o rol"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <SelectorGrupoLocal
          grupos={gruposDeLocales}
          locales={locales}
          idApp={fApp}
          idLocal={fLocal}
          onChange={({ idApp, idLocal }) => { setFApp(idApp); setFLocal(idLocal) }}
        />

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Rol</label>
          <select className="filter-select" value={fRol} onChange={e => setFRol(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Todos los roles</option>
            {roles.map(r => (
              <option key={r.id} value={r.nombre}>
                {r.nombre}{conteoRoles.get(r.nombre) ? ` (${conteoRoles.get(r.nombre)})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Departamento</label>
          <select className="filter-select" value={fDepto} onChange={e => setFDepto(e.target.value)} style={{ minWidth: 165 }}>
            <option value="">Todos</option>
            {/* Solo los que tienen gente: ofrecer diez departamentos cuando ocho están
                vacíos hace elegir a ciegas y devolver la lista en blanco. */}
            {OPCIONES_DEPARTAMENTO.filter(o => conteoDeptos.get(o.value)).map(o => (
              <option key={o.value} value={o.value}>
                {o.label} ({conteoDeptos.get(o.value)})
              </option>
            ))}
            {/* Los que faltan cargar. Es el filtro que se usa para completarlos, así
                que va aunque no haya ninguno pendiente (ahí ni aparece). */}
            {conteoDeptos.get(SIN_DEPARTAMENTO) > 0 && (
              <option value={SIN_DEPARTAMENTO}>
                Sin asignar ({conteoDeptos.get(SIN_DEPARTAMENTO)})
              </option>
            )}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Estado</label>
          <select className="filter-select" value={fEstado} onChange={e => setFEstado(e.target.value)}>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="">Todos</option>
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Separar por</label>
          <select className="filter-select" value={agrupar} onChange={e => setAgrupar(e.target.value)}>
            {AGRUPACIONES.map(a => <option key={a.valor} value={a.valor}>{a.label}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: 12.5, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
            {loading ? '' : `${filteredUsers.length} de ${users.length}`}
          </span>
          {hayFiltro && (
            <button className="btn btn-sm btn-secondary" onClick={limpiarFiltros}>Limpiar</button>
          )}
          {!hayFiltro && agrupar && bloques.length > 1 && (
            <button className="btn btn-sm btn-secondary" onClick={alternarTodos}>
              {abiertoTodo ? 'Colapsar todo' : 'Expandir todo'}
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Departamento</th>
              <th>Nacimiento</th>
              <th>Apps / Roles</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: COLUMNAS }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 13 + i * 11) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {/* Dos niveles: rol arriba, grupo adentro. Los DOS arrancan
                    colapsados -- con 47 usuarios en 6 roles la lista abierta es una
                    pared -- y se abren de a uno o todos juntos. Con un filtro puesto
                    se muestran abiertos: quien busca un nombre quiere ver al usuario,
                    no un bloque cerrado que no dice si está adentro. */}
                {bloques.map((bloque) => {
                  const abierto = bloqueAbierto(bloque.titulo, { abiertos, hayFiltro })
                  return (
                  <Fragment key={bloque.titulo ?? '_'}>
                    {bloque.titulo && (
                      <tr
                        className="row-clickable"
                        onClick={() => setAbiertos(a => alternar(a, bloque.titulo))}
                      >
                        <td colSpan={COLUMNAS} style={{
                          background: 'var(--bg-input)',
                          borderTop: '1px solid var(--glass-border)',
                          padding: '0.5rem 0.9rem',
                          fontSize: 11.5, letterSpacing: '0.05em', textTransform: 'uppercase',
                          color: 'var(--t1)', fontWeight: 700,
                          userSelect: 'none',
                        }}>
                          {/* El chevron dice si está abierto sin tener que mirar
                              si hay filas debajo. */}
                          <span style={{
                            display: 'inline-block', width: 14, color: 'var(--t3)',
                            transform: abierto ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s var(--ease)',
                          }}>▸</span>
                          {bloque.titulo}
                          <span style={{ color: 'var(--t3)', fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>
                            {' · '}{bloque.total} {bloque.total === 1 ? 'usuario' : 'usuarios'}
                          </span>
                        </td>
                      </tr>
                    )}
                    {abierto && bloque.sub.map((sub) => {
                      const subEstaAbierto = subAbierto(bloque.titulo, sub.titulo, { abiertos, hayFiltro })
                      return (
                      <Fragment key={`${bloque.titulo ?? ''}-${sub.titulo ?? '_'}`}>
                        {sub.titulo && (
                          <tr
                            className="row-clickable"
                            onClick={() => setAbiertos(a => alternar(a, claveSub(bloque.titulo, sub.titulo)))}
                          >
                            <td colSpan={COLUMNAS} style={{
                              padding: '0.35rem 0.9rem 0.35rem 1.6rem',
                              fontSize: 11, color: 'var(--t2)', fontWeight: 600,
                              userSelect: 'none',
                            }}>
                              <span style={{
                                display: 'inline-block', width: 13, color: 'var(--t3)',
                                transform: subEstaAbierto ? 'rotate(90deg)' : 'none',
                                transition: 'transform 0.15s var(--ease)',
                              }}>▸</span>
                              {sub.titulo}
                              <span style={{ color: 'var(--t3)', fontWeight: 400 }}> · {sub.users.length}</span>
                            </td>
                          </tr>
                        )}
                        {subEstaAbierto && sub.users.map((u) => (
                  <tr key={`${bloque.titulo ?? ''}-${sub.titulo ?? ''}-${u.id}`} className="row-clickable" onClick={() => openDetail(u)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar u={u} />
                        {/* El puesto va debajo del nombre, no en su propia columna: es
                            lo que uno lee junto con el nombre ("Ana, encargada"). */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{u.nombre}</div>
                          {u.puesto && (
                            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 1 }}>{u.puesto}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="td-muted">{u.email}</td>
                    <td>
                      {u.departamento
                        ? <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{etiquetaDepartamento(u.departamento)}</span>
                        : <Falta />}
                    </td>
                    <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>
                      {u.fecha_nac ? (
                        <>
                          {fechaNacTexto(u.fecha_nac)}
                          {/* La edad al lado, que es el dato que uno busca cuando mira
                              una fecha de nacimiento. */}
                          <span style={{ color: 'var(--t4)', fontSize: 11.5 }}>
                            {' · '}{edad(u.fecha_nac)}a
                          </span>
                        </>
                      ) : <Falta />}
                    </td>
                    <td>
                      {u.user_app_roles?.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {u.user_app_roles.map((r) => (
                            <span key={r.id} className={`badge ${ROLE_BADGE[r.role?.nombre] ?? 'badge-muted'}`}
                              title={roleAppLabel(r)}>
                              {roleAppLabel(r)} · {r.role?.nombre}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="td-muted">Sin roles</span>
                      )}
                    </td>
                    <td>
                      <span className={u.activo ? 'bool-yes' : 'bool-no'}>
                        {u.activo ? '● Activo' : '○ Inactivo'}
                      </span>
                    </td>
                    <td>
                      {u.activo ? (
                        <button className="btn btn-sm btn-danger" onClick={(e) => handleDeactivate(u.id, e)}>
                          <IcoTrash /> Desactivar
                        </button>
                      ) : (
                        amISuperAdmin && (
                          <button className="btn btn-sm btn-danger" onClick={(e) => handleHardDelete(u.id, e)}>
                            <IcoTrash /> Eliminar
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                        ))}
                      </Fragment>
                      )
                    })}
                  </Fragment>
                  )
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNAS}>
                      <div className="table-empty">
                        <IcoUsers />
                        <p>
                          {users.length === 0
                            ? 'No hay usuarios registrados.'
                            : 'Ningún usuario coincide con los filtros.'}
                        </p>
                        {users.length > 0 && hayFiltro && (
                          <button className="btn btn-sm btn-secondary" onClick={limpiarFiltros}>
                            Limpiar filtros
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Detail Drawer ── */}
      <DrawerPanel
        open={panelOpen}
        onClose={closeDetail}
        title={selected ? selected.nombre : 'Usuario'}
        width={480}
      >
        {selected && (() => {
          const userRoles  = selected.user_app_roles ?? []
          const accessByApp = buildAccessByApp(selected)

          return (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <Avatar u={selected} size={52} radius={14} fontSize={18} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingNombre ? (
                    <form onSubmit={handleSaveNombre} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div className="form-input-wrap" style={{ flex: 1 }}>
                        <input
                          autoFocus
                          value={editNombre}
                          onChange={e => setEditNombre(e.target.value)}
                          style={{ fontSize: 14, padding: '4px 8px' }}
                        />
                      </div>
                      <button type="submit" className="btn btn-sm btn-primary" disabled={editSaving}>
                        {editSaving ? '…' : 'OK'}
                      </button>
                      <button type="button" className="btn btn-sm btn-secondary"
                        onClick={() => setEditingNombre(false)}>✕</button>
                    </form>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{selected.nombre}</div>
                      {amISuperAdmin && (
                        <button
                          onClick={startEditNombre}
                          title="Editar nombre"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer',
                            color: 'var(--t3)', fontSize: 12, padding: '0 2px', lineHeight: 1 }}>
                          ✎
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{selected.email}</div>
                  {selected.created_at && (
                    <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 3 }}>
                      Alta: {fmtDateArg(selected.created_at)}
                    </div>
                  )}
                </div>
              </div>

              {/* Datos de la persona. Van arriba de todo lo de permisos porque son de
                  la persona, no de lo que puede hacer en el sistema. */}
              <div className="drawer-section-title">Datos personales</div>
              <form onSubmit={handleSavePersona} style={{ marginBottom: '1.25rem' }}>
                <DatosPersona
                  idPrefix={`u-${selected.id}`}
                  valores={personaForm}
                  onChange={(campo, valor) => setPersonaForm(f => ({ ...f, [campo]: valor }))}
                  puestosUsados={puestosUsados}
                  disabled={personaSaving}
                />
                {/* El botón aparece solo si hay algo para guardar: un Guardar siempre
                    visible no dice si quedó algo sin guardar, que es justo lo que uno
                    quiere saber al cerrar el panel. */}
                {personaCambio(personaForm, selected) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="submit" className="btn btn-sm btn-primary" disabled={personaSaving}>
                      {personaSaving ? 'Guardando…' : 'Guardar datos'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      disabled={personaSaving}
                      onClick={() => setPersonaForm(valoresPersona(selected))}
                    >
                      Descartar
                    </button>
                  </div>
                )}
                {/* Qué falta cargar. Con 60 usuarios que arrancan sin ninguno de estos
                    datos, sin este aviso no hay forma de saber si la ficha está
                    completa. */}
                {!personaCambio(personaForm, selected) && faltantes(selected).length > 0 && (
                  <p className="form-hint" style={{ marginTop: 8 }}>
                    Falta cargar: {faltantes(selected).join(', ')}.
                  </p>
                )}
              </form>

              {/* Estado */}
              <div className="drawer-section-title">Estado</div>
              <div className="drawer-detail" style={{ marginBottom: '1.25rem' }}>
                <div className="drawer-detail-row">
                  <span className="drawer-detail-key">Cuenta</span>
                  <span className="drawer-detail-val">
                    <span className={selected.activo ? 'bool-yes' : 'bool-no'}>
                      {selected.activo ? '● Activo' : '○ Inactivo'}
                    </span>
                  </span>
                </div>
                <div className="drawer-detail-row">
                  <span className="drawer-detail-key">Google</span>
                  <span className="drawer-detail-val">
                    {selected.google_id
                      ? <span className="bool-yes">● Vinculado</span>
                      : <span style={{ color: 'var(--t3)' }}>No vinculado</span>}
                  </span>
                </div>
              </div>

              {/* Permisos individuales. Reportes se ofrece solo a admins (como
                  siempre); Caja Mayor a cualquier usuario con rol que no sea
                  super_admin (el super entra siempre, el checkbox sería mentira). */}
              {(() => {
                const esAdminRol = userRoles.some(r => r.role?.nombre === 'admin')
                const esSuperAdminUsr = userRoles.some(r => r.role?.nombre === 'super_admin')
                const muestraCajaMayor = userRoles.length > 0 && !esSuperAdminUsr
                if (!esAdminRol && !muestraCajaMayor) return null

                const labelStyle = { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--t2)' }
                const refrescar = async () => {
                  const { data } = await usersApi.get(selected.id)
                  setSelected(data)
                  usersApi.list().then(({ data: all }) => setUsers(all)).catch(() => {})
                }
                const tienePermiso = (mod) =>
                  (selected.user_permissions ?? []).some(p => p.module?.nombre === mod && p.can_view)

                return (
                  <>
                    <div className="drawer-section-title">Permisos individuales</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.25rem' }}>
                      {esAdminRol && (
                        <label style={labelStyle}>
                          <input
                            type="checkbox"
                            className="select-checkbox"
                            checked={tienePermiso('reportes')}
                            onChange={async (e) => {
                              const checked = e.target.checked
                              const msg = checked
                                ? '¿Dar acceso a Reportes a este usuario?'
                                : '¿Quitar el acceso a Reportes a este usuario?'
                              if (!(await showConfirm(msg))) return
                              try {
                                if (checked) {
                                  await usersApi.setPermission(selected.id, 'reportes', { can_view: true })
                                } else {
                                  await usersApi.removePermission(selected.id, 'reportes')
                                }
                                await refrescar()
                              } catch (err) {
                                notify(err.response?.data?.error || 'Error al actualizar el permiso', 'error')
                              }
                            }}
                          />
                          Puede ver Reportes
                        </label>
                      )}
                      {muestraCajaMayor && (
                        <label style={labelStyle}>
                          <input
                            type="checkbox"
                            className="select-checkbox"
                            checked={tienePermiso('caja_mayor')}
                            onChange={async (e) => {
                              const checked = e.target.checked
                              const msg = checked
                                ? '¿Dar acceso a Caja Mayor a este usuario? Va a ver y cargar movimientos solo de sus locales asignados.'
                                : '¿Quitar el acceso a Caja Mayor a este usuario?'
                              if (!(await showConfirm(msg))) return
                              try {
                                if (checked) {
                                  // Acceso operativo completo al módulo; el recorte
                                  // por local lo aplica el backend igual.
                                  await usersApi.setPermission(selected.id, 'caja_mayor', {
                                    can_view: true, can_create: true, can_edit: true, can_delete: true,
                                  })
                                } else {
                                  await usersApi.removePermission(selected.id, 'caja_mayor')
                                }
                                await refrescar()
                              } catch (err) {
                                notify(err.response?.data?.error || 'Error al actualizar el permiso', 'error')
                              }
                            }}
                          />
                          Puede usar Caja Mayor (solo sus locales)
                        </label>
                      )}
                    </div>
                  </>
                )
              })()}

              {/* Acceso a dcsmart-analisis (plataforma de reportes, backend/base separados) */}
              <div className="drawer-section-title">Analytics (reportes)</div>
              <div style={{ marginBottom: '1.25rem' }}>
                {analyticsAccess === null ? (
                  <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>Consultando acceso…</div>
                ) : analyticsAccess.unavailable ? (
                  <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>
                    No se pudo consultar (¿está corriendo el backend de Analytics?)
                  </div>
                ) : (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: analyticsBusy ? 'wait' : 'pointer', userSelect: 'none', marginBottom: 8, fontSize: 13, color: 'var(--t2)' }}>
                      <input
                        type="checkbox"
                        className="select-checkbox"
                        disabled={analyticsBusy}
                        checked={!!analyticsAccess.enabled}
                        onChange={async (e) => {
                          const enabled = e.target.checked
                          const msg = enabled
                            ? '¿Habilitar el acceso a dcsmart-analisis para este usuario?'
                            : '¿Deshabilitar el acceso a dcsmart-analisis para este usuario?'
                          if (!(await showConfirm(msg))) return
                          setAnalyticsBusy(true)
                          try {
                            await usersApi.setAnalyticsAccess(selected.id, { enabled, is_admin: analyticsAccess.is_admin })
                            setAnalyticsAccess({ enabled, is_admin: analyticsAccess.is_admin })
                          } catch (err) {
                            notify(err.response?.data?.error || 'Error al actualizar el acceso a Analytics', 'error')
                          } finally {
                            setAnalyticsBusy(false)
                          }
                        }}
                      />
                      Acceso habilitado a dcsmart-analisis
                    </label>
                    {analyticsAccess.enabled === null && (
                      <div style={{ fontSize: 11.5, color: 'var(--t4)', marginBottom: 8 }}>
                        Sin habilitación individual — hoy entra igual si su rol es super_admin o dcsmart.
                      </div>
                    )}
                    {analyticsAccess.enabled ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: analyticsBusy ? 'wait' : 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--t2)' }}>
                        <input
                          type="checkbox"
                          className="select-checkbox"
                          disabled={analyticsBusy}
                          checked={!!analyticsAccess.is_admin}
                          onChange={async (e) => {
                            const is_admin = e.target.checked
                            const msg = is_admin
                              ? '¿Convertir a este usuario en administrador de Analytics (podrá habilitar a otros)?'
                              : '¿Quitarle el rol de administrador de Analytics a este usuario?'
                            if (!(await showConfirm(msg))) return
                            setAnalyticsBusy(true)
                            try {
                              await usersApi.setAnalyticsAccess(selected.id, { enabled: true, is_admin })
                              setAnalyticsAccess({ enabled: true, is_admin })
                            } catch (err) {
                              notify(err.response?.data?.error || 'Error al actualizar el acceso a Analytics', 'error')
                            } finally {
                              setAnalyticsBusy(false)
                            }
                          }}
                        />
                        Administrador en Analytics (puede habilitar a otros)
                      </label>
                    ) : null}
                  </>
                )}
              </div>

              {/* Acceso a dcsmart-costos (plataforma de costos, backend/base separados) */}
              <div className="drawer-section-title">Costos</div>
              <div style={{ marginBottom: '1.25rem' }}>
                {costosAccess === null ? (
                  <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>Consultando acceso…</div>
                ) : costosAccess.unavailable ? (
                  <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>
                    No se pudo consultar (¿está corriendo el backend de Costos?)
                  </div>
                ) : (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: costosBusy ? 'wait' : 'pointer', userSelect: 'none', marginBottom: 8, fontSize: 13, color: 'var(--t2)' }}>
                      <input
                        type="checkbox"
                        className="select-checkbox"
                        disabled={costosBusy}
                        checked={!!costosAccess.enabled}
                        onChange={async (e) => {
                          const enabled = e.target.checked
                          const msg = enabled
                            ? '¿Habilitar el acceso a Costos para este usuario?'
                            : '¿Deshabilitar el acceso a Costos para este usuario?'
                          if (!(await showConfirm(msg))) return
                          setCostosBusy(true)
                          try {
                            await usersApi.setCostosAccess(selected.id, { enabled, is_admin: costosAccess.is_admin })
                            setCostosAccess({ enabled, is_admin: costosAccess.is_admin })
                          } catch (err) {
                            notify(err.response?.data?.error || 'Error al actualizar el acceso a Costos', 'error')
                          } finally {
                            setCostosBusy(false)
                          }
                        }}
                      />
                      Acceso habilitado a Costos
                    </label>
                    {costosAccess.enabled === null && (
                      <div style={{ fontSize: 11.5, color: 'var(--t4)', marginBottom: 8 }}>
                        Sin habilitación individual — no puede entrar a Costos hasta que lo habilites aca.
                      </div>
                    )}
                    {costosAccess.enabled ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: costosBusy ? 'wait' : 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--t2)' }}>
                        <input
                          type="checkbox"
                          className="select-checkbox"
                          disabled={costosBusy}
                          checked={!!costosAccess.is_admin}
                          onChange={async (e) => {
                            const is_admin = e.target.checked
                            const msg = is_admin
                              ? '¿Convertir a este usuario en administrador de Costos (podrá habilitar a otros)?'
                              : '¿Quitarle el rol de administrador de Costos a este usuario?'
                            if (!(await showConfirm(msg))) return
                            setCostosBusy(true)
                            try {
                              await usersApi.setCostosAccess(selected.id, { enabled: true, is_admin })
                              setCostosAccess({ enabled: true, is_admin })
                            } catch (err) {
                              notify(err.response?.data?.error || 'Error al actualizar el acceso a Costos', 'error')
                            } finally {
                              setCostosBusy(false)
                            }
                          }}
                        />
                        Administrador en Costos (puede habilitar a otros)
                      </label>
                    ) : null}
                  </>
                )}
              </div>

              {/* Roles y Accesos */}
              <div className="drawer-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Roles y Accesos</span>
                {reloading && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />}
              </div>

              {userRoles.length === 0 ? (
                <div style={{ color: 'var(--t3)', fontSize: 13, marginBottom: '1rem', padding: '0.5rem 0' }}>
                  Sin roles asignados.
                </div>
              ) : (
                <div style={{ marginBottom: '1rem' }}>
                  {userRoles.map((r) => {
                    // `externo` es un admin que además borra, no un rol con
                    // acceso global: se le limitan los locales igual que a un
                    // admin. Antes caía en el `else` de `scoped` y la card le
                    // decía "Acceso a todos los grupos y locales", que además
                    // de falso escondía el selector para acotarlo.
                    const comoAdmin  = sinLocalesVeTodos(r.role?.nombre)
                    const isCajero   = r.role?.nombre === 'cajero'
                    const scoped     = !esAlcanceGlobal(r.role?.nombre)
                    const granted    = accessByApp[r.id_app] ?? []
                    const grantedIds = new Set(granted.map(l => l.id))
                    const appLocales = localesByApp[r.id_app] ?? []
                    const available  = appLocales.filter(l => !grantedIds.has(l.id))
                    // admin/externo sin locales específicos = todos los locales
                    const adminAllLocals = comoAdmin && granted.length === 0

                    return (
                      <div key={r.id} style={{
                        padding: '0.75rem 1rem',
                        marginBottom: 6,
                        background: 'rgba(var(--velo-rgb), 0.04)',
                        borderRadius: 10,
                        border: '1px solid rgba(var(--velo-rgb), 0.07)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>
                            {roleAppLabel(r)}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`badge ${ROLE_BADGE[r.role?.nombre] ?? 'badge-muted'}`}>
                              {r.role?.nombre || '—'}
                            </span>
                            {amISuperAdmin && (
                              <button
                                className="btn btn-sm btn-danger"
                                style={{ padding: '2px 6px' }}
                                disabled={accessBusy}
                                title="Quitar rol de esta app"
                                onClick={() => handleRemoveRole(r.id_app)}
                              >
                                <IcoTrash />
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t3)' }}>
                          {!scoped ? (
                            // super_admin / dcsmart
                            <span style={{ fontStyle: 'italic' }}>Acceso a todos los grupos y locales</span>
                          ) : adminAllLocals ? (
                            // admin sin restricción de locales
                            <>
                              <span style={{ fontStyle: 'italic' }}>Todos los locales del grupo</span>
                              {amISuperAdmin && available.length > 0 && (
                                <select
                                  className="filter-select"
                                  value=""
                                  disabled={accessBusy}
                                  onChange={(e) => handleAddLocal(r.id_app, e.target.value, r.role?.nombre)}
                                  style={{ marginTop: 8, width: '100%' }}
                                >
                                  <option value="">↳ Limitar a locales específicos…</option>
                                  {available.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                                </select>
                              )}
                            </>
                          ) : (
                            // admin con locales específicos, o cajero
                            <>
                              {granted.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {granted.map((l) => (
                                    <span key={l.id} style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 5,
                                      padding: '2px 6px 2px 8px', borderRadius: 6,
                                      background: 'rgba(var(--velo-rgb), 0.06)',
                                      border: '1px solid rgba(var(--velo-rgb), 0.1)',
                                      fontSize: 11, color: 'var(--t2)',
                                    }}>
                                      {l.nombre}
                                      {amISuperAdmin && !isCajero && (
                                        <button
                                          onClick={() => handleRemoveLocal(r.id_app, l.id)}
                                          disabled={accessBusy}
                                          title="Quitar local"
                                          style={{
                                            border: 'none', background: 'transparent', cursor: 'pointer',
                                            color: 'var(--t3)', lineHeight: 1, padding: 0, fontSize: 13,
                                          }}
                                        >×</button>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontStyle: 'italic', color: 'var(--danger)' }}>
                                  Sin local asignado — no verá datos
                                </span>
                              )}

                              {/* Todo rol scoped menos cajero puede sumar locales (para admin/externo,
                                  quitar todos = vuelve a "todos los locales"; para data_entry y afines,
                                  sin locales no ve nada). Antes solo admin/externo tenían este select y
                                  a un data_entry no había forma de darle un local desde la pantalla. */}
                              {amISuperAdmin && !isCajero && available.length > 0 && (
                                <select
                                  className="filter-select"
                                  value=""
                                  disabled={accessBusy}
                                  onChange={(e) => handleAddLocal(r.id_app, e.target.value, r.role?.nombre)}
                                  style={{ marginTop: 8, width: '100%' }}
                                >
                                  <option value="">+ Agregar local…</option>
                                  {available.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                                </select>
                              )}

                              {/* Cajero: cambiar local (reemplaza el existente) */}
                              {amISuperAdmin && isCajero && (
                                <select
                                  className="filter-select"
                                  value=""
                                  disabled={accessBusy}
                                  onChange={(e) => handleAddLocal(r.id_app, e.target.value, r.role?.nombre)}
                                  style={{ marginTop: 8, width: '100%' }}
                                >
                                  <option value="">↕ Cambiar local…</option>
                                  {appLocales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                                </select>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Role sub-form — solo super_admin */}
              {amISuperAdmin && (
                !showRoleForm ? (
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ marginBottom: '1rem', gap: 6 }}
                    onClick={() => { setShowRoleForm(true); setRoleForm(EMPTY_ROLE) }}
                  >
                    <IcoShield /> Asignar Rol
                  </button>
                ) : (
                  <form onSubmit={handleAssignRole} style={{
                    background: 'rgba(var(--velo-rgb), 0.04)',
                    border: '1px solid rgba(var(--velo-rgb), 0.08)',
                    borderRadius: 12,
                    padding: '1rem',
                    marginBottom: '1rem',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)', marginBottom: '0.75rem' }}>
                      Asignar / cambiar Rol
                    </div>

                    {/* Rol — siempre primero */}
                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                      <label className="form-label">Rol *</label>
                      <div className="form-input-wrap">
                        <select
                          required
                          value={roleForm.id_role}
                          onChange={e => setRoleForm({ id_role: e.target.value, id_app: '', id_local: '', all_locals: true })}
                        >
                          <option value="">Seleccionar rol...</option>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                        </select>
                      </div>
                    </div>

                    {roleForm.id_role && (() => {
                      const selRole = roles.find(r => r.id === roleForm.id_role)
                      const roleName = selRole?.nombre

                      if (GLOBAL_ROLES.has(roleName)) {
                        return (
                          <div style={{
                            padding: '0.5rem 0.75rem', borderRadius: 8, marginBottom: '1rem',
                            background: 'rgba(var(--velo-rgb), 0.05)', fontSize: 12, color: 'var(--t3)',
                          }}>
                            Acceso global a todos los grupos y locales del sistema.
                          </div>
                        )
                      }

                      return (
                        <>
                          {/* Grupo — requerido para admin y cajero */}
                          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                            <label className="form-label">Grupo *</label>
                            <div className="form-input-wrap">
                              <select
                                required
                                value={roleForm.id_app}
                                onChange={e => setRoleForm({ ...roleForm, id_app: e.target.value, id_local: '', all_locals: true })}
                              >
                                <option value="">Seleccionar grupo...</option>
                                {apps.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                              </select>
                            </div>
                          </div>

                          {sinLocalesVeTodos(roleName) && (
                            <>
                              {/* Admin/externo: todos los locales O específicos */}
                              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                                <label className="checkbox-wrap">
                                  <input
                                    type="checkbox"
                                    checked={roleForm.all_locals}
                                    onChange={e => setRoleForm({ ...roleForm, all_locals: e.target.checked, id_local: '' })}
                                  />
                                  <span className="checkbox-label">Acceso a todos los locales del grupo</span>
                                </label>
                              </div>
                              {!roleForm.all_locals && (
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                  <label className="form-label">Local inicial (opcional)</label>
                                  <div className="form-input-wrap">
                                    <select
                                      value={roleForm.id_local}
                                      onChange={e => setRoleForm({ ...roleForm, id_local: e.target.value })}
                                      disabled={!roleForm.id_app}
                                    >
                                      <option value="">Sin local (agregar luego)</option>
                                      {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                                    </select>
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {!sinLocalesVeTodos(roleName) && (
                            /* Cajero, data_entry y cualquier rol scoped sin "todos los
                               locales": el local es requerido. Antes esta rama era solo
                               de cajero y a un data_entry no se le podía asignar local
                               desde acá: quedaba sin locales y no veía ni cargaba nada. */
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                              <label className="form-label">Local *</label>
                              <div className="form-input-wrap">
                                <select
                                  required
                                  value={roleForm.id_local}
                                  onChange={e => setRoleForm({ ...roleForm, id_local: e.target.value })}
                                  disabled={!roleForm.id_app}
                                >
                                  <option value="">Seleccionar local...</option>
                                  {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                                </select>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={roleSaving}>
                        {roleSaving
                          ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Guardando...</>
                          : 'Guardar'}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => { setShowRoleForm(false); setRoleForm(EMPTY_ROLE) }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                )
              )}

              {/* Activate / Deactivate — solo super_admin */}
              {amISuperAdmin && (
                <>
                  <div style={{ height: 1, background: 'rgba(var(--velo-rgb), 0.06)', margin: '1rem 0' }} />
                  {selected.activo ? (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => handleDeactivate(selected.id, e)}
                    >
                      <IcoTrash /> Desactivar usuario
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleReactivate(selected.id)}
                      >
                        ↺ Reactivar usuario
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={(e) => handleHardDelete(selected.id, e)}
                      >
                        <IcoTrash /> Eliminar definitivamente
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}
      </DrawerPanel>

      {/* ── New User Drawer ── */}
      <DrawerPanel
        open={newOpen}
        onClose={closeNew}
        title="Nuevo Usuario"
        width={400}
      >
        <form onSubmit={handleCreateUser}>
          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <div className="form-input-wrap">
              <input
                required
                placeholder="Juan Pérez"
                value={newForm.nombre}
                onChange={e => setNewForm({ ...newForm, nombre: e.target.value })}
              />
            </div>
            {newErrors.nombre && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{newErrors.nombre}</span>}
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Email *</label>
            <div className="form-input-wrap">
              <input
                required
                type="email"
                placeholder="juan@empresa.com"
                value={newForm.email}
                onChange={e => setNewForm({ ...newForm, email: e.target.value })}
              />
            </div>
            {newErrors.email && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{newErrors.email}</span>}
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Contraseña *</label>
            <div className="form-input-wrap">
              <input
                required
                type="password"
                placeholder="••••••••"
                value={newForm.password}
                onChange={e => setNewForm({ ...newForm, password: e.target.value })}
              />
            </div>
            {newErrors.password && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{newErrors.password}</span>}
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Repetir contraseña *</label>
            <div className="form-input-wrap">
              <input
                required
                type="password"
                placeholder="••••••••"
                value={newForm.password2}
                onChange={e => setNewForm({ ...newForm, password2: e.target.value })}
              />
            </div>
            {newErrors.password2 && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{newErrors.password2}</span>}
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="checkbox-wrap">
              <input
                type="checkbox"
                checked={newForm.activo}
                onChange={e => setNewForm({ ...newForm, activo: e.target.checked })}
              />
              <span className="checkbox-label">Activo</span>
            </label>
          </div>

          {/* Datos de la persona. Opcionales: si no están a mano al dar el alta se
              cargan después desde el panel del usuario, y la tabla marca lo que falta. */}
          <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>
            Datos personales <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--t3)' }}>(opcional)</span>
          </div>
          <DatosPersona
            idPrefix="nuevo"
            valores={newForm}
            onChange={(campo, valor) => setNewForm(f => ({ ...f, [campo]: valor }))}
            puestosUsados={puestosUsados}
            disabled={newSaving}
          />

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={newSaving}>
              {newSaving
                ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</>
                : 'Crear Usuario'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeNew}>
              Cancelar
            </button>
          </div>
        </form>
      </DrawerPanel>
    </div>
  )
}
