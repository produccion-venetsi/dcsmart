import { useEffect, useState } from 'react'
import { appsApi } from '../../api/apps.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'

function IcoAppsEmpty() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 0-14.14 0M4.93 19.07a10 10 0 0 0 14.14 0M12 2v2M12 20v2M2 12h2M20 12h2"/>
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

const EMPTY = { nombre: '', slug: '', activo: true }

export default function Apps() {
  const notify = useUiStore((s) => s.notify)

  const [apps,    setApps]    = useState([])
  const [loading, setLoading] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected,  setSelected]  = useState(null)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)

  const load = () => {
    setLoading(true)
    appsApi.list()
      .then(({ data }) => setApps(data))
      .catch(() => notify('Error al cargar', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openCreate = () => { setSelected(null); setForm(EMPTY); setPanelOpen(true) }
  const openEdit   = (a) => { setSelected(a); setForm({ nombre: a.nombre, slug: a.slug, activo: a.activo }); setPanelOpen(true) }
  const closePanel = () => { setPanelOpen(false) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (selected) { await appsApi.update(selected.id, form); notify('App actualizada', 'success') }
      else          { await appsApi.create(form);               notify('App creada', 'success') }
      setPanelOpen(false)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar app?')) return
    try { await appsApi.remove(id); notify('App eliminada', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Apps</h1>
          <p className="page-sub">Grupos de trabajo y empresas</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openCreate}><IcoPlus /> Nueva App</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Slug</th>
              <th>Estado</th>
              <th>Locales</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 5 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 17 + i * 11) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {apps.map((a) => (
                  <tr key={a.id} className="row-clickable" onClick={() => openEdit(a)}>
                    <td className="td-primary">{a.nombre}</td>
                    <td><span className="tag-mono">{a.slug}</span></td>
                    <td>
                      <span className={`badge ${a.activo ? 'badge-green' : 'badge-muted'}`}>
                        {a.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="td-muted">{a.locales?.length ?? 0} locales</td>
                    <td>
                      <div className="td-actions">
                        <button className="btn btn-sm btn-danger btn-icon" onClick={(e) => handleDelete(a.id, e)}>
                          <IcoTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {apps.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">
                        <IcoAppsEmpty />
                        <p>No hay apps registradas.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <DrawerPanel
        open={panelOpen}
        onClose={closePanel}
        title={selected ? `Editar App — ${selected.nombre}` : 'Nueva App'}
        width={420}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <div className="form-input-wrap">
              <input required placeholder="Mi Empresa" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Slug *</label>
            <div className="form-input-wrap">
              <input required placeholder="mi-empresa" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="checkbox-wrap">
              <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
              <span className="checkbox-label">Activa</span>
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : selected ? 'Actualizar' : 'Crear App'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closePanel}>Cancelar</button>
          </div>
        </form>
      </DrawerPanel>
    </div>
  )
}
