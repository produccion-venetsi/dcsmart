import { useEffect, useState } from 'react'
import { cajasApi } from '../../api/cajas.js'
import { movimientosApi } from '../../api/movimientos.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'

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
function fmt$2(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR') : '—' }
function fmtDT(d) { return d ? new Date(d).toLocaleString('es-AR') : '—' }

function CajaDetailPanel({ cajaId, onRefreshList }) {
  const notify = useUiStore((s) => s.notify)
  const [caja,    setCaja]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [newMov,  setNewMov]  = useState({ tipo: 'INGRESO', monto: '' })
  const [saving,  setSaving]  = useState(false)

  const load = () => {
    setLoading(true)
    cajasApi.get(cajaId)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar caja', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (cajaId) load() }, [cajaId])

  const handleAddMov = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await movimientosApi.create({ ...newMov, monto: parseFloat(newMov.monto), id_caja: cajaId })
      notify('Movimiento agregado', 'success')
      setNewMov({ tipo: 'INGRESO', monto: '' })
      load()
    } catch { notify('Error al agregar movimiento', 'error') }
    finally { setSaving(false) }
  }

  const handleDeleteMov = async (movId) => {
    if (!confirm('¿Eliminar movimiento?')) return
    try { await movimientosApi.remove(movId); notify('Eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>
  if (!caja) return <div style={{ color: 'var(--red)', padding: '1rem' }}>No se pudo cargar la caja.</div>

  const totalMov = caja.movimientos?.reduce((acc, m) => acc + Number(m.monto), 0) || 0

  const rows = [
    ['Local',      caja.local?.nombre ?? '—'],
    ['Inicio',     fmtDT(caja.fecha_inicio)],
    ['Cierre',     fmtDT(caja.fecha_cierre)],
    ['Cajero',     caja.cajero ?? '—'],
    ['Total',      fmt$(caja.total)],
    ['Efectivo',   fmt$(caja.efectivo)],
    ['Fiscal',     fmt$(caja.fiscal)],
    ['Comensales', caja.comensales ?? '—'],
    ['Tickets',    caja.tickets ?? '—'],
    ['Origen',     caja.origin ?? '—'],
  ]

  return (
    <div>
      {caja.observaciones && (
        <div style={{ marginBottom: '1rem', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, color: 'var(--t2)' }}>
          {caja.observaciones}
        </div>
      )}

      <div className="drawer-section-title">Datos del turno</div>
      <div className="drawer-detail">
        {rows.map(([k, v]) => (
          <div key={k} className="drawer-detail-row">
            <span className="drawer-detail-key">{k}</span>
            <span className="drawer-detail-val">{v}</span>
          </div>
        ))}
      </div>

      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Movimientos ({caja.movimientos?.length || 0})</span>
        <span style={{ color: 'var(--gold-bright)', fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}>{fmt$2(totalMov)}</span>
      </div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Método</th>
              <th>Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(caja.movimientos || []).map((m) => (
              <tr key={m.id}>
                <td>
                  <span className={`badge ${m.tipo === 'INGRESO' || m.tipo === 'APERTURA' ? 'badge-green' : 'badge-red'}`}>{m.tipo}</span>
                </td>
                <td className="td-muted">{m.metodo_pago?.nombre || '—'}</td>
                <td className="td-number">{fmt$2(m.monto)}</td>
                <td>
                  <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteMov(m.id)}>
                    <IcoTrash />
                  </button>
                </td>
              </tr>
            ))}
            {(!caja.movimientos || caja.movimientos.length === 0) && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--t3)' }}>Sin movimientos</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="drawer-section-title">Agregar Movimiento</div>
      <form onSubmit={handleAddMov}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Tipo</label>
            <div className="form-input-wrap">
              <select value={newMov.tipo} onChange={e => setNewMov({ ...newMov, tipo: e.target.value })}>
                <option>INGRESO</option>
                <option>EGRESO</option>
                <option>APERTURA</option>
                <option>CIERRE</option>
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Monto *</label>
            <div className="form-input-wrap">
              <input type="number" step="0.01" required placeholder="0.00" value={newMov.monto} onChange={e => setNewMov({ ...newMov, monto: e.target.value })} />
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving || !newMov.monto}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : <><IcoPlus /> Agregar</>}
        </button>
      </form>
    </div>
  )
}

function CajaCreatePanel({ activeLocal, onCreated, onClose }) {
  const notify = useUiStore((s) => s.notify)
  const [form,   setForm]   = useState(EMPTY_CAJA)
  const [saving, setSaving] = useState(false)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!activeLocal) { notify('Seleccioná un local primero', 'error'); return }
    setSaving(true)
    try {
      await cajasApi.create({ ...form, id_local: activeLocal.id })
      notify('Caja creada', 'success')
      onCreated()
      onClose()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleCreate}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fecha Inicio *</label>
          <div className="form-input-wrap">
            <input type="datetime-local" required value={form.fecha_inicio} onChange={e => setF('fecha_inicio', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nro Turno</label>
          <div className="form-input-wrap">
            <input placeholder="T-001" value={form.nro_turno} onChange={e => setF('nro_turno', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Cajero</label>
          <div className="form-input-wrap">
            <input placeholder="Nombre del cajero" value={form.cajero} onChange={e => setF('cajero', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Total</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={form.total} onChange={e => setF('total', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Efectivo</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={form.efectivo} onChange={e => setF('efectivo', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fiscal</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={form.fiscal} onChange={e => setF('fiscal', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Comensales</label>
          <div className="form-input-wrap">
            <input type="number" placeholder="0" value={form.comensales} onChange={e => setF('comensales', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Tickets</label>
          <div className="form-input-wrap">
            <input type="number" placeholder="0" value={form.tickets} onChange={e => setF('tickets', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label className="form-label">URL Foto</label>
          <div className="form-input-wrap">
            <input type="url" placeholder="https://..." value={form.foto_url} onChange={e => setF('foto_url', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label className="form-label">Observaciones</label>
          <div className="form-input-wrap form-textarea-wrap">
            <textarea rows={2} value={form.observaciones} onChange={e => setF('observaciones', e.target.value)} placeholder="Notas opcionales..." />
          </div>
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : 'Crear Caja'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}

export default function CajaList() {
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify      = useUiStore((s) => s.notify)

  const [cajas,     setCajas]     = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelMode, setPanelMode] = useState('create')
  const [selectedId, setSelectedId] = useState(null)

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

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar esta caja?')) return
    try { await cajasApi.remove(id); notify('Caja eliminada', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  const openCreate = () => { setPanelMode('create'); setPanelOpen(true) }
  const openDetail = (id) => { setSelectedId(id); setPanelMode('detail'); setPanelOpen(true) }
  const closePanel = () => setPanelOpen(false)

  const drawerTitle = panelMode === 'create'
    ? 'Nueva Caja'
    : cajas.find(c => c.id === selectedId)
        ? `Turno ${cajas.find(c => c.id === selectedId)?.nro_turno || selectedId?.slice(0, 8)}`
        : 'Detalle de Caja'

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Cajas</h1>
          {activeLocal && <p className="page-sub">{activeLocal.nombre}</p>}
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openCreate}>
            <IcoPlus /> Nueva Caja
          </button>
        </div>
      </div>

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
                  <th>Foto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 7 }, (_, i) => (
                    <tr key={i} className="skel-row">
                      {Array.from({ length: 12 }, (_, j) => (
                        <td key={j}><span className="skel" style={{ width: `${48 + (j * 11 + i * 9) % 44}%` }} /></td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <>
                    {cajas.map((c) => (
                      <tr key={c.id} className="row-clickable" onClick={() => openDetail(c.id)}>
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
                        <td>
                          {c.foto_url
                            ? <a href={c.foto_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--gold-bright)' }}><IcoLink /></a>
                            : <span className="td-muted">—</span>}
                        </td>
                        <td>
                          <div className="td-actions">
                            <button className="btn btn-sm btn-danger btn-icon" onClick={(e) => handleDelete(c.id, e)}>
                              <IcoTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {cajas.length === 0 && (
                      <tr>
                        <td colSpan={12}>
                          <div className="table-empty">
                            <IcoCaja />
                            <p>No hay cajas registradas para este local.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {total > 20 && (
            <div className="pagination">
              <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
              <span className="pagination-info">Página {page} de {totalPages}</span>
              <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
            </div>
          )}
        </>
      )}

      <DrawerPanel open={panelOpen} onClose={closePanel} title={drawerTitle} width={560}>
        {panelMode === 'create'
          ? <CajaCreatePanel activeLocal={activeLocal} onCreated={load} onClose={closePanel} />
          : <CajaDetailPanel cajaId={selectedId} onRefreshList={load} />
        }
      </DrawerPanel>
    </div>
  )
}
