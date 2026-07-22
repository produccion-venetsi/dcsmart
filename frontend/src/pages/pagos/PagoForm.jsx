import { useEffect, useRef, useState } from 'react'
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
import Combobox from '../../components/Combobox.jsx'
import { saveDraft, loadDraft, clearDraft } from '../../lib/formDraft.js'
import { todayInputDate, nowDateTimeLocalInput, toDateTimeLocalInput, toUtcIsoFromDateTimeLocal } from '../../lib/dates.js'

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

// cashflow = fecha + plazo (días). Aritmética de día calendario en UTC para
// no depender del huso del navegador: `new Date(fecha + 'T00:00:00')` se
// interpretaba en hora local y, fuera de Argentina, corría el día resultante.
function calcCashflow(fecha, plazo) {
  if (!fecha || !plazo) return ''
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + Number(plazo))).toISOString().slice(0, 10)
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
function IcoEdit() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

export default function PagoForm() {
  const { id }          = useParams()
  const navigate        = useNavigate()
  const [searchParams]  = useSearchParams()
  const modoRapido      = searchParams.get('modo') === 'rapido'
  const tipoParam       = searchParams.get('tipo') // 'B' (Carga Avión) o 'STK' (MovStock)
  const activeLocal     = useAppStore((s) => s.activeLocal)
  const activeApp       = useAppStore((s) => s.activeApp)
  const notify          = useUiStore((s) => s.notify)
  const showConfirm     = useUiStore((s) => s.showConfirm)
  const isEditing       = Boolean(id)
  const esCargaAvion    = modoRapido && tipoParam === 'B'
  const draftKey        = `pago-draft:${id || 'nuevo'}${modoRapido ? `:${tipoParam || ''}` : ''}`
  const restoredFromDraftRef = useRef(false)
  const draftReadyRef        = useRef(false)

  const locales = activeApp?.locales ?? []

  // `hoy`/`ahoraDateTime` siempre en hora de Argentina (ver lib/dates.js) --
  // nunca usar new Date().toISOString().slice(...), que da el día/hora en
  // UTC y se corre después de las 21:00 hora Argentina.
  const hoy = todayInputDate()
  // Fecha+hora para <input type="datetime-local"> -- a diferencia de `hoy`
  // (solo fecha, usado para "Fecha factura"/"Período"), fecha_pago necesita hora
  // real para que Arqueo pueda ordenarlo correctamente contra otros arqueos del
  // mismo día (ver fix de PdpDashboard.jsx: fecha_pago a medianoche exacta hacía
  // que un gasto pagado más tarde ese día quedara "antes" de un arqueo anterior).
  const ahoraDateTime = nowDateTimeLocalInput()

  const [metodos,         setMetodos]         = useState([])
  const [loading,         setLoading]         = useState(false)
  const [localProveedor,  setLocalProveedor]  = useState(null)
  const [fotoFile,        setFotoFile]        = useState(null)
  const [pdfFile,         setPdfFile]         = useState(null)
  const [uploadingFoto,   setUploadingFoto]   = useState(false)
  const [uploadingPdf,    setUploadingPdf]    = useState(false)

  // proveedor y rubcat seleccionados (objeto completo, para mostrar su label en el Combobox)
  const [provSelected,   setProvSelected]   = useState(null)
  const [provPlazo,      setProvPlazo]      = useState(null)
  const [rubcatSelected, setRubcatSelected] = useState(null)
  const [previewNroOrd,  setPreviewNroOrd]  = useState(null)
  const [duplicado,      setDuplicado]      = useState(null)

  // impuestos pendientes (solo al crear, se mandan junto con el pago)
  const [pendingImp, setPendingImp] = useState([])
  // impuestos ya guardados del pago (solo al editar; cada cambio pega al backend al toque)
  const [savedImp,      setSavedImp]      = useState([])
  const [savingImp,     setSavingImp]     = useState(false)
  const [editingImpId,  setEditingImpId]  = useState(null)
  const [editImpForm,   setEditImpForm]   = useState({ tipo: 'IVA21', monto: '' })
  const [impForm,    setImpForm]    = useState({ tipo: 'IVA21', monto: '' })
  const TIPOS_IMP = ['IVA21', 'IVA27', 'IVA10', 'RETENCION', 'PERCEPCION', 'IMP_INTERNOS']

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
    fecha: hoy,
    id_proveedor: '', id_rubcat: '', id_tipo: modoRapido ? (tipoParam || 'STK') : '',
    pv: '', nro: '',
    importe_neto: '', descuento: '', importe: '',
    id_metodo: '', cashflow: '', observaciones: '',
    pagado: modoRapido, fecha_pago: modoRapido ? ahoraDateTime : '', periodo: modoRapido ? hoy : '',
    estado_op: 'CUENTA_CTE', ingresa_egreso: false,
    periodico: false,
    id_local: activeLocal?.id || '',
    foto_url: '', pdf_url: '',
  }))

  // Restaura un borrador guardado (si existe) antes que nada. Cubre el caso
  // de que la pestaña se haya recargado por completo mientras el usuario
  // sacaba una foto con la cámara (ver frontend/src/lib/formDraft.js).
  useEffect(() => {
    const draft = loadDraft(draftKey)
    if (draft) {
      restoredFromDraftRef.current = true
      if (draft.data.form)           setForm((f) => ({ ...f, ...draft.data.form }))
      if (draft.data.provSelected)   setProvSelected(draft.data.provSelected)
      if (draft.data.provPlazo != null) setProvPlazo(draft.data.provPlazo)
      if (draft.data.rubcatSelected) setRubcatSelected(draft.data.rubcatSelected)
      if (draft.data.pendingImp)     setPendingImp(draft.data.pendingImp)
      if (draft.data.mmForm)         setMmForm(draft.data.mmForm)
      if (draft.files.foto)          setFotoFile(draft.files.foto)
      if (draft.files.pdf)           setPdfFile(draft.files.pdf)
      notify('Se recuperó la carga que tenías sin guardar', 'info')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    const metReq   = metodosApi.list()
    const pagoReq  = isEditing ? pagosApi.get(id, ctrl.signal) : Promise.resolve(null)
    const localReq = (!isEditing && modoRapido && activeLocal) ? localesApi.get(activeLocal.id) : Promise.resolve(null)

    Promise.all([metReq, pagoReq, localReq])
      .then(async ([{ data: mets }, pagoRes, localRes]) => {
        setMetodos(mets)
        draftReadyRef.current = true
        if (restoredFromDraftRef.current) {
          // Ya se restauró el formulario desde el borrador: no lo pisamos con
          // lo que vino del servidor, salvo el historial de impuestos guardados.
          if (pagoRes) setSavedImp(pagoRes.data.impuestos || [])
          return
        }
        if (!isEditing && modoRapido) {
          const efectivo = mets.find((m) => m.nombre === 'Efectivo')
          if (efectivo) setForm((f) => ({ ...f, id_metodo: f.id_metodo || efectivo.id }))
        }
        if (pagoRes) {
          const d = pagoRes.data
          if (d.id_proveedor && d.proveedor) {
            setProvSelected(d.proveedor)
            setProvPlazo(d.proveedor.plazo || null)
          }
          if (d.id_rubcat && d.rubcat) {
            setRubcatSelected(d.rubcat)
          }
          setSavedImp(d.impuestos || [])
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
            fecha_pago:     toDateTimeLocalInput(d.fecha_pago),
            periodo:        d.periodo    ? d.periodo.slice(0, 10)    : '',
            estado_op:      d.estado_op      || 'CUENTA CTE',
            ingresa_egreso: d.ingresa_egreso,
            periodico:      d.periodico      ?? false,
            id_local:       d.id_local       || '',
            foto_url:       d.foto_url       || '',
            pdf_url:        d.pdf_url        || '',
            nro_ord:        d.nro_ord        ?? null,
          })
        } else if (localRes?.data?.id_proveedor) {
          const { data: prov } = await proveedoresApi.get(localRes.data.id_proveedor, ctrl.signal)
          setProvSelected(prov)
          setProvPlazo(prov.plazo || null)
          if (prov.rubcat) setRubcatSelected(prov.rubcat)
          setForm(f => ({
            ...f,
            id_proveedor: prov.id,
            id_rubcat:    prov.id_rubcat || f.id_rubcat,
            cashflow:     calcCashflow(f.fecha, prov.plazo) || f.cashflow,
          }))
        }
      })
      .catch(() => { if (!ctrl.signal.aborted) { draftReadyRef.current = true; notify('Error al cargar datos', 'error') } })

    return () => ctrl.abort()
  }, [id])

  // Guarda un borrador (debounced) cada vez que cambia el formulario o los
  // archivos adjuntos, para poder recuperarlo si la pestaña se recarga (ver
  // el efecto de restauración más arriba y frontend/src/lib/formDraft.js).
  useEffect(() => {
    if (!draftReadyRef.current) return // todavía no terminó de cargar/restaurar: no pisar con datos a medio inicializar
    const t = setTimeout(() => {
      saveDraft(
        draftKey,
        { form, provSelected, provPlazo, rubcatSelected, pendingImp, mmForm },
        { foto: fotoFile, pdf: pdfFile }
      )
    }, 400)
    return () => clearTimeout(t)
  }, [draftKey, form, provSelected, provPlazo, rubcatSelected, pendingImp, mmForm, fotoFile, pdfFile])

  // preview del próximo número de OP (solo al crear; en edición se muestra form.nro_ord real)
  useEffect(() => {
    if (isEditing) return
    const localId = activeLocal?.id || form.id_local
    if (!localId) { setPreviewNroOrd(null); return }
    const ctrl = new AbortController()
    pagosApi.nextNroOrd(localId, ctrl.signal)
      .then(({ data }) => setPreviewNroOrd(data.nro_ord))
      .catch(() => { if (!ctrl.signal.aborted) setPreviewNroOrd(null) })
    return () => ctrl.abort()
  }, [isEditing, activeLocal?.id, form.id_local])

  // Chequeo advisory (no bloqueante) de factura duplicada: mismo proveedor +
  // punto de venta + nro de comprobante en el mismo local. No aplica a Carga
  // Avión (esos campos son opcionales ahí, ver esCargaAvion más arriba).
  useEffect(() => {
    setDuplicado(null)
    if (esCargaAvion) return
    const localId = activeLocal?.id || form.id_local
    if (!localId || !form.id_proveedor || !form.pv || !form.nro) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      pagosApi.checkDuplicado({
        id_local: localId, id_proveedor: form.id_proveedor, pv: form.pv, nro: form.nro,
        ...(isEditing ? { exclude_id: id } : {})
      }, ctrl.signal)
        .then(({ data }) => { if (data.duplicado) setDuplicado(data.pago) })
        .catch(() => {})
    }, 500)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [esCargaAvion, activeLocal?.id, form.id_local, form.id_proveedor, form.pv, form.nro, isEditing, id])

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

  // El importe total es Neto + Impuestos − Descuento; nunca se edita a mano.
  const impuestosSum = isEditing
    ? savedImp.reduce((acc, i) => acc + Number(i.monto || 0), 0)
    : pendingImp.reduce((acc, i) => acc + Number(i.monto || 0), 0)
  useEffect(() => {
    const neto = parseFloat(form.importe_neto) || 0
    const descuento = parseFloat(form.descuento) || 0
    if (!form.importe_neto && !impuestosSum && !descuento) { set('importe', ''); return }
    const total = neto + impuestosSum - descuento
    set('importe', total.toFixed(2))
  }, [form.importe_neto, form.descuento, impuestosSum])

  // seleccionar proveedor desde el combobox: pre-llena rubcat y recalcula cashflow si hay plazo
  const selectProveedor = (prov) => {
    const plazo = prov.plazo || null
    setProvPlazo(plazo)
    setProvSelected(prov)
    if (prov.rubcat) setRubcatSelected(prov.rubcat)
    setForm(f => ({
      ...f,
      id_proveedor: prov.id,
      id_rubcat:    prov.id_rubcat || f.id_rubcat,
      cashflow:     calcCashflow(f.fecha, plazo) || f.cashflow
    }))
  }

  const clearProveedor = () => {
    setProvPlazo(null)
    setProvSelected(null)
    setForm(f => ({ ...f, id_proveedor: '', cashflow: '' }))
  }

  const fetchProveedores = (search) =>
    proveedoresApi.list({ search, activo: 'true', limit: 60 }).then(r => r.data.data)

  const fetchRubcats = (search) =>
    rubcatApi.list({ search }).then(r => {
      const data = r.data
      if (modoRapido && form.id_tipo === 'STK') {
        return data.filter(rc => rc.rubro?.nombre?.toUpperCase().startsWith('CMV'))
      }
      return data
    })

  // impuestos guardados (edición): cada acción pega directo al backend y
  // recarga la lista, que a su vez dispara el recálculo del importe total.
  const handleAddSavedImp = async () => {
    if (!impForm.monto) return
    setSavingImp(true)
    try {
      await impuestosApi.create({ id_pago: id, tipo: impForm.tipo, monto: parseFloat(impForm.monto) })
      const { data } = await impuestosApi.list({ id_pago: id, limit: 100 })
      setSavedImp(data.data || data)
      setImpForm(f => ({ ...f, monto: '' }))
      notify('Impuesto agregado', 'success')
    } catch (err) { notify(err.response?.data?.error || 'Error al agregar el impuesto', 'error') }
    finally { setSavingImp(false) }
  }

  const handleEditSavedImp = (imp) => {
    setEditingImpId(imp.id)
    setEditImpForm({ tipo: imp.tipo, monto: String(imp.monto) })
  }

  const handleSaveSavedImp = async (impId) => {
    if (!editImpForm.monto) return
    try {
      await impuestosApi.update(impId, { tipo: editImpForm.tipo, monto: parseFloat(editImpForm.monto) })
      setSavedImp(prev => prev.map(i => i.id === impId ? { ...i, tipo: editImpForm.tipo, monto: editImpForm.monto } : i))
      setEditingImpId(null)
      notify('Impuesto actualizado', 'success')
    } catch (err) { notify(err.response?.data?.error || 'Error al actualizar el impuesto', 'error') }
  }

  const handleDeleteSavedImp = async (impId) => {
    if (!(await showConfirm('¿Eliminar este impuesto?'))) return
    try {
      await impuestosApi.remove(impId)
      setSavedImp(prev => prev.filter(i => i.id !== impId))
      notify('Impuesto eliminado', 'success')
    } catch (err) { notify(err.response?.data?.error || 'Error al eliminar el impuesto', 'error') }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!activeLocal && !form.id_local) { notify('Seleccioná un local', 'error'); return }
    if (!form.fecha)     { notify('La fecha es obligatoria', 'error'); return }
    if (!form.id_rubcat) { notify('El rubro / categoría es obligatorio', 'error'); return }
    if (!form.id_metodo) { notify('El método de pago es obligatorio', 'error'); return }
    // Carga Avión suele cargar tickets manuscritos de los locales, sin punto de
    // venta ni número de comprobante fiscal real: exigirlos llevaba a que se
    // inventaran números para poder guardar. Para este modo quedan opcionales.
    if (!esCargaAvion && !form.pv)  { notify('El punto de venta es obligatorio', 'error'); return }
    if (!esCargaAvion && !form.nro) { notify('El número de comprobante es obligatorio', 'error'); return }
    if (!form.cashflow)   { notify('El cashflow es obligatorio', 'error'); return }
    if (!form.importe)   { notify('Ingresá el importe neto (o un impuesto) para calcular el total', 'error'); return }
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
        fecha_pago: toUtcIsoFromDateTimeLocal(form.fecha_pago),
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
      clearDraft(draftKey)
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
          <div style={{ marginBottom: '0.75rem', fontSize: 13, color: 'var(--t3)' }}>
            {isEditing
              ? (form.nro_ord != null && <>N° OP: <strong style={{ color: 'var(--t1)' }}>{form.nro_ord}</strong></>)
              : (previewNroOrd != null && (
                <>
                  N° OP a asignar: <strong style={{ color: 'var(--t1)' }}>{previewNroOrd}</strong>
                  {' '}<span title="El número final se confirma al guardar; puede variar si se crea otro pago en el mismo local antes de guardar este.">(previsualización)</span>
                </>
              ))
            }
          </div>

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
              <label className="form-label">Cashflow *</label>
              <div className="form-input-wrap">
                <input
                  type="date"
                  required
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
                <input type="datetime-local" value={form.fecha_pago} onChange={e => set('fecha_pago', e.target.value)} />
              </div>
            </div>
          </div>

          {/* fila 2: proveedor, rubro/categoria, metodo de pago */}
          <div className="form-grid form-row">
            <div className="form-group form-span-2">
              <label className="form-label">Proveedor</label>
              <Combobox
                value={form.id_proveedor}
                displayValue={provSelected?.nombre || ''}
                getKey={p => p.id}
                getLabel={p => p.nombre}
                onSelect={selectProveedor}
                onClear={clearProveedor}
                fetchItems={fetchProveedores}
                placeholder="Buscar proveedor…"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Rubro / Categoría *</label>
              <Combobox
                value={form.id_rubcat}
                displayValue={rubcatSelected ? `${rubcatSelected.rubro?.nombre} / ${rubcatSelected.categoria?.nombre}` : ''}
                getKey={rc => rc.id}
                getLabel={rc => `${rc.rubro?.nombre} / ${rc.categoria?.nombre}`}
                onSelect={rc => { setRubcatSelected(rc); set('id_rubcat', rc.id) }}
                onClear={() => { setRubcatSelected(null); set('id_rubcat', '') }}
                fetchItems={fetchRubcats}
                placeholder="Buscar rubro / categoría…"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Método de Pago *</label>
              <div className="form-input-wrap">
                <select required value={form.id_metodo} onChange={e => set('id_metodo', e.target.value)}>
                  <option value="">Seleccioná un método…</option>
                  {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          {duplicado && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.9rem',
              marginBottom: '0.9rem', borderRadius: 8,
              background: 'rgba(212,149,42,.12)', border: '1px solid rgba(212,149,42,.35)',
              color: 'var(--gold-bright)', fontSize: 12.5,
            }}>
              ⚠ Ya existe la <strong>OP-{duplicado.nro_ord ?? '—'}</strong> con este proveedor, punto de venta y número de comprobante
              {duplicado.fecha ? ` (cargada el ${new Date(duplicado.fecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })})` : ''}. Podés continuar si es correcto.
            </div>
          )}

          {/* fila 3: punto de venta, nro comprobante, tipo de comprobante, estado */}
          <div className="form-grid form-row">
            <div className="form-group">
              <label className="form-label">Punto de Venta{esCargaAvion ? '' : ' *'}</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  required={!esCargaAvion}
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
              <label className="form-label">Nro Comprobante{esCargaAvion ? '' : ' *'}</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  required={!esCargaAvion}
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
                  {['A','B','C','CM','DC_1','DC_2','DDJJ','FF','LF','M','NCA','NCB','NDA','ND','STK','X'].map(t => <option key={t} value={t}>{t}</option>)}
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
              <label className="form-label" title="Se calcula solo: Neto + Impuestos − Descuento">Importe Total</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.importe} disabled readOnly style={{ opacity: 0.75 }} />
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
            El importe total se calcula automáticamente (Neto + Impuestos − Descuento).
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <span className={`badge ${form.pagado ? 'badge-green' : 'badge-muted'}`} style={{ fontSize: 12 }}>
              {form.pagado ? 'Pagado' : 'Pendiente de pago'}
            </span>
          </div>
        </div>

        {/* ── Impuestos ── */}
        <div className="form-panel">
          <div className="form-panel-title">Impuestos</div>

          {/* Tabla de impuestos: al crear son locales (se mandan junto al pago),
              al editar cada cambio pega directo al backend. */}
          {isEditing ? (
            savedImp.length > 0 && (
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
                    {savedImp.map((imp) => (
                      <tr key={imp.id}>
                        {editingImpId === imp.id ? (
                          <>
                            <td>
                              <select className="filter-select" style={{ width: '100%' }} value={editImpForm.tipo} onChange={e => setEditImpForm(f => ({ ...f, tipo: e.target.value }))}>
                                {TIPOS_IMP.map(t => <option key={t}>{t}</option>)}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number" step="0.01" style={{ maxWidth: 110 }}
                                value={editImpForm.monto}
                                onChange={e => setEditImpForm(f => ({ ...f, monto: e.target.value }))}
                              />
                            </td>
                            <td style={{ display: 'flex', gap: 4 }}>
                              <button type="button" className="btn btn-sm btn-primary" onClick={() => handleSaveSavedImp(imp.id)}>Guardar</button>
                              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingImpId(null)}>Cancelar</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td><span className="badge badge-blue">{imp.tipo}</span></td>
                            <td className="td-number">${Number(imp.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                            <td style={{ display: 'flex', gap: 4 }}>
                              <button type="button" className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditSavedImp(imp)}>
                                <IcoEdit />
                              </button>
                              <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteSavedImp(imp.id)}>
                                <IcoTrash />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    <tr>
                      <td style={{ color: 'var(--t3)', fontSize: 11 }}>Total impuestos</td>
                      <td className="td-number" style={{ fontWeight: 700, color: 'var(--gold-bright)' }}>
                        ${impuestosSum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          ) : (
            pendingImp.length > 0 && (
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
            )
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
              disabled={!impForm.monto || savingImp}
              onClick={() => {
                if (isEditing) { handleAddSavedImp(); return }
                if (!impForm.monto) return
                setPendingImp(prev => [...prev, { tipo: impForm.tipo, monto: impForm.monto }])
                setImpForm(f => ({ ...f, monto: '' }))
              }}
            >
              {savingImp ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <IcoPlus />} Agregar
            </button>
          </div>
        </div>

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
