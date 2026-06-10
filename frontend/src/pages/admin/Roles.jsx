import { useEffect, useState } from 'react'
import { rolesApi } from '../../api/roles.js'
import { useUiStore } from '../../store/uiStore.js'

function IcoCheck() {
  return <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function IcoX() {
  return <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}

function PermCell({ yes }) {
  return (
    <td style={{ textAlign: 'center' }}>
      {yes
        ? <span style={{ color: 'var(--green)' }}><IcoCheck /></span>
        : <span style={{ color: 'var(--t4)' }}><IcoX /></span>}
    </td>
  )
}

export default function Roles() {
  const notify = useUiStore((s) => s.notify)
  const [roles,   setRoles]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    rolesApi.list()
      .then(({ data }) => setRoles(data))
      .catch(() => notify('Error al cargar roles', 'error'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Roles y Permisos</h1>
          <p className="page-sub">Permisos por defecto de cada rol del sistema</p>
        </div>
      </div>

      {loading ? (
        Array.from({ length: 3 }, (_, i) => (
          <div key={i} style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span className="skel" style={{ width: 100, height: 14 }} />
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th style={{ textAlign: 'center' }}>Ver</th>
                    <th style={{ textAlign: 'center' }}>Crear</th>
                    <th style={{ textAlign: 'center' }}>Editar</th>
                    <th style={{ textAlign: 'center' }}>Eliminar</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 4 }, (_, j) => (
                    <tr key={j} className="skel-row">
                      {Array.from({ length: 5 }, (_, k) => (
                        <td key={k}><span className="skel" style={{ width: `${50 + (k * 11 + j * 9) % 40}%` }} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        <>
          {roles.map((role) => {
            const perms = role.role_permissions ?? []
            return (
              <div key={role.id} style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{role.nombre}</h2>
                  {role.descripcion && <span style={{ fontSize: 12, color: 'var(--t3)' }}>{role.descripcion}</span>}
                </div>
                <div className="table-wrap" style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Módulo</th>
                        <th style={{ textAlign: 'center' }}>Ver</th>
                        <th style={{ textAlign: 'center' }}>Crear</th>
                        <th style={{ textAlign: 'center' }}>Editar</th>
                        <th style={{ textAlign: 'center' }}>Eliminar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perms.map((p) => (
                        <tr key={p.id}>
                          <td className="td-primary">{p.module?.nombre || p.id_module}</td>
                          <PermCell yes={p.can_view} />
                          <PermCell yes={p.can_create} />
                          <PermCell yes={p.can_edit} />
                          <PermCell yes={p.can_delete} />
                        </tr>
                      ))}
                      {perms.length === 0 && (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--t3)' }}>Sin permisos asignados</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {roles.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Sin roles</div>
          )}
        </>
      )}
    </div>
  )
}
