import { Fragment, useState, useEffect, useCallback } from 'react'
import { activityLogApi } from '../../api/activityLog.js'
import { useUiStore } from '../../store/uiStore.js'

const LIMIT = 50

function fmtDT(d) { return d ? new Date(d).toLocaleString('es-AR', { hour12: false }) : '—' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—' }
function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }

const ACCION_LABEL = { creado: 'Creado', editado: 'Editado', eliminado: 'Eliminado' }
const ACCION_BADGE = { creado: 'badge-green', editado: 'badge-blue', eliminado: 'badge-red' }

// Traduce el snapshot crudo del pago (columnas de la tabla, sin joins) a
// pares label/valor legibles, en vez de mostrar el JSON tal cual.
function snapshotRows(s) {
  if (!s) return []
  return [
    ['Nro Orden',    s.nro_ord != null ? `OP-${s.nro_ord}` : '—'],
    ['Fecha',        fmtDate(s.fecha)],
    ['Proveedor',    s.id_proveedor || '—'],
    ['Rubro/Cat',    s.id_rubcat || '—'],
    ['Tipo',         s.id_tipo || '—'],
    ['PV',           s.pv ?? '—'],
    ['Nro',          s.nro ?? '—'],
    ['Neto',         fmt$(s.importe_neto)],
    ['Descuento',    fmt$(s.descuento)],
    ['Importe',      fmt$(s.importe)],
    ['Método',       s.id_metodo || '—'],
    ['Dirección',    s.ingresa_egreso != null ? (s.ingresa_egreso ? 'Ingreso' : 'Egreso') : '—'],
    ['Estado Op.',   s.estado_op || '—'],
    ['Pagado',       s.pagado ? 'Sí' : 'No'],
    ['Fecha Pago',   fmtDate(s.fecha_pago)],
    ['Período',      fmtDate(s.periodo)],
    ['Local',        s.id_local || '—'],
    ['Observaciones', s.observaciones || '—'],
  ]
}

const FILTER_INIT = { desde: '', hasta: '', id_user: '', accion: '' }

export default function ActivityLog() {
  const notify = useUiStore((s) => s.notify)

  const [rows,      setRows]      = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [page,      setPage]      = useState(1)
  const [usuarios,  setUsuarios]  = useState([])
  const [filters,   setFilters]   = useState(FILTER_INIT)
  const [expandedId, setExpandedId] = useState(null)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  useEffect(() => {
    activityLogApi.usuarios()
      .then(({ data }) => setUsuarios(data))
      .catch(() => {})
  }, [])

  const buildParams = useCallback((pageNum) => ({
    page: pageNum,
    limit: LIMIT,
    ...(filters.desde   ? { desde: filters.desde }     : {}),
    ...(filters.hasta   ? { hasta: filters.hasta }     : {}),
    ...(filters.id_user ? { id_user: filters.id_user } : {}),
    ...(filters.accion  ? { accion: filters.accion }   : {}),
  }), [filters])

  useEffect(() => { setPage(1) }, [filters])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    activityLogApi.list(buildParams(page), ctrl.signal)
      .then(({ data }) => { setRows(data.data); setTotal(data.total) })
      .catch(() => { if (!ctrl.signal.aborted) notify('Error al cargar el log de actividad', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [buildParams, page])

  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages))
  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value }))

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Actividad</h1>
          <p className="page-sub">Registro de creación, edición y eliminación de pagos por usuario</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Desde</label>
          <div className="form-input-wrap">
            <input type="date" value={filters.desde} onChange={e => setFilter('desde', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Hasta</label>
          <div className="form-input-wrap">
            <input type="date" value={filters.hasta} onChange={e => setFilter('hasta', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Usuario</label>
          <select className="filter-select" value={filters.id_user} onChange={e => setFilter('id_user', e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Acción</label>
          <select className="filter-select" value={filters.accion} onChange={e => setFilter('accion', e.target.value)}>
            <option value="">Todas</option>
            <option value="creado">Creado</option>
            <option value="editado">Editado</option>
            <option value="eliminado">Eliminado</option>
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th>Fecha</th>
              <th>OP</th>
              <th>Usuario</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 5 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 13 + i * 9) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="table-empty">
                    <p>Sin eventos de actividad para los filtros aplicados.</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map(ev => {
                const isOpen = expandedId === ev.id
                const opLabel = ev.snapshot?.nro_ord != null ? `OP-${ev.snapshot.nro_ord}` : '—'
                return (
                  <Fragment key={ev.id}>
                    <tr className="row-clickable" onClick={() => setExpandedId(isOpen ? null : ev.id)}>
                      <td className="td-muted">{isOpen ? '▾' : '▸'}</td>
                      <td className="td-muted">{fmtDT(ev.fecha)}</td>
                      <td>{opLabel}</td>
                      <td>{ev.user?.nombre ?? '—'}</td>
                      <td>
                        <span className={`badge ${ACCION_BADGE[ev.accion] ?? 'badge-muted'}`}>
                          {ACCION_LABEL[ev.accion] ?? ev.accion}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td></td>
                        <td colSpan={4}>
                          <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem 1.5rem',
                            background: 'var(--bg-input)', borderRadius: 8,
                            padding: '0.9rem 1.1rem', margin: '0.25rem 0 0.75rem',
                          }}>
                            {snapshotRows(ev.snapshot).map(([label, val]) => (
                              <div key={label}>
                                <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
                                <div style={{ fontSize: 13, color: 'var(--t1)' }}>{val}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span className="pagination-info">
            {`${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} de ${total} eventos`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(1)} disabled={page <= 1} title="Primera página">«</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Anterior</button>
            <span style={{ fontSize: 13, color: 'var(--t2)', padding: '0 0.5rem', whiteSpace: 'nowrap' }}>
              Página {page} de {totalPages}
            </span>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>Siguiente ›</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(totalPages)} disabled={page >= totalPages} title="Última página">»</button>
          </div>
        </div>
      )}
    </div>
  )
}
