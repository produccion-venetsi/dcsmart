import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'

function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  )
}

const EMPTY = {
  nombre: '', razon_social: '', cuit: '', banco: '', cbu: '', alias: '',
  direccion_url: '', detalle_direc: '', telefono: '', mail_contacto: '',
  mail_envio: '', tag: '', cuenta: '', observaciones: '', tipo_local: '', tipo: '',
  plazo: '', activo: true
}

export default function ProveedorForm() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const notify      = useUiStore((s) => s.notify)
  const isEditing   = Boolean(id)

  const [form,    setForm]    = useState(EMPTY)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isEditing) {
      proveedoresApi.get(id)
        .then(({ data }) => setForm({ ...EMPTY, ...data }))
        .catch(() => notify('Error al cargar proveedor', 'error'))
    }
  }, [id])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

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

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/proveedores')}>
        <IcoBack /> Volver a Proveedores
      </button>

      <div className="page-head">
        <h1 className="page-title">{isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Datos principales */}
        <div className="form-panel">
          <div className="form-panel-title">Datos principales</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <div className="form-input-wrap">
                <input type="text" required placeholder="Nombre del proveedor" value={form.nombre} onChange={e => set('nombre', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Razón Social</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Razón social" value={form.razon_social} onChange={e => set('razon_social', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">CUIT</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="XX-XXXXXXXX-X" value={form.cuit} onChange={e => set('cuit', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tag</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Etiqueta" value={form.tag} onChange={e => set('tag', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Plazo de Pago <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(días)</span></label>
              <div className="form-input-wrap">
                <input type="number" min="0" step="1" placeholder="Ej: 30" value={form.plazo} onChange={e => set('plazo', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Datos bancarios */}
        <div className="form-panel">
          <div className="form-panel-title">Datos bancarios</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Banco</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Nombre del banco" value={form.banco} onChange={e => set('banco', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">CBU</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="CBU" value={form.cbu} onChange={e => set('cbu', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Alias</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Alias de transferencia" value={form.alias} onChange={e => set('alias', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cuenta</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Número de cuenta bancaria" value={form.cuenta} onChange={e => set('cuenta', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Contacto */}
        <div className="form-panel">
          <div className="form-panel-title">Contacto</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="+54 11 ..." value={form.telefono} onChange={e => set('telefono', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Email Contacto</label>
              <div className="form-input-wrap">
                <input type="email" placeholder="contacto@empresa.com" value={form.mail_contacto} onChange={e => set('mail_contacto', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Email Envío</label>
              <div className="form-input-wrap">
                <input type="email" placeholder="facturas@empresa.com" value={form.mail_envio} onChange={e => set('mail_envio', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Dirección</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Calle, número o link de Maps..." value={form.direccion_url} onChange={e => set('direccion_url', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Detalle Dirección</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Calle, número, piso..." value={form.detalle_direc} onChange={e => set('detalle_direc', e.target.value)} />
              </div>
            </div>
          </div>
          <label className="checkbox-wrap">
            <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} />
            <span className="checkbox-label">Proveedor activo</span>
          </label>
        </div>

        {/* Otros datos */}
        <div className="form-panel">
          <div className="form-panel-title">Otros datos</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Ej: PROVEEDOR" value={form.tipo} onChange={e => set('tipo', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de Local</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Ej: GASTRONOMICO" value={form.tipo_local} onChange={e => set('tipo_local', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Observaciones</label>
              <div className="form-input-wrap form-textarea-wrap">
                <textarea rows={2} placeholder="Notas opcionales..." value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading
              ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</>
              : isEditing ? 'Actualizar Proveedor' : 'Crear Proveedor'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/proveedores')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
