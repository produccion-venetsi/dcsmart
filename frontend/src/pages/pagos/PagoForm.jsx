import { useEffect, useRef, useState } from 'react'
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
function IcoUp() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7"/>
    </svg>
  )
}
function IcoDown() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M19 12l-7 7-7-7"/>
    </svg>
  )
}
function IcoPaperclip() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  )
}

function padLeft(val, len) {
  const str = String(val ?? '').replace(/\D/g, '')
  return str ? str.padStart(len, '0') : ''
}

export default function PagoForm() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const activeApp   = useAppStore((s) => s.activeApp)
  const notify      = useUiStore((s) => s.notify)
  const isEditing   = Boolean(id)

  const locales = activeApp?.locales ?? []

  const [proveedores, setProveedores] = useState([])
  const [rubcats,     setRubcats]     = useState([])
  const [metodos,     setMetodos]     = useState([])
  const [loading,     setLoading]     = useState(false)

  // combobox de proveedor
  const [provSearch, setProvSearch] = useState('')
  const [provOpen,   setProvOpen]   = useState(false)
  const provRef = useRef(null)

  const [form, setForm] = useState({
    fecha: '', id_proveedor: '', id_rubcat: '', id_tipo: '',
    pv: '', nro: '',
    importe_neto: '', descuento: '', importe: '',
    id_metodo: '', observaciones: '',
    pagado: false, fecha_pago: '', periodo: '',
    estado_op: 'CUENTA CTE', ingresa_egreso: true,
    id_local: activeLocal?.id || ''
  })

  // cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (provRef.current && !provRef.current.contains(e.target)) setProvOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
          // pre-llenar label del combobox
          const prov = provs.data.find(p => p.id === d.id_proveedor)
          if (prov) setProvSearch(prov.nombre)
          setForm({
            fecha:          d.fecha      ? d.fecha.slice(0, 10)      : '',
            id_proveedor:   d.id_proveedor   || '',
            id_rubcat:      d.id_rubcat      || '',
            id_tipo:        d.id_tipo        || '',
            pv:             d.pv != null     ? String(d.pv)           : '',
            nro:            d.nro != null    ? String(d.nro)          : '',
            importe_neto:   d.importe_neto   || '',
            descuento:      d.descuento      || '',
            importe:        d.importe        || '',
            id_metodo:      d.id_metodo      || '',
            observaciones:  d.observaciones  || '',
            pagado:         d.pagado,
            fecha_pago:     d.fecha_pago ? d.fecha_pago.slice(0, 10) : '',
            periodo:        d.periodo    ? d.periodo.slice(0, 10)    : '',
            estado_op:      d.estado_op      || 'CUENTA CTE',
            ingresa_egreso: d.ingresa_egreso,
            id_local:       d.id_local       || '',
          })
        }
      })
      .catch(() => { if (!ctrl.signal.aborted) notify('Error al cargar datos', 'error') })

    return () => ctrl.abort()
  }, [id])

  // set con efectos encadenados
  const set = (field, value) => setForm(f => {
    const next = { ...f, [field]: value }
    if (field === 'fecha') next.periodo = value
    if (field === 'fecha_pago') next.pagado = Boolean(value)
    if (field === 'pagado' && !value) next.fecha_pago = ''
    return next
  })

  // seleccionar proveedor desde el combobox: pre-llena rubcat si el proveedor tiene uno
  const selectProveedor = (prov) => {
    setForm(f => ({
      ...f,
      id_proveedor: prov.id,
      id_rubcat: prov.id_rubcat || f.id_rubcat
    }))
    setProvSearch(prov.nombre)
    setProvOpen(false)
  }

  const clearProveedor = () => {
    setForm(f => ({ ...f, id_proveedor: '' }))
    setProvSearch('')
    setProvOpen(false)
  }

  const filteredProvs = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(provSearch.toLowerCase())
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!activeLocal && !form.id_local) {
      notify('Seleccioná un local', 'error'); return
    }
    setLoading(true)
    try {
      const payload = {
        ...form,
        pv:         form.pv  ? parseInt(form.pv,  10) : null,
        nro:        form.nro ? parseInt(form.nro, 10) : null,
        fecha_pago: form.fecha_pago || null,
        periodo:    form.periodo    || null,
        id_local:   activeLocal?.id || form.id_local || null,
      }
      if (isEditing) {
        await pagosApi.update(id, payload)
        notify('Pago actualizado', 'success')
      } else {
        await pagosApi.create(payload)
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
        {/* ── Toggle Ingreso / Egreso ── */}
        <div className="form-panel" style={{ padding: '0.875rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn ${form.ingresa_egreso ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, justifyContent: 'center', gap: 6 }}
              onClick={() => set('ingresa_egreso', true)}
            >
              <IcoUp /> Ingreso
            </button>
            <button
              type="button"
              className={`btn ${!form.ingresa_egreso ? 'btn-danger' : 'btn-secondary'}`}
              style={{ flex: 1, justifyContent: 'center', gap: 6 }}
              onClick={() => set('ingresa_egreso', false)}
            >
              <IcoDown /> Egreso
            </button>
          </div>
        </div>

        {/* ── Información del Pago ── */}
        <div className="form-panel">
          <div className="form-panel-title">Información del Pago</div>
          <div className="form-grid">

            {/* selector de local — solo cuando no hay local activo */}
            {!activeLocal && locales.length > 0 && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Local *</label>
                <div className="form-input-wrap">
                  <select required value={form.id_local} onChange={e => set('id_local', e.target.value)}>
                    <option value="">Seleccioná un local…</option>
                    {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Fecha Factura</label>
              <div className="form-input-wrap">
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Período</label>
              <div className="form-input-wrap">
                <input type="date" value={form.periodo} onChange={e => set('periodo', e.target.value)} />
              </div>
            </div>

            {/* combobox de proveedor */}
            <div className="form-group combobox-wrap" ref={provRef} style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Proveedor</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  placeholder="Buscar proveedor…"
                  value={provSearch}
                  autoComplete="off"
                  onChange={e => { setProvSearch(e.target.value); setProvOpen(true) }}
                  onFocus={() => setProvOpen(true)}
                />
                {form.id_proveedor && (
                  <button
                    type="button"
                    onClick={clearProveedor}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                    title="Quitar proveedor"
                  >×</button>
                )}
              </div>
              {provOpen && (
                <div className="combobox-dropdown">
                  {filteredProvs.length === 0
                    ? <span className="combobox-option empty">Sin resultados</span>
                    : filteredProvs.slice(0, 60).map(p => (
                      <button key={p.id} type="button" className="combobox-option" onClick={() => selectProveedor(p)}>
                        {p.nombre}
                      </button>
                    ))
                  }
                </div>
              )}
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

            {/* PV y Nro de comprobante */}
            <div className="form-group">
              <label className="form-label">Punto de Venta</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00000"
                  maxLength={5}
                  value={form.pv}
                  onChange={e => set('pv', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  onBlur={e => { if (e.target.value) set('pv', padLeft(e.target.value, 5)) }}
                  style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Nro Comprobante</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00000000"
                  maxLength={8}
                  value={form.nro}
                  onChange={e => set('nro', e.target.value.replace(/\D/g, '').slice(0, 8))}
                  onBlur={e => { if (e.target.value) set('nro', padLeft(e.target.value, 8)) }}
                  style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}
                />
              </div>
            </div>

          </div>
        </div>

        {/* ── Montos ── */}
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
            <div className="form-group">
              <label className="form-label">Fecha de Pago</label>
              <div className="form-input-wrap">
                <input type="date" value={form.fecha_pago} onChange={e => set('fecha_pago', e.target.value)} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <span className={`badge ${form.pagado ? 'badge-green' : 'badge-muted'}`} style={{ fontSize: 12 }}>
              {form.pagado ? 'Pagado' : 'Pendiente de pago'}
            </span>
          </div>
        </div>

        {/* ── Adjuntos (visual, sin carga) ── */}
        <div className="form-panel">
          <div className="form-panel-title">Adjuntos</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <IcoPaperclip /> Foto
              </label>
              <div className="form-input-wrap">
                <input type="text" disabled placeholder="Sin archivo adjunto" style={{ opacity: 0.45, cursor: 'not-allowed' }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <IcoPaperclip /> PDF
              </label>
              <div className="form-input-wrap">
                <input type="text" disabled placeholder="Sin archivo adjunto" style={{ opacity: 0.45, cursor: 'not-allowed' }} />
              </div>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: '0.5rem', marginBottom: 0 }}>
            La carga de archivos estará disponible próximamente.
          </p>
        </div>

        {/* ── Notas ── */}
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
