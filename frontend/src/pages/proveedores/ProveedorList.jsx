import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'

export default function ProveedorList() {
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const [proveedores, setProveedores] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    proveedoresApi.list({ activo: 'true', search: search || undefined })
      .then(({ data }) => setProveedores(data))
      .catch(() => notify('Error al cargar proveedores', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [search])

  const handleDelete = async (id) => {
    if (!confirm('¿Desactivar este proveedor?')) return
    try { await proveedoresApi.remove(id); notify('Proveedor desactivado', 'success'); load() }
    catch { notify('Error al desactivar', 'error') }
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Proveedores</h1>
        <button onClick={() => navigate('/proveedores/nuevo')} style={{ padding: '0.6rem 1.25rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>+ Nuevo Proveedor</button>
      </div>

      <input
        type="search"
        placeholder="Buscar por nombre, razón social o CUIT..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', maxWidth: 400, padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: '1rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
      />

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Nombre', 'Razón Social', 'CUIT', 'Teléfono', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{p.nombre}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{p.razon_social || '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{p.cuit || '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{p.telefono || '—'}</td>
                <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => navigate(`/proveedores/${p.id}/editar`)} style={{ padding: '0.3rem 0.6rem', background: '#f5f3ff', color: '#7c3aed', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Editar</button>
                  <button onClick={() => handleDelete(p.id)} style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                </td>
              </tr>
            ))}
            {proveedores.length === 0 && <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No hay proveedores</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
