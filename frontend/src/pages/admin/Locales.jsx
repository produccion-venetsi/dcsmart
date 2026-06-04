import { useEffect, useState } from 'react'
import { localesApi } from '../../api/locales.js'
import { appsApi } from '../../api/apps.js'
import { useUiStore } from '../../store/uiStore.js'

export default function Locales() {
  const notify = useUiStore((s) => s.notify)
  const [locales, setLocales] = useState([])
  const [apps, setApps] = useState([])
  const [form, setForm] = useState({ nombre: '', id_app: '', direccion: '', telefono: '', activo: true })
  const [editing, setEditing] = useState(null)
  const [filterApp, setFilterApp] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      localesApi.list(filterApp ? { id_app: filterApp } : {}),
      appsApi.list()
    ])
      .then(([l, a]) => { setLocales(l.data); setApps(a.data) })
      .catch(() => notify('Error al cargar', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [filterApp])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.id_app) { notify('Seleccioná una app', 'error'); return }
    try {
      if (editing) { await localesApi.update(editing, form); notify('Local actualizado', 'success') }
      else { await localesApi.create(form); notify('Local creado', 'success') }
      setForm({ nombre: '', id_app: '', direccion: '', telefono: '', activo: true })
      setEditing(null)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
  }

  const startEdit = (l) => { setEditing(l.id); setForm({ nombre: l.nombre, id_app: l.id_app, direccion: l.direccion || '', telefono: l.telefono || '', activo: l.activo }) }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar local?')) return
    try { await localesApi.remove(id); notify('Local eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Cargando...</div>

  return (
    <div>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Locales</h1>

      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {[['nombre','Nombre','text',true,180],['direccion','Dirección','text',false,200],['telefono','Teléfono','text',false,120]].map(([f,l,t,req,w]) => (
          <div key={f}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>{l}</label>
            <input type={t} required={req} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db', width: w }} />
          </div>
        ))}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>App</label>
          <select required value={form.id_app} onChange={(e) => setForm({ ...form, id_app: e.target.value })} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="">Seleccionar...</option>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: 2 }}>
          <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} id="local-activo" />
          <label htmlFor="local-activo" style={{ fontSize: '0.875rem' }}>Activo</label>
        </div>
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>{editing ? 'Actualizar' : 'Crear'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm({ nombre: '', id_app: '', direccion: '', telefono: '', activo: true }) }} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>}
      </form>

      <div style={{ marginBottom: '1rem' }}>
        <select value={filterApp} onChange={(e) => setFilterApp(e.target.value)} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}>
          <option value="">Todas las apps</option>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Nombre', 'App', 'Dirección', 'Teléfono', 'Activo', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locales.map((l) => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{l.nombre}</td>
                <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{l.app?.nombre}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{l.direccion || '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{l.telefono || '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: l.activo ? '#16a34a' : '#dc2626' }}>{l.activo ? '✓' : '✗'}</span></td>
                <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => startEdit(l)} style={{ padding: '0.3rem 0.6rem', background: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Editar</button>
                  <button onClick={() => handleDelete(l.id)} style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                </td>
              </tr>
            ))}
            {locales.length === 0 && <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No hay locales</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
