import { useEffect, useState } from 'react'
import { impuestosApi } from '../../api/impuestos.js'
import { useUiStore } from '../../store/uiStore.js'

function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    </svg>
  )
}
function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

const TIPOS = ['IVA21', 'IVA10', 'RETENCION', 'PERCEPCION']
const TIPO_BADGE = { IVA21: 'badge-blue', IVA10: 'badge-blue', RETENCION: 'badge-amber', PERCEPCION: 'badge-amber' }

function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR') : '—' }

export default function Impuestos() {
  const notify = useUiStore((s) => s.notify)

  const [impuestos, setImpuestos] = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [form,      setForm]      = useState({ id_pago: '', tipo: 'IVA21', monto: '' })
  const [saving,    setSaving]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)

  const totalPages = Math.ceil(total / 50)

  const load = () => {
    setLoading(true)
    impuestosApi.list({ page, limit: 50 })
      .then(({ data }) => { setImpuestos(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar impuestos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    impuestosApi.list({ page, limit: 50 })
      .then(({ data }) => { setImpuestos(data.data); setTotal(data.total) })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar impuestos', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [page])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.id_pago.trim() || !form.monto) return
    setSaving(true)
    try {
      await impuestosApi.create(form)
      notify('Impuesto creado', 'success')
      setForm({ id_pago: '', tipo: 'IVA21', monto: '' })
      setShowForm(false)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar impuesto?')) return
    try { await impuestosApi.remove(id); notify('Eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Impuestos</h1>
          <p className="page-sub">Impuestos y retenciones sobre pagos</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancelar' : <><IcoPlus /> Nuevo Impuesto</>}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="form-panel" onSubmit={handleSubmit}>
          <div className="form-panel-title">Nuevo Impuesto</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">ID del Pago *</label>
              <div className="form-input-wrap">
                <input required placeholder="UUID del pago" value={form.id_pago} onChange={e => setForm({ ...form, id_pago: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <div className="form-input-wrap">
                <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Monto *</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" required placeholder="0.00" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : 'Crear Impuesto'}
            </button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Pago Nro</th>
              <th>Fecha Pago</th>
              <th>Tipo</th>
              <th>Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 6 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 11 + i * 13) % 42}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
            <>
              {impuestos.map((imp) => (
                <tr key={imp.id}>
                  <td className="td-mono" style={{ fontSize: 11, color: 'var(--t3)' }}>{imp.id.slice(0, 8)}…</td>
                  <td className="td-primary">{imp.pago?.nro_ord ?? <span className="td-muted">—</span>}</td>
                  <td className="td-muted">{fmtDate(imp.pago?.fecha)}</td>
                  <td>
                    <span className={`badge ${TIPO_BADGE[imp.tipo] ?? 'badge-muted'}`}>{imp.tipo}</span>
                  </td>
                  <td className="td-number">{fmt$(imp.monto)}</td>
                  <td>
                    <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDelete(imp.id)}>
                      <IcoTrash />
                    </button>
                  </td>
                </tr>
              ))}
              {impuestos.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>Sin impuestos registrados</td></tr>
              )}
            </>
            )}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div className="pagination">
          <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
          <span className="pagination-info">Página {page} de {totalPages}</span>
          <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
  )
}
