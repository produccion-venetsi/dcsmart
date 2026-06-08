import { useEffect, useState } from 'react'
import { appsApi } from '../../api/apps.js'
import { useUiStore } from '../../store/uiStore.js'

function IcoAppsEmpty() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 0-14.14 0M4.93 19.07a10 10 0 0 0 14.14 0M12 2v2M12 20v2M2 12h2M20 12h2"/>
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

export default function Apps() {
  const notify  = useUiStore((s) => s.notify)

  const [apps,    setApps]    = useState([])
  const [form,    setForm]    = useState({ nombre: '', slug: '', activo: true })
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const load = () => {
    setLoading(true)
    appsApi.list()
      .then(({ data }) => setApps(data))
      .catch(() => notify('Error al cargar', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) { await appsApi.update(editing, form); notify('App actualizada', 'success') }
      else         { await appsApi.create(form);          notify('App creada', 'success') }
      setForm({ nombre: '', slug: '', activo: true })
      setEditing(null)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const startEdit = (app) => {
    setEditing(app.id)
    setForm({ nombre: app.nombre, slug: app.slug, activo: app.activo })
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm({ nombre: '', slug: '', activo: true })
  }

  const handleDelete = async (id) => {
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
      </div>

      {/* Inline form */}
      <form className="form-panel" onSubmit={handleSubmit}>
        <div className="form-panel-title">
          {editing ? 'Editar App' : 'Nueva App'}
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <div className="form-input-wrap">
              <input required placeholder="Mi Empresa" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Slug *</label>
            <div className="form-input-wrap">
              <input required placeholder="mi-empresa" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label className="checkbox-wrap">
              <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
              <span className="checkbox-label">Activa</span>
            </label>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</>
              : editing ? 'Actualizar' : 'Crear App'}
          </button>
          {editing && (
            <button type="button" className="btn btn-secondary" onClick={cancelEdit}>Cancelar</button>
          )}
        </div>
      </form>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : (
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
              {apps.map((a) => (
                <tr key={a.id}>
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
                      <button className="btn btn-sm btn-secondary btn-icon" onClick={() => startEdit(a)}>
                        <IcoEdit />
                      </button>
                      <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDelete(a.id)}>
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
