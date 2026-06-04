import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'

const ESTADO_COLORS = {
  PENDIENTE: '#f59e0b', APROBADO: '#3b82f6', RECHAZADO: '#ef4444', PAGADO: '#22c55e'
}

export default function PagoList() {
  const navigate = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify = useUiStore((s) => s.notify)
  const [pagos, setPagos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ pagado: '', estado_op: '' })

  const load = () => {
    setLoading(true)
    const params = {
      id_local: activeLocal?.id, page, limit: 20,
      ...(filters.pagado !== '' ? { pagado: filters.pagado } : {}),
      ...(filters.estado_op ? { estado_op: filters.estado_op } : {})
    }
    pagosApi.list(params)
      .then(({ data }) => { setPagos(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar pagos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [page, activeLocal?.id, filters.pagado, filters.estado_op])

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este pago?')) return
    try { await pagosApi.remove(id); notify('Pago eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  const handleAudit = async (id) => {
    try { await pagosApi.audit(id); notify('Pago auditado', 'success'); load() }
    catch { notify('Error al auditar', 'error') }
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Pagos</h1>
        <button onClick={() => navigate('/pagos/nuevo')} style={{ padding: '0.6rem 1.25rem', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>+ Nuevo Pago</button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={filters.pagado} onChange={(e) => { setFilters({ ...filters, pagado: e.target.value }); setPage(1) }} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}>
          <option value="">Todos</option>
          <option value="false">No pagados</option>
          <option value="true">Pagados</option>
        </select>
        <select value={filters.estado_op} onChange={(e) => { setFilters({ ...filters, estado_op: e.target.value }); setPage(1) }} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}>
          <option value="">Todos los estados</option>
          {['PENDIENTE', 'APROBADO', 'RECHAZADO', 'PAGADO'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Fecha', 'Proveedor', 'Importe', 'Estado', 'Pagado', 'Audit', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem' }}>{p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR') : '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{p.proveedor?.nombre || '—'}</td>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{p.importe ? `$${Number(p.importe).toLocaleString('es-AR')}` : '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {p.estado_op ? (
                    <span style={{ background: ESTADO_COLORS[p.estado_op] + '20', color: ESTADO_COLORS[p.estado_op], padding: '0.2rem 0.5rem', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>{p.estado_op}</span>
                  ) : '—'}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: p.pagado ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{p.pagado ? '✓' : '✗'}</span></td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {p.audit ? <span style={{ color: '#16a34a', fontSize: '0.75rem' }}>✓ Auditado</span> : (
                    <button onClick={() => handleAudit(p.id)} style={{ padding: '0.2rem 0.5rem', background: '#f0fdf4', color: '#16a34a', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Auditar</button>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => navigate(`/pagos/${p.id}/editar`)} style={{ padding: '0.3rem 0.6rem', background: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Editar</button>
                  <button onClick={() => handleDelete(p.id)} style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                </td>
              </tr>
            ))}
            {pagos.length === 0 && <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No hay pagos registrados</td></tr>}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} style={{ padding: '0.4rem 0.75rem', borderRadius: 4, border: '1px solid #e2e8f0', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>← Anterior</button>
          <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Página {page} de {Math.ceil(total / 20)}</span>
          <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)} style={{ padding: '0.4rem 0.75rem', borderRadius: 4, border: '1px solid #e2e8f0', cursor: page >= Math.ceil(total / 20) ? 'not-allowed' : 'pointer' }}>Siguiente →</button>
        </div>
      )}
    </div>
  )
}
