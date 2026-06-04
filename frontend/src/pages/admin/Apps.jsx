import { useEffect, useState } from 'react'
import { appsApi } from '../../api/apps.js'
import { useUiStore } from '../../store/uiStore.js'

export default function Apps() {
  const notify = useUiStore((s) => s.notify)
  const [apps, setApps] = useState([])
  const [form, setForm] = useState({ nombre: '', slug: '', activo: true })
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    appsApi.list().then(({ data }) => setApps(data)).catch(() => notify('Error al cargar', 'error')).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editing) { await appsApi.update(editing, form); notify('App actualizada', 'success') }
      else { await appsApi.create(form); notify('App creada', 'success') }
      setForm({ nombre: '', slug: '', activo: true })
      setEditing(null)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
  }

  const startEdit = (app) => { setEditing(app.id); setForm({ nombre: app.nombre, slug: app.slug, activo: app.activo }) }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar app?')) return
    try { await appsApi.remove(id); notify('App eliminada', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Cargando...</div>

  return (
    <div>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Apps</h1>

      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Nombre</label>
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db', width: 180 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Slug</label>
          <input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db', width: 140 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: 2 }}>
          <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} id="app-activo" />
          <label htmlFor="app-activo" style={{ fontSize: '0.875rem' }}>Activo</label>
        </div>
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>{editing ? 'Actualizar' : 'Crear'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm({ nombre: '', slug: '', activo: true }) }} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>}
      </form>

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Nombre', 'Slug', 'Activo', 'Locales', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{a.nombre}</td>
                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#64748b' }}>{a.slug}</td>
                <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: a.activo ? '#16a34a' : '#dc2626' }}>{a.activo ? '✓' : '✗'}</span></td>
                <td style={{ padding: '0.75rem 1rem' }}>{a.locales?.length ?? 0}</td>
                <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => startEdit(a)} style={{ padding: '0.3rem 0.6rem', background: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Editar</button>
                  <button onClick={() => handleDelete(a.id)} style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                </td>
              </tr>
            ))}
            {apps.length === 0 && <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No hay apps</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
