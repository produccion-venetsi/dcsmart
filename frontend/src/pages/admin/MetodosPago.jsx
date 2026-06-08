import { useEffect, useState } from 'react'
import { metodosApi } from '../../api/metodospago.js'
import { useUiStore } from '../../store/uiStore.js'

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
function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

const EMPTY = { nombre: '', activo: true }

export default function MetodosPago() {
  const notify = useUiStore((s) => s.notify)

  const [metodos,  setMetodos]  = useState([])
  const [form,     setForm]     = useState(EMPTY)
  const [editing,  setEditing]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  const load = () => {
    setLoading(true)
    metodosApi.list()
      .then(({ data }) => setMetodos(data))
      .catch(() => notify('Error al cargar métodos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setSaving(true)
    try {
      if (editing) { await metodosApi.update(editing, form); notify('Método actualizado', 'success') }
      else         { await metodosApi.create(form);           notify('Método creado', 'success') }
      setForm(EMPTY); setEditing(null); load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const startEdit = (m) => { setEditing(m.id); setForm({ nombre: m.nombre, activo: m.activo }) }
  const cancel    = ()  => { setEditing(null); setForm(EMPTY) }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar método de pago?')) return
    try { await metodosApi.remove(id); notify('Eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Métodos de Pago</h1>
          <p className="page-sub">Formas de pago habilitadas en el sistema</p>
        </div>
      </div>

      <form className="form-panel" onSubmit={handleSubmit}>
        <div className="form-panel-title">{editing ? 'Editar Método' : 'Nuevo Método de Pago'}</div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <div className="form-input-wrap">
              <input required placeholder="Efectivo, Transferencia…" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label className="checkbox-wrap">
              <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
              <span className="checkbox-label">Activo</span>
            </label>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</>
              : editing ? 'Actualizar' : <><IcoPlus /> Crear Método</>}
          </button>
          {editing && <button type="button" className="btn btn-secondary" onClick={cancel}>Cancelar</button>}
        </div>
      </form>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {metodos.map((m) => (
                <tr key={m.id}>
                  <td className="td-mono" style={{ fontSize: 11, color: 'var(--t3)' }}>{m.id.slice(0, 8)}…</td>
                  <td className="td-primary">{m.nombre}</td>
                  <td>
                    <span className={`badge ${m.activo ? 'badge-green' : 'badge-muted'}`}>
                      {m.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="td-actions">
                      <button className="btn btn-sm btn-secondary btn-icon" onClick={() => startEdit(m)}><IcoEdit /></button>
                      <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDelete(m.id)}><IcoTrash /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {metodos.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>Sin métodos de pago</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
