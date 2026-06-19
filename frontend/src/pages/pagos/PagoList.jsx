import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { impuestosApi } from '../../api/impuestos.js'
import { rubrosApi, categoriasApi, rubcatApi } from '../../api/rubcat.js'
import { metodosApi } from '../../api/metodospago.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'

const TIPO_BADGE = {
  A: 'badge-blue', B: 'badge-green', C: 'badge-muted', CM: 'badge-amber',
  'DC (1)': 'badge-purple', 'DC (2)': 'badge-purple',
  DDJJ: 'badge-red', M: 'badge-muted', NCA: 'badge-amber', NDA: 'badge-amber', STK: 'badge-blue',
}
const ESTADO_BADGE = {
  PENDIENTE: 'badge-amber', APROBADO: 'badge-green', RECHAZADO: 'badge-red', PAGADO: 'badge-blue',
}
const TIPOS_IMP = ['IVA21', 'IVA10', 'RETENCION', 'PERCEPCION']

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
function IcoLink() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
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

function fmt$(n)     { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }
function fmtDate(d)  { return d ? new Date(d).toLocaleDateString('es-AR') : '—' }
function fmtMonth(d) { return d ? new Date(d).toLocaleDateString('es-AR', { year: 'numeric', month: 'short' }) : '—' }
function mono(v)     { return v ? <span className="td-mono" style={{ fontSize: 11 }}>{v}</span> : <span className="td-muted">—</span> }

function PagoDetailPanel({ pago, navigate, onDelete, onAudit, canEdit = false, canDelete = false }) {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const [impuestos,   setImpuestos]   = useState([])
  const [loadingImp,  setLoadingImp]  = useState(true)
  const [impForm,     setImpForm]     = useState({ tipo: 'IVA21', monto: '' })
  const [savingImp,   setSavingImp]   = useState(false)
  const [audited,     setAudited]     = useState(pago.audit)
  const [auditando,   setAuditando]   = useState(false)

  const loadImpuestos = () => {
    setLoadingImp(true)
    impuestosApi.list({ id_pago: pago.id, limit: 100 })
      .then(({ data }) => setImpuestos(data.data || data))
      .catch(() => notify('Error al cargar impuestos', 'error'))
      .finally(() => setLoadingImp(false))
  }

  useEffect(() => { if (pago) loadImpuestos() }, [pago?.id])

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
    ['Nro Orden',   pago.nro_ord ?? '—'],
    ['Fecha',       fmtDate(pago.fecha)],
    ['Proveedor',   pago.proveedor?.nombre || '—'],
    ['Rubro / Cat', pago.rubcat ? `${pago.rubcat.rubro?.nombre} / ${pago.rubcat.categoria?.nombre}` : '—'],
    ['Tipo',        pago.id_tipo || '—'],
    ['PV',          pago.pv ?? '—'],
    ['Nro',     pago.nro ?? '—'],
    ['Neto',        fmt$(pago.importe_neto)],
    ['Descuento',   fmt$(pago.descuento)],
    ['Importe',     fmt$(pago.importe)],
    ['Método',      pago.metodo_pago?.nombre || '—'],
    ['Cashflow',    fmtDate(pago.cashflow)],
    ['Dirección',   pago.ingresa_egreso != null ? (pago.ingresa_egreso ? 'Ingreso' : 'Egreso') : '—'],
    ['Estado Op.',  pago.estado_op || '—'],
    ['Pagado',      pago.pagado ? 'Sí' : 'No'],
    ['Fecha Pago',  fmtDate(pago.fecha_pago)],
    ['Período',     fmtMonth(pago.periodo)],
    ['Local',       pago.local?.nombre || '—'],
    ['Auditado',    audited ? 'Sí' : 'No'],
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
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
        {canDelete && (
          <button className="btn btn-danger" onClick={() => onDelete(pago.id)}>
            <IcoTrash /> Eliminar
          </button>
        )}
      </div>

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
          <div className="drawer-detail-row">
            <span className="drawer-detail-key">Adjuntos</span>
            <span className="drawer-detail-val" style={{ display: 'flex', gap: '0.75rem' }}>
              {pago.foto_url && <a href={pago.foto_url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-bright)', fontSize: 12 }}>Foto <IcoLink /></a>}
              {pago.pdf_url  && <a href={pago.pdf_url}  target="_blank" rel="noreferrer" style={{ color: 'var(--gold-bright)', fontSize: 12 }}>PDF <IcoLink /></a>}
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
    </div>
  )
}

const FILTER_INIT = {
  pagado: '', estado_op: '', desde: '', hasta: '',
  id_tipo: '', id_rub: '', id_cat: '',
  audit: '', ingresa_egreso: '', id_metodo: ''
}

export default function PagoList() {
  const navigate    = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const activeApp   = useAppStore((s) => s.activeApp)
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const role        = activeApp?.role
  const canEdit     = ['super_admin', 'dcsmart', 'admin'].includes(role)
  const canDelete   = ['super_admin', 'dcsmart'].includes(role)

  const [pagos,      setPagos]      = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(true)
  const [filters,    setFilters]    = useState(FILTER_INIT)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [selectedPago, setSelectedPago] = useState(null)
  const [sortField,  setSortField]  = useState('fecha')
  const [sortDir,    setSortDir]    = useState('desc')

  const [rubros,     setRubros]     = useState([])
  const [categorias, setCategorias] = useState([])
  const [rubcats,    setRubcats]    = useState([])
  const [metodos,    setMetodos]    = useState([])

  const LIMIT = 50
  const totalPages = Math.ceil(total / LIMIT)

  useEffect(() => {
    rubrosApi.list().then(r => setRubros(r.data || [])).catch(() => {})
    categoriasApi.list().then(r => setCategorias(r.data || [])).catch(() => {})
    rubcatApi.list().then(r => setRubcats(r.data || [])).catch(() => {})
    metodosApi.list().then(r => setMetodos(r.data || [])).catch(() => {})
  }, [])

  const buildParams = () => ({
    ...(activeLocal?.id ? { id_local: activeLocal.id } : {}),
    page, limit: LIMIT,
    ...(filters.pagado         !== '' ? { pagado:         filters.pagado }         : {}),
    ...(filters.estado_op      !== '' ? { estado_op:      filters.estado_op }      : {}),
    ...(filters.desde          !== '' ? { desde:          filters.desde }          : {}),
    ...(filters.hasta          !== '' ? { hasta:          filters.hasta }           : {}),
    ...(filters.id_tipo        !== '' ? { id_tipo:        filters.id_tipo }        : {}),
    ...(filters.id_rub         !== '' ? { id_rub:         filters.id_rub }         : {}),
    ...(filters.id_cat         !== '' ? { id_cat:         filters.id_cat }         : {}),
    ...(filters.audit          !== '' ? { audit:          filters.audit }          : {}),
    ...(filters.ingresa_egreso !== '' ? { ingresa_egreso: filters.ingresa_egreso } : {}),
    ...(filters.id_metodo      !== '' ? { id_metodo:      filters.id_metodo }      : {}),
  })

  const load = () => {
    setLoading(true)
    pagosApi.list(buildParams())
      .then(({ data }) => { setPagos(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar pagos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    pagosApi.list(buildParams(), ctrl.signal)
      .then(({ data }) => { setPagos(data.data); setTotal(data.total) })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar pagos', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [
    page, activeLocal?.id,
    filters.pagado, filters.estado_op, filters.desde, filters.hasta,
    filters.id_tipo, filters.id_rub, filters.id_cat,
    filters.audit, filters.ingresa_egreso, filters.id_metodo
  ])

  const handleDelete = async (id) => {
    if (!(await showConfirm('¿Eliminar este pago?'))) return
    try {
      await pagosApi.remove(id)
      notify('Pago eliminado', 'success')
      setPanelOpen(false)
      load()
    }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const [auditingId, setAuditingId] = useState(null)

  const patchPagoAudit = (id, audit) =>
    setPagos(prev => prev.map(p => p.id === id ? { ...p, audit } : p))

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

  const [filterOpen, setFilterOpen] = useState(false)
  const [draft, setDraft] = useState(FILTER_INIT)
  const filterRef = useRef(null)
  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
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

  const applyFilters  = () => { setFilters(draft); setPage(1); setFilterOpen(false) }
  const clearFilters  = () => { setDraft(FILTER_INIT); setFilters(FILTER_INIT); setPage(1) }
  const setDraftField = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  const cmvRubroId = rubros.find(r => r.nombre?.toUpperCase().includes('CMV'))?.id ?? ''
  const CHIPS = [
    { label: 'STK',         filters: { id_tipo: 'STK' } },
    { label: 'CMV',         filters: { id_rub: cmvRubroId }, disabled: !cmvRubroId },
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

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }
  const getSortVal = (p, field) => {
    if (field === 'proveedor') return p.proveedor?.nombre ?? ''
    return p[field] ?? ''
  }
  const sortedPagos = [...pagos].sort((a, b) => {
    const va = getSortVal(a, sortField)
    const vb = getSortVal(b, sortField)
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })
  const SortTh = ({ field, children, minWidth }) => (
    <th className={`sortable${sortField === field ? ' active' : ''}`} style={minWidth ? { minWidth } : undefined} onClick={() => toggleSort(field)}>
      {children} <span className="sort-ico">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )

  const openDetail = (p) => { setSelectedPago(p); setPanelOpen(true) }
  const closePanel = () => setPanelOpen(false)

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

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Pagos</h1>
          {activeLocal && <p className="page-sub">{activeLocal.nombre}</p>}
        </div>
        <div className="page-actions">
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

                {/* Controles en grilla 2 columnas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <div>
                    <span style={lbl}>Tipo</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.id_tipo} onChange={e => setDraftField('id_tipo', e.target.value)}>
                      <option value="">Todos los tipos</option>
                      {['A','B','C','CM','INTERCOMPANY','STK'].map(t => <option key={t} value={t}>{t}</option>)}
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
                      {['PENDIENTE','APROBADO','RECHAZADO','PAGADO'].map(s => <option key={s} value={s}>{s}</option>)}
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

                {/* Footer */}
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
          <button className="btn btn-primary" onClick={() => navigate('/pagos/nuevo')}>
            <IcoPlus /> Nuevo Pago
          </button>
        </div>
      </div>

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <SortTh field="nro_ord" minWidth={50}>Nro</SortTh>
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
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 20 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${45 + (j * 7 + i * 11) % 50}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {sortedPagos.map((p) => (
                  <tr key={p.id} className="row-clickable" onClick={() => openDetail(p)}>
                    <td className="td-primary" style={{ minWidth: 50 }}>{p.nro_ord ?? <span className="td-muted">—</span>}</td>
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
                    <td className="td-muted" style={{ textAlign: 'right', minWidth: 50 }}>{p.pv ?? '—'}</td>
                    <td className="td-mono"  style={{ minWidth: 70, fontSize: 11 }}>{p.nro ?? <span className="td-muted">—</span>}</td>
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
                        ? <span className={`badge ${ESTADO_BADGE[p.estado_op] ?? 'badge-muted'}`}>{p.estado_op}</span>
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
                {pagos.length === 0 && (
                  <tr>
                    <td colSpan={20}>
                      <div className="table-empty">
                        <IcoPagoEmpty />
                        <p>No hay pagos registrados.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {total > LIMIT && (
        <div className="pagination">
          <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(1)} title="Primera página">«</button>
          <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
          <span className="pagination-info">
            Pág.&nbsp;
            <input
              type="number" min={1} max={totalPages} value={page}
              onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= totalPages) setPage(v) }}
              style={{ width: 44, textAlign: 'center', padding: '2px 4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'inherit', fontSize: 12 }}
            />
            &nbsp;de {totalPages} — {total} pagos
          </span>
          <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
          <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(totalPages)} title="Última página">»</button>
        </div>
      )}

      <DrawerPanel
        open={panelOpen}
        onClose={closePanel}
        title={selectedPago ? `Pago #${selectedPago.nro_ord ?? selectedPago.id?.slice(0, 8)}` : 'Detalle de Pago'}
        width={580}
      >
        {selectedPago && (
          <PagoDetailPanel pago={selectedPago} navigate={navigate} onDelete={handleDelete} onAudit={patchPagoAudit} canEdit={canEdit} canDelete={canDelete} />
        )}
      </DrawerPanel>
    </div>
  )
}
