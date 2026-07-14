import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { movimientosApi } from '../../api/movimientos.js'
import { detallesApi } from '../../api/detalles.js'
import { metodosApi } from '../../api/metodospago.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import FotoViewer from '../../components/FotoViewer.jsx'
import AdjuntoUpload from '../../components/AdjuntoUpload.jsx'
import ActionsMenu from '../../components/ActionsMenu.jsx'
import { clasificacionLabel } from '../../lib/clasificaciones.js'
import { downloadCsv } from '../../lib/csv.js'

const EMPTY_CAJA = {
  nro_turno: '', tipo_turno: '', fecha_inicio: '', fecha_cierre: '', cajero: '', total: '',
  efectivo: '', fiscal: '', comensales: '', tickets: '', observaciones: '', foto_url: ''
}

const TIPOS_TURNO = ['Mañana', 'Tarde', 'Noche', 'Trasnoche', 'Evento', 'Otros']

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
function IcoCheckSquare() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
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
function IcoThumbUp() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 11v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z"/>
      <path d="M7 11l4-8a2 2 0 0 1 2 2v5h5.5a2 2 0 0 1 1.94 2.5l-1.5 6A2 2 0 0 1 16.97 21H7"/>
    </svg>
  )
}
function IcoEye() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
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
function IcoFilter() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}
function IcoDownload() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0 })}` : '—' }
function fmt$2(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—' }
function fmtDT(d) { return d ? new Date(d).toLocaleString('es-AR', { hour12: false }) : '—' }

// Mismas columnas que se ven en la tabla; montos como número plano (sin "$")
// para que Excel/Sheets los reconozca como numéricos al importar el CSV.
const CAJA_CSV_COLUMNS = [
  { label: 'Nro Turno',  get: (c) => c.nro_turno ? `TRN ${c.nro_turno}` : '' },
  { label: 'Tipo',       get: (c) => c.tipo_turno || '' },
  { label: 'Auditado',   get: (c) => c.audit ? 'Sí' : 'No' },
  { label: 'Inicio',     get: (c) => c.fecha_inicio ? fmtDate(c.fecha_inicio) : '' },
  { label: 'Cierre',     get: (c) => c.fecha_cierre ? fmtDate(c.fecha_cierre) : '' },
  { label: 'Cajero',     get: (c) => c.cajero || '' },
  { label: 'Total',      get: (c) => c.total ?? '' },
  { label: 'Efectivo',   get: (c) => c.efectivo ?? '' },
  { label: 'Fiscal',     get: (c) => c.fiscal ?? '' },
  { label: 'Comensales', get: (c) => c.comensales ?? '' },
  { label: 'Tickets',    get: (c) => c.tickets ?? '' },
  { label: 'Origen',     get: (c) => c.origin || '' },
  { label: 'Local',      get: (c) => c.local?.nombre || '' },
  { label: 'Observaciones', get: (c) => c.observaciones || '' },
]

const SIGN_BY_TIPO = { INICIAL: 1, INGRESO: 1, COBRO: 1, GASTO: -1, RETIRO: -1, VACIADO: -1 }
const DESCUADRE_TOLERANCE = 0.01

function CajaDetailPanel({ cajaId, onRefreshList, canEdit, canDelete, canAuditDc, onEdit, onDelete }) {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)
  const [caja,       setCaja]      = useState(null)
  const [loading,    setLoading]   = useState(true)
  const [metodos,    setMetodos]   = useState([])
  const [tipos,      setTipos]     = useState([])
  const [newMov,     setNewMov]    = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [saving,     setSaving]    = useState(false)
  const [addingMov,  setAddingMov] = useState(false)
  const [newDet,     setNewDet]    = useState({ tipo: '', id_tipo: '', nombre: '', monto: '', observaciones: '' })
  const [savingDet,  setSavingDet] = useState(false)
  const [addingDet,  setAddingDet] = useState(false)
  const [editingMovId, setEditingMovId] = useState(null)
  const [editMovForm,  setEditMovForm]  = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [savingMovEdit, setSavingMovEdit] = useState(false)
  const [editingDetId, setEditingDetId] = useState(null)
  const [editDetForm,  setEditDetForm]  = useState({ id_tipo: '', monto: '', observaciones: '' })
  const [savingDetEdit, setSavingDetEdit] = useState(false)
  const [auditando,  setAuditando] = useState(false)
  const [auditandoDc, setAuditandoDc] = useState(false)
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
      setAddingMov(false)
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
      setAddingDet(false)
      load()
    } catch { notify('Error al agregar detalle', 'error') }
    finally { setSavingDet(false) }
  }

  const handleDeleteDet = async (detId) => {
    if (!(await showConfirm('¿Eliminar detalle?'))) return
    try { await detallesApi.remove(detId); notify('Eliminado', 'success'); load() }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const handleEditMov = (m) => {
    setEditingMovId(m.id)
    setEditMovForm({ tipo: m.tipo, id_metodo: m.id_metodo || '', monto: String(m.monto), cantidad: m.cantidad != null ? String(m.cantidad) : '' })
  }

  const handleSaveMov = async (movId) => {
    if (!editMovForm.monto) return
    setSavingMovEdit(true)
    try {
      await movimientosApi.update(movId, {
        tipo:      editMovForm.tipo,
        id_metodo: editMovForm.id_metodo || null,
        monto:     parseFloat(editMovForm.monto),
        cantidad:  editMovForm.cantidad ? parseInt(editMovForm.cantidad) : null
      })
      notify('Movimiento actualizado', 'success')
      setEditingMovId(null)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error al actualizar', 'error') }
    finally { setSavingMovEdit(false) }
  }

  const handleEditDet = (d) => {
    setEditingDetId(d.id)
    setEditDetForm({ id_tipo: d.id_tipo || '', monto: String(d.monto), observaciones: d.observaciones || '' })
  }

  const handleSaveDet = async (detId) => {
    if (!editDetForm.monto) return
    setSavingDetEdit(true)
    try {
      await detallesApi.update(detId, {
        id_tipo:       editDetForm.id_tipo || null,
        monto:         parseFloat(editDetForm.monto),
        observaciones: editDetForm.observaciones || null
      })
      notify('Detalle actualizado', 'success')
      setEditingDetId(null)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error al actualizar', 'error') }
    finally { setSavingDetEdit(false) }
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

  const handleAuditDc = async () => {
    let observaciones
    if (caja.audit_dc) {
      observaciones = await showPrompt(
        'Esta caja ya tiene audit DC. ¿Querés revertirlo? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditandoDc(true)
    try {
      const { data } = await cajasApi.auditDc(cajaId, caja.audit_dc ? { observaciones } : undefined)
      notify(data.audit_dc ? 'Audit DC aplicado' : 'Audit DC revertido', 'success')
      setCaja(prev => ({ ...prev, audit_dc: data.audit_dc, audit: data.audit }))
      onRefreshList?.()
      loadAuditHistory()
    } catch { notify('Error al auditar (DC)', 'error') }
    finally { setAuditandoDc(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>
  if (!caja) return <div style={{ color: 'var(--red)', padding: '1rem' }}>No se pudo cargar la caja.</div>

  const totalMov = caja.movimientos?.reduce((acc, m) => acc + Number(m.monto), 0) || 0
  // Los detalles siempre se cargan en positivo; la clasificación del tipo
  // (no el signo del monto) dice si suma o resta -- un "egreso" (ej. Gastos)
  // resta del total esperado.
  const totalDet = caja.detalles?.reduce((acc, d) => {
    const sign = d.detalle_tipo?.clasificacion === 'egreso' ? -1 : 1
    return acc + sign * Number(d.monto)
  }, 0) || 0

  // Si el origen es DCSMART y hay detalles cargados, el total esperado se
  // valida contra efectivo + detalles (verificado contra datos reales de
  // producción, el "fiscal" no entra en esta cuenta). Si no hay detalles
  // (caja cargada solo con movimientos), sigue el chequeo de siempre contra
  // movimientos.
  const usaDetalles = caja.origin === 'DCSMART' && caja.detalles?.length > 0
  const totalEsperado = usaDetalles
    ? Number(caja.efectivo ?? 0) + totalDet
    : (caja.movimientos?.reduce((acc, m) => acc + Number(m.monto) * (SIGN_BY_TIPO[m.tipo] ?? 0), 0) || 0)
  const descuadre = caja.total != null ? Number(caja.total) - totalEsperado : null
  const hayDescuadre = descuadre != null && Math.abs(descuadre) > DESCUADRE_TOLERANCE

  const rows = [
    ['Turno',      caja.nro_turno ? `TRN ${caja.nro_turno}` : '—'],
    ['Tipo Turno', caja.tipo_turno ?? '—'],
    ['Local',      caja.local?.nombre ?? '—'],
    ['Inicio',     fmtDT(caja.fecha_inicio)],
    ['Cierre',     fmtDT(caja.fecha_cierre)],
    ['Cajero',     caja.cajero ?? '—'],
    ['Total',      fmt$(caja.total)],
    ['Efectivo',   fmt$(caja.efectivo)],
    ['Fiscal',     fmt$(caja.fiscal)],
    ['Comensales', caja.comensales ?? '—'],
    ['Tickets',    caja.tickets ?? '—'],
  ]

  return (
    <div>
      {/* Tags destacados: mismos indicadores que ya tienen color/badge en la lista */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
        <span className={`badge ${caja.audit ? 'badge-green' : 'badge-muted'}`}>{caja.audit ? '✓ Auditado' : 'No auditado'}</span>
        {canAuditDc && (
          <span className={`badge ${caja.audit_dc ? 'badge-purple' : 'badge-muted'}`}>{caja.audit_dc ? '✓ Audit DC' : 'Sin Audit DC'}</span>
        )}
        {caja.origin && caja.origin !== 'DCSMART' && (
          <span className="badge badge-muted">{caja.origin}</span>
        )}
        {hayDescuadre && (
          <span
            className="badge badge-red"
            title={usaDetalles ? 'Total de caja vs. suma de detalles' : 'Total de caja vs. inicial + ingresos − egresos de los movimientos'}
          >
            ⚠ Descuadre: {fmt$(Math.abs(descuadre))} {descuadre > 0 ? '(sobra)' : '(falta)'}
          </span>
        )}
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <ActionsMenu label="Acciones">
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
          {canAuditDc && (
            <button
              className={`btn btn-sm ${caja.audit_dc ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleAuditDc}
              disabled={auditandoDc}
            >
              {auditandoDc
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : caja.audit_dc ? '✓ Audit DC' : 'Audit DC'
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
        </ActionsMenu>
      </div>

      {caja.foto_url && (
        <div style={{ marginBottom: '0.5rem' }}>
          <div className="drawer-section-title">Adjuntos</div>
          <FotoViewer pagoId={caja.id} fotoUrl={caja.foto_url} entity="cajas" />
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

      {caja.observaciones && (
        <div style={{ marginTop: '0.75rem', marginBottom: '1rem', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, color: 'var(--t2)' }}>
          {caja.observaciones}
        </div>
      )}

      {/* ── DETALLES ─────────────────────────────────────────────────────── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Detalles ({caja.detalles?.length || 0})</span>
        {canEdit && !addingDet && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingDet(true)}>
            <IcoPlus /> Añadir
          </button>
        )}
      </div>
      {caja.detalles && caja.detalles.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }}>
          <table className="data-table">
            <thead>
              <tr><th>Tipo</th><th>Nombre</th><th>Monto</th><th></th></tr>
            </thead>
            <tbody>
              {caja.detalles.map((d) => (
                <tr key={d.id}>
                  {editingDetId === d.id ? (
                    <>
                      <td colSpan={2}>
                        <select value={editDetForm.id_tipo} onChange={e => setEditDetForm(f => ({ ...f, id_tipo: e.target.value }))}>
                          <option value="">Ver opciones</option>
                          {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" style={{ maxWidth: 100 }} value={editDetForm.monto} onChange={e => setEditDetForm(f => ({ ...f, monto: e.target.value }))} />
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-primary" disabled={savingDetEdit} onClick={() => handleSaveDet(d.id)}>Guardar</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingDetId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="td-muted">{clasificacionLabel(d.tipo)}</td>
                      <td>{d.detalle_tipo?.nombre || d.nombre || '—'}</td>
                      <td className="td-number">{fmt$2(d.monto)}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {canEdit && (
                          <button className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditDet(d)}>
                            <IcoEdit />
                          </button>
                        )}
                        {canDelete && (
                          <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteDet(d.id)}>
                            <IcoTrash />
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(!caja.detalles || caja.detalles.length === 0) && !addingDet && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin detalles</div>
      )}

      {canEdit && addingDet && <form onSubmit={handleAddDet}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
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
        <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem', marginBottom: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={savingDet || !newDet.monto}>
            {savingDet ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : <><IcoPlus /> Agregar</>}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAddingDet(false)}>✕</button>
        </div>
      </form>}

      {/* ── MOVIMIENTOS ──────────────────────────────────────────────────── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Movimientos ({caja.movimientos?.length || 0})</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--gold-bright)', fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}>{fmt$2(totalMov)}</span>
          {canEdit && !addingMov && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingMov(true)}>
              <IcoPlus /> Añadir
            </button>
          )}
        </div>
      </div>
      {caja.movimientos && caja.movimientos.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }}>
          <table className="data-table">
            <thead>
              <tr><th>Tipo</th><th>Método</th><th>Monto</th><th>Cant.</th><th></th></tr>
            </thead>
            <tbody>
              {caja.movimientos.map((m) => (
                <tr key={m.id}>
                  {editingMovId === m.id ? (
                    <>
                      <td>
                        <select value={editMovForm.tipo} onChange={e => setEditMovForm(f => ({ ...f, tipo: e.target.value }))}>
                          <option>INGRESO</option>
                          <option>EGRESO</option>
                          <option>APERTURA</option>
                          <option>CIERRE</option>
                        </select>
                      </td>
                      <td>
                        <select value={editMovForm.id_metodo} onChange={e => setEditMovForm(f => ({ ...f, id_metodo: e.target.value }))}>
                          <option value="">Sin método</option>
                          {metodos.map(mp => <option key={mp.id} value={mp.id}>{mp.nombre}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" style={{ maxWidth: 100 }} value={editMovForm.monto} onChange={e => setEditMovForm(f => ({ ...f, monto: e.target.value }))} />
                      </td>
                      <td>
                        <input type="number" min="1" step="1" style={{ maxWidth: 70 }} value={editMovForm.cantidad} onChange={e => setEditMovForm(f => ({ ...f, cantidad: e.target.value }))} />
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-primary" disabled={savingMovEdit} onClick={() => handleSaveMov(m.id)}>Guardar</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingMovId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <span className={`badge ${m.tipo === 'INGRESO' || m.tipo === 'APERTURA' ? 'badge-green' : 'badge-red'}`}>{m.tipo}</span>
                      </td>
                      <td className="td-muted">{m.metodo_pago?.nombre || '—'}</td>
                      <td className="td-number">{fmt$2(m.monto)}</td>
                      <td className="td-muted" style={{ textAlign: 'right' }}>{m.cantidad ?? '—'}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {canEdit && (
                          <button className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditMov(m)}>
                            <IcoEdit />
                          </button>
                        )}
                        {canDelete && (
                          <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteMov(m.id)}>
                            <IcoTrash />
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(!caja.movimientos || caja.movimientos.length === 0) && !addingMov && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin movimientos</div>
      )}

      {canEdit && addingMov && <form onSubmit={handleAddMov}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving || !newMov.monto}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : <><IcoPlus /> Agregar</>}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAddingMov(false)}>✕</button>
        </div>
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
                  <td className="td-muted">{fmtDT(ev.fecha)}</td>
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
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const [form,   setForm]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [fotoFile,      setFotoFile]      = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)

  const [detalles,    setDetalles]    = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [tipos,       setTipos]       = useState([])
  const [metodos,     setMetodos]     = useState([])

  const [addingDet,  setAddingDet]  = useState(false)
  const [newDet,     setNewDet]     = useState({ id_tipo: '', monto: '', observaciones: '' })
  const [savingDet,  setSavingDet]  = useState(false)
  const [editingDetId, setEditingDetId] = useState(null)
  const [editDetForm,  setEditDetForm]  = useState({ id_tipo: '', monto: '', observaciones: '' })
  const [savingDetEdit, setSavingDetEdit] = useState(false)

  const [addingMov,  setAddingMov]  = useState(false)
  const [newMov,     setNewMov]     = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [savingMov,  setSavingMov]  = useState(false)
  const [editingMovId, setEditingMovId] = useState(null)
  const [editMovForm,  setEditMovForm]  = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [savingMovEdit, setSavingMovEdit] = useState(false)

  const loadRelacionales = (idLocal) => {
    cajasApi.get(cajaId).then(({ data }) => {
      setDetalles(data.detalles || [])
      setMovimientos(data.movimientos || [])
    }).catch(() => notify('Error al cargar detalles/movimientos', 'error'))
    if (idLocal) {
      detallesApi.tipos(idLocal).then(r => setTipos(r.data || [])).catch(() => {})
    }
  }

  useEffect(() => {
    if (!cajaId) return
    cajasApi.get(cajaId).then(({ data }) => {
      const toLocal = (d) => d ? new Date(d).toISOString().slice(0, 16) : ''
      setForm({
        nro_turno:    data.nro_turno    ?? '',
        tipo_turno:   data.tipo_turno   ?? '',
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
      setDetalles(data.detalles || [])
      setMovimientos(data.movimientos || [])
      if (data.id_local) detallesApi.tipos(data.id_local).then(r => setTipos(r.data || [])).catch(() => {})
    }).catch(() => notify('Error al cargar caja', 'error'))
    metodosApi.list().then(r => setMetodos(r.data || [])).catch(() => {})
  }, [cajaId])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAddDet = async (e) => {
    e.preventDefault()
    if (!newDet.monto) return
    setSavingDet(true)
    try {
      await detallesApi.create({ id_caja: cajaId, id_tipo: newDet.id_tipo || null, monto: parseFloat(newDet.monto), observaciones: newDet.observaciones || null })
      notify('Detalle agregado', 'success')
      setNewDet({ id_tipo: '', monto: '', observaciones: '' })
      setAddingDet(false)
      loadRelacionales(form?.id_local)
    } catch (err) { notify(err.response?.data?.error || 'Error al agregar detalle', 'error') }
    finally { setSavingDet(false) }
  }

  const handleDeleteDet = async (detId) => {
    if (!(await showConfirm('¿Eliminar detalle?'))) return
    try { await detallesApi.remove(detId); notify('Eliminado', 'success'); loadRelacionales(form?.id_local) }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const handleEditDet = (d) => {
    setEditingDetId(d.id)
    setEditDetForm({ id_tipo: d.id_tipo || '', monto: String(d.monto), observaciones: d.observaciones || '' })
  }

  const handleSaveDet = async (detId) => {
    if (!editDetForm.monto) return
    setSavingDetEdit(true)
    try {
      await detallesApi.update(detId, { id_tipo: editDetForm.id_tipo || null, monto: parseFloat(editDetForm.monto), observaciones: editDetForm.observaciones || null })
      notify('Detalle actualizado', 'success')
      setEditingDetId(null)
      loadRelacionales(form?.id_local)
    } catch (err) { notify(err.response?.data?.error || 'Error al actualizar', 'error') }
    finally { setSavingDetEdit(false) }
  }

  const handleAddMov = async (e) => {
    e.preventDefault()
    if (!newMov.monto) return
    setSavingMov(true)
    try {
      await movimientosApi.create({ id_caja: cajaId, tipo: newMov.tipo, id_metodo: newMov.id_metodo || null, monto: parseFloat(newMov.monto), cantidad: newMov.cantidad ? parseInt(newMov.cantidad) : null })
      notify('Movimiento agregado', 'success')
      setNewMov({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
      setAddingMov(false)
      loadRelacionales(form?.id_local)
    } catch (err) { notify(err.response?.data?.error || 'Error al agregar movimiento', 'error') }
    finally { setSavingMov(false) }
  }

  const handleDeleteMov = async (movId) => {
    if (!(await showConfirm('¿Eliminar movimiento?'))) return
    try { await movimientosApi.remove(movId); notify('Eliminado', 'success'); loadRelacionales(form?.id_local) }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const handleEditMov = (m) => {
    setEditingMovId(m.id)
    setEditMovForm({ tipo: m.tipo, id_metodo: m.id_metodo || '', monto: String(m.monto), cantidad: m.cantidad != null ? String(m.cantidad) : '' })
  }

  const handleSaveMov = async (movId) => {
    if (!editMovForm.monto) return
    setSavingMovEdit(true)
    try {
      await movimientosApi.update(movId, { tipo: editMovForm.tipo, id_metodo: editMovForm.id_metodo || null, monto: parseFloat(editMovForm.monto), cantidad: editMovForm.cantidad ? parseInt(editMovForm.cantidad) : null })
      notify('Movimiento actualizado', 'success')
      setEditingMovId(null)
      loadRelacionales(form?.id_local)
    } catch (err) { notify(err.response?.data?.error || 'Error al actualizar', 'error') }
    finally { setSavingMovEdit(false) }
  }

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
        tipo_turno:   form.tipo_turno   || null,
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
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
          <label className="form-label">Tipo de Turno</label>
          <div className="form-input-wrap">
            <select value={form.tipo_turno} onChange={e => setF('tipo_turno', e.target.value)}>
              <option value="">Sin especificar</option>
              {TIPOS_TURNO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
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

      {/* ── Detalles ─────────────────────────────────────────────────────── */}
      <div className="drawer-section-title" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Detalles ({detalles.length})</span>
        {!addingDet && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingDet(true)}>
            <IcoPlus /> Añadir
          </button>
        )}
      </div>
      {detalles.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }}>
          <table className="data-table">
            <thead><tr><th>Tipo</th><th>Nombre</th><th>Monto</th><th></th></tr></thead>
            <tbody>
              {detalles.map((d) => (
                <tr key={d.id}>
                  {editingDetId === d.id ? (
                    <>
                      <td colSpan={2}>
                        <select value={editDetForm.id_tipo} onChange={e => setEditDetForm(f => ({ ...f, id_tipo: e.target.value }))}>
                          <option value="">Ver opciones</option>
                          {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" style={{ maxWidth: 100 }} value={editDetForm.monto} onChange={e => setEditDetForm(f => ({ ...f, monto: e.target.value }))} />
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-primary" disabled={savingDetEdit} onClick={() => handleSaveDet(d.id)}>Guardar</button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingDetId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="td-muted">{clasificacionLabel(d.tipo)}</td>
                      <td>{d.detalle_tipo?.nombre || d.nombre || '—'}</td>
                      <td className="td-number">{fmt$2(d.monto)}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditDet(d)}>
                          <IcoEdit />
                        </button>
                        <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteDet(d.id)}>
                          <IcoTrash />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detalles.length === 0 && !addingDet && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin detalles</div>
      )}
      {addingDet && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre</label>
              <div className="form-input-wrap">
                <select value={newDet.id_tipo} onChange={e => setNewDet(f => ({ ...f, id_tipo: e.target.value }))}>
                  <option value="">Ver opciones</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Monto *</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={newDet.monto} onChange={e => setNewDet(f => ({ ...f, monto: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Observaciones</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Opcional" value={newDet.observaciones} onChange={e => setNewDet(f => ({ ...f, observaciones: e.target.value }))} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-primary" disabled={savingDet || !newDet.monto} onClick={handleAddDet}>
              {savingDet ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlus />} Agregar
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAddingDet(false)}>✕</button>
          </div>
        </div>
      )}

      {/* ── Movimientos ──────────────────────────────────────────────────── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Movimientos ({movimientos.length})</span>
        {!addingMov && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingMov(true)}>
            <IcoPlus /> Añadir
          </button>
        )}
      </div>
      {movimientos.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }}>
          <table className="data-table">
            <thead><tr><th>Tipo</th><th>Método</th><th>Monto</th><th>Cant.</th><th></th></tr></thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  {editingMovId === m.id ? (
                    <>
                      <td>
                        <select value={editMovForm.tipo} onChange={e => setEditMovForm(f => ({ ...f, tipo: e.target.value }))}>
                          <option>INGRESO</option>
                          <option>EGRESO</option>
                          <option>APERTURA</option>
                          <option>CIERRE</option>
                        </select>
                      </td>
                      <td>
                        <select value={editMovForm.id_metodo} onChange={e => setEditMovForm(f => ({ ...f, id_metodo: e.target.value }))}>
                          <option value="">Sin método</option>
                          {metodos.map(mp => <option key={mp.id} value={mp.id}>{mp.nombre}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" style={{ maxWidth: 100 }} value={editMovForm.monto} onChange={e => setEditMovForm(f => ({ ...f, monto: e.target.value }))} />
                      </td>
                      <td>
                        <input type="number" min="1" step="1" style={{ maxWidth: 70 }} value={editMovForm.cantidad} onChange={e => setEditMovForm(f => ({ ...f, cantidad: e.target.value }))} />
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-primary" disabled={savingMovEdit} onClick={() => handleSaveMov(m.id)}>Guardar</button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingMovId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <span className={`badge ${m.tipo === 'INGRESO' || m.tipo === 'APERTURA' ? 'badge-green' : 'badge-red'}`}>{m.tipo}</span>
                      </td>
                      <td className="td-muted">{m.metodo_pago?.nombre || '—'}</td>
                      <td className="td-number">{fmt$2(m.monto)}</td>
                      <td className="td-muted" style={{ textAlign: 'right' }}>{m.cantidad ?? '—'}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditMov(m)}>
                          <IcoEdit />
                        </button>
                        <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteMov(m.id)}>
                          <IcoTrash />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {movimientos.length === 0 && !addingMov && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin movimientos</div>
      )}
      {addingMov && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tipo</label>
              <div className="form-input-wrap">
                <select value={newMov.tipo} onChange={e => setNewMov(f => ({ ...f, tipo: e.target.value }))}>
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
                <select value={newMov.id_metodo} onChange={e => setNewMov(f => ({ ...f, id_metodo: e.target.value }))}>
                  <option value="">Sin método</option>
                  {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Monto *</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={newMov.monto} onChange={e => setNewMov(f => ({ ...f, monto: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cantidad</label>
              <div className="form-input-wrap">
                <input type="number" min="1" step="1" placeholder="Opcional" value={newMov.cantidad} onChange={e => setNewMov(f => ({ ...f, cantidad: e.target.value }))} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-primary" disabled={savingMov || !newMov.monto} onClick={handleAddMov}>
              {savingMov ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlus />} Agregar
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAddingMov(false)}>✕</button>
          </div>
        </div>
      )}

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

  const [tipos,   setTipos]   = useState([])
  const [metodos, setMetodos] = useState([])

  const [pendingDetalles, setPendingDetalles] = useState([])
  const [detForm, setDetForm] = useState({ id_tipo: '', monto: '', observaciones: '' })

  const [pendingMovimientos, setPendingMovimientos] = useState([])
  const [movForm, setMovForm] = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const targetLocalId = activeLocal?.id || localId

  useEffect(() => {
    if (!targetLocalId) return
    detallesApi.tipos(targetLocalId)
      .then(r => setTipos(r.data || []))
      .catch(() => {})
  }, [targetLocalId])

  useEffect(() => {
    metodosApi.list()
      .then(r => setMetodos(r.data || []))
      .catch(() => {})
  }, [])

  const addPendingDetalle = () => {
    if (!detForm.monto) return
    setPendingDetalles(prev => [...prev, { ...detForm, _key: crypto.randomUUID() }])
    setDetForm({ id_tipo: '', monto: '', observaciones: '' })
  }
  const removePendingDetalle = (key) => setPendingDetalles(prev => prev.filter(d => d._key !== key))

  const addPendingMovimiento = () => {
    if (!movForm.monto) return
    setPendingMovimientos(prev => [...prev, { ...movForm, _key: crypto.randomUUID() }])
    setMovForm({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  }
  const removePendingMovimiento = (key) => setPendingMovimientos(prev => prev.filter(m => m._key !== key))

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
      const nuevoId = res.data?.id

      let detOk = 0, detFail = 0
      for (const d of pendingDetalles) {
        try {
          await detallesApi.create({
            id_caja: nuevoId,
            id_tipo: d.id_tipo || null,
            monto: parseFloat(d.monto),
            observaciones: d.observaciones || null
          })
          detOk++
        } catch { detFail++ }
      }

      let movOk = 0, movFail = 0
      for (const m of pendingMovimientos) {
        try {
          await movimientosApi.create({
            id_caja: nuevoId,
            tipo: m.tipo,
            id_metodo: m.id_metodo || null,
            monto: parseFloat(m.monto),
            cantidad: m.cantidad ? parseInt(m.cantidad) : null
          })
          movOk++
        } catch { movFail++ }
      }

      if (detFail === 0 && movFail === 0) {
        notify('Caja creada', 'success')
      } else {
        notify(
          `Caja creada. Detalles: ${detOk}/${pendingDetalles.length} guardados. Movimientos: ${movOk}/${pendingMovimientos.length} guardados. Los que fallaron podés agregarlos manualmente desde el detalle.`,
          'error'
        )
      }
      onCreated(nuevoId)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
      setUploadingFoto(false)
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleCreate}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
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
          <label className="form-label">Tipo de Turno</label>
          <div className="form-input-wrap">
            <select value={form.tipo_turno} onChange={e => setF('tipo_turno', e.target.value)}>
              <option value="">Sin especificar</option>
              {TIPOS_TURNO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
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
      <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>Detalles (opcional)</div>
      {pendingDetalles.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '0.75rem' }}>
          <table className="data-table">
            <thead><tr><th>Nombre</th><th>Monto</th><th></th></tr></thead>
            <tbody>
              {pendingDetalles.map(d => (
                <tr key={d._key}>
                  <td>{tipos.find(t => t.id === d.id_tipo)?.nombre || '—'}</td>
                  <td className="td-number">{fmt$2(d.monto)}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => removePendingDetalle(d._key)}>
                      <IcoTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nombre</label>
          <div className="form-input-wrap">
            <select value={detForm.id_tipo} onChange={e => setDetForm(f => ({ ...f, id_tipo: e.target.value }))}>
              <option value="">Ver opciones</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Monto</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={detForm.monto} onChange={e => setDetForm(f => ({ ...f, monto: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label className="form-label">Observaciones</label>
          <div className="form-input-wrap">
            <input type="text" placeholder="Opcional" value={detForm.observaciones} onChange={e => setDetForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
        </div>
      </div>
      <div style={{ marginTop: '0.75rem', marginBottom: '1.25rem' }}>
        <button type="button" className="btn btn-secondary" onClick={addPendingDetalle} disabled={!detForm.monto}>
          <IcoPlus /> Agregar
        </button>
      </div>

      <div className="drawer-section-title">Movimientos (opcional)</div>
      {pendingMovimientos.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '0.75rem' }}>
          <table className="data-table">
            <thead><tr><th>Tipo</th><th>Método</th><th>Monto</th><th>Cant.</th><th></th></tr></thead>
            <tbody>
              {pendingMovimientos.map(m => (
                <tr key={m._key}>
                  <td>
                    <span className={`badge ${m.tipo === 'INGRESO' || m.tipo === 'APERTURA' ? 'badge-green' : 'badge-red'}`}>{m.tipo}</span>
                  </td>
                  <td className="td-muted">{metodos.find(x => x.id === m.id_metodo)?.nombre || '—'}</td>
                  <td className="td-number">{fmt$2(m.monto)}</td>
                  <td className="td-muted" style={{ textAlign: 'right' }}>{m.cantidad || '—'}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => removePendingMovimiento(m._key)}>
                      <IcoTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Tipo</label>
          <div className="form-input-wrap">
            <select value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}>
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
            <select value={movForm.id_metodo} onChange={e => setMovForm(f => ({ ...f, id_metodo: e.target.value }))}>
              <option value="">Sin método</option>
              {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Monto</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={movForm.monto} onChange={e => setMovForm(f => ({ ...f, monto: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Cantidad</label>
          <div className="form-input-wrap">
            <input type="number" min="1" step="1" placeholder="Opcional" value={movForm.cantidad} onChange={e => setMovForm(f => ({ ...f, cantidad: e.target.value }))} />
          </div>
        </div>
      </div>
      <div style={{ marginTop: '0.75rem', marginBottom: '1.25rem' }}>
        <button type="button" className="btn btn-secondary" onClick={addPendingMovimiento} disabled={!movForm.monto}>
          <IcoPlus /> Agregar
        </button>
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

const LIMIT = 100
export default function CajaList() {
  const [searchParams] = useSearchParams()
  const { activeApp, activeLocal } = useAppStore()
  const locales     = activeApp?.locales ?? []
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const role        = activeApp?.role
  const canCreate = ['super_admin', 'dcsmart', 'admin', 'cajero'].includes(role)
  const canEdit    = ['super_admin', 'dcsmart', 'admin'].includes(role)
  const canDelete  = ['super_admin', 'dcsmart', 'admin'].includes(role)
  const canAuditDc = ['super_admin', 'dcsmart'].includes(role)
  const canExport  = ['super_admin', 'dcsmart'].includes(role)
  const [exporting, setExporting] = useState(false)

  const [cajas,      setCajas]      = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(true)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [panelMode,  setPanelMode]  = useState('create')
  const [selectedId, setSelectedId] = useState(null)
  const [sortField,  setSortField]  = useState('fecha_inicio')
  const [sortDir,    setSortDir]    = useState('desc')
  const FILTER_INIT_CAJAS = { desde: '', hasta: '', audit: '' }
  const [filters, setFilters] = useState(FILTER_INIT_CAJAS)
  const [draft,   setDraft]   = useState(FILTER_INIT_CAJAS)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const hasActiveFilters  = activeFilterCount > 0

  const openFilters   = () => { setDraft(filters); setFilterOpen(true) }
  const applyFilters  = () => { setFilters(draft); setFilterOpen(false) }
  const clearFilters  = () => { setDraft(FILTER_INIT_CAJAS); setFilters(FILTER_INIT_CAJAS) }
  const setDraftField = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  useEffect(() => {
    if (!filterOpen) return
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])
  const autoOpenedRef = useRef(false)

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectionMode, setSelectionMode] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const cajaListParams = useCallback((pageNum) => ({
    id_local: activeLocal?.id,
    page: pageNum,
    limit: LIMIT,
    sort_field: sortField,
    sort_dir: sortDir,
    ...(filters.audit !== '' ? { audit: filters.audit } : {}),
    ...(filters.desde !== '' ? { desde: filters.desde } : {}),
    ...(filters.hasta !== '' ? { hasta: filters.hasta } : {})
  }), [activeLocal?.id, sortField, sortDir, filters])

  // Volver a página 1 cuando cambian filtros / sort / local
  useEffect(() => { setPage(1) }, [cajaListParams])

  // ── Exportar CSV: mismos filtros ya aplicados, pero SIN paginar (limit: 0
  // → el backend trae todas las filas que matchean el where, no una página) ──
  const exportCsv = useCallback(async () => {
    setExporting(true)
    try {
      const { data } = await cajasApi.list({ ...cajaListParams(1), limit: 0 })
      if (!data.data.length) { notify('No hay filas para exportar con estos filtros', 'info'); return }
      downloadCsv(`cajas_${new Date().toISOString().slice(0, 10)}.csv`, data.data, CAJA_CSV_COLUMNS)
    } catch {
      notify('Error al exportar CSV', 'error')
    } finally {
      setExporting(false)
    }
  }, [cajaListParams, notify])

  const load = useCallback(() => {
    setLoading(true)
    cajasApi.list(cajaListParams(page))
      .then(({ data }) => { setCajas(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar cajas', 'error'))
      .finally(() => setLoading(false))
  }, [cajaListParams, page])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setSelectedIds(new Set())
    cajasApi.list(cajaListParams(page), ctrl.signal)
      .then(({ data }) => {
        setCajas(data.data)
        setTotal(data.total)
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
  }, [cajaListParams, page])

  const goToPage = (p) => {
    const next = Math.min(Math.max(1, p), totalPages)
    if (next !== page) {
      setPage(next)
      document.querySelector('.app-main')?.scrollTo({ top: 0 })
    }
  }

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

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

  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const allVisibleSelected = cajas.length > 0 && cajas.every(c => selectedIds.has(c.id))
  const toggleSelectAllVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(cajas.map(c => c.id)))
  }

  const selectedCajas    = cajas.filter(c => selectedIds.has(c.id))
  const canBulkAudit     = selectedCajas.some(c => !c.audit)
  const canBulkDesaudit  = selectedCajas.some(c => c.audit)

  const bulkCancel = () => setSelectedIds(new Set())

  const toggleSelectionMode = () => {
    setSelectionMode(m => !m)
    setSelectedIds(new Set())
  }

  const bulkAuditar = async () => {
    const targets = selectedCajas.filter(c => !c.audit)
    let ok = 0, fail = 0
    for (const c of targets) {
      try { await cajasApi.audit(c.id); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} cajas auditadas` : `${ok}/${targets.length} auditadas, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkDesauditar = async () => {
    const targets = selectedCajas.filter(c => c.audit)
    let ok = 0, fail = 0
    for (const c of targets) {
      try { await cajasApi.audit(c.id, { observaciones: null }); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} cajas desauditadas` : `${ok}/${targets.length} desauditadas, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkEliminar = async () => {
    if (!(await showConfirm(`¿Eliminar ${selectedCajas.length} cajas?`))) return
    let ok = 0, fail = 0
    for (const c of selectedCajas) {
      try { await cajasApi.remove(c.id); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} cajas eliminadas` : `${ok}/${selectedCajas.length} eliminadas, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
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
  const colCount = 13 + (showLocalCol ? 1 : 0) + (selectionMode ? 1 : 0)

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Cajas</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }} ref={filterRef}>
            <button
              className={`btn ${filterOpen || hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => filterOpen ? setFilterOpen(false) : openFilters()}
            >
              <IcoFilter />
              Filtros
              {activeFilterCount > 0 && (
                <span style={{ marginLeft: 6, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filterOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '1.25rem', width: 320, maxWidth: '90vw',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Desde</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.desde} max={draft.hasta || undefined} onChange={e => setDraftField('desde', e.target.value)} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Hasta</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.hasta} min={draft.desde || undefined} onChange={e => setDraftField('hasta', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Auditado</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.audit} onChange={e => setDraftField('audit', e.target.value)}>
                      <option value="">Todos</option>
                      <option value="false">No auditado</option>
                      <option value="true">Auditado</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-sm btn-secondary" onClick={clearFilters}>
                    Limpiar todo
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={applyFilters}>
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>
          {(canEdit || canDelete) && (
            <button className={`btn ${selectionMode ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleSelectionMode}>
              <IcoCheckSquare /> {selectionMode ? 'Cancelar selección' : 'Seleccionar'}
            </button>
          )}
          {canExport && (
            <button className="btn btn-secondary" onClick={exportCsv} disabled={exporting} title="Exportar a CSV las cajas con los filtros actuales">
              {exporting ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <IcoDownload />} Exportar CSV
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={openCreate}>
              <IcoPlus /> Nueva Caja
            </button>
          )}
        </div>
      </div>

      {selectionMode && selectedIds.size > 0 && (
        <div className="bulk-bar">
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold-bright)' }}>
            {selectedIds.size} seleccionados
          </span>
          <button className="btn btn-sm btn-secondary" onClick={bulkAuditar} disabled={!canBulkAudit}>
            Auditar
          </button>
          <button className="btn btn-sm btn-secondary" onClick={bulkDesauditar} disabled={!canBulkDesaudit}>
            Desauditar
          </button>
          <button className="btn btn-sm btn-danger" onClick={bulkEliminar}>
            Eliminar
          </button>
          <button className="btn btn-sm btn-secondary" onClick={bulkCancel} style={{ marginLeft: 'auto' }}>
            Cancelar
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {selectionMode && (
                <th style={{ width: 32 }}>
                  <input type="checkbox" className="select-checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                </th>
              )}
              <SortTh field="nro_turno">Nro Turno</SortTh>
              <th>Tipo</th>
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
            ) : cajas.length === 0 ? (
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
                {cajas.map((c) => (
                  <tr key={c.id} className="row-clickable" onClick={() => openDetail(c.id)}>
                    {selectionMode && (
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="select-checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} />
                      </td>
                    )}
                    <td className="td-primary">{c.nro_turno ? `TRN ${c.nro_turno}` : <span className="td-muted">—</span>}</td>
                    <td className="td-muted">{c.tipo_turno || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: c.audit ? 'var(--green)' : 'var(--amber)' }} title={c.audit ? 'Auditado' : 'No auditado'}>
                        {c.audit ? <IcoThumbUp /> : <IcoEye />}
                      </span>
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
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      {c.foto_url
                        ? <FotoViewer pagoId={c.id} fotoUrl={c.foto_url} entity="cajas" drawerWidth={0} compact />
                        : <span className="td-muted">—</span>}
                    </td>
                    {showLocalCol && <td className="td-muted">{c.local?.nombre ?? '—'}</td>}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span className="pagination-info">
            {`${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} de ${total} cajas`}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(1)} disabled={page <= 1} title="Primera página">«</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Anterior</button>
            <span className="pagination-info">Página {page} de {totalPages}</span>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>Siguiente ›</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(totalPages)} disabled={page >= totalPages} title="Última página">»</button>
          </div>
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
            canAuditDc={canAuditDc}
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
