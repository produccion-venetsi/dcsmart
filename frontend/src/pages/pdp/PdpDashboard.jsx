import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { metodosApi } from '../../api/metodospago.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import FotoViewer from '../../components/FotoViewer.jsx'
import { generarReportePdp } from '../../lib/pdpReport.js'
import { pdpApi } from '../../api/pdp.js'
import { fmtDateUTC, fmtMonthUTC, fmtDateArg, fmtDateTimeArg, nowDateTimeLocalInput, toUtcIsoFromDateTimeLocal } from '../../lib/dates.js'

/* ── helpers ── */
function fmt$(n) {
  return n != null
    ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : '—'
}
const fmtDate  = fmtDateUTC
const fmtMonth = fmtMonthUTC

function provName(p) {
  return p.proveedor?.razon_social || p.proveedor?.nombre || 'Sin proveedor'
}

// Agrupa los pagos por proveedor (razón social), con subtotal por grupo.
function groupByProveedor(pagos) {
  const map = new Map()
  for (const p of pagos) {
    const key = p.proveedor?.id ?? '__none__'
    if (!map.has(key)) map.set(key, { key, nombre: provName(p), total: 0, totalTransferencia: 0, items: [] })
    const g = map.get(key)
    g.items.push(p)
    g.total += Number(p.importe ?? 0)
    if (p.metodo_pago?.nombre === 'Transferencia') g.totalTransferencia += Number(p.importe ?? 0)
  }
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

const sumImporte = (rows) => rows.reduce((acc, p) => acc + Number(p.importe ?? 0), 0)

// NCA/NCB (notas de crédito) e ingresos no son deuda real: se excluyen del
// todo del "Total Deuda" (no restan ni suman), a diferencia del PDF de PDP
// que sí los neteo con signo (ver pdpReport.js -- distinto criterio a propósito).
const TIPOS_NO_DEUDA = new Set(['NCA', 'NCB'])
function esDeudaReal(p) {
  return p.ingresa_egreso !== true && !TIPOS_NO_DEUDA.has(p.id_tipo)
}

// Desglose del total de deuda en categorías fijas (por nombre real de Rubro
// en la base): Sueldos, CMV (cualquier variante "CMV *"), Impositivo, y el
// resto sin clasificar en esas tres.
function desglosarDeuda(rows) {
  const acc = { Sueldos: 0, CMV: 0, Impositivo: 0, Resto: 0 }
  for (const p of rows) {
    const importe = Number(p.importe ?? 0)
    const rubroNombre = p.rubcat?.rubro?.nombre || ''
    if (rubroNombre === 'Sueldos') acc.Sueldos += importe
    else if (/^CMV/i.test(rubroNombre)) acc.CMV += importe
    else if (rubroNombre === 'Impositivo') acc.Impositivo += importe
    else acc.Resto += importe
  }
  return acc
}

const DESGLOSE_COLOR = { Sueldos: '#f59e0b', CMV: '#22c55e', Impositivo: '#ef4444', Resto: '#64748b' }

// Las barras del desglose. Antes vivían solo dentro de un modal que había que
// abrir a propósito; ahora son la mitad derecha de cada tarjeta y están
// siempre a la vista, que es como se usa: la composición de la deuda es tan
// importante como el total, y esconderla detrás de un click hacía que casi
// nunca se mirara.
//
// Las categorías se muestran SIEMPRE las cuatro, incluso en cero. Que Sueldos
// esté en cero es información: si solo aparecieran las que tienen monto, la
// tarjeta cambiaría de forma según el mes y no se podrían comparar dos locales
// de un vistazo.
function DesgloseBarras({ rows, total }) {
  return (
    <div className="pdp-desglose">
      {rows.map(([label, val]) => {
        const pct = total > 0 ? (val / total) * 100 : 0
        return (
          <div className="pdp-desglose-fila" key={label}>
            <span className="pdp-desglose-dot" style={{ background: DESGLOSE_COLOR[label] }} />
            <span className="pdp-desglose-label">{label}</span>
            <span className="pdp-desglose-barra">
              <span style={{ width: `${pct}%`, background: DESGLOSE_COLOR[label] }} />
            </span>
            <span className="pdp-desglose-monto">{fmt$(val)}</span>
            <span className="pdp-desglose-pct">{pct.toFixed(0)}%</span>
          </div>
        )
      })}
    </div>
  )
}


/* ── icons ── */
function IcoArrow() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  )
}
function IcoMoney() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}
function IcoChevron() {
  return (
    <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}
function IcoUndo() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  )
}
function IcoFile() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" /><line x1="9" y1="11" x2="15" y2="11" />
    </svg>
  )
}
function IcoCollapseAll() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}
function IcoExpandAll() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/* ── modal de pago ── */
function PagarModal({ count, total, metodos, onClose, onConfirm, working }) {
  const [fecha, setFecha]       = useState(nowDateTimeLocalInput())
  const [idMetodo, setIdMetodo] = useState('')

  return (
    <div className="pdp-modal-backdrop" onMouseDown={onClose}>
      <div className="pdp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="pdp-modal-title">Registrar pago</h3>

        <div style={{ fontSize: 12.5, color: 'var(--t2)', marginBottom: '1.1rem' }}>
          <strong style={{ color: 'var(--t1)' }}>{count}</strong> orden{count !== 1 ? 'es' : ''} ·{' '}
          <strong style={{ color: 'var(--gold-bright)' }}>{fmt$(total)}</strong>
        </div>

        <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
          <label className="form-label">Fecha de pago</label>
          <div className="form-input-wrap">
            <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Forma de pago *</label>
          <div className="form-input-wrap">
            <select value={idMetodo} onChange={e => setIdMetodo(e.target.value)}>
              <option value="">Seleccionar…</option>
              {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="pdp-modal-foot">
          <button className="btn btn-sm btn-secondary" onClick={onClose} disabled={working}>Cancelar</button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onConfirm({ fecha_pago: toUtcIsoFromDateTimeLocal(fecha), id_metodo: idMetodo })}
            disabled={working || !idMetodo}
          >
            {working
              ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block' }} />
              : 'Confirmar pago'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── detalle del pago (solo lectura) ── */
function PagoDetailPdp({ pago, navigate }) {
  const rows = [
    ['Nro Orden',   pago.nro_ord != null ? `OP-${pago.nro_ord}` : '—'],
    ['Fecha',       fmtDate(pago.fecha)],
    ['Proveedor',   provName(pago)],
    ['Rubro / Cat', pago.rubcat ? `${pago.rubcat.rubro?.nombre} / ${pago.rubcat.categoria?.nombre}` : '—'],
    ['Tipo',        pago.id_tipo || '—'],
    ['PV',          pago.pv ?? '—'],
    ['Nro',         pago.nro ?? '—'],
    ['Neto',        fmt$(pago.importe_neto)],
    ['Descuento',   fmt$(pago.descuento)],
    ['Importe',     fmt$(pago.importe)],
    ['Método',      pago.metodo_pago?.nombre || '—'],
    ['Dirección',   pago.ingresa_egreso != null ? (pago.ingresa_egreso ? 'Ingreso' : 'Egreso') : '—'],
    ['Estado Op.',  pago.estado_op || '—'],
    ['Pagado',      pago.pagado ? 'Sí' : 'No'],
    ['Fecha Pago',  pago.fecha_pago ? fmtDateArg(pago.fecha_pago) : '—'],
    ['Período',     fmtMonth(pago.periodo)],
    ['Local',       pago.local?.nombre || '—'],
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => navigate(`/pagos/${pago.id}/editar`)}>
          Editar pago
        </button>
      </div>

      {pago.observaciones && (
        <div style={{ marginBottom: '1rem', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, color: 'var(--t2)' }}>
          {pago.observaciones}
        </div>
      )}

      {(pago.foto_url || pago.pdf_url) && (
        <div style={{ marginBottom: '0.5rem' }}>
          <div className="drawer-section-title">Adjuntos</div>
          <FotoViewer pagoId={pago.id} fotoUrl={pago.foto_url} pdfUrl={pago.pdf_url} />
        </div>
      )}

      <div className="drawer-section-title">Datos del pago</div>
      <div className="drawer-detail">
        {rows.map(([k, v]) => (
          <div key={k} className="drawer-detail-row">
            <span className="drawer-detail-key">{k}</span>
            <span className="drawer-detail-val">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── columna ── */
function PdpColumn({
  title, loading, groups, total, emptyText, onRowClick,
  selectable = false, selected, onToggleOne, onToggleGroup,
  actionLabel, actionIcon, onAction,
  secondaryActionLabel, secondaryActionIcon, onSecondaryAction,
  working,
  onGenerateReport, generatingReport,
}) {
  // Arranca con todos los grupos colapsados (sin desglosar por proveedor);
  // el usuario expande el/los que le interesen. `groups` llega vacío en el
  // primer render (todavía está cargando), así que se colapsa recién cuando
  // aparecen los grupos por primera vez.
  const [collapsed, setCollapsed] = useState(() => new Set())
  const initedRef = useRef(false)
  useEffect(() => {
    if (!initedRef.current && groups.length > 0) {
      initedRef.current = true
      setCollapsed(new Set(groups.map(g => g.key)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  const toggleCollapse = (key) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const allKeys = groups.map(g => g.key)
  const allCollapsed = allKeys.length > 0 && allKeys.every(k => collapsed.has(k))
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(allKeys))

  const selCount = selectable ? selected.size : 0
  const selTotal = selectable
    ? groups.flatMap(g => g.items).filter(p => selected.has(p.id)).reduce((a, p) => a + Number(p.importe ?? 0), 0)
    : 0

  return (
    <div className="pdp-col">
      <div className="pdp-col-head">
        <span className="pdp-col-title">{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="pdp-col-total">{fmt$(total)}</span>
          {onGenerateReport && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={onGenerateReport}
              disabled={groups.length === 0 || generatingReport}
              title="Generar Reporte PDP (PDF)"
            >
              {generatingReport
                ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, display: 'inline-block' }} />
                : <IcoFile />} Reporte
            </button>
          )}
          {groups.length > 0 && (
            <button
              className="pdp-collapse-all"
              onClick={toggleAll}
              title={allCollapsed ? 'Expandir todos' : 'Colapsar todos'}
            >
              {allCollapsed ? <IcoExpandAll /> : <IcoCollapseAll />}
            </button>
          )}
        </div>
      </div>

      {onAction && (
        <div className="pdp-col-action">
          <span className="pdp-sel-info">
            {selCount > 0
              ? <><strong>{selCount}</strong> sel · <strong>{fmt$(selTotal)}</strong></>
              : 'Sin selección'}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {onSecondaryAction && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={onSecondaryAction}
                disabled={selCount === 0 || working}
              >
                {secondaryActionIcon} {secondaryActionLabel}
              </button>
            )}
            <button
              className="btn btn-sm btn-primary"
              onClick={onAction}
              disabled={selCount === 0 || working}
            >
              {actionIcon} {actionLabel}
            </button>
          </div>
        </div>
      )}

      <div className="pdp-col-body">
        {loading ? (
          <div style={{ padding: '1rem' }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 4px' }}>
                <span className="skel" style={{ width: `${50 + (i * 13) % 40}%` }} />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="pdp-empty">{emptyText}</div>
        ) : (
          groups.map(g => {
            const ids = g.items.map(p => p.id)
            const allSel = selectable && ids.every(id => selected.has(id))
            const isOpen = !collapsed.has(g.key)
            return (
              <div key={g.key}>
                <div className="pdp-group-head" onClick={() => toggleCollapse(g.key)}>
                  <span className={`pdp-chevron${isOpen ? ' open' : ''}`}><IcoChevron /></span>
                  {selectable && (
                    <input
                      type="checkbox" className="pdp-check" checked={allSel} readOnly
                      onClick={(e) => { e.stopPropagation(); onToggleGroup(ids) }}
                    />
                  )}
                  <span className="pdp-group-name">{g.nombre}</span>
                  <span className="pdp-group-count" title="Total de OPs">{g.items.length} OP{g.items.length !== 1 ? 's' : ''}</span>
                  {g.totalTransferencia > 0 && (
                    <span className="pdp-group-transfer" title="Total por Transferencia">Transf: {fmt$(g.totalTransferencia)}</span>
                  )}
                  <span className="pdp-group-total">{fmt$(g.total)}</span>
                </div>

                {isOpen && g.items.map(p => {
                  const sel = selectable && selected.has(p.id)
                  return (
                    <div
                      key={p.id}
                      className={`pdp-row${sel ? ' sel' : ''}`}
                      onClick={() => onRowClick(p)}
                    >
                      {selectable && (
                        <input
                          type="checkbox" className="pdp-check"
                          checked={sel}
                          onChange={() => onToggleOne(p.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <span className="pdp-row-ord">{p.nro_ord != null ? `OP-${p.nro_ord}` : '—'}</span>
                      <span className="pdp-row-date">{fmtDate(p.fecha)}</span>
                      <span className="pdp-row-amount">{fmt$(p.importe)}</span>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ── página ── */
export default function PdpDashboard() {
  const navigate    = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const activeApp   = useAppStore((s) => s.activeApp)
  const notify      = useUiStore((s) => s.notify)
  const role        = activeApp?.role
  const canVerUltimoUsuario = ['dcsmart', 'super_admin'].includes(role)

  const [deuda,   setDeuda]   = useState([])
  const [pagar,   setPagar]   = useState([])
  const [metodos, setMetodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  const [selDeuda, setSelDeuda] = useState(new Set())
  const [selPagar, setSelPagar] = useState(new Set())
  const [pagarOpen, setPagarOpen] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)

  const [historial, setHistorial] = useState([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [descargandoId, setDescargandoId] = useState(null)

  const [panelOpen,    setPanelOpen]    = useState(false)
  const [selectedPago, setSelectedPago] = useState(null)
  const openDetail = (p) => { setSelectedPago(p); setPanelOpen(true) }


  const load = () => {
    setLoading(true)
    const base = { limit: 1000, ...(activeLocal?.id ? { id_local: activeLocal.id } : {}) }
    Promise.all([
      pagosApi.list({ ...base, estado_op: 'CUENTA_CTE', pagado: 'false' }),
      pagosApi.list({ ...base, estado_op: 'PDP', pagado: 'false' }),
    ])
      .then(([d, p]) => {
        setDeuda(d.data.data.filter(esDeudaReal)); setPagar(p.data.data.filter(esDeudaReal))
        setSelDeuda(new Set()); setSelPagar(new Set())
      })
      .catch(() => notify('Error al cargar el PDP', 'error'))
      .finally(() => setLoading(false))
  }

  const loadHistorial = () => {
    if (!activeLocal?.id) { setHistorial([]); return }
    setLoadingHistorial(true)
    pdpApi.list(activeLocal.id)
      .then(({ data }) => setHistorial(data.data))
      .catch(() => notify('Error al cargar el historial de PDP', 'error'))
      .finally(() => setLoadingHistorial(false))
  }

  useEffect(() => {
    metodosApi.list().then(r => setMetodos(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => { load() }, [activeLocal?.id])
  useEffect(() => { loadHistorial() }, [activeLocal?.id])

  const groupsDeuda = useMemo(() => groupByProveedor(deuda), [deuda])
  const groupsPagar = useMemo(() => groupByProveedor(pagar), [pagar])

  const toggleSet = (setSel) => (id) =>
    setSel(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleGroupSet = (setSel) => (ids) =>
    setSel(prev => {
      const next = new Set(prev)
      const allSel = ids.every(id => next.has(id))
      ids.forEach(id => allSel ? next.delete(id) : next.add(id))
      return next
    })

  const handleMandar = async () => {
    const ids = [...selDeuda]
    if (!ids.length) return
    setWorking(true)
    try {
      const { data } = await pagosApi.mandarPdp(ids)
      notify(`${data.count} orden${data.count !== 1 ? 'es' : ''} enviada${data.count !== 1 ? 's' : ''} al PDP`, 'success')
      load()
    } catch { notify('Error al enviar al PDP', 'error') }
    finally { setWorking(false) }
  }

  const handleRevertir = async () => {
    const ids = [...selPagar]
    if (!ids.length) return
    setWorking(true)
    try {
      const { data } = await pagosApi.revertirPdp(ids)
      notify(`${data.count} orden${data.count !== 1 ? 'es' : ''} revertida${data.count !== 1 ? 's' : ''} a deuda`, 'success')
      load()
    } catch { notify('Error al revertir', 'error') }
    finally { setWorking(false) }
  }

  const handleGenerarReporte = async () => {
    setGeneratingReport(true)
    try {
      const { blob, filename } = await generarReportePdp({
        localNombre: activeLocal?.nombre,
        pagosPdp: pagar,
        totalDeuda: sumImporte(deuda),
      })
      if (activeLocal?.id) {
        try {
          const formData = new FormData()
          formData.append('file', blob, filename)
          const { data: uploadRes } = await pagosApi.upload(formData, activeLocal.id)
          await pdpApi.create({
            id_local: activeLocal.id,
            pago_ids: pagar.map(p => p.id),
            pdf_url: uploadRes.url,
          })
          loadHistorial()
        } catch {
          // El PDF ya se descargó al navegador -- si falla el registro, se
          // avisa pero no se bloquea nada que el usuario ya haya recibido.
          notify('El reporte se descargó, pero no se pudo guardar el registro del PDP', 'error')
        }
      }
      // Sin local activo ("Todos los locales") no se sube ni se registra
      // nada: el usuario ya recibió su PDF, igual que antes de esta feature.
    } catch {
      notify('Error al generar el reporte', 'error')
    } finally {
      setGeneratingReport(false)
    }
  }

  const handlePagar = async ({ fecha_pago, id_metodo }) => {
    const ids = [...selPagar]
    if (!ids.length) return
    setWorking(true)
    try {
      const { data } = await pagosApi.pagar(ids, { fecha_pago, id_metodo })
      notify(`${data.count} pago${data.count !== 1 ? 's' : ''} registrado${data.count !== 1 ? 's' : ''}`, 'success')
      setPagarOpen(false)
      load()
    } catch { notify('Error al registrar el pago', 'error') }
    finally { setWorking(false) }
  }

  const fmtDateTime = fmtDateTimeArg

  const handleDescargarPdp = async (pdp) => {
    setDescargandoId(pdp.id)
    try {
      const res = await pdpApi.attachment(pdp.id)
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `PDP_${activeLocal?.nombre || 'local'}_${pdp.id.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      loadHistorial()
    } catch {
      notify('Error al descargar el PDP', 'error')
    } finally {
      setDescargandoId(null)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">PDP</h1>
          <p className="page-sub">
            {activeLocal ? activeLocal.nombre : 'Todos los locales'} · Armado de plan de pago
          </p>
        </div>
      </div>

      {/* ── tarjetas de resumen, con el desglose al costado ── */}
      <div className="pdp-stats">
        <div className="pdp-stat-card">
          <div className="pdp-stat-main">
            <span className="pdp-stat-label">Total Deuda</span>
            <span className="pdp-stat-value">{loading ? '…' : fmt$(sumImporte(deuda))}</span>
            <span className="pdp-stat-sub">{loading ? '' : `${deuda.length} orden${deuda.length !== 1 ? 'es' : ''}`}</span>
          </div>
          {!loading && deuda.length > 0 && (
            <DesgloseBarras rows={Object.entries(desglosarDeuda(deuda))} total={sumImporte(deuda)} />
          )}
        </div>
        <div className="pdp-stat-card">
          <div className="pdp-stat-main">
            <span className="pdp-stat-label">Total en PDP</span>
            <span className="pdp-stat-value">{loading ? '…' : fmt$(sumImporte(pagar))}</span>
            <span className="pdp-stat-sub">{loading ? '' : `${pagar.length} orden${pagar.length !== 1 ? 'es' : ''} pendiente${pagar.length !== 1 ? 's' : ''}`}</span>
          </div>
          {!loading && pagar.length > 0 && (
            <DesgloseBarras rows={Object.entries(desglosarDeuda(pagar))} total={sumImporte(pagar)} />
          )}
        </div>
      </div>

      <div className="pdp-grid">
        <PdpColumn
          title="Deuda"
          loading={loading}
          groups={groupsDeuda}
          total={sumImporte(deuda)}
          emptyText="Sin deuda en cuenta corriente"
          onRowClick={openDetail}
          selectable
          selected={selDeuda}
          onToggleOne={toggleSet(setSelDeuda)}
          onToggleGroup={toggleGroupSet(setSelDeuda)}
          actionLabel="Mandar a PDP"
          actionIcon={<IcoArrow />}
          onAction={handleMandar}
          working={working}
        />

        <PdpColumn
          title="Pagar PDP"
          loading={loading}
          groups={groupsPagar}
          total={sumImporte(pagar)}
          emptyText="No hay órdenes pendientes de pago"
          onRowClick={openDetail}
          selectable
          selected={selPagar}
          onToggleOne={toggleSet(setSelPagar)}
          onToggleGroup={toggleGroupSet(setSelPagar)}
          secondaryActionLabel="Revertir"
          secondaryActionIcon={<IcoUndo />}
          onSecondaryAction={handleRevertir}
          actionLabel="Pagar"
          actionIcon={<IcoMoney />}
          onAction={() => setPagarOpen(true)}
          working={working}
          onGenerateReport={handleGenerarReporte}
          generatingReport={generatingReport}
        />
      </div>

      <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>
        Historial de PDP
      </div>
      {loadingHistorial ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><span className="spinner" /></div>
      ) : historial.length === 0 ? (
        <div className="pdp-empty">Todavía no se generó ningún PDP para este local.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>{canVerUltimoUsuario && <th>Último usuario</th>}<th>Cant. pagos</th><th>Total</th>
                <th>Última descarga</th><th></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.created_at)}</td>
                  {canVerUltimoUsuario && <td>{p.creador?.email || '—'}</td>}
                  <td>{p.cantidad_pagos}</td>
                  <td className="td-number">{fmt$(p.total)}</td>
                  <td>{fmtDateTime(p.ultima_descarga)}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleDescargarPdp(p)}
                      disabled={descargandoId === p.id}
                    >
                      {descargandoId === p.id
                        ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                        : 'Descargar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagarOpen && (
        <PagarModal
          count={selPagar.size}
          total={pagar.filter(p => selPagar.has(p.id)).reduce((a, p) => a + Number(p.importe ?? 0), 0)}
          metodos={metodos}
          working={working}
          onClose={() => !working && setPagarOpen(false)}
          onConfirm={handlePagar}
        />
      )}

      <DrawerPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={selectedPago ? `Pago ${selectedPago.nro_ord != null ? `OP-${selectedPago.nro_ord}` : selectedPago.id?.slice(0, 8)}` : 'Detalle de pago'}
        width={560}
      >
        {selectedPago && <PagoDetailPdp pago={selectedPago} navigate={navigate} />}
      </DrawerPanel>
    </div>
  )
}
