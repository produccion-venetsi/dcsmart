import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'

const ESTADO_BADGE = {
  'CAJA':       'badge-green',
  'CUENTA CTE': 'badge-amber',
  'MP PDP':     'badge-blue',
  'PDP':        'badge-purple',
}
const TIPO_BADGE = {
  A: 'badge-blue', B: 'badge-green', C: 'badge-muted', CM: 'badge-amber',
  'DC (1)': 'badge-purple', 'DC (2)': 'badge-purple',
  DDJJ: 'badge-red', M: 'badge-muted', NCA: 'badge-amber', NDA: 'badge-amber', STK: 'badge-blue',
}

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
function IcoCheck() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
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

export default function PagoList() {
  const navigate    = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify      = useUiStore((s) => s.notify)

  const [pagos,   setPagos]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ pagado: '', estado_op: '', desde: '', hasta: '' })

  const LIMIT = 50
  const totalPages = Math.ceil(total / LIMIT)

  const buildParams = () => ({
    id_local: activeLocal?.id, page, limit: LIMIT,
    ...(filters.pagado    !== '' ? { pagado:    filters.pagado    } : {}),
    ...(filters.estado_op !== '' ? { estado_op: filters.estado_op } : {}),
    ...(filters.desde     !== '' ? { desde:     filters.desde     } : {}),
    ...(filters.hasta     !== '' ? { hasta:     filters.hasta     } : {}),
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
  }, [page, activeLocal?.id, filters.pagado, filters.estado_op, filters.desde, filters.hasta])

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este pago?')) return
    try { await pagosApi.remove(id); notify('Pago eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  const handleAudit = async (id) => {
    try { await pagosApi.audit(id); notify('Pago auditado', 'success'); load() }
    catch { notify('Error al auditar', 'error') }
  }

  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Pagos</h1>
          {activeLocal && <p className="page-sub">{activeLocal.nombre}</p>}
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/pagos/nuevo')}>
            <IcoPlus /> Nuevo Pago
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--t3)', fontSize: 12, fontWeight: 600 }}>
          <IcoFilter /> Filtros
        </div>
        <select className="filter-select" value={filters.pagado} onChange={e => setFilter('pagado', e.target.value)}>
          <option value="">Todos</option>
          <option value="false">No pagados</option>
          <option value="true">Pagados</option>
        </select>
        <select className="filter-select" value={filters.estado_op} onChange={e => setFilter('estado_op', e.target.value)}>
          <option value="">Todos los estados</option>
          {['CAJA','CUENTA CTE','MP PDP','PDP'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="date"
          className="filter-select"
          value={filters.desde}
          onChange={e => setFilter('desde', e.target.value)}
          title="Desde"
          style={{ width: 140 }}
        />
        <input
          type="date"
          className="filter-select"
          value={filters.hasta}
          onChange={e => setFilter('hasta', e.target.value)}
          title="Hasta"
          style={{ width: 140 }}
        />
        {(filters.pagado || filters.estado_op || filters.desde || filters.hasta) && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => { setFilters({ pagado: '', estado_op: '', desde: '', hasta: '' }); setPage(1) }}
          >
            Limpiar
          </button>
        )}
      </div>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : (
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nro</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Rubro / Cat</th>
                <th>Tipo</th>
                <th>PV</th>
                <th>Nro Doc</th>
                <th>Neto</th>
                <th>Descuento</th>
                <th>Importe</th>
                <th>Método</th>
                <th>Cashflow</th>
                <th>Dirección</th>
                <th>Estado</th>
                <th>Pagado</th>
                <th>Fecha Pago</th>
                <th>Audit</th>
                <th>Fecha Audit</th>
                <th>Observaciones</th>
                <th>Período</th>
                <th>Foto</th>
                <th>PDF</th>
                <th>PDP</th>
                <th>Evento</th>
                <th>Cheque</th>
                <th>Cta Cte</th>
                <th>Local</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id}>
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
                    <button className="btn btn-sm btn-secondary" onClick={() => handleAudit(p.id)}>Auditar</button>
                  </td>
                  <td style={{ minWidth: 90 }}>—</td>
                  <td style={{ minWidth: 160 }}>
                    {p.observaciones
                      ? <span title={p.observaciones} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150, fontSize: 11 }}>{p.observaciones}</span>
                      : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 80 }}>{fmtMonth(p.periodo)}</td>
                  <td style={{ minWidth: 50, textAlign: 'center' }}>
                    {p.foto_url ? <a href={p.foto_url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-bright)' }}><IcoLink /></a> : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 50, textAlign: 'center' }}>
                    {p.pdf_url ? <a href={p.pdf_url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-bright)' }}><IcoLink /></a> : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 70 }}>{mono(p.id_pdp)}</td>
                  <td style={{ minWidth: 70 }}>{mono(p.id_eventos)}</td>
                  <td style={{ minWidth: 70 }}>{mono(p.id_cheque)}</td>
                  <td style={{ minWidth: 70 }}>{mono(p.id_ctacte)}</td>
                  <td style={{ minWidth: 120, fontSize: 12 }}>{p.local?.nombre || <span className="td-muted">—</span>}</td>
                  <td style={{ minWidth: 90 }}>
                    <div className="td-actions">
                      <button className="btn btn-sm btn-secondary btn-icon" onClick={() => navigate(`/pagos/${p.id}/editar`)}>
                        <IcoEdit />
                      </button>
                      <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDelete(p.id)}>
                        <IcoTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pagos.length === 0 && (
                <tr>
                  <td colSpan={28}>
                    <div className="table-empty">
                      <IcoPagoEmpty />
                      <p>No hay pagos registrados.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > LIMIT && (
        <div className="pagination">
          <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
          <span className="pagination-info">Página {page} de {totalPages} — {total} pagos</span>
          <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
  )
}
