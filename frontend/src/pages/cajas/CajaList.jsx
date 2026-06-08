import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'

const EMPTY_CAJA = {
  nro_turno: '', fecha_inicio: '', cajero: '', total: '',
  efectivo: '', fiscal: '', comensales: '', tickets: '', observaciones: '', foto_url: ''
}

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
function IcoEye() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}
function IcoCaja() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  )
}
function IcoLink() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  )
}

function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0 })}` : '—' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR') : '—' }

export default function CajaList() {
  const navigate    = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify      = useUiStore((s) => s.notify)

  const [cajas,     setCajas]     = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState(EMPTY_CAJA)
  const [saving,    setSaving]    = useState(false)

  const totalPages = Math.ceil(total / 20)

  const load = () => {
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, page, limit: 20 })
      .then(({ data }) => { setCajas(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar cajas', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, page, limit: 20 }, ctrl.signal)
      .then(({ data }) => { setCajas(data.data); setTotal(data.total) })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar cajas', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [page, activeLocal?.id])

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta caja?')) return
    try { await cajasApi.remove(id); notify('Caja eliminada', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
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

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Cajas</h1>
          {activeLocal && <p className="page-sub">{activeLocal.nombre}</p>}
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancelar' : <><IcoPlus /> Nueva Caja</>}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="form-panel" onSubmit={handleCreate}>
          <div className="form-panel-title">Nueva Caja</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Fecha Inicio *</label>
              <div className="form-input-wrap">
                <input type="datetime-local" required value={form.fecha_inicio} onChange={e => setF('fecha_inicio', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Nro Turno</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="T-001" value={form.nro_turno} onChange={e => setF('nro_turno', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cajero</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Nombre del cajero" value={form.cajero} onChange={e => setF('cajero', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Total</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.total} onChange={e => setF('total', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Efectivo</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.efectivo} onChange={e => setF('efectivo', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Fiscal</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.fiscal} onChange={e => setF('fiscal', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Comensales</label>
              <div className="form-input-wrap">
                <input type="number" placeholder="0" value={form.comensales} onChange={e => setF('comensales', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tickets</label>
              <div className="form-input-wrap">
                <input type="number" placeholder="0" value={form.tickets} onChange={e => setF('tickets', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">URL Foto</label>
              <div className="form-input-wrap">
                <input type="url" placeholder="https://..." value={form.foto_url} onChange={e => setF('foto_url', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Observaciones</label>
              <div className="form-input-wrap form-textarea-wrap">
                <textarea rows={2} value={form.observaciones} onChange={e => setF('observaciones', e.target.value)} placeholder="Notas opcionales..." />
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : 'Crear Caja'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {!activeLocal && (
        <div className="table-wrap">
          <div className="table-empty">
            <IcoCaja />
            <p>Seleccioná un local desde el Dashboard<br/>para ver sus cajas.</p>
          </div>
        </div>
      )}

      {activeLocal && (
        <>
          {loading ? (
            <div className="page-loading"><div className="spinner" /></div>
          ) : (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nro Turno</th>
                    <th>Inicio</th>
                    <th>Cierre</th>
                    <th>Cajero</th>
                    <th>Total</th>
                    <th>Efectivo</th>
                    <th>Fiscal</th>
                    <th>Comensales</th>
                    <th>Tickets</th>
                    <th>Origen</th>
                    <th>Observaciones</th>
                    <th>Foto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cajas.map((c) => (
                    <tr key={c.id}>
                      <td className="td-primary">{c.nro_turno || <span className="td-muted">—</span>}</td>
                      <td>{fmtDate(c.fecha_inicio)}</td>
                      <td className="td-muted">{fmtDate(c.fecha_cierre)}</td>
                      <td>{c.cajero || <span className="td-muted">—</span>}</td>
                      <td className="td-number">{fmt$(c.total)}</td>
                      <td className="td-number">{fmt$(c.efectivo)}</td>
                      <td className="td-number">{fmt$(c.fiscal)}</td>
                      <td className="td-muted" style={{ textAlign: 'right' }}>{c.comensales ?? '—'}</td>
                      <td className="td-muted" style={{ textAlign: 'right' }}>{c.tickets ?? '—'}</td>
                      <td>
                        {c.origin && c.origin !== 'DCSMART'
                          ? <span className="badge badge-muted">{c.origin}</span>
                          : <span className="td-muted">—</span>}
                      </td>
                      <td style={{ maxWidth: 180 }}>
                        {c.observaciones
                          ? <span title={c.observaciones} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170, fontSize: 12, color: 'var(--t2)' }}>{c.observaciones}</span>
                          : <span className="td-muted">—</span>}
                      </td>
                      <td>
                        {c.foto_url
                          ? <a href={c.foto_url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-bright)' }}><IcoLink /></a>
                          : <span className="td-muted">—</span>}
                      </td>
                      <td>
                        <div className="td-actions">
                          <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/cajas/${c.id}`)}>
                            <IcoEye /> Ver
                          </button>
                          <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDelete(c.id)}>
                            <IcoTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {cajas.length === 0 && (
                    <tr>
                      <td colSpan={13}>
                        <div className="table-empty">
                          <IcoCaja />
                          <p>No hay cajas registradas para este local.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {total > 20 && (
            <div className="pagination">
              <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
              <span className="pagination-info">Página {page} de {totalPages}</span>
              <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
