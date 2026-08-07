import { useEffect, useState } from 'react'
import { localesApi } from '../../api/locales.js'
import { appsApi } from '../../api/apps.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import Combobox from '../../components/Combobox.jsx'
import { TIPOS_LOCAL, labelTipoLocal } from '../../lib/tiposLocal.js'
import { DESCUENTO_MOVSTOCK_DEFAULT } from '../../lib/descuentoMovstock.js'

const LIMIT = 50

// Columnas de la tabla. Se usa en el skeleton y en la fila de "sin resultados":
// si queda desfasado de los <th>, la tabla se desalinea al cargar y al estar vacía.
const COLUMNAS = 11

function IcoLocalesEmpty() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
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
function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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
function IcoImage() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="m21 15-5-5L5 21"/>
    </svg>
  )
}

const EMPTY = {
  nombre: '', id_app: '', direccion: '', telefono: '', activo: true,
  id_proveedor: '', maps_url: '', menu_url: '', mail_facturas: '', tipo_local: '',
  // Vacío en el alta significa "el general": el default de la base lo pone en
  // 30 y no hace falta escribirlo local por local.
  descuento_movstock: ''
}

function Seccion({ titulo, children }) {
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--t3)', paddingBottom: 6, marginBottom: 12, borderBottom: '1px solid var(--border)'
      }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

// El logo vive en un bucket privado y el proxy del backend pide el JWT, que un
// <img src> no manda: se baja como blob. `version` fuerza la recarga despues
// de subir uno nuevo.
function LogoPreview({ localId, tieneLogo, version, size = 96 }) {
  const [blobUrl, setBlobUrl] = useState(null)

  useEffect(() => {
    if (!localId || !tieneLogo) { setBlobUrl(null); return }
    let cancelado = false
    let creada = null
    localesApi.getLogo(localId)
      .then((res) => {
        if (cancelado) return
        creada = URL.createObjectURL(res.data)
        setBlobUrl(creada)
      })
      .catch(() => { if (!cancelado) setBlobUrl(null) })
    return () => {
      cancelado = true
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [localId, tieneLogo, version])

  const caja = {
    width: size, height: size, flexShrink: 0, borderRadius: 10,
    border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden', color: 'var(--t3)',
    background: 'var(--bg2, transparent)'
  }

  return (
    <div style={caja}>
      {blobUrl
        ? <img src={blobUrl} alt="Logo del local" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <IcoImage />}
    </div>
  )
}

export default function Locales() {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)

  const [locales,   setLocales]   = useState([])
  const [apps,      setApps]      = useState([])
  const [filterApp, setFilterApp] = useState('')
  const [loading,   setLoading]   = useState(true)
  const [page,      setPage]      = useState(1)
  const [total,     setTotal]     = useState(0)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState(EMPTY)
  const [saving,    setSaving]    = useState(false)
  const [addingApp, setAddingApp] = useState(false)
  const [newApp,    setNewApp]    = useState({ nombre: '', slug: '' })
  const [savingApp, setSavingApp] = useState(false)
  const [provSel,   setProvSel]   = useState(null)
  const [logoVer,   setLogoVer]   = useState(0)
  const [logoBusy,  setLogoBusy]  = useState(false)

  const totalPages = Math.ceil(total / LIMIT)

  const load = () => {
    setLoading(true)
    Promise.all([
      localesApi.list({ ...(filterApp ? { id_app: filterApp } : {}), page, limit: LIMIT }),
      appsApi.list()
    ])
      .then(([l, a]) => { setLocales(l.data.data); setTotal(l.data.total); setApps(a.data) })
      .catch(() => notify('Error al cargar', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => setPage(1), [filterApp])
  useEffect(load, [filterApp, page])

  const slugify = (s) => s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const openCreate = () => {
    setSelected(null)
    setForm(EMPTY)
    setProvSel(null)
    setAddingApp(false)
    setNewApp({ nombre: '', slug: '' })
    setPanelOpen(true)
  }

  const openEdit = (l) => {
    setSelected(l)
    setForm({
      nombre:        l.nombre,
      id_app:        l.id_app,
      direccion:     l.direccion     || '',
      telefono:      l.telefono      || '',
      activo:        l.activo,
      id_proveedor:  l.id_proveedor  || '',
      maps_url:      l.maps_url      || '',
      menu_url:      l.menu_url      || '',
      mail_facturas: l.mail_facturas || '',
      tipo_local:    l.tipo_local    || '',
      descuento_movstock: l.descuento_movstock == null ? '' : String(Number(l.descuento_movstock))
    })
    setProvSel(l.proveedor || null)
    setPanelOpen(true)
  }

  const closePanel = () => setPanelOpen(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.id_app) { notify('Seleccioná un grupo', 'error'); return }
    setSaving(true)
    try {
      if (selected) {
        const { data } = await localesApi.update(selected.id, form)
        setSelected((s) => ({ ...s, ...data }))
        notify('Local actualizado', 'success')
      } else {
        await localesApi.create(form)
        notify('Local creado', 'success')
      }
      setPanelOpen(false)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const handleCreateApp = async (e) => {
    e.preventDefault()
    if (!newApp.nombre.trim() || !newApp.slug.trim()) { notify('Nombre y slug son requeridos', 'error'); return }
    setSavingApp(true)
    try {
      const { data } = await appsApi.create({ nombre: newApp.nombre.trim(), slug: newApp.slug.trim(), activo: true })
      const { data: appsList } = await appsApi.list()
      setApps(appsList)
      setForm(f => ({ ...f, id_app: data.id }))
      setAddingApp(false)
      setNewApp({ nombre: '', slug: '' })
      notify('Grupo creado', 'success')
    } catch (err) { notify(err.response?.data?.error || 'Error al crear el grupo', 'error') }
    finally { setSavingApp(false) }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!(await showConfirm('¿Eliminar local?'))) return
    try { await localesApi.remove(id); notify('Local eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  // Ordena por afinidad con el tipo elegido en el formulario, sin filtrar.
  const fetchProveedores = (search) =>
    proveedoresApi
      .list({ search, activo: 'true', limit: 60, ...(form.tipo_local ? { tipo_local: form.tipo_local } : {}) })
      .then(r => r.data.data)

  const subirLogo = async (file) => {
    if (!file || !selected) return
    setLogoBusy(true)
    try {
      const { data } = await localesApi.uploadLogo(selected.id, file)
      setSelected(s => ({ ...s, logo_url: data.url }))
      setLogoVer(v => v + 1)
      notify('Logo actualizado', 'success')
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error al subir el logo', 'error') }
    finally { setLogoBusy(false) }
  }

  const quitarLogo = async () => {
    if (!selected) return
    setLogoBusy(true)
    try {
      await localesApi.removeLogo(selected.id)
      setSelected(s => ({ ...s, logo_url: null }))
      setLogoVer(v => v + 1)
      notify('Logo quitado', 'success')
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error al quitar el logo', 'error') }
    finally { setLogoBusy(false) }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Locales</h1>
          <p className="page-sub">Sucursales y puntos de venta</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openCreate}><IcoPlus /> Nuevo Local</button>
        </div>
      </div>

      <div className="filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--t3)', fontSize: 12, fontWeight: 600 }}>
          <IcoFilter /> Filtrar por grupo
        </div>
        <select className="filter-select" value={filterApp} onChange={e => setFilterApp(e.target.value)}>
          <option value="">Todos los grupos</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Grupo</th>
              <th>Tipo</th>
              {/* El proveedor del local es con quien se factura a sí mismo en los
                  modos rápidos (Carga Avión y MovStock lo usan como proveedor por
                  defecto), así que saber si está cargado importa. */}
              <th>Proveedor</th>
              <th>Mail facturas</th>
              <th style={{ textAlign: 'right' }}>Desc. MovStock</th>
              <th>Dirección</th>
              <th>Teléfono</th>
              <th>Links</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: COLUMNAS }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 13 + i * 9) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {locales.map((l) => (
                  <tr key={l.id} className="row-clickable" onClick={() => openEdit(l)}>
                    <td className="td-primary">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        {l.logo_url && <LogoPreview localId={l.id} tieneLogo version={0} size={26} />}
                        {l.nombre}
                      </div>
                    </td>
                    <td><span className="badge badge-muted">{l.app?.nombre}</span></td>
                    <td className="td-muted">{labelTipoLocal(l.tipo_local)}</td>

                    {/* Sin proveedor, Carga Avión y MovStock no pueden facturar
                        contra el local: se avisa en vez de mostrar un guion que no
                        distingue "no tiene" de "no se cargó". */}
                    <td style={{ maxWidth: 200 }}>
                      {l.proveedor ? (
                        <div
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={[l.proveedor.razon_social, l.proveedor.cuit].filter(Boolean).join(' · ')}
                        >
                          {l.proveedor.nombre || l.proveedor.razon_social || '(sin nombre)'}
                        </div>
                      ) : (
                        <span className="badge badge-amber" title="Carga Avión y MovStock necesitan el proveedor del local">
                          Sin proveedor
                        </span>
                      )}
                    </td>

                    <td className="td-muted" style={{ maxWidth: 180 }}>
                      {l.mail_facturas ? (
                        <div
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={l.mail_facturas}
                        >
                          {l.mail_facturas}
                        </div>
                      ) : '—'}
                    </td>

                    {/* El descuento que MovStock aplica sobre el neto. Se marca
                        cuando difiere del general: es plata y conviene que salte. */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {(() => {
                        const pct = Number(l.descuento_movstock ?? DESCUENTO_MOVSTOCK_DEFAULT)
                        const esDefault = pct === Number(DESCUENTO_MOVSTOCK_DEFAULT)
                        return (
                          <span
                            style={{ color: esDefault ? 'var(--t3)' : 'var(--amber)', fontWeight: esDefault ? 400 : 700 }}
                            title={esDefault
                              ? `El general (${DESCUENTO_MOVSTOCK_DEFAULT}%)`
                              : `Pactado distinto del general (${DESCUENTO_MOVSTOCK_DEFAULT}%)`}
                          >
                            {pct}%
                          </span>
                        )
                      })()}
                    </td>

                    <td className="td-muted" style={{ maxWidth: 220 }}>
                      {l.direccion ? (
                        <div
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={l.direccion}
                        >
                          {l.direccion}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="td-muted">{l.telefono  || '—'}</td>

                    {/* Maps y menú: iconos y no la URL entera, que ocuparía media
                        tabla. El click no abre el drawer del local. */}
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {l.maps_url && (
                          <a
                            href={l.maps_url} target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Ver en Maps" style={{ fontSize: 12 }}
                          >Maps</a>
                        )}
                        {l.menu_url && (
                          <a
                            href={l.menu_url} target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Ver el menú" style={{ fontSize: 12 }}
                          >Menú</a>
                        )}
                        {!l.maps_url && !l.menu_url && <span className="td-muted">—</span>}
                      </div>
                    </td>

                    <td>
                      <span className={`badge ${l.activo ? 'badge-green' : 'badge-muted'}`}>
                        {l.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="td-actions">
                        <button className="btn btn-sm btn-danger btn-icon" onClick={(e) => handleDelete(l.id, e)}>
                          <IcoTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {locales.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNAS}>
                      <div className="table-empty">
                        <IcoLocalesEmpty />
                        <p>No hay locales registrados.</p>
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
          <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
          <span className="pagination-info">Página {page} de {totalPages} — {total} locales</span>
          <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
        </div>
      )}

      <DrawerPanel
        open={panelOpen}
        onClose={closePanel}
        title={selected ? `Editar Local — ${selected.nombre}` : 'Nuevo Local'}
        width={620}
      >
        <form onSubmit={handleSubmit}>
          {/* ── Identificación ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <LogoPreview localId={selected?.id} tieneLogo={Boolean(selected?.logo_url)} version={logoVer} />
              {selected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, width: 96 }}>
                  <label className="btn btn-secondary btn-sm" style={{ justifyContent: 'center', cursor: logoBusy ? 'default' : 'pointer' }}>
                    {logoBusy
                      ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                      : (selected.logo_url ? 'Cambiar' : 'Subir logo')}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      disabled={logoBusy}
                      onChange={(e) => { subirLogo(e.target.files?.[0]); e.target.value = '' }}
                    />
                  </label>
                  {selected.logo_url && (
                    <button type="button" className="btn btn-sm btn-secondary" onClick={quitarLogo} disabled={logoBusy}>
                      Quitar
                    </button>
                  )}
                </div>
              ) : (
                <p style={{ width: 96, marginTop: 8, fontSize: 10.5, lineHeight: 1.35, color: 'var(--t3)' }}>
                  Guardá el local para poder subir el logo.
                </p>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="form-group">
                <label className="form-label">Grupo *</label>
                {!addingApp ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    <div className="form-input-wrap" style={{ flex: 1 }}>
                      <select required value={form.id_app} onChange={e => setForm({ ...form, id_app: e.target.value })}>
                        <option value="">Seleccionar grupo...</option>
                        {apps.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddingApp(true)}>
                      <IcoPlus /> Nuevo
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div className="form-input-wrap">
                      <input
                        placeholder="Nombre del grupo"
                        value={newApp.nombre}
                        onChange={e => {
                          const nombre = e.target.value
                          setNewApp(f => ({ nombre, slug: f.slug === slugify(f.nombre) ? slugify(nombre) : f.slug }))
                        }}
                      />
                    </div>
                    <div className="form-input-wrap">
                      <input placeholder="slug" value={newApp.slug} onChange={e => setNewApp(f => ({ ...f, slug: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateApp} disabled={savingApp}>
                        {savingApp ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : 'Crear grupo'}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddingApp(false)} disabled={savingApp}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Nombre fantasía *</label>
                <div className="form-input-wrap">
                  <input required placeholder="Bar 878" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Tipo de local</label>
                <div className="form-input-wrap">
                  <select value={form.tipo_local} onChange={e => setForm({ ...form, tipo_local: e.target.value })}>
                    <option value="">Sin especificar</option>
                    {TIPOS_LOCAL.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Descuento automático de MovStock. Se deja vacío salvo que el
                  local tenga otro pactado: así el general se cambia en un solo
                  lugar y no hay que revisar 59 fichas. */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Descuento MovStock (%)</label>
                <div className="form-input-wrap">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder={String(DESCUENTO_MOVSTOCK_DEFAULT)}
                    value={form.descuento_movstock}
                    onChange={e => setForm({ ...form, descuento_movstock: e.target.value })}
                  />
                </div>
                <span style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, display: 'block' }}>
                  Se descuenta solo del neto al cargar un MovStock.
                  Vacío = {DESCUENTO_MOVSTOCK_DEFAULT}% general. Poné 0 si este local no tiene descuento.
                </span>
              </div>
            </div>
          </div>

          {/* ── Fiscal ─────────────────────────────────────────────────── */}
          <Seccion titulo="Fiscal">
            <div className="form-group">
              <label className="form-label">Proveedor vinculado</label>
              <Combobox
                value={form.id_proveedor}
                displayValue={provSel?.nombre || provSel?.razon_social || ''}
                getKey={(p) => p.id}
                getLabel={(p) => p.nombre || p.razon_social || '(sin nombre)'}
                onSelect={(p) => { setProvSel(p); setForm(f => ({ ...f, id_proveedor: p.id })) }}
                onClear={() => { setProvSel(null); setForm(f => ({ ...f, id_proveedor: '' })) }}
                fetchItems={fetchProveedores}
                placeholder="Buscar proveedor..."
              />
            </div>

            {provSel ? (
              <div style={{
                marginTop: 10, padding: '0.75rem 0.9rem', border: '1px solid var(--border)',
                borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem',
                fontSize: 12
              }}>
                {[
                  ['Razón social', provSel.razon_social],
                  ['CUIT',         provSel.cuit],
                  ['Banco',        provSel.banco],
                  ['CBU',          provSel.cbu],
                  ['Alias',        provSel.alias]
                ].map(([etiqueta, valor]) => (
                  <div key={etiqueta}>
                    <div style={{ color: 'var(--t3)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {etiqueta}
                    </div>
                    <div style={{ wordBreak: 'break-all' }}>{valor || '—'}</div>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', color: 'var(--t3)', fontSize: 11 }}>
                  Estos datos se editan en la pantalla de Proveedores.
                </div>
              </div>
            ) : (
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--t3)', lineHeight: 1.45 }}>
                Vinculá el proveedor propio del local para ver acá su razón social, CUIT y datos
                bancarios. Ese proveedor también queda como el sugerido al cargar pagos de este local.
              </p>
            )}
          </Seccion>

          {/* ── Enlaces ────────────────────────────────────────────────── */}
          <Seccion titulo="Enlaces">
            <div className="form-group">
              <label className="form-label">Google Maps</label>
              <div className="form-input-wrap">
                {/* type="text" a proposito: el validador nativo de type="url"
                    exige el esquema y el backend justamente prefija https://
                    cuando falta, que es como la gente pega los links. */}
                <input
                  placeholder="maps.google.com/..."
                  value={form.maps_url}
                  onChange={e => setForm({ ...form, maps_url: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Menú / carta</label>
              <div className="form-input-wrap">
                <input
                  placeholder="micarta.com/878"
                  value={form.menu_url}
                  onChange={e => setForm({ ...form, menu_url: e.target.value })}
                />
              </div>
            </div>
          </Seccion>

          {/* ── Contacto ───────────────────────────────────────────────── */}
          <Seccion titulo="Contacto">
            <div className="form-group">
              <label className="form-label">Dirección</label>
              <div className="form-input-wrap">
                <input placeholder="Av. Corrientes 1234" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Teléfono</label>
              <div className="form-input-wrap">
                <input placeholder="+54 11 ..." value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Mail recepción facturas</label>
              <div className="form-input-wrap">
                <input
                  type="email"
                  placeholder="facturas@local.com"
                  value={form.mail_facturas}
                  onChange={e => setForm({ ...form, mail_facturas: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="checkbox-wrap">
                <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
                <span className="checkbox-label">Activo</span>
              </label>
            </div>
          </Seccion>

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : selected ? 'Actualizar' : 'Crear Local'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closePanel}>Cancelar</button>
          </div>
        </form>
      </DrawerPanel>
    </div>
  )
}
