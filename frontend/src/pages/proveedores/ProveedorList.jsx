import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import { fmtDateArg } from '../../lib/dates.js'
import { labelTipoLocal } from '../../lib/tiposLocal.js'

const fmt$ = (n) => (n == null ? '—' : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
const fmtDate = (v) => (v ? fmtDateArg(v) : '—')

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

// Ficha del proveedor. Antes eran diez filas que ademas se ocultaban si venian
// vacias: un proveedor con solo nombre y CUIT mostraba dos lineas y la ficha
// parecia rota. Ahora los datos van agrupados y SIEMPRE se ven (los que faltan,
// en gris), y debajo va la actividad real -- que es lo que se viene a mirar:
// cuanto se le pago, desde cuando, en que locales y las ultimas ordenes.
function DetalleProveedor({ p, onEditar }) {
  const notify = useUiStore((s) => s.notify)
  const [res, setRes] = useState(null)
  const [loadingRes, setLoadingRes] = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoadingRes(true)
    setRes(null)
    proveedoresApi.resumen(p.id, ctrl.signal)
      .then(({ data }) => setRes(data))
      .catch((err) => {
        if (ctrl.signal.aborted) return
        // Sin app activa el backend pide X-App-Id: no es un error que valga un
        // toast rojo, simplemente no hay actividad que recortar por locales.
        if (err.response?.status !== 400) notify('No se pudo cargar la actividad del proveedor', 'info')
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingRes(false) })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id])

  const rubcat = p.rubcat
    ? [p.rubcat.rubro?.nombre, p.rubcat.categoria?.nombre].filter(Boolean).join(' / ') || p.id_rubcat
    : null

  const grupos = [
    ['Identificación', [
      ['Nombre', p.nombre],
      ['Razón social', p.razon_social],
      ['CUIT', p.cuit],
    ]],
    ['Contacto', [
      ['Teléfono', p.telefono],
      ['Mail contacto', p.mail_contacto],
      ['Mail envío', p.mail_envio],
      ['Dirección', p.detalle_direc],
    ]],
    ['Datos bancarios', [
      ['Banco', p.banco],
      ['CBU', p.cbu],
      ['Alias', p.alias],
    ]],
    ['Comercial', [
      ['Rubro / categoría', rubcat],
      ['Plazo de pago', p.plazo != null ? `${p.plazo} día${p.plazo === 1 ? '' : 's'}` : null],
      ['Cuenta', p.cuenta],
      ['Tipo', p.tipo],
      ['Tag', p.tag],
    ]],
  ]

  const faltantes = grupos.flatMap(([, filas]) => filas).filter(([, v]) => !v).length

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={onEditar}><IcoEdit /> Editar</button>
        <span className={`badge ${p.activo ? 'badge-green' : 'badge-muted'}`} style={{ display: 'flex', alignItems: 'center' }}>
          {p.activo ? 'Activo' : 'Inactivo'}
        </span>
        {p.es_general && (
          <span className="badge badge-gold" style={{ display: 'flex', alignItems: 'center' }} title="Sirve a cualquier tipo de local">
            General
          </span>
        )}
        {(p.tipos_afines ?? []).map((t) => (
          <span key={t} className="badge badge-muted" style={{ display: 'flex', alignItems: 'center' }}>
            {labelTipoLocal(t)}
          </span>
        ))}
      </div>

      {/* ── Actividad ── va primero: es el dato que se viene a buscar ── */}
      <div className="drawer-section-title">Actividad</div>
      {loadingRes ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><span className="spinner" /></div>
      ) : !res ? (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>
          Elegí un grupo para ver la actividad de este proveedor en tus locales.
        </div>
      ) : res.pagos === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>
          Sin pagos cargados a este proveedor en tus locales.
        </div>
      ) : (
        <>
          <div className="drawer-detail">
            <div className="drawer-detail-row">
              <span className="drawer-detail-key">Total pagado</span>
              <span className="drawer-detail-val">{fmt$(res.total)} <span className="td-muted" style={{ fontSize: 11 }}>en {res.pagos} orden{res.pagos === 1 ? '' : 'es'}</span></span>
            </div>
            {res.pendientes > 0 && (
              <div className="drawer-detail-row">
                <span className="drawer-detail-key">Sin pagar</span>
                <span className="drawer-detail-val" style={{ color: 'var(--amber)' }}>
                  {fmt$(res.total_pendiente)} <span className="td-muted" style={{ fontSize: 11 }}>en {res.pendientes} orden{res.pendientes === 1 ? '' : 'es'}</span>
                </span>
              </div>
            )}
            <div className="drawer-detail-row">
              <span className="drawer-detail-key">Última orden</span>
              <span className="drawer-detail-val">{fmtDate(res.ultimo_pago)}</span>
            </div>
            <div className="drawer-detail-row">
              <span className="drawer-detail-key">Primera orden</span>
              <span className="drawer-detail-val">{fmtDate(res.primer_pago)}</span>
            </div>
          </div>

          {res.por_local.length > 0 && (
            <>
              <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Dónde se le compra</div>
              <div className="table-wrap" style={{ marginBottom: '1rem' }}>
                <table className="data-table">
                  <thead><tr><th>Local</th><th style={{ textAlign: 'right' }}>Órdenes</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                  <tbody>
                    {res.por_local.slice(0, 8).map((l) => (
                      <tr key={l.id_local}>
                        <td>
                          {l.local}
                          {l.grupo && <div style={{ fontSize: 10.5, color: 'var(--t4)' }}>{l.grupo}</div>}
                        </td>
                        <td className="td-muted" style={{ textAlign: 'right' }}>{l.pagos}</td>
                        <td className="td-number" style={{ textAlign: 'right' }}>{fmt$(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {res.por_local.length > 8 && (
                <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: -6 }}>
                  Se muestran los 8 locales de mayor monto, de {res.por_local.length}.
                </p>
              )}
            </>
          )}

          {res.ultimos.length > 0 && (
            <>
              <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Últimas órdenes</div>
              <div className="table-wrap" style={{ marginBottom: '1rem' }}>
                <table className="data-table">
                  <thead><tr><th>OP</th><th>Fecha</th><th>Local</th><th style={{ textAlign: 'right' }}>Importe</th></tr></thead>
                  <tbody>
                    {res.ultimos.map((o) => (
                      <tr key={o.id}>
                        <td>
                          {o.nro_ord != null ? `OP-${o.nro_ord}` : '—'}
                          {!o.pagado && <span className="badge badge-amber" style={{ marginLeft: 6 }}>sin pagar</span>}
                        </td>
                        <td className="td-muted">{fmtDate(o.fecha)}</td>
                        <td className="td-muted">{o.local || '—'}</td>
                        <td className="td-number" style={{ textAlign: 'right' }}>{fmt$(o.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Datos ── siempre completos: lo que falta se ve como "—" ── */}
      {grupos.map(([titulo, filas]) => (
        <div key={titulo}>
          <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>{titulo}</div>
          <div className="drawer-detail">
            {filas.map(([k, v]) => (
              <div key={k} className="drawer-detail-row">
                <span className="drawer-detail-key">{k}</span>
                <span className="drawer-detail-val" style={{ wordBreak: 'break-word', fontSize: 12, color: v ? undefined : 'var(--t4)' }}>
                  {v || '—'}
                </span>
              </div>
            ))}
            {titulo === 'Contacto' && p.direccion_url && (
              <div className="drawer-detail-row">
                <span className="drawer-detail-key">Mapa</span>
                <span className="drawer-detail-val">
                  <a href={p.direccion_url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-bright)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Ver ubicación <IcoLink />
                  </a>
                </span>
              </div>
            )}
          </div>
        </div>
      ))}

      {p.observaciones && (
        <>
          <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Observaciones</div>
          <div style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.55,
            color: 'var(--t2)', background: 'var(--bg-input)', border: '1px solid var(--glass-border)',
            borderRadius: 12, padding: '10px 13px',
          }}>
            {p.observaciones}
          </div>
        </>
      )}

      {/* Cuantos datos faltan, en una linea: con los campos vacios visibles ya
          se ve cuales, pero el numero dice si vale la pena completar la ficha. */}
      {faltantes > 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: '1rem' }}>
          Faltan {faltantes} dato{faltantes === 1 ? '' : 's'} por cargar en esta ficha.
        </p>
      )}
    </div>
  )
}

export default function ProveedorList() {
  const navigate = useNavigate()
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)

  const LIMIT = 100

  const [proveedores,     setProveedores]     = useState([])
  const [search,          setSearch]          = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showInac,        setShowInac]        = useState(false)
  const [loading,         setLoading]         = useState(true)
  const [page,            setPage]            = useState(1)
  const [total,           setTotal]           = useState(0)
  const [panelOpen,       setPanelOpen]       = useState(false)
  const [selectedProv,    setSelectedProv]    = useState(null)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const load = () => {
    setLoading(true)
    proveedoresApi.list({ activo: showInac ? undefined : 'true', search: debouncedSearch || undefined, page, limit: LIMIT })
      .then(({ data }) => { setProveedores(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar proveedores', 'error'))
      .finally(() => setLoading(false))
  }

  // ── Debounce búsqueda ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, showInac])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    proveedoresApi.list({ activo: showInac ? undefined : 'true', search: debouncedSearch || undefined, page, limit: LIMIT }, ctrl.signal)
      .then(({ data }) => { setProveedores(data.data); setTotal(data.total) })
      .catch(() => { if (!ctrl.signal.aborted) notify('Error al cargar proveedores', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [debouncedSearch, showInac, page])

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!(await showConfirm('¿Desactivar este proveedor?'))) return
    try { await proveedoresApi.remove(id); notify('Proveedor desactivado', 'success'); load() }
    catch { notify('Error al desactivar', 'error') }
  }

  const openDetail = (p) => { setSelectedProv(p); setPanelOpen(true) }
  const closePanel = () => setPanelOpen(false)

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
              <th>Tag</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 11 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${48 + (j * 13 + i * 9) % 42}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {proveedores.map((p) => (
                  <tr key={p.id} className="row-clickable" onClick={() => openDetail(p)}>
                    <td className="td-primary" style={{ minWidth: 160 }}>{p.nombre}</td>
                    <td className="td-muted"   style={{ minWidth: 160 }}>{p.razon_social || '—'}</td>
                    <td className="td-mono"    style={{ minWidth: 110 }}>{p.cuit || '—'}</td>
                    <td                        style={{ minWidth: 100 }}>{p.banco || <span className="td-muted">—</span>}</td>
                    <td className="td-mono"    style={{ minWidth: 140, fontSize: 11 }}>{p.cbu || <span className="td-muted">—</span>}</td>
                    <td className="td-mono"    style={{ minWidth: 120 }}>{p.alias || <span className="td-muted">—</span>}</td>
                    <td                        style={{ minWidth: 110 }}>{p.telefono || <span className="td-muted">—</span>}</td>
                    <td style={{ minWidth: 160, fontSize: 12 }}>{p.mail_contacto || <span className="td-muted">—</span>}</td>
                    <td style={{ minWidth: 120, fontSize: 12 }}>
                      {p.tag
                        ? p.tag.split(',').map(t => <span key={t} className="badge badge-muted" style={{ marginRight: 3, fontSize: 10 }}>{t.trim()}</span>)
                        : <span className="td-muted">—</span>}
                    </td>
                    <td style={{ minWidth: 80 }}>
                      <span className={`badge ${p.activo ? 'badge-green' : 'badge-muted'}`}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="td-actions">
                        <button className="btn btn-sm btn-secondary btn-icon" onClick={(e) => { e.stopPropagation(); navigate(`/proveedores/${p.id}/editar`) }}>
                          <IcoEdit />
                        </button>
                        <button className="btn btn-sm btn-danger btn-icon" onClick={(e) => handleDelete(p.id, e)}>
                          <IcoTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {proveedores.length === 0 && (
                  <tr>
                    <td colSpan={11}>
                      <div className="table-empty">
                        <IcoProvEmpty />
                        <p>{search ? `Sin resultados para "${search}"` : 'No hay proveedores registrados.'}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span className="pagination-info">
            {`${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} de ${total} proveedores`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setPage(1)} disabled={page <= 1} title="Primera página">«</button>
            <button className="btn btn-sm btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹ Anterior</button>
            <span style={{ fontSize: 13, color: 'var(--t2)', padding: '0 0.5rem', whiteSpace: 'nowrap' }}>
              Página {page} de {totalPages}
            </span>
            <button className="btn btn-sm btn-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente ›</button>
            <button className="btn btn-sm btn-secondary" onClick={() => setPage(totalPages)} disabled={page >= totalPages} title="Última página">»</button>
          </div>
        </div>
      )}

      <DrawerPanel
        open={panelOpen}
        onClose={closePanel}
        title={selectedProv?.nombre || 'Proveedor'}
        width={500}
      >
        {selectedProv && <DetalleProveedor p={selectedProv} onEditar={() => { closePanel(); navigate(`/proveedores/${selectedProv.id}/editar`) }} />}
      </DrawerPanel>
    </div>
  )
}
