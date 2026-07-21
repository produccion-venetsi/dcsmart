import { useEffect, useState } from 'react'
import { arqueoApi } from '../../api/arqueo.js'
import { detallesApi } from '../../api/detalles.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import { toDateTimeLocalInput, toUtcIsoFromDateTimeLocal, fmtDateTimeArg } from '../../lib/dates.js'

/* ── helpers ── */
function fmt$(n) {
  return n != null
    ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : '—'
}
const fmtDateTime = fmtDateTimeArg

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

/* ── panel de creación (con preview) ── */
function ArqueoCreatePanel({ activeLocal, onCreated }) {
  const notify = useUiStore((s) => s.notify)
  const [saving, setSaving] = useState(false)

  const [cajaFuerte, setCajaFuerte] = useState('')
  const [cofre,      setCofre]      = useState('')
  const [adicion,    setAdicion]    = useState('')

  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(true)

  const [tipos, setTipos] = useState([])
  const [pendingDetalles, setPendingDetalles] = useState([])
  const [detForm, setDetForm] = useState({ id_tipo: '', monto: '' })

  const fechaArqueo = new Date()

  useEffect(() => {
    detallesApi.tipos(activeLocal.id).then(r => setTipos(r.data || [])).catch(() => {})
    setLoadingPreview(true)
    arqueoApi.preview(activeLocal.id, fechaArqueo.toISOString())
      .then(({ data }) => setPreview(data))
      .catch(() => notify('Error al calcular el preview', 'error'))
      .finally(() => setLoadingPreview(false))
  }, [activeLocal.id])

  const total = (Number(cajaFuerte) || 0) + (Number(cofre) || 0) + (Number(adicion) || 0)
  const comprobacion = preview
    ? (preview.ingresos - preview.gastos) - (total - preview.total_ultimo_arqueo)
    : null

  const addPendingDetalle = () => {
    if (!detForm.monto) return
    setPendingDetalles(prev => [...prev, { ...detForm, _key: crypto.randomUUID() }])
    setDetForm({ id_tipo: '', monto: '' })
  }
  const removePendingDetalle = (key) => setPendingDetalles(prev => prev.filter(d => d._key !== key))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await arqueoApi.create({
        id_local: activeLocal.id,
        fecha: fechaArqueo.toISOString(),
        caja_fuerte: parseFloat(cajaFuerte) || 0,
        cofre: parseFloat(cofre) || 0,
        adicion: parseFloat(adicion) || 0,
        detalles: pendingDetalles.map(d => ({
          id_tipo: d.id_tipo || null,
          monto: parseFloat(d.monto) || 0
        }))
      })
      notify('Arqueo creado', 'success')
      onCreated()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear el arqueo', 'error')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Caja fuerte</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cajaFuerte} onChange={e => setCajaFuerte(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Cofre</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cofre} onChange={e => setCofre(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Adición</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={adicion} onChange={e => setAdicion(e.target.value)} />
        </div>
      </div>

      <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Detalles (opcional)</div>
      {pendingDetalles.map(d => (
        <div key={d._key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span>{tipos.find(t => t.id === d.id_tipo)?.nombre || 'Sin tipo'}: {fmt$(d.monto)}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => removePendingDetalle(d._key)}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: '0.5rem', alignItems: 'flex-start' }}>
        <div className="form-input-wrap" style={{ flex: 2 }}>
          <select value={detForm.id_tipo} onChange={e => setDetForm({ ...detForm, id_tipo: e.target.value })}>
            <option value="">Tipo…</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div className="form-input-wrap" style={{ flex: 1 }}>
          <input type="number" step="0.01" placeholder="Monto" value={detForm.monto} onChange={e => setDetForm({ ...detForm, monto: e.target.value })} />
        </div>
        <button type="button" className="btn btn-sm btn-secondary" onClick={addPendingDetalle}>
          <IcoPlus /> Agregar
        </button>
      </div>

      <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Comprobación</div>
      {loadingPreview ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><span className="spinner" /></div>
      ) : (
        <div className="drawer-detail">
          <div className="drawer-detail-row"><span className="drawer-detail-key">Total contado</span><span className="drawer-detail-val">{fmt$(total)}</span></div>
          <div className="drawer-detail-row"><span className="drawer-detail-key">Total arqueo anterior</span><span className="drawer-detail-val">{fmt$(preview?.total_ultimo_arqueo)}</span></div>
          <div className="drawer-detail-row"><span className="drawer-detail-key">Ingresos</span><span className="drawer-detail-val">{fmt$(preview?.ingresos)}</span></div>
          <div className="drawer-detail-row"><span className="drawer-detail-key">Gastos</span><span className="drawer-detail-val">{fmt$(preview?.gastos)}</span></div>
          <div className="drawer-detail-row">
            <span className="drawer-detail-key">Comprobación</span>
            <span className={`badge ${Math.abs(comprobacion) < 0.01 ? 'badge-green' : 'badge-red'}`}>{fmt$(comprobacion)}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving || loadingPreview}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Confirmar arqueo'}
        </button>
      </div>
    </form>
  )
}

/* ── panel de edición ── */
function ArqueoEditPanel({ arqueo, onSaved, onCancel }) {
  const notify = useUiStore((s) => s.notify)
  const [saving, setSaving] = useState(false)

  const [fecha,      setFecha]      = useState(toDateTimeLocalInput(arqueo.fecha))
  const [cajaFuerte, setCajaFuerte] = useState(String(arqueo.caja_fuerte))
  const [cofre,      setCofre]      = useState(String(arqueo.cofre))
  const [adicion,    setAdicion]    = useState(String(arqueo.adicion))
  const [detalles,   setDetalles]   = useState(
    (arqueo.detalles || []).map(d => ({ id_tipo: d.id_tipo || '', monto: String(d.monto), _key: d.id }))
  )
  const [tipos, setTipos] = useState([])
  const [detForm, setDetForm] = useState({ id_tipo: '', monto: '' })

  useEffect(() => {
    detallesApi.tipos(arqueo.id_local).then(r => setTipos(r.data || [])).catch(() => {})
  }, [arqueo.id_local])

  const addDetalle = () => {
    if (!detForm.monto) return
    setDetalles(prev => [...prev, { ...detForm, _key: crypto.randomUUID() }])
    setDetForm({ id_tipo: '', monto: '' })
  }
  const removeDetalle = (key) => setDetalles(prev => prev.filter(d => d._key !== key))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await arqueoApi.update(arqueo.id, {
        fecha: toUtcIsoFromDateTimeLocal(fecha),
        caja_fuerte: parseFloat(cajaFuerte) || 0,
        cofre: parseFloat(cofre) || 0,
        adicion: parseFloat(adicion) || 0,
        detalles: detalles.map(d => ({ id_tipo: d.id_tipo || null, monto: parseFloat(d.monto) || 0 }))
      })
      notify('Arqueo actualizado', 'success')
      onSaved()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al actualizar el arqueo', 'error')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Fecha</label>
        <div className="form-input-wrap">
          <input type="datetime-local" required value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Caja fuerte</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cajaFuerte} onChange={e => setCajaFuerte(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Cofre</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cofre} onChange={e => setCofre(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Adición</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={adicion} onChange={e => setAdicion(e.target.value)} />
        </div>
      </div>

      <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Detalles (opcional)</div>
      {detalles.map(d => (
        <div key={d._key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span>{tipos.find(t => t.id === d.id_tipo)?.nombre || 'Sin tipo'}: {fmt$(d.monto)}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => removeDetalle(d._key)}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: '0.5rem', alignItems: 'flex-start' }}>
        <div className="form-input-wrap" style={{ flex: 2 }}>
          <select value={detForm.id_tipo} onChange={e => setDetForm({ ...detForm, id_tipo: e.target.value })}>
            <option value="">Tipo…</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div className="form-input-wrap" style={{ flex: 1 }}>
          <input type="number" step="0.01" placeholder="Monto" value={detForm.monto} onChange={e => setDetForm({ ...detForm, monto: e.target.value })} />
        </div>
        <button type="button" className="btn btn-sm btn-secondary" onClick={addDetalle}>
          <IcoPlus /> Agregar
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Guardar cambios'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </form>
  )
}

/* ── panel de detalle ── */
function ArqueoDetailPanel({ arqueoId, canEdit, canDelete, onChanged }) {
  const notify = useUiStore((s) => s.notify)
  const [arqueo, setArqueo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [auditando, setAuditando] = useState(false)

  const load = () => {
    setLoading(true)
    arqueoApi.get(arqueoId)
      .then(({ data }) => setArqueo(data))
      .catch(() => notify('Error al cargar el arqueo', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [arqueoId])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><span className="spinner" /></div>
  if (!arqueo) return null

  if (editing) {
    return (
      <ArqueoEditPanel
        arqueo={arqueo}
        onCancel={() => setEditing(false)}
        onSaved={() => { setEditing(false); load(); onChanged() }}
      />
    )
  }

  const handleDelete = async () => {
    if (!confirm('¿Borrar este arqueo? Esta acción no se puede deshacer.')) return
    setDeleting(true)
    try {
      await arqueoApi.remove(arqueo.id)
      notify('Arqueo borrado', 'success')
      onChanged(true)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al borrar el arqueo', 'error')
      setDeleting(false)
    }
  }

  const cuadra = Math.abs(Number(arqueo.comprobacion)) < 0.01

  const handleAudit = async () => {
    setAuditando(true)
    try {
      const { data } = await arqueoApi.audit(arqueo.id)
      setArqueo(a => ({ ...a, audit: data.audit }))
      notify(data.audit ? 'Arqueo auditado' : 'Arqueo desauditado', 'success')
      onChanged()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al auditar', 'error')
    } finally { setAuditando(false) }
  }

  return (
    <div>
      <div className="drawer-detail">
        <div className="drawer-detail-row">
          <span className="drawer-detail-key">Auditado</span>
          <span className={`badge ${arqueo.audit ? 'badge-green' : 'badge-muted'}`}>
            {arqueo.audit ? '✓ Auditado' : 'No auditado'}
          </span>
        </div>
        {arqueo.audit_by && (
          <div className="drawer-detail-row"><span className="drawer-detail-key">Auditado por</span><span className="drawer-detail-val">{arqueo.audit_by} · {fmtDateTime(arqueo.audit_date)}</span></div>
        )}
        <div className="drawer-detail-row"><span className="drawer-detail-key">Fecha</span><span className="drawer-detail-val">{fmtDateTime(arqueo.fecha)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Caja fuerte</span><span className="drawer-detail-val">{fmt$(arqueo.caja_fuerte)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Cofre</span><span className="drawer-detail-val">{fmt$(arqueo.cofre)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Adición</span><span className="drawer-detail-val">{fmt$(arqueo.adicion)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Total</span><span className="drawer-detail-val">{fmt$(arqueo.total)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Ingresos</span><span className="drawer-detail-val">{fmt$(arqueo.ingresos)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Gastos</span><span className="drawer-detail-val">{fmt$(arqueo.gastos)}</span></div>
        <div className="drawer-detail-row">
          <span className="drawer-detail-key">Comprobación</span>
          <span className={`badge ${cuadra ? 'badge-green' : 'badge-red'}`}>{fmt$(arqueo.comprobacion)}</span>
        </div>
      </div>

      {arqueo.detalles?.length > 0 && (
        <>
          <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Detalles</div>
          {arqueo.detalles.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{d.detalle_tipo?.nombre || d.nombre || 'Sin tipo'}</span>
              <span>{fmt$(d.monto)}</span>
            </div>
          ))}
        </>
      )}

      {(canEdit || canDelete) && (
        <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
          {canEdit && (
            <button type="button" className={`btn ${arqueo.audit ? 'btn-secondary' : 'btn-primary'}`} onClick={handleAudit} disabled={auditando}>
              {auditando
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : (arqueo.audit ? 'Desauditar' : 'Auditar')}
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>Editar</button>
          )}
          {canDelete && (
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Borrar'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── página ── */
export default function ArqueoList() {
  const activeLocal = useAppStore((s) => s.activeLocal)
  const activeApp   = useAppStore((s) => s.activeApp)
  const notify      = useUiStore((s) => s.notify)

  const role       = activeApp?.role
  const canEdit    = ['super_admin', 'dcsmart'].includes(role)
  const canDelete  = ['super_admin', 'dcsmart'].includes(role)

  const [arqueos, setArqueos] = useState([])
  const [loading, setLoading] = useState(true)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const load = () => {
    if (!activeLocal?.id) { setArqueos([]); setLoading(false); return }
    setLoading(true)
    arqueoApi.list(activeLocal.id)
      .then(({ data }) => setArqueos(data.data))
      .catch(() => notify('Error al cargar el historial de arqueos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [activeLocal?.id])

  const openDetail = (id) => { setSelectedId(id); setDetailOpen(true) }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Arqueo</h1>
          <p className="page-sub">
            {activeLocal ? activeLocal.nombre : 'Seleccioná un local'}
          </p>
        </div>
        <div className="page-head-right">
          <button
            className="btn btn-primary"
            onClick={() => setPanelOpen(true)}
            disabled={!activeLocal}
          >
            <IcoPlus /> Nuevo arqueo
          </button>
        </div>
      </div>

      {!activeLocal ? (
        <div className="pdp-empty">Seleccioná un local para ver su historial de arqueos.</div>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><span className="spinner" /></div>
      ) : arqueos.length === 0 ? (
        <div className="pdp-empty">Todavía no se cargó ningún arqueo para este local.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Caja fuerte</th><th>Cofre</th><th>Adición</th>
                <th>Total</th><th>Comprobación</th><th>Auditado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {arqueos.map((a) => {
                const cuadra = Math.abs(Number(a.comprobacion)) < 0.01
                return (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.fecha)}</td>
                    <td className="td-number">{fmt$(a.caja_fuerte)}</td>
                    <td className="td-number">{fmt$(a.cofre)}</td>
                    <td className="td-number">{fmt$(a.adicion)}</td>
                    <td className="td-number">{fmt$(a.total)}</td>
                    <td>
                      <span className={`badge ${cuadra ? 'badge-green' : 'badge-red'}`}>
                        {fmt$(a.comprobacion)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${a.audit ? 'badge-green' : 'badge-muted'}`}>
                        {a.audit ? '✓ Auditado' : 'No auditado'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => openDetail(a.id)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <DrawerPanel open={panelOpen} onClose={() => setPanelOpen(false)} title="Nuevo arqueo" width={560}>
        {panelOpen && activeLocal && (
          <ArqueoCreatePanel
            activeLocal={activeLocal}
            onCreated={() => { setPanelOpen(false); load() }}
          />
        )}
      </DrawerPanel>

      <DrawerPanel open={detailOpen} onClose={() => setDetailOpen(false)} title="Detalle de arqueo" width={560}>
        {detailOpen && selectedId && (
          <ArqueoDetailPanel
            arqueoId={selectedId}
            canEdit={canEdit}
            canDelete={canDelete}
            onChanged={(closed) => { load(); if (closed) setDetailOpen(false) }}
          />
        )}
      </DrawerPanel>
    </div>
  )
}
