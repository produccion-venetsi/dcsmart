import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { impuestosApi } from '../../api/impuestos.js'
import { rubrosApi, categoriasApi, rubcatApi } from '../../api/rubcat.js'
import { metodosApi } from '../../api/metodospago.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import FotoViewer from '../../components/FotoViewer.jsx'

const TIPO_BADGE = {
  A: 'badge-blue', B: 'badge-green', C: 'badge-muted', CM: 'badge-amber',
  'DC (1)': 'badge-purple', 'DC (2)': 'badge-purple',
  DC_1: 'badge-purple', DC_2: 'badge-purple',
  DDJJ: 'badge-red', M: 'badge-muted', NCA: 'badge-amber', NDA: 'badge-amber', STK: 'badge-blue',
}
const ESTADO_BADGE = {
  CAJA: 'badge-muted', CUENTA_CTE: 'badge-amber', MP_PDP: 'badge-blue', PDP: 'badge-green',
}
const ESTADO_OP_LABEL = {
  CAJA: 'CAJA', CUENTA_CTE: 'CUENTA CTE', MP_PDP: 'MP PDP', PDP: 'PDP',
}
const ESTADO_OP_OPTIONS = [
  { value: 'CAJA',       label: 'CAJA' },
  { value: 'CUENTA_CTE', label: 'CUENTA CTE' },
  { value: 'MP_PDP',     label: 'MP PDP' },
  { value: 'PDP',        label: 'PDP' },
]
const TIPO_PAGO_OPTIONS = [
  'A','B','C','CM','DC_1','DC_2','DDJJ','M','NCA','NDA','STK'
]
const TIPOS_IMP = ['IVA21', 'IVA27', 'IVA10', 'RETENCION', 'PERCEPCION']

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
function IcoEdit() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}
function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
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
function IcoPagoEmpty() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
function IcoPlane() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}
function IcoDollar() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  )
}
function IcoRepeat() {
  return (
    <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}

function fmt$(n)     { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }
function fmtDate(d)  { return d ? new Date(d).toLocaleDateString('es-AR') : '—' }
function fmtMonth(d) { return d ? new Date(d).toLocaleDateString('es-AR', { year: 'numeric', month: 'short' }) : '—' }
function fmtPV(v)    { return v != null ? String(v).padStart(5, '0') : '—' }
function fmtNro(v)   { return v != null ? String(v).padStart(8, '0') : '—' }

function PagoDetailPanel({ pago, navigate, onDelete, onAudit, onPatch, metodos = [], canEdit = false, canDelete = false }) {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const [impuestos,   setImpuestos]   = useState([])
  const [loadingImp,  setLoadingImp]  = useState(true)
  const [impForm,     setImpForm]     = useState({ tipo: 'IVA21', monto: '' })
  const [savingImp,   setSavingImp]   = useState(false)
  const [audited,     setAudited]     = useState(pago.audit)
  const [auditando,   setAuditando]   = useState(false)
  const [periodico,   setPeriodico]   = useState(pago.periodico ?? false)
  const [toggling,    setToggling]    = useState(false)
  const [multimoneda, setMultimoneda] = useState([])
  const [loadingMM,   setLoadingMM]   = useState(true)
  const [mmForm,      setMmForm]      = useState({ tipo: 'USD', tdc: '', monto: '' })
  const [savingMM,    setSavingMM]    = useState(false)
  const [pagarOpen,   setPagarOpen]   = useState(false)
  const [pagarForm,   setPagarForm]   = useState({ fecha_pago: new Date().toISOString().slice(0, 10), id_metodo: '' })
  const [pagando,     setPagando]     = useState(false)
  const [mandando,    setMandando]    = useState(false)

  const loadImpuestos = () => {
    setLoadingImp(true)
    impuestosApi.list({ id_pago: pago.id, limit: 100 })
      .then(({ data }) => setImpuestos(data.data || data))
      .catch(() => notify('Error al cargar impuestos', 'error'))
      .finally(() => setLoadingImp(false))
  }

  const loadMM = () => {
    setLoadingMM(true)
    pagosApi.listMM(pago.id)
      .then(({ data }) => setMultimoneda(data))
      .catch(() => {})
      .finally(() => setLoadingMM(false))
  }

  useEffect(() => { if (pago) { loadImpuestos(); loadMM() } }, [pago?.id])

  const handleTogglePeriodico = async () => {
    setToggling(true)
    try {
      const { data } = await pagosApi.periodico(pago.id)
      setPeriodico(data.periodico)
      onPatch?.(pago.id, { periodico: data.periodico })
      notify(data.periodico ? 'Marcado como periódico' : 'Periódico desactivado', 'success')
    } catch { notify('Error', 'error') }
    finally { setToggling(false) }
  }

  const handleMandarPdp = async () => {
    if (!(await showConfirm('¿Mandar esta orden a PDP?'))) return
    setMandando(true)
    try {
      await pagosApi.mandarPdp([pago.id])
      notify('Orden enviada a PDP', 'success')
      onPatch?.(pago.id, { estado_op: 'PDP' })
    } catch { notify('Error al mandar a PDP', 'error') }
    finally { setMandando(false) }
  }

  const handlePagar = async (e) => {
    e.preventDefault()
    if (!pagarForm.id_metodo) return notify('Seleccioná un método de pago', 'error')
    setPagando(true)
    try {
      await pagosApi.pagar([pago.id], { fecha_pago: pagarForm.fecha_pago, id_metodo: pagarForm.id_metodo })
      notify('Pago registrado', 'success')
      setPagarOpen(false)
      onPatch?.(pago.id, { pagado: true, fecha_pago: pagarForm.fecha_pago, id_metodo: pagarForm.id_metodo })
    } catch { notify('Error al pagar', 'error') }
    finally { setPagando(false) }
  }

  const handleAddMM = async (e) => {
    e.preventDefault()
    if (!mmForm.tdc || !mmForm.monto) return
    setSavingMM(true)
    try {
      await pagosApi.createMM(pago.id, { tipo: mmForm.tipo, tdc: parseFloat(mmForm.tdc), monto: parseFloat(mmForm.monto) })
      notify('Registro multimoneda agregado', 'success')
      setMmForm({ tipo: 'USD', tdc: '', monto: '' })
      loadMM()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSavingMM(false) }
  }

  const handleDeleteMM = async (mmId) => {
    if (!(await showConfirm('¿Eliminar registro?'))) return
    try { await pagosApi.deleteMM(pago.id, mmId); notify('Eliminado', 'success'); loadMM() }
    catch { notify('Error', 'error') }
  }

  const handlePanelAudit = async () => {
    if (audited && !(await showConfirm('Esta orden ya está auditada. ¿Querés desauditarla?'))) return
    setAuditando(true)
    try {
      const { data } = await pagosApi.audit(pago.id)
      setAudited(data.audit)
      notify(data.audit ? 'Pago auditado' : 'Auditoría revertida', 'success')
      onAudit?.(pago.id, data.audit)
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }

  const handleAddImp = async (e) => {
    e.preventDefault()
    if (!impForm.monto) return
    setSavingImp(true)
    try {
      await impuestosApi.create({ id_pago: pago.id, tipo: impForm.tipo, monto: parseFloat(impForm.monto) })
      notify('Impuesto agregado', 'success')
      setImpForm({ tipo: 'IVA21', monto: '' })
      loadImpuestos()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSavingImp(false) }
  }

  const handleDeleteImp = async (id) => {
    if (!(await showConfirm('¿Eliminar impuesto?'))) return
    try { await impuestosApi.remove(id); notify('Eliminado', 'success'); loadImpuestos() }
    catch { notify('Error al eliminar', 'error') }
  }

  const infoRows = [
    ['OP',          pago.nro_ord != null ? `OP-${pago.nro_ord}` : '—'],
    ['Fecha',       fmtDate(pago.fecha)],
    ['Proveedor',   pago.proveedor?.nombre || '—'],
    ['Rubro / Cat', pago.rubcat ? `${pago.rubcat.rubro?.nombre} / ${pago.rubcat.categoria?.nombre}` : '—'],
    ['Tipo',        pago.id_tipo || '—'],
    ['PV',          fmtPV(pago.pv)],
    ['Nro',         fmtNro(pago.nro)],
    ['Neto',        fmt$(pago.importe_neto)],
    ['Descuento',   fmt$(pago.descuento)],
    ['Importe',     fmt$(pago.importe)],
    ['Método',      pago.metodo_pago?.nombre || '—'],
    ['Cashflow',    fmtDate(pago.cashflow)],
    ['Dirección',   pago.ingresa_egreso != null ? (pago.ingresa_egreso ? 'Ingreso' : 'Egreso') : '—'],
    ['Estado Op.',  ESTADO_OP_LABEL[pago.estado_op] ?? pago.estado_op ?? '—'],
    ['Pagado',      pago.pagado ? 'Sí' : 'No'],
    ['Fecha Pago',  fmtDate(pago.fecha_pago)],
    ['Período',     fmtMonth(pago.periodo)],
    ['Local',       pago.local?.nombre || '—'],
    ['Auditado',    audited ? 'Sí' : 'No'],
    ['Periódico',   periodico ? 'Sí' : 'No'],
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {canEdit && (
          <button className="btn btn-secondary" onClick={() => navigate(`/pagos/${pago.id}/editar`)}>
            <IcoEdit /> Editar
          </button>
        )}
        {canEdit && (
          <button
            className={`btn ${audited ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handlePanelAudit}
            disabled={auditando}
          >
            {auditando
              ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              : audited ? '✓ Auditado' : 'Auditar'
            }
          </button>
        )}
        {canEdit && pago.estado_op !== 'PDP' && (
          <button className="btn btn-secondary" onClick={handleMandarPdp} disabled={mandando} title="Mandar a PDP">
            {mandando ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlane />}
            {' '}PDP
          </button>
        )}
        {canEdit && !pago.pagado && (
          <button className="btn btn-secondary" onClick={() => setPagarOpen(true)} title="Registrar pago">
            <IcoDollar /> Pagar
          </button>
        )}
        {canEdit && (
          <button
            className={`btn ${periodico ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleTogglePeriodico}
            disabled={toggling}
            title="Marcar como periódico"
          >
            {toggling ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoRepeat />}
            {' '}{periodico ? 'Periódico' : 'Periódico'}
          </button>
        )}
        {canDelete && (
          <button className="btn btn-danger" onClick={() => onDelete(pago.id)}>
            <IcoTrash /> Eliminar
          </button>
        )}
      </div>

      {/* Modal Pagar */}
      {pagarOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPagarOpen(false)}>
          <form onSubmit={handlePagar} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', width: 340, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Registrar pago</div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Fecha de pago</label>
              <div className="form-input-wrap">
                <input type="date" value={pagarForm.fecha_pago} onChange={e => setPagarForm(f => ({ ...f, fecha_pago: e.target.value }))} required />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Forma de pago *</label>
              <div className="form-input-wrap">
                <select value={pagarForm.id_metodo} onChange={e => setPagarForm(f => ({ ...f, id_metodo: e.target.value }))} required>
                  <option value="">Seleccioná método</option>
                  {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPagarOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={pagando}>
                {pagando ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Confirmar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {pago.observaciones && (
        <div style={{ marginBottom: '1rem', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, color: 'var(--t2)' }}>
          {pago.observaciones}
        </div>
      )}

      <div className="drawer-section-title">Datos del pago</div>
      <div className="drawer-detail">
        {infoRows.map(([k, v]) => (
          <div key={k} className="drawer-detail-row">
            <span className="drawer-detail-key">{k}</span>
            <span className="drawer-detail-val">{v}</span>
          </div>
        ))}
        {(pago.foto_url || pago.pdf_url) && (
          <div className="drawer-detail-row" style={{ alignItems: 'flex-start' }}>
            <span className="drawer-detail-key" style={{ paddingTop: 6 }}>Adjuntos</span>
            <span className="drawer-detail-val">
              <FotoViewer pagoId={pago.id} fotoUrl={pago.foto_url} pdfUrl={pago.pdf_url} />
            </span>
          </div>
        )}
      </div>

      <div className="drawer-section-title">Impuestos</div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loadingImp ? (
              Array.from({ length: 3 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 3 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 15 + i * 11) % 35}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {impuestos.map((imp) => (
                  <tr key={imp.id}>
                    <td><span className="badge badge-blue">{imp.tipo}</span></td>
                    <td className="td-number">{fmt$(imp.monto)}</td>
                    <td>
                      <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteImp(imp.id)}>
                        <IcoTrash />
                      </button>
                    </td>
                  </tr>
                ))}
                {impuestos.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--t3)' }}>Sin impuestos</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={handleAddImp} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0, flex: 1 }}>
          <label className="form-label">Tipo</label>
          <div className="form-input-wrap">
            <select value={impForm.tipo} onChange={e => setImpForm({ ...impForm, tipo: e.target.value })}>
              {TIPOS_IMP.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0, flex: 1 }}>
          <label className="form-label">Monto *</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" required placeholder="0.00" value={impForm.monto} onChange={e => setImpForm({ ...impForm, monto: e.target.value })} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={savingImp || !impForm.monto}>
          {savingImp ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlus />}
        </button>
      </form>

      <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>Multimoneda</div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr><th>Moneda</th><th>TDC</th><th>Monto</th><th></th></tr>
          </thead>
          <tbody>
            {loadingMM ? (
              Array.from({ length: 2 }, (_, i) => (
                <tr key={i} className="skel-row">{Array.from({ length: 4 }, (_, j) => <td key={j}><span className="skel" /></td>)}</tr>
              ))
            ) : (
              <>
                {multimoneda.map(mm => (
                  <tr key={mm.id}>
                    <td><span className="badge badge-amber">{mm.tipo}</span></td>
                    <td className="td-mono">{Number(mm.tdc).toFixed(4)}</td>
                    <td className="td-number">{Number(mm.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteMM(mm.id)}><IcoTrash /></button>
                    </td>
                  </tr>
                ))}
                {multimoneda.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: 'var(--t3)' }}>Sin registros</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={handleAddMM} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0, flex: '0 0 70px' }}>
          <label className="form-label">Moneda</label>
          <div className="form-input-wrap">
            <select value={mmForm.tipo} onChange={e => setMmForm(f => ({ ...f, tipo: e.target.value }))}>
              {['USD', 'EUR', 'BRL', 'UYU', 'BTC', 'OTRO'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0, flex: 1 }}>
          <label className="form-label">TDC *</label>
          <div className="form-input-wrap">
            <input type="number" step="0.0001" required placeholder="1000.00" value={mmForm.tdc} onChange={e => setMmForm(f => ({ ...f, tdc: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0, flex: 1 }}>
          <label className="form-label">Monto *</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" required placeholder="0.00" value={mmForm.monto} onChange={e => setMmForm(f => ({ ...f, monto: e.target.value }))} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={savingMM || !mmForm.tdc || !mmForm.monto}>
          {savingMM ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlus />}
        </button>
      </form>
    </div>
  )
}

// ─── Filtros ────────────────────────────────────────────────────────────────

const FILTER_INIT = {
  pagado: '', estado_op: '', desde: '', hasta: '',
  id_tipo: '', id_rub: '', id_cat: '',
  audit: '', ingresa_egreso: '', id_metodo: '', cmv_quick: '',
  id_proveedores: [],
  id_rubcats: [],
}

// ─── Scroll virtual ─────────────────────────────────────────────────────────

const ROW_HEIGHT = 32
const OVERSCAN = 20
const COL_COUNT = 20

// ─── Componente principal ───────────────────────────────────────────────────

export default function PagoList() {
  const navigate    = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const activeApp   = useAppStore((s) => s.activeApp)
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const role        = activeApp?.role
  const canEdit     = ['super_admin', 'dcsmart', 'admin'].includes(role)
  const canDelete   = ['super_admin', 'dcsmart'].includes(role)

  const [pagos,        setPagos]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filters,      setFilters]      = useState(FILTER_INIT)
  const [panelOpen,    setPanelOpen]    = useState(false)
  const [selectedPago, setSelectedPago] = useState(null)
  const [sortField,    setSortField]    = useState('fecha')
  const [sortDir,      setSortDir]      = useState('desc')
  const [search,       setSearch]       = useState('')
  const [auditingId,   setAuditingId]   = useState(null)

  const [rubros,      setRubros]      = useState([])
  const [categorias,  setCategorias]  = useState([])
  const [rubcats,     setRubcats]     = useState([])
  const [metodos,     setMetodos]     = useState([])
  const [proveedores, setProveedores] = useState([])

  const scrollRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)

  // ── Carga de datos de referencia ──────────────────────────────────────────
  useEffect(() => {
    rubrosApi.list().then(r => setRubros(r.data || [])).catch(() => {})
    categoriasApi.list().then(r => setCategorias(r.data || [])).catch(() => {})
    rubcatApi.list().then(r => setRubcats(r.data || [])).catch(() => {})
    metodosApi.list().then(r => setMetodos(r.data || [])).catch(() => {})
    proveedoresApi.list({ activo: 'true', limit: 500 }).then(r => setProveedores(r.data?.data || [])).catch(() => {})
  }, [])

  // ── Carga de TODOS los pagos ──────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true)
    pagosApi.list({
      ...(activeLocal?.id ? { id_local: activeLocal.id } : {}),
      limit: 0
    })
      .then(({ data }) => setPagos(data.data))
      .catch(() => notify('Error al cargar pagos', 'error'))
      .finally(() => setLoading(false))
  }, [activeLocal?.id])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    pagosApi.list({
      ...(activeLocal?.id ? { id_local: activeLocal.id } : {}),
      limit: 0
    }, ctrl.signal)
      .then(({ data }) => setPagos(data.data))
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar pagos', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [activeLocal?.id])

  // ── Filtrado client-side ──────────────────────────────────────────────────
  const nroOrdNum = search.trim().replace(/^op[-\s]*/i, '')

  const filteredPagos = useMemo(() => {
    let result = pagos

    if (nroOrdNum !== '') {
      const num = parseInt(nroOrdNum)
      if (!isNaN(num)) result = result.filter(p => p.nro_ord === num)
    }
    if (filters.pagado !== '')
      result = result.filter(p => p.pagado === (filters.pagado === 'true'))
    if (filters.estado_op !== '')
      result = result.filter(p => p.estado_op === filters.estado_op)
    if (filters.desde) {
      const d = new Date(filters.desde)
      result = result.filter(p => p.fecha && new Date(p.fecha) >= d)
    }
    if (filters.hasta) {
      const d = new Date(filters.hasta + 'T23:59:59.999')
      result = result.filter(p => p.fecha && new Date(p.fecha) <= d)
    }
    if (filters.id_tipo !== '')
      result = result.filter(p => p.id_tipo === filters.id_tipo)
    if (filters.id_rub !== '')
      result = result.filter(p => p.rubcat?.id_rub === filters.id_rub)
    if (filters.id_cat !== '')
      result = result.filter(p => p.rubcat?.id_cat === filters.id_cat)
    if (filters.audit !== '')
      result = result.filter(p => p.audit === (filters.audit === 'true'))
    if (filters.ingresa_egreso !== '')
      result = result.filter(p => p.ingresa_egreso === (filters.ingresa_egreso === 'true'))
    if (filters.id_metodo !== '')
      result = result.filter(p => p.id_metodo === filters.id_metodo)
    if (filters.cmv_quick === 'true')
      result = result.filter(p => p.rubcat?.rubro?.nombre?.toUpperCase().startsWith('CMV'))
    if (filters.id_proveedores.length > 0)
      result = result.filter(p => filters.id_proveedores.includes(p.id_proveedor))
    if (filters.id_rubcats.length > 0)
      result = result.filter(p => filters.id_rubcats.includes(p.id_rubcat))

    return result
  }, [pagos, nroOrdNum, filters])

  // ── Ordenamiento client-side ──────────────────────────────────────────────
  const getSortVal = (p, field) => {
    if (field === 'proveedor') return p.proveedor?.nombre ?? ''
    return p[field] ?? ''
  }

  const sortedPagos = useMemo(() => {
    return [...filteredPagos].sort((a, b) => {
      const va = getSortVal(a, sortField)
      const vb = getSortVal(b, sortField)
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredPagos, sortField, sortDir])

  // ── Scroll virtual ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [filters, search, sortField, sortDir])

  const viewportH = scrollRef.current?.clientHeight ?? 800
  const startIdx  = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx    = Math.min(sortedPagos.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN)
  const topPad    = startIdx * ROW_HEIGHT
  const bottomPad = Math.max(0, (sortedPagos.length - endIdx) * ROW_HEIGHT)
  const visiblePagos = sortedPagos.slice(startIdx, endIdx)

  // ── Acciones ──────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!(await showConfirm('¿Eliminar este pago?'))) return
    try {
      await pagosApi.remove(id)
      notify('Pago eliminado', 'success')
      setPanelOpen(false)
      setPagos(prev => prev.filter(p => p.id !== id))
    }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const patchPagoAudit = (id, audit) =>
    setPagos(prev => prev.map(p => p.id === id ? { ...p, audit } : p))

  const patchPago = (id, fields) =>
    setPagos(prev => prev.map(p => p.id === id ? { ...p, ...fields } : p))

  const handleAudit = async (id, e) => {
    e.stopPropagation()
    const current = pagos.find(p => p.id === id)
    if (current?.audit && !(await showConfirm('Esta orden ya está auditada. ¿Querés desauditarla?'))) return
    setAuditingId(id)
    try {
      const { data } = await pagosApi.audit(id)
      notify(data.audit ? 'Pago auditado' : 'Auditoría revertida', 'success')
      patchPagoAudit(id, data.audit)
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditingId(null) }
  }

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const openDetail  = (p) => { setSelectedPago(p); setPanelOpen(true) }
  const closePanel  = () => setPanelOpen(false)

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false)
  const [draft, setDraft] = useState(FILTER_INIT)
  const filterRef = useRef(null)
  const activeFilterCount = Object.values(filters).filter(v => Array.isArray(v) ? v.length > 0 : v !== '').length
  const hasActiveFilters  = activeFilterCount > 0

  const openFilters = () => { setDraft(filters); setFilterOpen(true) }

  useEffect(() => {
    if (!filterOpen) return
    const handleClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [filterOpen])

  const applyFilters  = () => { setFilters(draft); setFilterOpen(false) }
  const clearFilters  = () => { setDraft(FILTER_INIT); setFilters(FILTER_INIT); setSearch('') }
  const setDraftField = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  const toggleDraftArr = (k, v) => setDraft(d => {
    const arr = d[k] || []
    return { ...d, [k]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] }
  })

  const [provSearch, setProvSearch] = useState('')
  const filteredProvs = useMemo(() =>
    provSearch.trim()
      ? proveedores.filter(p => (p.nombre || '').toLowerCase().includes(provSearch.toLowerCase()))
      : proveedores
  , [proveedores, provSearch])

  const hasCmvRubros = rubros.some(r => r.nombre?.toUpperCase().startsWith('CMV'))
  const CHIPS = [
    { label: 'STK',         filters: { id_tipo: 'STK' } },
    { label: 'CMV',         filters: { cmv_quick: 'true' }, disabled: !hasCmvRubros },
    { label: 'No auditado', filters: { audit: 'false' } },
    { label: 'No pagado',   filters: { pagado: 'false' } },
    { label: 'Egreso',      filters: { ingresa_egreso: 'false' } },
  ]

  const isChipActive = (chipFilters) =>
    Object.entries(chipFilters).every(([k, v]) => v !== '' && draft[k] === v)

  const toggleChip = (chipFilters) => {
    if (isChipActive(chipFilters)) {
      const cleared = Object.keys(chipFilters).reduce((acc, k) => ({ ...acc, [k]: '' }), {})
      setDraft(d => ({ ...d, ...cleared }))
    } else {
      setDraft(d => ({ ...d, ...chipFilters }))
    }
  }

  const catsForRubro = draft.id_rub
    ? rubcats.filter(rc => rc.id_rub === draft.id_rub).map(rc => rc.categoria).filter(Boolean)
    : categorias

  // ── Estilos ───────────────────────────────────────────────────────────────
  const SortTh = ({ field, children, minWidth }) => (
    <th className={`sortable${sortField === field ? ' active' : ''}`} style={minWidth ? { minWidth } : undefined} onClick={() => toggleSort(field)}>
      {children} <span className="sort-ico">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )

  const chipSt = (active) => ({
    padding: '3px 11px', borderRadius: 20, cursor: 'pointer', fontSize: 11,
    fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
    border: `1px solid ${active ? 'var(--gold-bright)' : 'var(--border)'}`,
    background: active ? 'rgba(212,175,55,0.15)' : 'transparent',
    color: active ? 'var(--gold-bright)' : 'var(--t2)',
  })

  const lbl = {
    fontSize: 10, color: 'var(--t3)', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: 3, display: 'block',
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{`
        .vt-scroll { max-height: calc(100vh - 180px); overflow: auto; }
        .vt-spacer td { padding: 0 !important; border: none !important; }
      `}</style>

      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Pagos</h1>
          {activeLocal && <p className="page-sub">{activeLocal.nombre}</p>}
        </div>
        <div className="page-actions">
          {/* Buscador OP */}
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--t2)', pointerEvents: 'none', fontSize: 13,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              type="text"
              placeholder="Buscar OP…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                height: 36, paddingLeft: 32, paddingRight: search ? 28 : 12,
                background: 'var(--bg-input)', border: '1px solid var(--border-input)',
                borderRadius: 8, color: 'var(--t1)', fontSize: 13, width: 150,
                outline: 'none',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--t2)', padding: 2, display: 'flex', lineHeight: 1,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

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
                borderRadius: 12, padding: '1.25rem', width: 520, maxWidth: '90vw',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}>
                {/* Atajos */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.05em', marginRight: 2 }}>ATAJOS</span>
                  {CHIPS.filter(c => !c.disabled).map(chip => (
                    <button key={chip.label} style={chipSt(isChipActive(chip.filters))} onClick={() => toggleChip(chip.filters)}>
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <div>
                    <span style={lbl}>Tipo</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.id_tipo} onChange={e => setDraftField('id_tipo', e.target.value)}>
                      <option value="">Todos los tipos</option>
                      {TIPO_PAGO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Método</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.id_metodo} onChange={e => setDraftField('id_metodo', e.target.value)}>
                      <option value="">Todos los métodos</option>
                      {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Rubro</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.id_rub}
                      onChange={e => setDraft(d => ({ ...d, id_rub: e.target.value, id_cat: '' }))}>
                      <option value="">Todos los rubros</option>
                      {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Categoría</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.id_cat} onChange={e => setDraftField('id_cat', e.target.value)}>
                      <option value="">Todas las cats.</option>
                      {catsForRubro.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Pagado</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.pagado} onChange={e => setDraftField('pagado', e.target.value)}>
                      <option value="">Todos</option>
                      <option value="false">No pagados</option>
                      <option value="true">Pagados</option>
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Estado op.</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.estado_op} onChange={e => setDraftField('estado_op', e.target.value)}>
                      <option value="">Todos los estados</option>
                      {ESTADO_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Audit</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.audit} onChange={e => setDraftField('audit', e.target.value)}>
                      <option value="">Todos</option>
                      <option value="false">No auditado</option>
                      <option value="true">Auditado</option>
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Dirección</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.ingresa_egreso} onChange={e => setDraftField('ingresa_egreso', e.target.value)}>
                      <option value="">Todos</option>
                      <option value="true">Ingreso</option>
                      <option value="false">Egreso</option>
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Desde</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.desde} onChange={e => setDraftField('desde', e.target.value)} />
                  </div>
                  <div>
                    <span style={lbl}>Hasta</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.hasta} onChange={e => setDraftField('hasta', e.target.value)} />
                  </div>
                </div>

                {/* Multi-select proveedores */}
                <div style={{ marginTop: '0.75rem' }}>
                  <span style={lbl}>Proveedores {draft.id_proveedores.length > 0 && <span style={{ color: 'var(--gold-bright)' }}>({draft.id_proveedores.length})</span>}</span>
                  <input
                    type="text"
                    placeholder="Buscar proveedor…"
                    value={provSearch}
                    onChange={e => setProvSearch(e.target.value)}
                    style={{ width: '100%', marginBottom: 4, height: 30, padding: '0 8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 6, color: 'var(--t1)', fontSize: 12 }}
                  />
                  <div style={{ maxHeight: 110, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 0' }}>
                    {filteredProvs.slice(0, 80).map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>
                        <input type="checkbox" checked={draft.id_proveedores.includes(p.id)} onChange={() => toggleDraftArr('id_proveedores', p.id)} />
                        {p.nombre}
                      </label>
                    ))}
                    {filteredProvs.length === 0 && <div style={{ padding: '4px 8px', color: 'var(--t3)', fontSize: 12 }}>Sin resultados</div>}
                  </div>
                </div>

                {/* Multi-select rubcats */}
                <div style={{ marginTop: '0.75rem' }}>
                  <span style={lbl}>Rubros/Cat (múltiple) {draft.id_rubcats.length > 0 && <span style={{ color: 'var(--gold-bright)' }}>({draft.id_rubcats.length})</span>}</span>
                  <div style={{ maxHeight: 110, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 0' }}>
                    {rubcats.slice(0, 200).map(rc => (
                      <label key={rc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>
                        <input type="checkbox" checked={draft.id_rubcats.includes(rc.id)} onChange={() => toggleDraftArr('id_rubcats', rc.id)} />
                        <span style={{ color: 'var(--t2)' }}>{rc.rubro?.nombre}</span>
                        <span style={{ color: 'var(--t3)' }}>/</span>
                        <span>{rc.categoria?.nombre}</span>
                      </label>
                    ))}
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
          <button className="btn btn-secondary" onClick={() => navigate('/pagos/nuevo?modo=rapido')} title="Carga rápida">
            <IcoPlane /> Carga rápida
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/pagos/nuevo')}>
            <IcoPlus /> Nuevo Pago
          </button>
        </div>
      </div>

      {/* ── Tabla virtualizada ── */}
      <div ref={scrollRef} className="vt-scroll table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortTh field="nro_ord" minWidth={70}>OP</SortTh>
              <SortTh field="fecha" minWidth={90}>Fecha</SortTh>
              <SortTh field="proveedor" minWidth={140}>Proveedor</SortTh>
              <th style={{ minWidth: 160 }}>Rubro / Cat</th>
              <th style={{ minWidth: 80 }}>Tipo</th>
              <th>PV</th>
              <th>Nro</th>
              <th>Neto</th>
              <th>Descuento</th>
              <SortTh field="importe" minWidth={90}>Importe</SortTh>
              <th>Método</th>
              <th>Cashflow</th>
              <th>Dirección</th>
              <th>Estado</th>
              <th>Pagado</th>
              <SortTh field="fecha_pago" minWidth={90}>Fecha Pago</SortTh>
              <th>Audit</th>
              <SortTh field="periodo" minWidth={80}>Período</SortTh>
              <th>Local</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 12 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: COL_COUNT }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${45 + (j * 7 + i * 11) % 50}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : sortedPagos.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT}>
                  <div className="table-empty">
                    <IcoPagoEmpty />
                    <p>{pagos.length === 0 ? 'No hay pagos registrados.' : 'No hay pagos que coincidan con los filtros.'}</p>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {topPad > 0 && <tr className="vt-spacer"><td colSpan={COL_COUNT} style={{ height: topPad }} /></tr>}
                {visiblePagos.map((p) => (
                  <tr key={p.id} className="row-clickable" onClick={() => openDetail(p)}>
                    <td className="td-primary" style={{ minWidth: 70, whiteSpace: 'nowrap' }}>{p.nro_ord != null ? `OP-${p.nro_ord}` : <span className="td-muted">—</span>}</td>
                    <td style={{ minWidth: 90 }}>{fmtDate(p.fecha)}</td>
                    <td style={{ minWidth: 140 }}>{p.proveedor?.nombre || <span className="td-muted">—</span>}</td>
                    <td style={{ minWidth: 160, fontSize: 12 }}>
                      {p.rubcat
                        ? <span>{p.rubcat.rubro?.nombre}<span className="td-muted"> / {p.rubcat.categoria?.nombre}</span></span>
                        : <span className="td-muted">—</span>}
                    </td>
                    <td style={{ minWidth: 80 }}>
                      {p.id_tipo
                        ? <span className={`badge ${TIPO_BADGE[p.id_tipo] ?? 'badge-muted'}`}>{p.id_tipo}</span>
                        : <span className="td-muted">—</span>}
                    </td>
                    <td className="td-mono" style={{ textAlign: 'right', minWidth: 60 }}>{fmtPV(p.pv)}</td>
                    <td className="td-mono" style={{ minWidth: 80 }}>{fmtNro(p.nro)}</td>
                    <td className="td-number" style={{ minWidth: 100 }}>{fmt$(p.importe_neto)}</td>
                    <td className="td-number" style={{ minWidth: 90 }}>{fmt$(p.descuento)}</td>
                    <td className="td-number" style={{ minWidth: 100, color: 'var(--gold-bright)', fontWeight: 700 }}>{fmt$(p.importe)}</td>
                    <td style={{ minWidth: 120, fontSize: 12 }}>{p.metodo_pago?.nombre || <span className="td-muted">—</span>}</td>
                    <td style={{ minWidth: 90 }}>{fmtDate(p.cashflow)}</td>
                    <td style={{ minWidth: 90 }}>
                      {p.ingresa_egreso != null
                        ? <span className={`badge ${p.ingresa_egreso ? 'badge-green' : 'badge-red'}`}>{p.ingresa_egreso ? 'Ingreso' : 'Egreso'}</span>
                        : <span className="td-muted">—</span>}
                    </td>
                    <td style={{ minWidth: 90 }}>
                      {p.estado_op
                        ? <span className={`badge ${ESTADO_BADGE[p.estado_op] ?? 'badge-muted'}`}>{ESTADO_OP_LABEL[p.estado_op] ?? p.estado_op}</span>
                        : <span className="td-muted">—</span>}
                    </td>
                    <td style={{ minWidth: 70, textAlign: 'center' }}>
                      <span className={p.pagado ? 'bool-yes' : 'bool-no'}>{p.pagado ? '✓' : '✗'}</span>
                    </td>
                    <td style={{ minWidth: 90 }}>{fmtDate(p.fecha_pago)}</td>
                    <td style={{ minWidth: 100 }}>
                      {auditingId === p.id
                        ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block' }} />
                        : p.audit
                          ? <span className="badge badge-green" style={{ cursor: 'pointer' }} onClick={(e) => handleAudit(p.id, e)} title="Click para revertir">✓ Auditado</span>
                          : <button className="btn btn-sm btn-secondary" onClick={(e) => handleAudit(p.id, e)}>Auditar</button>
                      }
                    </td>
                    <td style={{ minWidth: 80 }}>{fmtMonth(p.periodo)}</td>
                    <td style={{ minWidth: 120, fontSize: 12 }}>{p.local?.nombre || <span className="td-muted">—</span>}</td>
                    <td style={{ minWidth: 50 }}>
                      <div className="td-actions">
                        <button className="btn btn-sm btn-secondary btn-icon" onClick={(e) => { e.stopPropagation(); navigate(`/pagos/${p.id}/editar`) }}>
                          <IcoEdit />
                        </button>
                        <button className="btn btn-sm btn-danger btn-icon" onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}>
                          <IcoTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {bottomPad > 0 && <tr className="vt-spacer"><td colSpan={COL_COUNT} style={{ height: bottomPad }} /></tr>}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer con conteo ── */}
      {!loading && pagos.length > 0 && (
        <div className="pagination">
          <span className="pagination-info">
            {filteredPagos.length === pagos.length
              ? `${pagos.length} pagos`
              : `${filteredPagos.length} de ${pagos.length} pagos`
            }
          </span>
        </div>
      )}

      <DrawerPanel
        open={panelOpen}
        onClose={closePanel}
        title={selectedPago ? `OP-${selectedPago.nro_ord ?? selectedPago.id?.slice(0, 8)}` : 'Detalle de Pago'}
        width={580}
      >
        {selectedPago && (
          <PagoDetailPanel pago={selectedPago} navigate={navigate} onDelete={handleDelete} onAudit={patchPagoAudit} onPatch={patchPago} metodos={metodos} canEdit={canEdit} canDelete={canDelete} />
        )}
      </DrawerPanel>
    </div>
  )
}
