import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'

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
function IcoSearch() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
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
function IcoProvEmpty() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

export default function ProveedorList() {
  const navigate = useNavigate()
  const notify   = useUiStore((s) => s.notify)

  const LIMIT = 50

  const [proveedores, setProveedores] = useState([])
  const [search,      setSearch]      = useState('')
  const [showInac,    setShowInac]    = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [page,        setPage]        = useState(1)
  const [total,       setTotal]       = useState(0)

  const totalPages = Math.ceil(total / LIMIT)

  const load = () => {
    setLoading(true)
    proveedoresApi.list({ activo: showInac ? undefined : 'true', search: search || undefined, page, limit: LIMIT })
      .then(({ data }) => { setProveedores(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar proveedores', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setPage(1)
  }, [search, showInac])

  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      proveedoresApi.list({ activo: showInac ? undefined : 'true', search: search || undefined, page, limit: LIMIT }, ctrl.signal)
        .then(({ data }) => { setProveedores(data.data); setTotal(data.total) })
        .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar proveedores', 'error') })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    }, 300)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [search, showInac, page])

  const handleDelete = async (id) => {
    if (!confirm('¿Desactivar este proveedor?')) return
    try { await proveedoresApi.remove(id); notify('Proveedor desactivado', 'success'); load() }
    catch { notify('Error al desactivar', 'error') }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Proveedores</h1>
          <p className="page-sub">Directorio de cuentas y contactos</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/proveedores/nuevo')}>
            <IcoPlus /> Nuevo Proveedor
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-wrap">
          <IcoSearch />
          <input
            className="search-input"
            type="search"
            placeholder="Buscar por nombre, razón social o CUIT..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <label className="checkbox-wrap" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showInac} onChange={e => setShowInac(e.target.checked)} />
          <span className="checkbox-label">Mostrar inactivos</span>
        </label>
      </div>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : (
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Razón Social</th>
                <th>CUIT</th>
                <th>Banco</th>
                <th>CBU</th>
                <th>Alias</th>
                <th>Teléfono</th>
                <th>Mail Contacto</th>
                <th>Mail Envío</th>
                <th>Tag</th>
                <th>Dirección URL</th>
                <th>Detalle Dirección</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.id}>
                  <td className="td-primary" style={{ minWidth: 160 }}>{p.nombre}</td>
                  <td className="td-muted"   style={{ minWidth: 160 }}>{p.razon_social || '—'}</td>
                  <td className="td-mono"    style={{ minWidth: 110 }}>{p.cuit || '—'}</td>
                  <td                        style={{ minWidth: 100 }}>{p.banco || <span className="td-muted">—</span>}</td>
                  <td className="td-mono"    style={{ minWidth: 140, fontSize: 11 }}>{p.cbu || <span className="td-muted">—</span>}</td>
                  <td className="td-mono"    style={{ minWidth: 120 }}>{p.alias || <span className="td-muted">—</span>}</td>
                  <td                        style={{ minWidth: 110 }}>{p.telefono || <span className="td-muted">—</span>}</td>
                  <td style={{ minWidth: 160, fontSize: 12 }}>{p.mail_contacto || <span className="td-muted">—</span>}</td>
                  <td style={{ minWidth: 160, fontSize: 12 }}>{p.mail_envio || <span className="td-muted">—</span>}</td>
                  <td style={{ minWidth: 120, fontSize: 12 }}>
                    {p.tag
                      ? p.tag.split(',').map(t => <span key={t} className="badge badge-muted" style={{ marginRight: 3, fontSize: 10 }}>{t.trim()}</span>)
                      : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 70, textAlign: 'center' }}>
                    {p.direccion_url
                      ? <a href={p.direccion_url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-bright)' }}><IcoLink /></a>
                      : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 160, fontSize: 12 }}>
                    {p.detalle_direc
                      ? <span title={p.detalle_direc} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{p.detalle_direc}</span>
                      : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 80 }}>
                    <span className={`badge ${p.activo ? 'badge-green' : 'badge-muted'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="td-actions">
                      <button className="btn btn-sm btn-secondary btn-icon" onClick={() => navigate(`/proveedores/${p.id}/editar`)}>
                        <IcoEdit />
                      </button>
                      <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDelete(p.id)}>
                        <IcoTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {proveedores.length === 0 && (
                <tr>
                  <td colSpan={14}>
                    <div className="table-empty">
                      <IcoProvEmpty />
                      <p>{search ? `Sin resultados para "${search}"` : 'No hay proveedores registrados.'}</p>
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
          <span className="pagination-info">Página {page} de {totalPages} — {total} proveedores</span>
          <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
  )
}
