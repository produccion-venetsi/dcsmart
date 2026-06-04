import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'

const inputStyle = { width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }
const labelStyle = { display: 'block', marginBottom: 4, fontSize: '0.8rem', fontWeight: 500, color: '#374151' }

export default function PagoForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify = useUiStore((s) => s.notify)
  const isEditing = Boolean(id)

  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    fecha: '', id_proveedor: '', id_tipo: '',
    importe_neto: '', descuento: '', importe: '',
    id_metodo: '', observaciones: '', pagado: false,
    estado_op: 'PENDIENTE', ingresa_egreso: true,
    id_local: activeLocal?.id || ''
  })

  useEffect(() => {
    proveedoresApi.list({ activo: 'true' }).then(({ data }) => setProveedores(data)).catch(console.error)
    if (isEditing) {
      pagosApi.get(id).then(({ data }) => {
        setForm({
          fecha: data.fecha ? data.fecha.slice(0, 10) : '',
          id_proveedor: data.id_proveedor || '',
          id_tipo: data.id_tipo || '',
          importe_neto: data.importe_neto || '',
          descuento: data.descuento || '',
          importe: data.importe || '',
          id_metodo: data.id_metodo || '',
          observaciones: data.observaciones || '',
          pagado: data.pagado,
          estado_op: data.estado_op || 'PENDIENTE',
          ingresa_egreso: data.ingresa_egreso,
          id_local: data.id_local || ''
        })
      }).catch(() => notify('Error al cargar el pago', 'error'))
    }
  }, [id])

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEditing) {
        await pagosApi.update(id, form)
        notify('Pago actualizado', 'success')
      } else {
        await pagosApi.create(form)
        notify('Pago creado', 'success')
      }
      navigate('/pagos')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setLoading(false) }
  }

  return (
    <div>
      <button onClick={() => navigate('/pagos')} style={{ marginBottom: '1rem', background: 'none', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: '0.9rem' }}>
        ← Volver a Pagos
      </button>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
        {isEditing ? 'Editar Pago' : 'Nuevo Pago'}
      </h1>

      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 10, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Proveedor</label>
            <select value={form.id_proveedor} onChange={(e) => set('id_proveedor', e.target.value)} style={inputStyle}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select value={form.id_tipo} onChange={(e) => set('id_tipo', e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {['A','B','C','CM','INTERCOMPANY'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Importe Neto</label>
            <input type="number" step="0.01" value={form.importe_neto} onChange={(e) => set('importe_neto', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Descuento</label>
            <input type="number" step="0.01" value={form.descuento} onChange={(e) => set('descuento', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Importe Total</label>
            <input type="number" step="0.01" value={form.importe} onChange={(e) => set('importe', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Estado</label>
            <select value={form.estado_op} onChange={(e) => set('estado_op', e.target.value)} style={inputStyle}>
              {['PENDIENTE','APROBADO','RECHAZADO','PAGADO'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
            <input type="checkbox" checked={form.pagado} onChange={(e) => set('pagado', e.target.checked)} id="pagado" />
            <label htmlFor="pagado" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>Pagado</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
            <input type="checkbox" checked={form.ingresa_egreso} onChange={(e) => set('ingresa_egreso', e.target.checked)} id="ingresa" />
            <label htmlFor="ingresa" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>Ingreso</label>
          </div>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Observaciones</label>
          <textarea value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" disabled={loading} style={{ padding: '0.65rem 1.5rem', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear Pago'}
          </button>
          <button type="button" onClick={() => navigate('/pagos')} style={{ padding: '0.65rem 1.5rem', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
