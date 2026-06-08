import { useEffect, useState } from 'react'
import { usersApi } from '../../api/users.js'
import { useUiStore } from '../../store/uiStore.js'

function IcoUsersEmpty() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
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

const ROLE_BADGE = {
  super_admin: 'badge-gold',
  admin:       'badge-gold',
  gerente:     'badge-blue',
  cajero:      'badge-green',
  operador:    'badge-purple',
}

function initials(nombre) {
  if (!nombre) return '?'
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

export default function Users() {
  const notify   = useUiStore((s) => s.notify)
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    usersApi.list()
      .then(({ data }) => setUsers(data))
      .catch(() => notify('Error al cargar usuarios', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleDeactivate = async (id) => {
    if (!confirm('¿Desactivar usuario?')) return
    try { await usersApi.remove(id); notify('Usuario desactivado', 'success'); load() }
    catch { notify('Error al desactivar', 'error') }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Usuarios</h1>
          <p className="page-sub">Gestión de accesos y roles</p>
        </div>
      </div>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>App</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const primaryRole = u.user_app_roles?.[0]
                const roleName    = primaryRole?.role?.nombre ?? ''
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-cell-avatar">
                          {u.avatar_url
                            ? <img src={u.avatar_url} alt={u.nombre} />
                            : initials(u.nombre)}
                        </div>
                        <span className="user-cell-name">{u.nombre}</span>
                      </div>
                    </td>
                    <td className="td-muted">{u.email}</td>
                    <td>
                      {roleName
                        ? <span className={`badge ${ROLE_BADGE[roleName] ?? 'badge-muted'}`}>{roleName}</span>
                        : <span className="td-muted">—</span>}
                    </td>
                    <td className="td-muted">{primaryRole?.app?.nombre || '—'}</td>
                    <td>
                      <span className={u.activo ? 'bool-yes' : 'bool-no'}>
                        {u.activo ? '● Activo' : '○ Inactivo'}
                      </span>
                    </td>
                    <td>
                      {u.activo && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeactivate(u.id)}
                        >
                          <IcoTrash /> Desactivar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">
                      <IcoUsersEmpty />
                      <p>No hay usuarios registrados.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
