import { useEffect, useState } from 'react'
import { localesApi } from '../../api/locales.js'
import { appsApi } from '../../api/apps.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'

const LIMIT = 50

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

const EMPTY = { nombre: '', id_app: '', direccion: '', telefono: '', activo: true }

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

  const openCreate = () => { setSelected(null); setForm(EMPTY); setPanelOpen(true) }
  const openEdit   = (l) => {
    setSelected(l)
    setForm({ nombre: l.nombre, id_app: l.id_app, direccion: l.direccion || '', telefono: l.telefono || '', activo: l.activo })
    setPanelOpen(true)
  }
  const closePanel = () => setPanelOpen(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.id_app) { notify('Seleccioná una app', 'error'); return }
    setSaving(true)
    try {
      if (selected) { await localesApi.update(selected.id, form); notify('Local actualizado', 'success') }
      else          { await localesApi.create(form);               notify('Local creado', 'success') }
      setPanelOpen(false)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!(await showConfirm('¿Eliminar local?'))) return
    try { await localesApi.remove(id); notify('Local eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
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
          <IcoFilter /> Filtrar por app
        </div>
        <select className="filter-select" value={filterApp} onChange={e => setFilterApp(e.target.value)}>
          <option value="">Todas las apps</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>App</th>
              <th>Dirección</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 6 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 13 + i * 9) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {locales.map((l) => (
                  <tr key={l.id} className="row-clickable" onClick={() => openEdit(l)}>
                    <td className="td-primary">{l.nombre}</td>
                    <td><span className="badge badge-muted">{l.app?.nombre}</span></td>
                    <td className="td-muted">{l.direccion || '—'}</td>
                    <td className="td-muted">{l.telefono  || '—'}</td>
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
                    <td colSpan={6}>
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
        width={440}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">App *</label>
            <div className="form-input-wrap">
              <select required value={form.id_app} onChange={e => setForm({ ...form, id_app: e.target.value })}>
                <option value="">Seleccionar app...</option>
                {apps.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Nombre *</label>
            <div className="form-input-wrap">
              <input required placeholder="Sucursal Centro" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '1rem' }}>
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
            <label className="checkbox-wrap">
              <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
              <span className="checkbox-label">Activo</span>
            </label>
          </div>
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
