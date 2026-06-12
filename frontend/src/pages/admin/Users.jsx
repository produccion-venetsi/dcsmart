import { useEffect, useState } from 'react'
import { usersApi }  from '../../api/users.js'
import { appsApi }   from '../../api/apps.js'
import { localesApi } from '../../api/locales.js'
import { rolesApi }  from '../../api/roles.js'
import { useUiStore } from '../../store/uiStore.js'
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
  admin:       'badge-blue',
  cajero:      'badge-green',
}

const EMPTY_USER = { nombre: '', email: '', password: '', password2: '', activo: true }
const EMPTY_ROLE = { id_app: '', id_role: '', id_local: '' }

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
  const notify = useUiStore((s) => s.notify)

  // List state
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)

  // Detail drawer
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [selected,   setSelected]   = useState(null)
  const [reloading,  setReloading]  = useState(false)

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

  // ── open / close detail drawer ────────────────────────────────────────────

  const openDetail = (u) => {
    setSelected(u)
    setShowRoleForm(false)
    setRoleForm(EMPTY_ROLE)
    setPanelOpen(true)
  }

  const closeDetail = () => {
    setPanelOpen(false)
    setShowRoleForm(false)
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

  // ── deactivate ────────────────────────────────────────────────────────────

  const handleDeactivate = async (id, e) => {
    e?.stopPropagation?.()
    if (!confirm('¿Desactivar este usuario?')) return
    try {
      await usersApi.remove(id)
      notify('Usuario desactivado', 'success')
      closeDetail()
      load()
    } catch {
      notify('Error al desactivar', 'error')
    }
  }

  // ── assign role ───────────────────────────────────────────────────────────

  const handleAssignRole = async (e) => {
    e.preventDefault()
    if (!roleForm.id_app || !roleForm.id_role) {
      notify('App y Rol son requeridos', 'error')
      return
    }
    setRoleSaving(true)
    try {
      const payload = {
        id_app:  roleForm.id_app,
        id_role: roleForm.id_role,
        ...(roleForm.id_local ? { id_local: roleForm.id_local } : {}),
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
                              title={r.app?.nombre}>
                              {r.app?.nombre} · {r.role?.nombre}
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
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{selected.nombre}</div>
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
                    const localesRestringidos = accessByApp[r.id_app] ?? []
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
                            {r.app?.nombre || '—'}
                          </span>
                          <span className={`badge ${ROLE_BADGE[r.role?.nombre] ?? 'badge-muted'}`}>
                            {r.role?.nombre || '—'}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--t3)' }}>
                          {localesRestringidos.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {localesRestringidos.map((l) => (
                                <span key={l.id} style={{
                                  padding: '1px 8px', borderRadius: 6,
                                  background: 'rgba(255,255,255,0.06)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  fontSize: 11, color: 'var(--t2)',
                                }}>
                                  {l.nombre}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontStyle: 'italic' }}>Todos los locales</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Role sub-form */}
              {!showRoleForm ? (
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
                    Asignar Rol
                  </div>

                  {/* App select */}
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">App *</label>
                    <div className="form-input-wrap">
                      <select
                        required
                        value={roleForm.id_app}
                        onChange={e => setRoleForm({ ...roleForm, id_app: e.target.value, id_local: '' })}
                      >
                        <option value="">Seleccionar app...</option>
                        {apps.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Role select */}
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Rol *</label>
                    <div className="form-input-wrap">
                      <select
                        required
                        value={roleForm.id_role}
                        onChange={e => setRoleForm({ ...roleForm, id_role: e.target.value })}
                      >
                        <option value="">Seleccionar rol...</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Local select (optional) */}
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label">Local (opcional)</label>
                    <div className="form-input-wrap">
                      <select
                        value={roleForm.id_local}
                        onChange={e => setRoleForm({ ...roleForm, id_local: e.target.value })}
                        disabled={!roleForm.id_app}
                      >
                        <option value="">Todos los locales</option>
                        {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                      </select>
                    </div>
                  </div>

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
              )}

              {/* Deactivate */}
              {selected.activo && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '1rem 0' }} />
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={(e) => handleDeactivate(selected.id, e)}
                  >
                    <IcoTrash /> Desactivar usuario
                  </button>
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
