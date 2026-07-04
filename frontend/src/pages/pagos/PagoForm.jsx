import { useEffect, useRef, useState, useMemo } from 'react'
import { impuestosApi } from '../../api/impuestos.js'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { rubcatApi } from '../../api/rubcat.js'
import { metodosApi } from '../../api/metodospago.js'
import { localesApi } from '../../api/locales.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import AdjuntoUpload from '../../components/AdjuntoUpload.jsx'

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
function padLeft(val, len) {
  const str = String(val ?? '').replace(/\D/g, '')
  return str ? str.padStart(len, '0') : ''
}

function calcCashflow(fecha, plazo) {
  if (!fecha || !plazo) return ''
  const d = new Date(fecha + 'T00:00:00')
  d.setDate(d.getDate() + Number(plazo))
  return d.toISOString().slice(0, 10)
}

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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

export default function PagoForm() {
  const { id }          = useParams()
  const navigate        = useNavigate()
  const [searchParams]  = useSearchParams()
  const modoRapido      = searchParams.get('modo') === 'rapido'
  const activeLocal     = useAppStore((s) => s.activeLocal)
  const activeApp       = useAppStore((s) => s.activeApp)
  const notify          = useUiStore((s) => s.notify)
  const isEditing       = Boolean(id)

  const locales = activeApp?.locales ?? []

  const hoy = new Date().toISOString().slice(0, 10)

  const [proveedores,     setProveedores]     = useState([])
  const [rubcats,         setRubcats]         = useState([])
  const [metodos,         setMetodos]         = useState([])
  const [loading,         setLoading]         = useState(false)
  const [localProveedor,  setLocalProveedor]  = useState(null)
  const [fotoFile,        setFotoFile]        = useState(null)
  const [pdfFile,         setPdfFile]         = useState(null)
  const [uploadingFoto,   setUploadingFoto]   = useState(false)
  const [uploadingPdf,    setUploadingPdf]    = useState(false)

  // combobox de proveedor
  const [provSearch, setProvSearch] = useState('')
  const [provOpen,   setProvOpen]   = useState(false)
  const [provPlazo,  setProvPlazo]  = useState(null)
  const provRef = useRef(null)

  // impuestos pendientes (solo al crear)
  const [pendingImp, setPendingImp] = useState([])
  const [impForm,    setImpForm]    = useState({ tipo: 'IVA21', monto: '' })
  const TIPOS_IMP = ['IVA21', 'IVA27', 'IVA10', 'RETENCION', 'PERCEPCION']

  // multimoneda (solo al crear — un único registro por pago)
  const [mmForm,  setMmForm]  = useState({ tipo: 'USD', tdc: '', monto: '' })
  const TIPOS_MM = ['USD', 'EUR', 'BRL', 'UYU', 'BTC', 'OTRO']

  const onMmChange = (field, value) => {
    const next = { ...mmForm, [field]: value }
    setMmForm(next)
    if (next.tdc && next.monto) {
      set('importe_neto', (parseFloat(next.tdc) * parseFloat(next.monto)).toFixed(2))
    } else {
      set('importe_neto', '')
    }
  }

  const ESTADO_OP_OPTIONS = [
    { value: 'CAJA',       label: 'CAJA' },
    { value: 'CUENTA_CTE', label: 'CUENTA CTE' },
    { value: 'MP_PDP',     label: 'MP PDP' },
    { value: 'PDP',        label: 'PDP' },
  ]

  const [form, setForm] = useState(() => ({
    fecha: modoRapido ? hoy : '',
    id_proveedor: '', id_rubcat: '', id_tipo: modoRapido ? 'STK' : '',
    pv: '', nro: '',
    importe_neto: '', descuento: '', importe: '',
    id_metodo: '', cashflow: '', observaciones: '',
    pagado: modoRapido, fecha_pago: modoRapido ? hoy : '', periodo: modoRapido ? hoy : '',
    estado_op: 'CUENTA_CTE', ingresa_egreso: true,
    periodico: false,
    id_local: activeLocal?.id || '',
    foto_url: '', pdf_url: '',
  }))

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
    const localReq  = (!isEditing && modoRapido && activeLocal) ? localesApi.get(activeLocal.id) : Promise.resolve(null)

    Promise.all([provReq, rubcatReq, metReq, pagoReq, localReq])
      .then(([{ data: provs }, { data: rubs }, { data: mets }, pagoRes, localRes]) => {
        setProveedores(provs.data)
        setRubcats(rubs)
        setMetodos(mets)
        if (pagoRes) {
          const d = pagoRes.data
          const prov = provs.data.find(p => p.id === d.id_proveedor)
          if (prov) {
            setProvSearch(prov.nombre)
            setProvPlazo(prov.plazo || null)
          }
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
            cashflow:       d.cashflow   ? d.cashflow.slice(0, 10)   : '',
            observaciones:  d.observaciones  || '',
            pagado:         d.pagado,
            fecha_pago:     d.fecha_pago ? d.fecha_pago.slice(0, 10) : '',
            periodo:        d.periodo    ? d.periodo.slice(0, 10)    : '',
            estado_op:      d.estado_op      || 'CUENTA CTE',
            ingresa_egreso: d.ingresa_egreso,
            periodico:      d.periodico      ?? false,
            id_local:       d.id_local       || '',
            foto_url:       d.foto_url       || '',
            pdf_url:        d.pdf_url        || '',
          })
        } else if (localRes?.data?.id_proveedor) {
          const prov = provs.data.find(p => p.id === localRes.data.id_proveedor)
          if (prov) {
            setProvSearch(prov.nombre)
            setProvPlazo(prov.plazo || null)
            setForm(f => ({
              ...f,
              id_proveedor: prov.id,
              id_rubcat:    prov.id_rubcat || f.id_rubcat,
              cashflow:     calcCashflow(f.fecha, prov.plazo) || f.cashflow,
            }))
          }
        }
      })
      .catch(() => { if (!ctrl.signal.aborted) notify('Error al cargar datos', 'error') })

    return () => ctrl.abort()
  }, [id])

  // set con efectos encadenados
  const set = (field, value) => setForm(f => {
    const next = { ...f, [field]: value }
    if (field === 'fecha') {
      next.periodo = value
      next.cashflow = calcCashflow(value, provPlazo)
    }
    if (field === 'fecha_pago') next.pagado = Boolean(value)
    if (field === 'pagado' && !value) next.fecha_pago = ''
    return next
  })

  // seleccionar proveedor desde el combobox: pre-llena rubcat y recalcula cashflow si hay plazo
  const selectProveedor = (prov) => {
    const plazo = prov.plazo || null
    setProvPlazo(plazo)
    setForm(f => ({
      ...f,
      id_proveedor: prov.id,
      id_rubcat:    prov.id_rubcat || f.id_rubcat,
      cashflow:     calcCashflow(f.fecha, plazo) || f.cashflow
    }))
    setProvSearch(prov.nombre)
    setProvOpen(false)
  }

  const clearProveedor = () => {
    setProvPlazo(null)
    setForm(f => ({ ...f, id_proveedor: '', cashflow: '' }))
    setProvSearch('')
    setProvOpen(false)
  }

  const filteredProvs = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(provSearch.toLowerCase())
  )

  const visibleRubcats = useMemo(() => {
    if (modoRapido && form.id_tipo === 'STK') {
      return rubcats.filter(rc => rc.rubro?.nombre?.toUpperCase().startsWith('CMV'))
    }
    return rubcats
  }, [rubcats, modoRapido, form.id_tipo])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!activeLocal && !form.id_local) { notify('Seleccioná un local', 'error'); return }
    if (!form.fecha)   { notify('La fecha es obligatoria', 'error'); return }
    if (!form.importe) { notify('El importe es obligatorio', 'error'); return }
    setLoading(true)
    try {
      let foto_url = form.foto_url
      let pdf_url  = form.pdf_url

      const localId = activeLocal?.id || form.id_local
      if (fotoFile) {
        setUploadingFoto(true)
        const fd = new FormData()
        fd.append('file', fotoFile)
        const r = await pagosApi.upload(fd, localId)
        foto_url = r.data.url
        setUploadingFoto(false)
      }
      if (pdfFile) {
        setUploadingPdf(true)
        const fd = new FormData()
        fd.append('file', pdfFile)
        const r = await pagosApi.upload(fd, localId)
        pdf_url = r.data.url
        setUploadingPdf(false)
      }

      const payload = {
        ...form,
        foto_url,
        pdf_url,
        pv:         form.pv       ? parseInt(form.pv,  10) : null,
        nro:        form.nro      ? parseInt(form.nro, 10) : null,
        fecha_pago: form.fecha_pago || null,
        periodo:    form.periodo    || null,
        cashflow:   form.cashflow   || null,
        id_local:   activeLocal?.id || form.id_local || null,
      }
      if (isEditing) {
        await pagosApi.update(id, payload)
        notify('Pago actualizado', 'success')
      } else {
        const res = await pagosApi.create(payload)
        const newId = res.data?.id
        if (newId && pendingImp.length > 0) {
          await Promise.all(
            pendingImp.map(imp =>
              impuestosApi.create({ id_pago: newId, tipo: imp.tipo, monto: parseFloat(imp.monto) })
            )
          )
        }
        if (newId && mmForm.tdc && mmForm.monto) {
          await pagosApi.createMM(newId, { tipo: mmForm.tipo, tdc: parseFloat(mmForm.tdc), monto: parseFloat(mmForm.monto) })
        }
        notify('Pago creado', 'success')
      }
      navigate('/pagos')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
      setUploadingFoto(false)
      setUploadingPdf(false)
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
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: 12,
          marginBottom: '1rem',
          background: form.ingresa_egreso
            ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))'
            : 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))',
          border: `2px solid ${form.ingresa_egreso ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{
              fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em',
              color: form.ingresa_egreso ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {form.ingresa_egreso ? <><IcoUp /> INGRESO</> : <><IcoDown /> EGRESO</>}
            </span>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>
              {form.ingresa_egreso ? 'Entra plata al local' : 'Sale plata del local'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => set('ingresa_egreso', true)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 700, textAlign: 'center',
                border: form.ingresa_egreso ? '2px solid var(--green, #22c55e)' : '1px solid var(--border)',
                background: form.ingresa_egreso ? 'rgba(34,197,94,0.2)' : 'transparent',
                color: form.ingresa_egreso ? 'var(--green, #22c55e)' : 'var(--t3)',
              }}
            >
              Ingreso
            </button>
            <button
              type="button"
              onClick={() => set('ingresa_egreso', false)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 700, textAlign: 'center',
                border: !form.ingresa_egreso ? '2px solid var(--red, #ef4444)' : '1px solid var(--border)',
                background: !form.ingresa_egreso ? 'rgba(239,68,68,0.2)' : 'transparent',
                color: !form.ingresa_egreso ? 'var(--red, #ef4444)' : 'var(--t3)',
              }}
            >
              Egreso
            </button>
          </div>
        </div>

        {/* ── Información del Pago ── */}
        <div className="form-panel">
          <div className="form-panel-title">Información del Pago</div>

          {/* fila 1: local (si corresponde) + las 4 fechas juntas */}
          <div className="form-grid form-row">

            {!activeLocal && locales.length > 0 && (
              <div className="form-group">
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
              <label className="form-label">Fecha Factura *</label>
              <div className="form-input-wrap">
                <input type="date" required value={form.fecha} onChange={e => set('fecha', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Período</label>
              <div className="form-input-wrap">
                <input type="date" value={form.periodo} onChange={e => set('periodo', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cashflow</label>
              <div className="form-input-wrap">
                <input
                  type="date"
                  value={form.cashflow}
                  onChange={e => set('cashflow', e.target.value)}
                  title={provPlazo ? `Calculado: fecha + ${provPlazo} días` : 'Fecha estimada de pago'}
                />
              </div>
              {provPlazo && (
                <span style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, display: 'block' }}>
                  Plazo: {provPlazo} días
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de Pago</label>
              <div className="form-input-wrap">
                <input type="date" value={form.fecha_pago} onChange={e => set('fecha_pago', e.target.value)} />
              </div>
            </div>
          </div>

          {/* fila 2: proveedor, rubro/categoria, metodo de pago */}
          <div className="form-grid form-row">
            <div className="form-group combobox-wrap" ref={provRef} style={{ gridColumn: 'span 2' }}>
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
                    className="input-clear-btn"
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
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
                  {visibleRubcats.map(rc => (
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
          </div>

          {/* fila 3: punto de venta, nro comprobante, tipo de comprobante, estado */}
          <div className="form-grid form-row">
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
            <div className="form-group">
              <label className="form-label">Tipo de Comprobante</label>
              <div className="form-input-wrap">
                <select value={form.id_tipo} onChange={e => set('id_tipo', e.target.value)}>
                  <option value="">—</option>
                  {['A','B','C','CM','DC_1','DC_2','DDJJ','M','NCA','NDA','STK'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <div className="form-input-wrap">
                <select value={form.estado_op} onChange={e => set('estado_op', e.target.value)}>
                  {ESTADO_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

          </div>

          {/* pago periódico: suelto, en su propia card chica */}
          <label className="periodico-card">
            <input
              type="checkbox"
              checked={form.periodico}
              onChange={e => set('periodico', e.target.checked)}
            />
            <span>Pago periódico (recurrente)</span>
          </label>
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
              <label className="form-label">Importe Total *</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" required value={form.importe} onChange={e => set('importe', e.target.value)} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <span className={`badge ${form.pagado ? 'badge-green' : 'badge-muted'}`} style={{ fontSize: 12 }}>
              {form.pagado ? 'Pagado' : 'Pendiente de pago'}
            </span>
          </div>
        </div>

        {/* ── Impuestos (solo al crear) ── */}
        {!isEditing && (
          <div className="form-panel">
            <div className="form-panel-title">Impuestos</div>

            {/* Tabla de impuestos agregados */}
            {pendingImp.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <table className="data-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Monto</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingImp.map((imp, i) => (
                      <tr key={i}>
                        <td><span className="badge badge-blue">{imp.tipo}</span></td>
                        <td className="td-number">${Number(imp.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger btn-icon"
                            onClick={() => setPendingImp(prev => prev.filter((_, j) => j !== i))}
                          >
                            <IcoTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ color: 'var(--t3)', fontSize: 11 }}>Total impuestos</td>
                      <td className="td-number" style={{ fontWeight: 700, color: 'var(--gold-bright)' }}>
                        ${pendingImp.reduce((acc, i) => acc + Number(i.monto), 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Formulario para agregar un impuesto */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, flex: '0 0 140px' }}>
                <label className="form-label">Tipo</label>
                <div className="form-input-wrap">
                  <select value={impForm.tipo} onChange={e => setImpForm(f => ({ ...f, tipo: e.target.value }))}>
                    {TIPOS_IMP.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0, flex: '1 1 120px' }}>
                <label className="form-label">Monto</label>
                <div className="form-input-wrap">
                  <input
                    type="number" step="0.01" placeholder="0.00"
                    value={impForm.monto}
                    onChange={e => setImpForm(f => ({ ...f, monto: e.target.value }))}
                  />
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap' }}
                disabled={!impForm.monto}
                onClick={() => {
                  if (!impForm.monto) return
                  setPendingImp(prev => [...prev, { tipo: impForm.tipo, monto: impForm.monto }])
                  setImpForm(f => ({ ...f, monto: '' }))
                }}
              >
                <IcoPlus /> Agregar
              </button>
            </div>
          </div>
        )}

        {/* ── Multimoneda (solo al crear) ── */}
        {!isEditing && (
          <div className="form-panel">
            <div className="form-panel-title">Multimoneda</div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, flex: '0 0 80px' }}>
                <label className="form-label">Moneda</label>
                <div className="form-input-wrap">
                  <select value={mmForm.tipo} onChange={e => onMmChange('tipo', e.target.value)}>
                    {TIPOS_MM.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0, flex: '1 1 120px' }}>
                <label className="form-label">TDC</label>
                <div className="form-input-wrap">
                  <input type="number" step="0.0001" placeholder="1000.00" value={mmForm.tdc} onChange={e => onMmChange('tdc', e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0, flex: '1 1 120px' }}>
                <label className="form-label">Monto</label>
                <div className="form-input-wrap">
                  <input type="number" step="0.01" placeholder="0.00" value={mmForm.monto} onChange={e => onMmChange('monto', e.target.value)} />
                </div>
              </div>
              {mmForm.tdc && mmForm.monto && (
                <div style={{ fontSize: 12, color: 'var(--gold-bright)', fontWeight: 700, alignSelf: 'center', whiteSpace: 'nowrap' }}>
                  = ${(parseFloat(mmForm.tdc) * parseFloat(mmForm.monto)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Adjuntos ── */}
        <div className="form-panel">
          <div className="form-panel-title">Adjuntos</div>
          <div className="form-grid">
            <AdjuntoUpload
              label="Foto"
              accept="image/*"
              value={form.foto_url}
              file={fotoFile}
              onFileSelected={setFotoFile}
              onRemove={() => { set('foto_url', ''); setFotoFile(null) }}
              uploading={uploadingFoto}
            />
            <AdjuntoUpload
              label="PDF"
              accept=".pdf,application/pdf"
              value={form.pdf_url}
              file={pdfFile}
              onFileSelected={setPdfFile}
              onRemove={() => { set('pdf_url', ''); setPdfFile(null) }}
              uploading={uploadingPdf}
            />
          </div>
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
