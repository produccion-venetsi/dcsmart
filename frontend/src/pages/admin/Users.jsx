import { useEffect, useState } from 'react'
import { usersApi }  from '../../api/users.js'
import { appsApi }   from '../../api/apps.js'
import { localesApi } from '../../api/locales.js'
import { rolesApi }  from '../../api/roles.js'
import { useUiStore } from '../../store/uiStore.js'
import { useAuthStore } from '../../store/authStore.js'
import DrawerPanel   from '../../components/DrawerPanel.jsx'

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

const EMPTY_USER = { nombre: '', email: '', password: '', password2: '', activo: true }
const EMPTY_ROLE = { id_app: '', id_role: '', id_local: '', all_locals: true }

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ u, size = 36, radius = 10, fontSize = 13 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
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

  // Detail drawer
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [selected,   setSelected]   = useState(null)
  const [reloading,  setReloading]  = useState(false)

  // Edit nombre inline
  const [editingNombre, setEditingNombre] = useState(false)
  const [editNombre,    setEditNombre]    = useState('')
  const [editSaving,    setEditSaving]    = useState(false)

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

  // ── load list ──────────────────────────────────────────────────────────────

  const load = () => {
    setLoading(true)
    usersApi.list()
      .then(({ data }) => setUsers(data))
      .catch(() => notify('Error al cargar usuarios', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

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
    setSelected(u)
    setShowRoleForm(false)
    setRoleForm(EMPTY_ROLE)
    setEditingNombre(false)
    setPanelOpen(true)
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

  // ── assign role ───────────────────────────────────────────────────────────

  const handleAssignRole = async (e) => {
    e.preventDefault()
    const global = isGlobalRole(roles, roleForm.id_role)
    const selectedRole = roles.find(r => r.id === roleForm.id_role)
    const roleName = selectedRole?.nombre

    if (!roleForm.id_role) { notify('El Rol es requerido', 'error'); return }
    if (!global && !roleForm.id_app) { notify('El Grupo es requerido', 'error'); return }
    if (roleName === 'cajero' && !roleForm.id_local) { notify('El Local es requerido para cajero', 'error'); return }

    setRoleSaving(true)
    try {
      const payload = {
        id_role: roleForm.id_role,
        ...(global ? {} : { id_app: roleForm.id_app }),
        // cajero: siempre envía local; admin: solo si eligió locales específicos
        ...(!global && roleForm.id_local && (roleName === 'cajero' || !roleForm.all_locals)
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
      })
      notify('Usuario creado', 'success')
      setNewOpen(false)
      load()
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

      {/* ── Table ── */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Apps / Roles</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 5 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 13 + i * 11) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {users.map((u) => (
                  <tr key={u.id} className="row-clickable" onClick={() => openDetail(u)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar u={u} />
                        <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{u.nombre}</span>
                      </div>
                    </td>
                    <td className="td-muted">{u.email}</td>
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
                      {u.activo && (
                        <button className="btn btn-sm btn-danger" onClick={(e) => handleDeactivate(u.id, e)}>
                          <IcoTrash /> Desactivar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">
                        <IcoUsers />
                        <p>No hay usuarios registrados.</p>
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
                      Alta: {new Date(selected.created_at).toLocaleDateString('es-AR')}
                    </div>
                  )}
                </div>
              </div>

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

              {/* Permisos individuales */}
              {userRoles.some(r => r.role?.nombre === 'admin') && (
                <>
                  <div className="drawer-section-title">Permisos individuales</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: '1.25rem', fontSize: 13, color: 'var(--t2)' }}>
                    <input
                      type="checkbox"
                      className="select-checkbox"
                      checked={(selected.user_permissions ?? []).some(p => p.module?.nombre === 'reportes' && p.can_view)}
                      onChange={async (e) => {
                        const checked = e.target.checked
                        try {
                          if (checked) {
                            await usersApi.setPermission(selected.id, 'reportes', { can_view: true })
                          } else {
                            await usersApi.removePermission(selected.id, 'reportes')
                          }
                          const { data } = await usersApi.get(selected.id)
                          setSelected(data)
                          usersApi.list().then(({ data: all }) => setUsers(all)).catch(() => {})
                        } catch (err) {
                          notify(err.response?.data?.error || 'Error al actualizar el permiso', 'error')
                        }
                      }}
                    />
                    Puede ver Reportes
                  </label>
                </>
              )}

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
                    const isAdmin    = r.role?.nombre === 'admin'
                    const isCajero   = r.role?.nombre === 'cajero'
                    const scoped     = isAdmin || isCajero
                    const granted    = accessByApp[r.id_app] ?? []
                    const grantedIds = new Set(granted.map(l => l.id))
                    const appLocales = localesByApp[r.id_app] ?? []
                    const available  = appLocales.filter(l => !grantedIds.has(l.id))
                    // admin sin locales específicos = todos los locales
                    const adminAllLocals = isAdmin && granted.length === 0

                    return (
                      <div key={r.id} style={{
                        padding: '0.75rem 1rem',
                        marginBottom: 6,
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.07)',
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
                                      background: 'rgba(255,255,255,0.06)',
                                      border: '1px solid rgba(255,255,255,0.1)',
                                      fontSize: 11, color: 'var(--t2)',
                                    }}>
                                      {l.nombre}
                                      {amISuperAdmin && isAdmin && (
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

                              {/* Admin: agregar más locales (quitar todos = vuelve a "todos los locales") */}
                              {amISuperAdmin && isAdmin && available.length > 0 && (
                                <select
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
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
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
                            background: 'rgba(255,255,255,0.05)', fontSize: 12, color: 'var(--t3)',
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

                          {roleName === 'admin' && (
                            <>
                              {/* Admin: todos los locales O específicos */}
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

                          {roleName === 'cajero' && (
                            /* Cajero: 1 solo local, requerido */
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
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '1rem 0' }} />
                  {selected.activo ? (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => handleDeactivate(selected.id, e)}
                    >
                      <IcoTrash /> Desactivar usuario
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleReactivate(selected.id)}
                    >
                      ↺ Reactivar usuario
                    </button>
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
