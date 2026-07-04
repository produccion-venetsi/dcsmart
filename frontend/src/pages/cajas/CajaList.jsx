import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { movimientosApi } from '../../api/movimientos.js'
import { detallesApi } from '../../api/detalles.js'
import { metodosApi } from '../../api/metodospago.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import CajaFotoViewer from '../../components/CajaFotoViewer.jsx'
import AdjuntoUpload from '../../components/AdjuntoUpload.jsx'
import { clasificacionLabel } from '../../lib/clasificaciones.js'

const EMPTY_CAJA = {
  nro_turno: '', fecha_inicio: '', fecha_cierre: '', cajero: '', total: '',
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
function IcoEdit() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}
function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}

function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0 })}` : '—' }
function fmt$2(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR') : '—' }
function fmtDT(d) { return d ? new Date(d).toLocaleString('es-AR') : '—' }

function CajaDetailPanel({ cajaId, onRefreshList, canEdit, canDelete, onEdit, onDelete }) {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)
  const [caja,       setCaja]      = useState(null)
  const [loading,    setLoading]   = useState(true)
  const [metodos,    setMetodos]   = useState([])
  const [tipos,      setTipos]     = useState([])
  const [newMov,     setNewMov]    = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [saving,     setSaving]    = useState(false)
  const [newDet,     setNewDet]    = useState({ tipo: '', id_tipo: '', nombre: '', monto: '', observaciones: '' })
  const [savingDet,  setSavingDet] = useState(false)
  const [auditando,  setAuditando] = useState(false)
  const [auditHistory, setAuditHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const load = () => {
    setLoading(true)
    cajasApi.get(cajaId)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar caja', 'error'))
      .finally(() => setLoading(false))
  }

  const loadAuditHistory = () => {
    setLoadingHistory(true)
    cajasApi.auditHistory(cajaId)
      .then(({ data }) => setAuditHistory(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => {
    if (!cajaId) return
    load()
    loadAuditHistory()
    metodosApi.list()
      .then(r => setMetodos(r.data || []))
      .catch(() => {})
  }, [cajaId])

  useEffect(() => {
    if (!caja?.id_local) return
    detallesApi.tipos(caja.id_local)
      .then(r => setTipos(r.data || []))
      .catch(() => {})
  }, [caja?.id_local])

  const handleAddMov = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await movimientosApi.create({
        tipo:      newMov.tipo,
        id_metodo: newMov.id_metodo || null,
        monto:     parseFloat(newMov.monto),
        id_caja:   cajaId,
        cantidad:  newMov.cantidad ? parseInt(newMov.cantidad) : null
      })
      notify('Movimiento agregado', 'success')
      setNewMov({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
      load()
    } catch { notify('Error al agregar movimiento', 'error') }
    finally { setSaving(false) }
  }

  const handleDeleteMov = async (movId) => {
    if (!(await showConfirm('¿Eliminar movimiento?'))) return
    try { await movimientosApi.remove(movId); notify('Eliminado', 'success'); load() }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const handleAddDet = async (e) => {
    e.preventDefault()
    setSavingDet(true)
    try {
      await detallesApi.create({
        id_caja:       cajaId,
        id_tipo:       newDet.id_tipo       || null,
        monto:         parseFloat(newDet.monto),
        observaciones: newDet.observaciones || null
      })
      notify('Detalle agregado', 'success')
      setNewDet({ tipo: '', id_tipo: '', nombre: '', monto: '', observaciones: '' })
      load()
    } catch { notify('Error al agregar detalle', 'error') }
    finally { setSavingDet(false) }
  }

  const handleDeleteDet = async (detId) => {
    if (!(await showConfirm('¿Eliminar detalle?'))) return
    try { await detallesApi.remove(detId); notify('Eliminado', 'success'); load() }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const handleAudit = async () => {
    let observaciones
    if (caja.audit) {
      observaciones = await showPrompt(
        'Esta caja ya está auditada. ¿Querés desauditarla? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditando(true)
    try {
      const { data } = await cajasApi.audit(cajaId, caja.audit ? { observaciones } : undefined)
      notify(data.audit ? 'Caja auditada' : 'Auditoría revertida', 'success')
      setCaja(prev => ({ ...prev, audit: data.audit }))
      onRefreshList?.()
      loadAuditHistory()
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>
  if (!caja) return <div style={{ color: 'var(--red)', padding: '1rem' }}>No se pudo cargar la caja.</div>

  const totalMov = caja.movimientos?.reduce((acc, m) => acc + Number(m.monto), 0) || 0
  const totalDet = caja.detalles?.reduce((acc, d) => acc + Number(d.monto), 0) || 0

  const rows = [
    ['Turno',      caja.nro_turno ? `TRN ${caja.nro_turno}` : '—'],
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
    ['Auditado',   caja.audit ? 'Sí' : 'No'],
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {canEdit && (
          <button
            className={`btn btn-sm ${caja.audit ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleAudit}
            disabled={auditando}
          >
            {auditando
              ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              : caja.audit ? '✓ Auditado' : 'Auditar'
            }
          </button>
        )}
        {canEdit && (
          <button className="btn btn-secondary btn-sm" onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoEdit /> Editar
          </button>
        )}
        {canDelete && (
          <button className="btn btn-danger btn-sm" onClick={(e) => onDelete(cajaId, e)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoTrash /> Eliminar
          </button>
        )}
      </div>

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

      {caja.foto_url && (
        <div style={{ marginBottom: '1rem' }}>
          <div className="drawer-section-title">Foto</div>
          <CajaFotoViewer cajaId={caja.id} fotoUrl={caja.foto_url} />
        </div>
      )}

      {/* ── DETALLES ─────────────────────────────────────────────────────── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Detalles ({caja.detalles?.length || 0})</span>
      </div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr><th>Tipo</th><th>Nombre</th><th>Monto</th><th></th></tr>
          </thead>
          <tbody>
            {(caja.detalles || []).map((d) => (
              <tr key={d.id}>
                <td className="td-muted">{clasificacionLabel(d.tipo)}</td>
                <td>{d.detalle_tipo?.nombre || d.nombre || '—'}</td>
                <td className="td-number">{fmt$2(d.monto)}</td>
                <td>
                  {canDelete && (
                    <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteDet(d.id)}>
                      <IcoTrash />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!caja.detalles || caja.detalles.length === 0) && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--t3)' }}>Sin detalles</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && <div className="drawer-section-title">Agregar Detalle</div>}
      {canEdit && <form onSubmit={handleAddDet}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Clasificación</label>
            <div className="form-input-wrap">
              <input
                type="text"
                readOnly
                style={{ opacity: 0.5, cursor: 'not-allowed' }}
                value={(() => {
                  const t = tipos.find(x => x.id === newDet.id_tipo)
                  return t ? clasificacionLabel(t.clasificacion, 'Otro') : 'Seleccioná un nombre'
                })()}
              />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nombre</label>
            <div className="form-input-wrap">
              <select value={newDet.id_tipo} onChange={e => setNewDet({ ...newDet, id_tipo: e.target.value })}>
                <option value="">Ver opciones</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Monto *</label>
            <div className="form-input-wrap">
              <input type="number" step="0.01" required placeholder="0.00" value={newDet.monto} onChange={e => setNewDet({ ...newDet, monto: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Observaciones</label>
            <div className="form-input-wrap">
              <input type="text" placeholder="Opcional" value={newDet.observaciones} onChange={e => setNewDet({ ...newDet, observaciones: e.target.value })} />
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={savingDet || !newDet.monto} style={{ marginTop: '0.75rem', marginBottom: '1.5rem' }}>
          {savingDet ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : <><IcoPlus /> Agregar</>}
        </button>
      </form>}

      {/* ── MOVIMIENTOS ──────────────────────────────────────────────────── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Movimientos ({caja.movimientos?.length || 0})</span>
        <span style={{ color: 'var(--gold-bright)', fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}>{fmt$2(totalMov)}</span>
      </div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr><th>Tipo</th><th>Método</th><th>Monto</th><th>Cant.</th><th></th></tr>
          </thead>
          <tbody>
            {(caja.movimientos || []).map((m) => (
              <tr key={m.id}>
                <td>
                  <span className={`badge ${m.tipo === 'INGRESO' || m.tipo === 'APERTURA' ? 'badge-green' : 'badge-red'}`}>{m.tipo}</span>
                </td>
                <td className="td-muted">{m.metodo_pago?.nombre || '—'}</td>
                <td className="td-number">{fmt$2(m.monto)}</td>
                <td className="td-muted" style={{ textAlign: 'right' }}>{m.cantidad ?? '—'}</td>
                <td>
                  {canDelete && (
                    <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteMov(m.id)}>
                      <IcoTrash />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!caja.movimientos || caja.movimientos.length === 0) && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--t3)' }}>Sin movimientos</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && <div className="drawer-section-title">Agregar Movimiento</div>}
      {canEdit && <form onSubmit={handleAddMov}>
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
            <label className="form-label">Método</label>
            <div className="form-input-wrap">
              <select value={newMov.id_metodo} onChange={e => setNewMov({ ...newMov, id_metodo: e.target.value })}>
                <option value="">Sin método</option>
                {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Monto *</label>
            <div className="form-input-wrap">
              <input type="number" step="0.01" required placeholder="0.00" value={newMov.monto} onChange={e => setNewMov({ ...newMov, monto: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Cantidad</label>
            <div className="form-input-wrap">
              <input type="number" min="1" step="1" placeholder="Opcional" value={newMov.cantidad} onChange={e => setNewMov({ ...newMov, cantidad: e.target.value })} />
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving || !newMov.monto}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : <><IcoPlus /> Agregar</>}
        </button>
      </form>}

      <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>Historial de auditoría</div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Observación</th></tr>
          </thead>
          <tbody>
            {loadingHistory ? (
              <tr><td colSpan={4}><span className="skel" style={{ width: '60%' }} /></td></tr>
            ) : auditHistory.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: 'var(--t3)' }}>Sin eventos de auditoría</td></tr>
            ) : (
              auditHistory.map((ev) => (
                <tr key={ev.id}>
                  <td className="td-muted">{new Date(ev.fecha).toLocaleString('es-AR')}</td>
                  <td>{ev.user?.nombre ?? '—'}</td>
                  <td>
                    <span className={`badge ${ev.accion === 'auditado' ? 'badge-green' : 'badge-amber'}`}>
                      {ev.accion === 'auditado' ? 'Auditado' : 'Desauditado'}
                    </span>
                  </td>
                  <td className="td-muted">{ev.observaciones || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CajaEditPanel({ cajaId, onSaved, onBack }) {
  const notify  = useUiStore((s) => s.notify)
  const [form,   setForm]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [fotoFile,      setFotoFile]      = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)

  useEffect(() => {
    if (!cajaId) return
    cajasApi.get(cajaId).then(({ data }) => {
      const toLocal = (d) => d ? new Date(d).toISOString().slice(0, 16) : ''
      setForm({
        nro_turno:    data.nro_turno    ?? '',
        fecha_inicio: toLocal(data.fecha_inicio),
        fecha_cierre: toLocal(data.fecha_cierre),
        cajero:       data.cajero       ?? '',
        total:        data.total        != null ? String(data.total)        : '',
        efectivo:     data.efectivo     != null ? String(data.efectivo)     : '',
        fiscal:       data.fiscal       != null ? String(data.fiscal)       : '',
        comensales:   data.comensales   != null ? String(data.comensales)   : '',
        tickets:      data.tickets      != null ? String(data.tickets)      : '',
        observaciones: data.observaciones ?? '',
        foto_url:     data.foto_url     ?? '',
        id_local:     data.id_local     ?? '',
      })
    }).catch(() => notify('Error al cargar caja', 'error'))
  }, [cajaId])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      let foto_url = form.foto_url
      if (fotoFile) {
        setUploadingFoto(true)
        const fd = new FormData()
        fd.append('file', fotoFile)
        const r = await cajasApi.upload(fd, form.id_local)
        foto_url = r.data.url
        setUploadingFoto(false)
      }
      await cajasApi.update(cajaId, {
        nro_turno:    form.nro_turno    || null,
        fecha_cierre: form.fecha_cierre || null,
        cajero:       form.cajero       || null,
        total:        form.total        !== '' ? parseFloat(form.total)      : null,
        efectivo:     form.efectivo     !== '' ? parseFloat(form.efectivo)   : null,
        fiscal:       form.fiscal       !== '' ? parseFloat(form.fiscal)     : null,
        comensales:   form.comensales   !== '' ? parseInt(form.comensales)   : null,
        tickets:      form.tickets      !== '' ? parseInt(form.tickets)      : null,
        observaciones: form.observaciones || null,
        foto_url:     foto_url          || null,
      })
      notify('Caja actualizada', 'success')
      onSaved()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
      setUploadingFoto(false)
    } finally { setSaving(false) }
  }

  if (!form) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <IcoBack /> Volver al detalle
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fecha Inicio</label>
          <div className="form-input-wrap">
            <input type="datetime-local" value={form.fecha_inicio} readOnly style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fecha Cierre</label>
          <div className="form-input-wrap">
            <input type="datetime-local" value={form.fecha_cierre} onChange={e => setF('fecha_cierre', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nro Turno</label>
          <div className="form-input-wrap">
            <input type="number" min="1" step="1" placeholder="1" value={form.nro_turno} onChange={e => setF('nro_turno', e.target.value)} />
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
        <AdjuntoUpload
          label="Foto"
          accept="image/*"
          value={form.foto_url}
          file={fotoFile}
          onFileSelected={setFotoFile}
          onRemove={() => { setF('foto_url', ''); setFotoFile(null) }}
          uploading={uploadingFoto}
        />
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label className="form-label">Observaciones</label>
          <div className="form-input-wrap form-textarea-wrap">
            <textarea rows={2} value={form.observaciones} onChange={e => setF('observaciones', e.target.value)} placeholder="Notas opcionales..." />
          </div>
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : 'Guardar cambios'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onBack}>Cancelar</button>
      </div>
    </form>
  )
}

function CajaCreatePanel({ activeLocal, locales, onCreated, onClose }) {
  const notify = useUiStore((s) => s.notify)
  const [form,      setForm]    = useState(EMPTY_CAJA)
  const [localId,   setLocalId] = useState(activeLocal?.id || '')
  const [saving,    setSaving]  = useState(false)
  const [fotoFile,      setFotoFile]      = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const targetLocalId = activeLocal?.id || localId

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!targetLocalId) { notify('Seleccioná un local', 'error'); return }
    setSaving(true)
    try {
      let foto_url = form.foto_url
      if (fotoFile) {
        setUploadingFoto(true)
        const fd = new FormData()
        fd.append('file', fotoFile)
        const r = await cajasApi.upload(fd, targetLocalId)
        foto_url = r.data.url
        setUploadingFoto(false)
      }
      const res = await cajasApi.create({ ...form, foto_url, id_local: targetLocalId })
      notify('Caja creada', 'success')
      onCreated(res.data?.id)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
      setUploadingFoto(false)
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleCreate}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {!activeLocal && (
          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Local *</label>
            <div className="form-input-wrap">
              <select required value={localId} onChange={e => setLocalId(e.target.value)}>
                <option value="">Seleccioná un local…</option>
                {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fecha Inicio *</label>
          <div className="form-input-wrap">
            <input type="datetime-local" required value={form.fecha_inicio} onChange={e => setF('fecha_inicio', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fecha Cierre</label>
          <div className="form-input-wrap">
            <input type="datetime-local" value={form.fecha_cierre} onChange={e => setF('fecha_cierre', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nro Turno</label>
          <div className="form-input-wrap">
            <input type="number" min="1" step="1" placeholder="1" value={form.nro_turno} onChange={e => setF('nro_turno', e.target.value)} />
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
        <AdjuntoUpload
          label="Foto"
          accept="image/*"
          value={form.foto_url}
          file={fotoFile}
          onFileSelected={setFotoFile}
          onRemove={() => { setF('foto_url', ''); setFotoFile(null) }}
          uploading={uploadingFoto}
        />
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

const ROW_HEIGHT = 32
const OVERSCAN = 20
export default function CajaList() {
  const [searchParams] = useSearchParams()
  const { activeApp, activeLocal } = useAppStore()
  const locales     = activeApp?.locales ?? []
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const role        = activeApp?.role
  const canCreate = ['super_admin', 'dcsmart', 'admin'].includes(role)
  const canEdit   = ['super_admin', 'dcsmart', 'admin'].includes(role)
  const canDelete = ['super_admin', 'dcsmart', 'admin'].includes(role)

  const [cajas,      setCajas]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [panelMode,  setPanelMode]  = useState('create')
  const [selectedId, setSelectedId] = useState(null)
  const [sortField,  setSortField]  = useState('fecha_inicio')
  const [sortDir,    setSortDir]    = useState('desc')
  const [auditFilter, setAuditFilter] = useState('')
  const autoOpenedRef = useRef(false)

  const scrollRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, limit: 0, ...(auditFilter !== '' ? { audit: auditFilter } : {}) })
      .then(({ data }) => setCajas(data.data))
      .catch(() => notify('Error al cargar cajas', 'error'))
      .finally(() => setLoading(false))
  }, [activeLocal?.id, auditFilter])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, limit: 0, ...(auditFilter !== '' ? { audit: auditFilter } : {}) }, ctrl.signal)
      .then(({ data }) => {
        setCajas(data.data)
        const turno = searchParams.get('turno')
        if (!autoOpenedRef.current && turno) {
          const match = data.data.find(c => c.nro_turno === turno)
          if (match) {
            autoOpenedRef.current = true
            openDetail(match.id)
          }
        }
      })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar cajas', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [activeLocal?.id, auditFilter])

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const sortedCajas = useMemo(() => {
    return [...cajas].sort((a, b) => {
      const va = a[sortField] ?? ''
      const vb = b[sortField] ?? ''
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [cajas, sortField, sortDir])

  // Scroll virtual
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [sortField, sortDir])

  const viewportH = scrollRef.current?.clientHeight ?? 800
  const startIdx  = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx    = Math.min(sortedCajas.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN)
  const topPad    = startIdx * ROW_HEIGHT
  const bottomPad = Math.max(0, (sortedCajas.length - endIdx) * ROW_HEIGHT)
  const visibleCajas = sortedCajas.slice(startIdx, endIdx)

  const handleDelete = async (id, e) => {
    e?.stopPropagation()
    if (!(await showConfirm('¿Eliminar esta caja?'))) return
    try {
      await cajasApi.remove(id)
      notify('Caja eliminada', 'success')
      setCajas(prev => prev.filter(c => c.id !== id))
      setPanelOpen(false)
    }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const openCreate = () => { setPanelMode('create'); setPanelOpen(true) }
  const openDetail = (id) => { setSelectedId(id); setPanelMode('detail'); setPanelOpen(true) }
  const openEdit   = (id) => { setSelectedId(id); setPanelMode('edit');   setPanelOpen(true) }
  const backToDetail = ()  => { setPanelMode('detail') }
  const closePanel = () => setPanelOpen(false)

  const selectedCaja = cajas.find(c => c.id === selectedId)
  const selectedLabel = selectedCaja?.nro_turno ? `TRN ${selectedCaja.nro_turno}` : 'Detalle de Caja'

  const drawerTitle = panelMode === 'create'
    ? 'Nueva Caja'
    : panelMode === 'edit'
      ? `Editar — ${selectedLabel}`
      : selectedLabel

  const SortTh = ({ field, children }) => (
    <th className={`sortable${sortField === field ? ' active' : ''}`} onClick={() => toggleSort(field)}>
      {children} <span className="sort-ico">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )

  // La columna "Local" se oculta si ya hay un local puntual seleccionado (es redundante).
  // Se sacó la columna de acciones (borrar) de la fila (ahora vive en el detalle).
  const showLocalCol = !activeLocal
  const colCount = 12 + (showLocalCol ? 1 : 0)

  return (
    <div className="page">
      <style>{`
        .vt-scroll-cajas { max-height: calc(100vh - 180px); overflow: auto; }
        .vt-spacer td { padding: 0 !important; border: none !important; }
      `}</style>

      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Cajas</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select className="filter-select" value={auditFilter} onChange={e => setAuditFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="false">No auditado</option>
            <option value="true">Auditado</option>
          </select>
          {canCreate && (
            <button className="btn btn-primary" onClick={openCreate}>
              <IcoPlus /> Nueva Caja
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="vt-scroll-cajas table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortTh field="nro_turno">Nro Turno</SortTh>
              <th>Auditado</th>
              <SortTh field="fecha_inicio">Inicio</SortTh>
              <SortTh field="fecha_cierre">Cierre</SortTh>
              <SortTh field="cajero">Cajero</SortTh>
              <SortTh field="total">Total</SortTh>
              <th>Efectivo</th>
              <th>Fiscal</th>
              <th>Comensales</th>
              <th>Tickets</th>
              <th>Origen</th>
              <th>Foto</th>
              {showLocalCol && <th>Local</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: colCount }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${48 + (j * 11 + i * 9) % 44}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : sortedCajas.length === 0 ? (
              <tr>
                <td colSpan={colCount}>
                  <div className="table-empty">
                    <IcoCaja />
                    <p>No hay cajas registradas{activeLocal ? ' para este local' : ''}.</p>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {topPad > 0 && <tr className="vt-spacer"><td colSpan={colCount} style={{ height: topPad }} /></tr>}
                {visibleCajas.map((c) => (
                  <tr key={c.id} className="row-clickable" onClick={() => openDetail(c.id)}>
                    <td className="td-primary">{c.nro_turno ? `TRN ${c.nro_turno}` : <span className="td-muted">—</span>}</td>
                    <td>
                      <span className={`badge ${c.audit ? 'badge-green' : 'badge-muted'}`}>{c.audit ? '✓ Auditado' : 'No auditado'}</span>
                    </td>
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
                      {c.foto_url && !c.foto_url.startsWith('gs://')
                        ? <a href={c.foto_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--gold-bright)' }}><IcoLink /></a>
                        : c.foto_url
                          ? <span className="td-muted" title="Ver en el detalle"><IcoLink /></span>
                          : <span className="td-muted">—</span>}
                    </td>
                    {showLocalCol && <td className="td-muted">{c.local?.nombre ?? '—'}</td>}
                  </tr>
                ))}
                {bottomPad > 0 && <tr className="vt-spacer"><td colSpan={colCount} style={{ height: bottomPad }} /></tr>}
              </>
            )}
          </tbody>
        </table>
      </div>

      {!loading && cajas.length > 0 && (
        <div className="pagination">
          <span className="pagination-info">{cajas.length} cajas</span>
        </div>
      )}

      <DrawerPanel open={panelOpen} onClose={closePanel} title={drawerTitle} width={560}>
        {panelMode === 'create' && (
          <CajaCreatePanel
            activeLocal={activeLocal}
            locales={locales}
            onCreated={(newId) => {
              load()
              if (newId) { setSelectedId(newId); setPanelMode('detail') }
              else closePanel()
            }}
            onClose={closePanel}
          />
        )}
        {panelMode === 'detail' && (
          <CajaDetailPanel
            cajaId={selectedId}
            onRefreshList={load}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => openEdit(selectedId)}
            onDelete={handleDelete}
          />
        )}
        {panelMode === 'edit' && (
          <CajaEditPanel
            cajaId={selectedId}
            onSaved={() => { load(); backToDetail() }}
            onBack={backToDetail}
          />
        )}
      </DrawerPanel>
    </div>
  )
}
