import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { movimientosApi } from '../../api/movimientos.js'
import { useUiStore } from '../../store/uiStore.js'

export default function CajaDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const [caja, setCaja] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newMov, setNewMov] = useState({ tipo: 'INGRESO', monto: '', id_metodo: '' })

  const load = () => {
    setLoading(true)
    cajasApi.get(id)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar la caja', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  const handleAddMovimiento = async (e) => {
    e.preventDefault()
    try {
      await movimientosApi.create({ ...newMov, monto: parseFloat(newMov.monto), id_caja: id })
      notify('Movimiento agregado', 'success')
      setNewMov({ tipo: 'INGRESO', monto: '', id_metodo: '' })
      load()
    } catch { notify('Error al agregar movimiento', 'error') }
  }

  const handleDeleteMov = async (movId) => {
    if (!confirm('¿Eliminar movimiento?')) return
    try {
      await movimientosApi.remove(movId)
      notify('Movimiento eliminado', 'success')
      load()
    } catch { notify('Error al eliminar', 'error') }
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Cargando...</div>
  if (!caja) return <div style={{ padding: '2rem', color: '#dc2626' }}>Caja no encontrada</div>

  const totalMovimientos = caja.movimientos?.reduce((acc, m) => acc + Number(m.monto), 0) || 0

  return (
    <div>
      <button onClick={() => navigate('/cajas')} style={{ marginBottom: '1rem', background: 'none', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: '0.9rem' }}>
        ← Volver a Cajas
      </button>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280, background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 700 }}>
            Caja {caja.nro_turno || `#${caja.id.slice(0, 8)}`}
          </h2>
          {[
            ['Local', caja.local?.nombre],
            ['Inicio', new Date(caja.fecha_inicio).toLocaleString('es-AR')],
            ['Cierre', caja.fecha_cierre ? new Date(caja.fecha_cierre).toLocaleString('es-AR') : '—'],
            ['Cajero', caja.cajero || '—'],
            ['Total', caja.total ? `$${Number(caja.total).toLocaleString('es-AR')}` : '—'],
            ['Efectivo', caja.efectivo ? `$${Number(caja.efectivo).toLocaleString('es-AR')}` : '—'],
            ['Fiscal', caja.fiscal ? `$${Number(caja.fiscal).toLocaleString('es-AR')}` : '—'],
            ['Comensales', caja.comensales ?? '—'],
            ['Tickets', caja.tickets ?? '—'],
            ['Origen', caja.origin]
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: '#64748b', fontSize: '0.875rem' }}>{k}</span>
              <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 2, minWidth: 320 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>
              Movimientos ({caja.movimientos?.length || 0}) — Total: ${totalMovimientos.toLocaleString('es-AR')}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Tipo', 'Método', 'Monto', 'Cantidad', ''].map((h) => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(caja.movimientos || []).map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{m.tipo}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{m.metodo_pago?.nombre || '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>${Number(m.monto).toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{m.cantidad ?? '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <button onClick={() => handleDeleteMov(m.id)} style={{ padding: '0.2rem 0.5rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                    </td>
                  </tr>
                ))}
                {(!caja.movimientos || caja.movimientos.length === 0) && (
                  <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>Sin movimientos</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleAddMovimiento} style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Agregar Movimiento</h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Tipo</label>
                <select value={newMov.tipo} onChange={(e) => setNewMov({ ...newMov, tipo: e.target.value })} style={{ padding: '0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}>
                  <option>INGRESO</option>
                  <option>EGRESO</option>
                  <option>APERTURA</option>
                  <option>CIERRE</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Monto</label>
                <input type="number" step="0.01" required value={newMov.monto} onChange={(e) => setNewMov({ ...newMov, monto: e.target.value })} style={{ padding: '0.5rem', borderRadius: 4, border: '1px solid #d1d5db', width: 120 }} />
              </div>
              <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Agregar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
