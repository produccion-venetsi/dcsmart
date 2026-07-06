import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { auditoriasApi } from '../../api/auditorias.js'
import { useUiStore } from '../../store/uiStore.js'

const LIMIT = 50

function fmtDT(d) { return d ? new Date(d).toLocaleString('es-AR', { hour12: false }) : '—' }

const MODULO_LABEL = { pagos: 'Pagos', cajas: 'Cajas' }
const MODULO_BADGE = { pagos: 'badge-blue', cajas: 'badge-muted' }

const FILTER_INIT = { desde: '', hasta: '', tabla: '', id_user: '', accion: '' }

export default function Auditorias() {
  const notify = useUiStore((s) => s.notify)

  const [rows,     setRows]     = useState([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [page,     setPage]     = useState(1)
  const [usuarios, setUsuarios] = useState([])
  const [filters,  setFilters]  = useState(FILTER_INIT)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  useEffect(() => {
    auditoriasApi.usuarios()
      .then(({ data }) => setUsuarios(data))
      .catch(() => {})
  }, [])

  const buildParams = useCallback((pageNum) => ({
    page: pageNum,
    limit: LIMIT,
    ...(filters.desde   ? { desde: filters.desde }     : {}),
    ...(filters.hasta   ? { hasta: filters.hasta }     : {}),
    ...(filters.tabla   ? { tabla: filters.tabla }     : {}),
    ...(filters.id_user ? { id_user: filters.id_user } : {}),
    ...(filters.accion  ? { accion: filters.accion }   : {}),
  }), [filters])

  useEffect(() => { setPage(1) }, [filters])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    auditoriasApi.list(buildParams(page), ctrl.signal)
      .then(({ data }) => { setRows(data.data); setTotal(data.total) })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar auditorías', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [buildParams, page])

  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages))
  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value }))

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Auditorías</h1>
          <p className="page-sub">Historial completo de auditorías de pagos y cajas</p>
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
          <label className="form-label">Módulo</label>
          <select className="filter-select" value={filters.tabla} onChange={e => setFilter('tabla', e.target.value)}>
            <option value="">Todos</option>
            <option value="pagos">Pagos</option>
            <option value="cajas">Cajas</option>
          </select>
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
            <option value="auditado">Auditado</option>
            <option value="desauditado">Desauditado</option>
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Módulo</th>
              <th>Registro</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Circuito</th>
              <th>Observación</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 7 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 13 + i * 9) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="table-empty">
                    <p>Sin eventos de auditoría para los filtros aplicados.</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map(ev => (
                <tr key={ev.id}>
                  <td className="td-muted">{fmtDT(ev.fecha)}</td>
                  <td><span className={`badge ${MODULO_BADGE[ev.tabla] ?? 'badge-muted'}`}>{MODULO_LABEL[ev.tabla] ?? ev.tabla}</span></td>
                  <td>
                    {ev.registro_label === '—' ? (
                      <span className="td-muted">—</span>
                    ) : (
                      <Link
                        className="registro-link"
                        to={ev.tabla === 'pagos'
                          ? `/pagos?search=${encodeURIComponent(ev.registro_label)}`
                          : `/cajas?turno=${encodeURIComponent(ev.registro_label.replace(/^TRN\s*/, ''))}`}
                      >
                        {ev.registro_label}
                      </Link>
                    )}
                  </td>
                  <td>{ev.user?.nombre ?? '—'}</td>
                  <td>
                    <span className={`badge ${ev.accion === 'auditado' ? 'badge-green' : 'badge-amber'}`}>
                      {ev.accion === 'auditado' ? 'Auditado' : 'Desauditado'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${ev.audit_dc ? 'badge-purple' : 'badge-muted'}`}>
                      {ev.audit_dc ? 'DC' : 'Normal'}
                    </span>
                  </td>
                  <td className="td-muted">{ev.observaciones || '—'}</td>
                </tr>
              ))
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
