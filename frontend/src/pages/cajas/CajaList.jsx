import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'

const EMPTY_CAJA = { nro_turno: '', fecha_inicio: '', cajero: '', total: '', efectivo: '', fiscal: '', comensales: '', tickets: '', observaciones: '' }

export default function CajaList() {
  const navigate = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify = useUiStore((s) => s.notify)
  const [cajas, setCajas] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_CAJA)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, page, limit: 20 })
      .then(({ data }) => { setCajas(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar cajas', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [page, activeLocal?.id])

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta caja?')) return
    try {
      await cajasApi.remove(id)
      notify('Caja eliminada', 'success')
      load()
    } catch { notify('Error al eliminar', 'error') }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!activeLocal) { notify('Seleccioná un local primero', 'error'); return }
    setSaving(true)
    try {
      await cajasApi.create({ ...form, id_local: activeLocal.id })
      notify('Caja creada', 'success')
      setForm(EMPTY_CAJA)
      setShowForm(false)
      load()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
    } finally { setSaving(false) }
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Cajas</h1>
          {activeLocal && <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>Local: {activeLocal.nombre}</p>}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{ padding: '0.6rem 1.25rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
        >
          {showForm ? 'Cancelar' : '+ Nueva Caja'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Nueva Caja</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {[
              ['fecha_inicio', 'Fecha Inicio *', 'datetime-local', true],
              ['nro_turno', 'Nro Turno', 'text', false],
              ['cajero', 'Cajero', 'text', false],
              ['total', 'Total', 'number', false],
              ['efectivo', 'Efectivo', 'number', false],
              ['fiscal', 'Fiscal', 'number', false],
              ['comensales', 'Comensales', 'number', false],
              ['tickets', 'Tickets', 'number', false]
            ].map(([f, l, t, req]) => (
              <div key={f}>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>{l}</label>
                <input
                  type={t}
                  required={req}
                  step={t === 'number' ? '0.01' : undefined}
                  value={form[f]}
                  onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Observaciones</label>
            <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} rows={2} style={{ width: '100%', padding: '0.45rem', borderRadius: 6, border: '1px solid #d1d5db', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={saving} style={{ padding: '0.55rem 1.25rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : 'Crear Caja'}
          </button>
        </form>
      )}

      {!activeLocal && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 10 }}>
          Seleccioná un local desde el Dashboard para ver sus cajas.
        </div>
      )}

      {activeLocal && (
        <>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Nro Turno', 'Inicio', 'Cierre', 'Total', 'Efectivo', 'Cajero', 'Acciones'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cajas.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.nro_turno || '-'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{new Date(c.fecha_inicio).toLocaleDateString('es-AR')}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleDateString('es-AR') : '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{c.total ? `$${Number(c.total).toLocaleString('es-AR')}` : '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.efectivo ? `$${Number(c.efectivo).toLocaleString('es-AR')}` : '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.cajero || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => navigate(`/cajas/${c.id}`)} style={{ padding: '0.3rem 0.75rem', background: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Ver</button>
                      <button onClick={() => handleDelete(c.id)} style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✕</button>
                    </td>
                  </tr>
                ))}
                {cajas.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No hay cajas registradas</td></tr>
                )}
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
        </>
      )}
    </div>
  )
}
