import { useEffect, useState } from 'react'
import { usersApi } from '../../api/users.js'
import { useUiStore } from '../../store/uiStore.js'

export default function Users() {
  const notify = useUiStore((s) => s.notify)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    usersApi.list().then(({ data }) => setUsers(data)).catch(() => notify('Error al cargar usuarios', 'error')).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleDeactivate = async (id) => {
    if (!confirm('¿Desactivar usuario?')) return
    try { await usersApi.remove(id); notify('Usuario desactivado', 'success'); load() }
    catch { notify('Error al desactivar', 'error') }
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Cargando...</div>

  return (
    <div>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Usuarios</h1>

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Usuario', 'Email', 'Rol', 'App', 'Activo', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const primaryRole = u.user_app_roles?.[0]
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {u.avatar_url && <img src={u.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
                      <span style={{ fontWeight: 500 }}>{u.nombre}</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{u.email}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {primaryRole?.role?.nombre ? (
                      <span style={{ background: '#eff6ff', color: '#1e40af', padding: '0.2rem 0.5rem', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>{primaryRole.role.nombre}</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{primaryRole?.app?.nombre || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: u.activo ? '#16a34a' : '#dc2626' }}>{u.activo ? '✓' : '✗'}</span></td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {u.activo && (
                      <button onClick={() => handleDeactivate(u.id)} style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Desactivar</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No hay usuarios</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
