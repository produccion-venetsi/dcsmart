import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'

const inputStyle = { width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }
const labelStyle = { display: 'block', marginBottom: 4, fontSize: '0.8rem', fontWeight: 500, color: '#374151' }

const EMPTY = {
  nombre: '', razon_social: '', cuit: '', banco: '', cbu: '', alias: '',
  direccion_url: '', detalle_direc: '', telefono: '', mail_contacto: '',
  mail_envio: '', tag: '', activo: true
}

export default function ProveedorForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const isEditing = Boolean(id)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isEditing) {
      proveedoresApi.get(id)
        .then(({ data }) => setForm({ ...EMPTY, ...data }))
        .catch(() => notify('Error al cargar proveedor', 'error'))
    }
  }, [id])

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { notify('El nombre es requerido', 'error'); return }
    setLoading(true)
    try {
      if (isEditing) {
        await proveedoresApi.update(id, form)
        notify('Proveedor actualizado', 'success')
      } else {
        await proveedoresApi.create(form)
        notify('Proveedor creado', 'success')
      }
      navigate('/proveedores')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setLoading(false) }
  }

  const fields = [
    ['nombre', 'Nombre *', 'text'], ['razon_social', 'Razón Social', 'text'],
    ['cuit', 'CUIT', 'text'], ['banco', 'Banco', 'text'],
    ['cbu', 'CBU', 'text'], ['alias', 'Alias', 'text'],
    ['telefono', 'Teléfono', 'text'], ['mail_contacto', 'Email Contacto', 'email'],
    ['mail_envio', 'Email Envío', 'email'], ['direccion_url', 'URL Dirección', 'url'],
    ['detalle_direc', 'Detalle Dirección', 'text'], ['tag', 'Tag', 'text']
  ]

  return (
    <div>
      <button onClick={() => navigate('/proveedores')} style={{ marginBottom: '1rem', background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: '0.9rem' }}>
        ← Volver a Proveedores
      </button>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
        {isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
      </h1>

      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 10, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {fields.map(([field, label, type]) => (
            <div key={field}>
              <label style={labelStyle}>{label}</label>
              <input type={type} value={form[field]} onChange={(e) => set(field, e.target.value)} required={field === 'nombre'} style={inputStyle} />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
            <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} id="activo" />
            <label htmlFor="activo" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>Activo</label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" disabled={loading} style={{ padding: '0.65rem 1.5rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear Proveedor'}
          </button>
          <button type="button" onClick={() => navigate('/proveedores')} style={{ padding: '0.65rem 1.5rem', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
