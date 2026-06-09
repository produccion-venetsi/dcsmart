import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { rubcatApi } from '../../api/rubcat.js'
import { metodosApi } from '../../api/metodospago.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'

function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  )
}

export default function PagoForm() {
  const { id }        = useParams()
  const navigate      = useNavigate()
  const activeLocal   = useAppStore((s) => s.activeLocal)
  const notify        = useUiStore((s) => s.notify)
  const isEditing     = Boolean(id)

  const [proveedores, setProveedores] = useState([])
  const [rubcats,     setRubcats]     = useState([])
  const [metodos,     setMetodos]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [form, setForm] = useState({
    fecha: '', id_proveedor: '', id_rubcat: '', id_tipo: '',
    importe_neto: '', descuento: '', importe: '',
    id_metodo: '', observaciones: '', pagado: false,
    estado_op: 'CAJA', ingresa_egreso: true,
    id_local: activeLocal?.id || ''
  })

  useEffect(() => {
    const ctrl = new AbortController()
    const provReq   = proveedoresApi.list({ activo: 'true', limit: 500 }, ctrl.signal)
    const rubcatReq = rubcatApi.list()
    const metReq    = metodosApi.list()
    const pagoReq   = isEditing ? pagosApi.get(id, ctrl.signal) : Promise.resolve(null)

    Promise.all([provReq, rubcatReq, metReq, pagoReq])
      .then(([{ data: provs }, { data: rubs }, { data: mets }, pagoRes]) => {
        setProveedores(provs.data)
        setRubcats(rubs)
        setMetodos(mets)
        if (pagoRes) {
          const d = pagoRes.data
          setForm({
            fecha:          d.fecha ? d.fecha.slice(0, 10) : '',
            id_proveedor:   d.id_proveedor   || '',
            id_rubcat:      d.id_rubcat      || '',
            id_tipo:        d.id_tipo        || '',
            importe_neto:   d.importe_neto   || '',
            descuento:      d.descuento      || '',
            importe:        d.importe        || '',
            id_metodo:      d.id_metodo      || '',
            observaciones:  d.observaciones  || '',
            pagado:         d.pagado,
            estado_op:      d.estado_op      || 'CAJA',
            ingresa_egreso: d.ingresa_egreso,
            id_local:       d.id_local       || '',
          })
        }
      })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar datos', 'error') })

    return () => ctrl.abort()
  }, [id])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

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
    <div className="page">
      <button className="back-link" onClick={() => navigate('/pagos')}>
        <IcoBack /> Volver a Pagos
      </button>

      <div className="page-head">
        <h1 className="page-title">{isEditing ? 'Editar Pago' : 'Nuevo Pago'}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-panel">
          <div className="form-panel-title">Información del Pago</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <div className="form-input-wrap">
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Proveedor</label>
              <div className="form-input-wrap">
                <select value={form.id_proveedor} onChange={e => set('id_proveedor', e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Rubro / Categoría</label>
              <div className="form-input-wrap">
                <select value={form.id_rubcat} onChange={e => set('id_rubcat', e.target.value)}>
                  <option value="">Sin clasificar</option>
                  {rubcats.map(rc => (
                    <option key={rc.id} value={rc.id}>
                      {rc.rubro?.nombre} / {rc.categoria?.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Método de Pago</label>
              <div className="form-input-wrap">
                <select value={form.id_metodo} onChange={e => set('id_metodo', e.target.value)}>
                  <option value="">Sin método</option>
                  {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de Comprobante</label>
              <div className="form-input-wrap">
                <select value={form.id_tipo} onChange={e => set('id_tipo', e.target.value)}>
                  <option value="">—</option>
                  {['A','B','C','CM','DC (1)','DC (2)','DDJJ','M','NCA','NDA','STK'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <div className="form-input-wrap">
                <select value={form.estado_op} onChange={e => set('estado_op', e.target.value)}>
                  {['CAJA','CUENTA CTE','MP PDP','PDP'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="form-panel">
          <div className="form-panel-title">Montos</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Importe Neto</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.importe_neto} onChange={e => set('importe_neto', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descuento</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.descuento} onChange={e => set('descuento', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Importe Total</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.importe} onChange={e => set('importe', e.target.value)} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
            <label className="checkbox-wrap">
              <input type="checkbox" checked={form.pagado} onChange={e => set('pagado', e.target.checked)} />
              <span className="checkbox-label">Pagado</span>
            </label>
            <label className="checkbox-wrap">
              <input type="checkbox" checked={form.ingresa_egreso} onChange={e => set('ingresa_egreso', e.target.checked)} />
              <span className="checkbox-label">Ingreso (desmarcar = egreso)</span>
            </label>
          </div>
        </div>

        <div className="form-panel">
          <div className="form-panel-title">Notas</div>
          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <div className="form-input-wrap form-textarea-wrap">
              <textarea rows={3} placeholder="Notas opcionales..." value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading
              ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</>
              : isEditing ? 'Actualizar Pago' : 'Crear Pago'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/pagos')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
