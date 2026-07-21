import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { impuestosApi } from '../../api/impuestos.js'
import { rubrosApi, categoriasApi, rubcatApi } from '../../api/rubcat.js'
import { metodosApi } from '../../api/metodospago.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import FotoViewer from '../../components/FotoViewer.jsx'
import ActionsMenu from '../../components/ActionsMenu.jsx'
import { downloadCsv } from '../../lib/csv.js'
import { todayInputDate, nowDateTimeLocalInput, toUtcIsoFromDateTimeLocal, fmtDateArg, fmtDateTimeArg } from '../../lib/dates.js'

const TIPO_BADGE = {
  A: 'badge-blue', B: 'badge-green', C: 'badge-muted', CM: 'badge-amber',
  'DC (1)': 'badge-purple', 'DC (2)': 'badge-purple',
  DC_1: 'badge-purple', DC_2: 'badge-purple',
  DDJJ: 'badge-red', FF: 'badge-purple', LF: 'badge-blue', M: 'badge-muted', NCA: 'badge-amber',
  NCB: 'badge-amber', NDA: 'badge-amber', ND: 'badge-amber', STK: 'badge-blue', X: 'badge-muted',
}
const ESTADO_BADGE = {
  CAJA: 'badge-muted', CUENTA_CTE: 'badge-amber', MP_PDP: 'badge-blue', PDP: 'badge-green',
}
const ESTADO_OP_LABEL = {
  CAJA: 'CAJA', CUENTA_CTE: 'CUENTA CTE', MP_PDP: 'MP PDP', PDP: 'PDP',
}
const ESTADO_OP_OPTIONS = [
  { value: 'CAJA',       label: 'CAJA' },
  { value: 'CUENTA_CTE', label: 'CUENTA CTE' },
  { value: 'MP_PDP',     label: 'MP PDP' },
  { value: 'PDP',        label: 'PDP' },
]
const TIPO_PAGO_OPTIONS = [
  'A','B','C','CM','DC_1','DC_2','DDJJ','FF','LF','M','NCA','NCB','NDA','ND','STK','X'
]
const CAMPO_FECHA_OPTIONS = [
  { value: 'fecha',      label: 'Fecha' },
  { value: 'fecha_pago', label: 'Fecha de Pago' },
  { value: 'cashflow',   label: 'Cashflow' },
  { value: 'periodo',    label: 'Período' },
]
const TIPOS_IMP = ['IVA21', 'IVA27', 'IVA10', 'RETENCION', 'PERCEPCION', 'IMP_INTERNOS']

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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
function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    </svg>
  )
}
function IcoFilter() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}
function IcoCheckSquare() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}
function IcoPagoEmpty() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
function IcoPlane() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}
function IcoBox() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
    </svg>
  )
}
function IcoDownload() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}
function IcoDollar() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  )
}
function IcoRepeat() {
  return (
    <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}
function IcoThumbUp() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 11v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z"/>
      <path d="M7 11l4-8a2 2 0 0 1 2 2v5h5.5a2 2 0 0 1 1.94 2.5l-1.5 6A2 2 0 0 1 16.97 21H7"/>
    </svg>
  )
}
function IcoEye() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function IcoArrowUp() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
    </svg>
  )
}
function IcoArrowDown() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
    </svg>
  )
}

function fmt$(n)     { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }
function fmtDate(d)  { return d ? new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—' }
function fmtMonth(d) { return d ? new Date(d).toLocaleDateString('es-AR', { year: 'numeric', month: 'short', timeZone: 'UTC' }) : '—' }
function fmtPV(v)    { return v != null ? String(v).padStart(5, '0') : '—' }
function fmtNro(v)   { return v != null ? String(v).padStart(8, '0') : '—' }

// Mismas columnas que se ven en la tabla; los montos van como número plano
// (sin "$" ni separador de miles) para que Excel/Sheets los reconozca como
// numéricos al importar el CSV, en vez de como texto.
const PAGO_CSV_COLUMNS = [
  { label: 'OP',          get: (p) => p.nro_ord != null ? `OP-${p.nro_ord}` : '' },
  { label: 'Auditado',    get: (p) => p.audit ? 'Sí' : 'No' },
  { label: 'Fecha',       get: (p) => p.fecha ? fmtDate(p.fecha) : '' },
  { label: 'Proveedor',   get: (p) => p.proveedor?.nombre || '' },
  { label: 'Rubro',       get: (p) => p.rubcat?.rubro?.nombre || '' },
  { label: 'Categoría',   get: (p) => p.rubcat?.categoria?.nombre || '' },
  { label: 'Tipo',        get: (p) => p.id_tipo || '' },
  { label: 'PV',          get: (p) => p.pv != null ? fmtPV(p.pv) : '' },
  { label: 'Nro',         get: (p) => p.nro != null ? fmtNro(p.nro) : '' },
  { label: 'Neto',        get: (p) => p.importe_neto ?? '' },
  { label: 'Importe',     get: (p) => p.importe ?? '' },
  { label: 'Método',      get: (p) => p.metodo_pago?.nombre || '' },
  { label: 'Cashflow',    get: (p) => p.cashflow ? fmtDate(p.cashflow) : '' },
  { label: 'Dirección',   get: (p) => p.ingresa_egreso == null ? '' : (p.ingresa_egreso ? 'Ingreso' : 'Egreso') },
  { label: 'Estado',      get: (p) => ESTADO_OP_LABEL[p.estado_op] ?? p.estado_op ?? '' },
  { label: 'Pagado',      get: (p) => p.pagado ? 'Sí' : 'No' },
  { label: 'Fecha Pago',  get: (p) => p.fecha_pago ? fmtDate(p.fecha_pago) : '' },
  { label: 'Período',     get: (p) => p.periodo ? fmtMonth(p.periodo) : '' },
  { label: 'Local',       get: (p) => p.local?.nombre || '' },
  { label: 'Observaciones', get: (p) => p.observaciones || '' },
]

function PagoDetailPanel({ pago, navigate, onDelete, onAudit, onPatch, metodos = [], canEdit = false, canDelete = false, canAuditDc = false }) {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)
  const [impuestos,    setImpuestos]    = useState([])
  const [loadingImp,   setLoadingImp]   = useState(true)
  const [impForm,      setImpForm]      = useState({ tipo: 'IVA21', monto: '' })
  const [savingImp,    setSavingImp]    = useState(false)
  const [addingImp,    setAddingImp]    = useState(false)
  const [editingImpId, setEditingImpId] = useState(null)
  const [editImpForm,  setEditImpForm]  = useState({ tipo: 'IVA21', monto: '' })
  const [audited,      setAudited]      = useState(pago.audit)
  const [auditando,    setAuditando]    = useState(false)
  const [auditedDc,    setAuditedDc]    = useState(pago.audit_dc)
  const [auditandoDc,  setAuditandoDc]  = useState(false)
  const [auditHistory, setAuditHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [periodico,   setPeriodico]   = useState(pago.periodico ?? false)
  const [toggling,    setToggling]    = useState(false)
  const [multimoneda, setMultimoneda] = useState([])
  const [loadingMM,   setLoadingMM]   = useState(true)
  const [mmForm,      setMmForm]      = useState({ tipo: 'USD', tdc: '', monto: '' })
  const [savingMM,    setSavingMM]    = useState(false)
  const [addingMM,    setAddingMM]    = useState(false)
  const [pagarOpen,   setPagarOpen]   = useState(false)
  // fecha_pago con hora real (no solo el día) -- el arqueo compara fecha_pago
  // como un instante exacto contra su propio corte de hora, así que un
  // "pagado hoy" a medianoche (sin hora real) puede caer del lado
  // equivocado del arqueo. Ver frontend/src/lib/dates.js.
  const [pagarForm,   setPagarForm]   = useState({ fecha_pago: nowDateTimeLocalInput(), id_metodo: '' })
  const [pagando,     setPagando]     = useState(false)
  const [mandando,    setMandando]    = useState(false)

  const loadImpuestos = () => {
    setLoadingImp(true)
    impuestosApi.list({ id_pago: pago.id, limit: 100 })
      .then(({ data }) => setImpuestos(data.data || data))
      .catch(() => notify('Error al cargar impuestos', 'error'))
      .finally(() => setLoadingImp(false))
  }

  // El importe total es Neto + Impuestos − Descuento; se recalcula solo
  // cada vez que cambia algún impuesto del pago (igual que con multimoneda/neto).
  const recalcImporte = async (impuestosList) => {
    const suma = impuestosList.reduce((acc, imp) => acc + Number(imp.monto), 0)
    const total = Number(pago.importe_neto ?? 0) + suma - Number(pago.descuento ?? 0)
    await pagosApi.update(pago.id, { importe: total })
    onPatch?.(pago.id, { importe: total })
  }

  const reloadImpuestosAndTotal = async () => {
    setLoadingImp(true)
    try {
      const { data } = await impuestosApi.list({ id_pago: pago.id, limit: 100 })
      const list = data.data || data
      setImpuestos(list)
      await recalcImporte(list)
    } catch { notify('Error al recalcular el total', 'error') }
    finally { setLoadingImp(false) }
  }

  const loadMM = () => {
    setLoadingMM(true)
    pagosApi.listMM(pago.id)
      .then(({ data }) => setMultimoneda(data))
      .catch(() => {})
      .finally(() => setLoadingMM(false))
  }

  const loadAuditHistory = () => {
    setLoadingHistory(true)
    pagosApi.auditHistory(pago.id)
      .then(({ data }) => setAuditHistory(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => { if (pago) { loadImpuestos(); loadMM(); loadAuditHistory() } }, [pago?.id])

  const handleTogglePeriodico = async () => {
    setToggling(true)
    try {
      const { data } = await pagosApi.periodico(pago.id)
      setPeriodico(data.periodico)
      onPatch?.(pago.id, { periodico: data.periodico })
      notify(data.periodico ? 'Marcado como periódico' : 'Periódico desactivado', 'success')
    } catch { notify('Error', 'error') }
    finally { setToggling(false) }
  }

  const handleMandarPdp = async () => {
    if (!(await showConfirm('¿Mandar esta orden a PDP?'))) return
    setMandando(true)
    try {
      await pagosApi.mandarPdp([pago.id])
      notify('Orden enviada a PDP', 'success')
      onPatch?.(pago.id, { estado_op: 'PDP' })
    } catch { notify('Error al mandar a PDP', 'error') }
    finally { setMandando(false) }
  }

  const handleRevertirPdp = async () => {
    if (!(await showConfirm('¿Revertir esta orden a deuda (Cuenta Corriente)?'))) return
    setMandando(true)
    try {
      await pagosApi.revertirPdp([pago.id])
      notify('Orden revertida a Cuenta Corriente', 'success')
      onPatch?.(pago.id, { estado_op: 'CUENTA_CTE', pagado: false, fecha_pago: null, id_metodo: null })
    } catch { notify('Error al revertir', 'error') }
    finally { setMandando(false) }
  }

  const handlePagar = async (e) => {
    e.preventDefault()
    if (!pagarForm.id_metodo) return notify('Seleccioná un método de pago', 'error')
    setPagando(true)
    try {
      const fechaPagoIso = toUtcIsoFromDateTimeLocal(pagarForm.fecha_pago)
      await pagosApi.pagar([pago.id], { fecha_pago: fechaPagoIso, id_metodo: pagarForm.id_metodo })
      notify('Pago registrado', 'success')
      setPagarOpen(false)
      onPatch?.(pago.id, { pagado: true, fecha_pago: fechaPagoIso, id_metodo: pagarForm.id_metodo })
    } catch { notify('Error al pagar', 'error') }
    finally { setPagando(false) }
  }

  const recalcNeto = async (updatedList) => {
    const neto = updatedList.reduce((acc, m) => acc + parseFloat(m.tdc) * parseFloat(m.monto), 0)
    const nuevoNeto = neto > 0 ? neto : null
    const suma = impuestos.reduce((acc, imp) => acc + Number(imp.monto), 0)
    const total = Number(nuevoNeto ?? 0) + suma - Number(pago.descuento ?? 0)
    await pagosApi.update(pago.id, { importe_neto: nuevoNeto, importe: total })
    onPatch?.(pago.id, { importe_neto: nuevoNeto, importe: total })
  }

  const handleAddMM = async (e) => {
    e.preventDefault()
    if (!mmForm.tdc || !mmForm.monto) return
    setSavingMM(true)
    try {
      const { data: newMM } = await pagosApi.createMM(pago.id, { tipo: mmForm.tipo, tdc: parseFloat(mmForm.tdc), monto: parseFloat(mmForm.monto) })
      const updatedList = [...multimoneda, newMM]
      setMultimoneda(updatedList)
      await recalcNeto(updatedList)
      notify('Registro multimoneda agregado', 'success')
      setMmForm({ tipo: 'USD', tdc: '', monto: '' })
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSavingMM(false) }
  }

  const handleDeleteMM = async (mmId) => {
    if (!(await showConfirm('¿Eliminar registro?'))) return
    try {
      await pagosApi.deleteMM(pago.id, mmId)
      const updatedList = multimoneda.filter(m => m.id !== mmId)
      setMultimoneda(updatedList)
      await recalcNeto(updatedList)
      setAddingMM(false)
      notify('Eliminado', 'success')
    } catch { notify('Error', 'error') }
  }

  const handlePanelAudit = async () => {
    let observaciones
    if (audited) {
      observaciones = await showPrompt(
        'Esta orden ya está auditada. ¿Querés desauditarla? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditando(true)
    try {
      const { data } = await pagosApi.audit(pago.id, audited ? { observaciones } : undefined)
      setAudited(data.audit)
      notify(data.audit ? 'Pago auditado' : 'Auditoría revertida', 'success')
      onAudit?.(pago.id, data.audit)
      loadAuditHistory()
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }

  const handlePanelAuditDc = async () => {
    let observaciones
    if (auditedDc) {
      observaciones = await showPrompt(
        'Esta orden ya tiene audit DC. ¿Querés revertirlo? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditandoDc(true)
    try {
      const { data } = await pagosApi.auditDc(pago.id, auditedDc ? { observaciones } : undefined)
      setAuditedDc(data.audit_dc)
      setAudited(data.audit)
      notify(data.audit_dc ? 'Audit DC aplicado' : 'Audit DC revertido', 'success')
      onAudit?.(pago.id, data.audit)
      loadAuditHistory()
    } catch { notify('Error al auditar (DC)', 'error') }
    finally { setAuditandoDc(false) }
  }

  const handleAddImp = async (e) => {
    e.preventDefault()
    if (!impForm.monto) return
    setSavingImp(true)
    try {
      await impuestosApi.create({ id_pago: pago.id, tipo: impForm.tipo, monto: parseFloat(impForm.monto) })
      notify('Impuesto agregado', 'success')
      setImpForm({ tipo: 'IVA21', monto: '' })
      setAddingImp(false)
      await reloadImpuestosAndTotal()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSavingImp(false) }
  }

  const handleDeleteImp = async (id) => {
    if (!(await showConfirm('¿Eliminar impuesto?'))) return
    try { await impuestosApi.remove(id); notify('Eliminado', 'success'); await reloadImpuestosAndTotal() }
    catch { notify('Error al eliminar', 'error') }
  }

  const handleEditImp = (imp) => {
    setEditingImpId(imp.id)
    setEditImpForm({ tipo: imp.tipo, monto: String(imp.monto) })
  }

  const handleSaveImp = async (id) => {
    if (!editImpForm.monto) return
    try {
      await impuestosApi.update(id, { tipo: editImpForm.tipo, monto: parseFloat(editImpForm.monto) })
      setEditingImpId(null)
      notify('Impuesto actualizado', 'success')
      await reloadImpuestosAndTotal()
    } catch { notify('Error al actualizar', 'error') }
  }

  const handleEditMM = () => {
    const mm = multimoneda[0]
    if (!mm) return
    setMmForm({ tipo: mm.tipo, tdc: String(mm.tdc), monto: String(mm.monto) })
    setSavingMM('editing')
  }

  const handleSaveMM = async (e) => {
    e?.preventDefault()
    if (!mmForm.tdc || !mmForm.monto) return
    setSavingMM(true)
    try {
      const mm = multimoneda[0]
      const { data: updated } = mm
        ? await pagosApi.updateMM(pago.id, mm.id, { tipo: mmForm.tipo, tdc: parseFloat(mmForm.tdc), monto: parseFloat(mmForm.monto) })
        : await pagosApi.createMM(pago.id, { tipo: mmForm.tipo, tdc: parseFloat(mmForm.tdc), monto: parseFloat(mmForm.monto) })
      const updatedList = [updated]
      setMultimoneda(updatedList)
      await recalcNeto(updatedList)
      setMmForm({ tipo: 'USD', tdc: '', monto: '' })
      notify(mm ? 'Multimoneda actualizado' : 'Multimoneda agregado', 'success')
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSavingMM(false) }
  }

  const infoRows = [
    ['OP',          pago.nro_ord != null ? `OP-${pago.nro_ord}` : '—'],
    ['Fecha',       fmtDate(pago.fecha)],
    ['Proveedor',   pago.proveedor?.nombre || '—'],
    ['Rubro / Cat', pago.rubcat ? `${pago.rubcat.rubro?.nombre} / ${pago.rubcat.categoria?.nombre}` : '—'],
    ['PV',          fmtPV(pago.pv)],
    ['Nro',         fmtNro(pago.nro)],
    ['Neto',        fmt$(pago.importe_neto)],
    ['Descuento',   fmt$(pago.descuento)],
    ['Importe',     fmt$(pago.importe)],
    ['Método',      pago.metodo_pago?.nombre || '—'],
    ['Cashflow',    fmtDate(pago.cashflow)],
    ['Pagado',      pago.pagado ? 'Sí' : 'No'],
    ['Fecha Pago',  fmtDate(pago.fecha_pago)],
    ['Período',     fmtMonth(pago.periodo)],
    ['Local',       pago.local?.nombre || '—'],
    ['Periódico',   periodico ? 'Sí' : 'No'],
  ]

  return (
    <div>
      {/* Tags destacados: mismos indicadores que ya tienen color/badge en la tabla */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
        <span className={`badge ${audited ? 'badge-green' : 'badge-muted'}`}>{audited ? '✓ Auditado' : 'No auditado'}</span>
        {canAuditDc && (
          <span className={`badge ${auditedDc ? 'badge-purple' : 'badge-muted'}`}>{auditedDc ? '✓ Audit DC' : 'Sin Audit DC'}</span>
        )}
        {pago.ingresa_egreso != null && (
          <span className={`badge ${pago.ingresa_egreso ? 'badge-green' : 'badge-red'}`}>{pago.ingresa_egreso ? 'Ingreso' : 'Egreso'}</span>
        )}
        {pago.estado_op && (
          <span className={`badge ${ESTADO_BADGE[pago.estado_op] ?? 'badge-muted'}`}>{ESTADO_OP_LABEL[pago.estado_op] ?? pago.estado_op}</span>
        )}
        {pago.id_tipo && (
          <span className={`badge ${TIPO_BADGE[pago.id_tipo] ?? 'badge-muted'}`}>{pago.id_tipo}</span>
        )}
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <ActionsMenu label="Acciones">
          {canEdit && (
            <button className="btn btn-secondary" onClick={() => navigate(`/pagos/${pago.id}/editar`)}>
              <IcoEdit /> Editar
            </button>
          )}
          {canEdit && (
            <button
              className={`btn ${audited ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handlePanelAudit}
              disabled={auditando}
            >
              {auditando
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : audited ? '✓ Auditado' : 'Auditar'
              }
            </button>
          )}
          {canAuditDc && (
            <button
              className={`btn ${auditedDc ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handlePanelAuditDc}
              disabled={auditandoDc}
            >
              {auditandoDc
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : auditedDc ? '✓ Audit DC' : 'Audit DC'
              }
            </button>
          )}
          {canEdit && pago.estado_op !== 'PDP' && (
            <button className="btn btn-secondary" onClick={handleMandarPdp} disabled={mandando} title="Mandar a PDP">
              {mandando ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlane />}
              {' '}PDP
            </button>
          )}
          {canEdit && pago.estado_op === 'PDP' && (
            <button className="btn btn-secondary" onClick={handleRevertirPdp} disabled={mandando} title="Revertir a deuda">
              {mandando ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '↩'}
              {' '}Deuda
            </button>
          )}
          {canEdit && !pago.pagado && (
            <button className="btn btn-secondary" onClick={() => { setPagarForm(f => ({ ...f, fecha_pago: nowDateTimeLocalInput() })); setPagarOpen(true) }} title="Registrar pago">
              <IcoDollar /> Pagar
            </button>
          )}
          {canEdit && (
            <button
              className={`btn ${periodico ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleTogglePeriodico}
              disabled={toggling}
              title="Marcar como periódico"
            >
              {toggling ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoRepeat />}
              {' '}{periodico ? 'Periódico' : 'Periódico'}
            </button>
          )}
          {canDelete && (
            <button className="btn btn-danger" onClick={() => onDelete(pago.id)}>
              <IcoTrash /> Eliminar
            </button>
          )}
        </ActionsMenu>
      </div>

      {/* Modal Pagar */}
      {pagarOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPagarOpen(false)}>
          <form onSubmit={handlePagar} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', width: 340, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Registrar pago</div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Fecha de pago</label>
              <div className="form-input-wrap">
                <input type="datetime-local" value={pagarForm.fecha_pago} onChange={e => setPagarForm(f => ({ ...f, fecha_pago: e.target.value }))} required />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Forma de pago *</label>
              <div className="form-input-wrap">
                <select value={pagarForm.id_metodo} onChange={e => setPagarForm(f => ({ ...f, id_metodo: e.target.value }))} required>
                  <option value="">Seleccioná método</option>
                  {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPagarOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={pagando}>
                {pagando ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Confirmar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {(pago.foto_url || pago.pdf_url) && (
        <div style={{ marginBottom: '0.5rem' }}>
          <div className="drawer-section-title">Adjuntos</div>
          <FotoViewer pagoId={pago.id} fotoUrl={pago.foto_url} pdfUrl={pago.pdf_url} />
        </div>
      )}

      <div className="drawer-section-title">Datos del pago</div>
      <div className="drawer-detail">
        {infoRows.map(([k, v]) => (
          <div key={k} className="drawer-detail-row">
            <span className="drawer-detail-key">{k}</span>
            <span className="drawer-detail-val">{v}</span>
          </div>
        ))}
      </div>

      {pago.observaciones && (
        <div style={{ marginTop: '0.75rem', marginBottom: '1rem', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, color: 'var(--t2)' }}>
          {pago.observaciones}
        </div>
      )}

      {pago.importe != null && (() => {
        const sumaImpuestos = impuestos.reduce((acc, imp) => acc + Number(imp.monto), 0)
        const esperado = sumaImpuestos + Number(pago.importe_neto ?? 0) - Number(pago.descuento ?? 0)
        const diff = Number(pago.importe) - esperado
        if (Math.abs(diff) <= 0.01) return null
        return (
          <div className="badge badge-red" style={{ marginTop: '0.5rem', marginBottom: '1rem', display: 'inline-block' }} title="Impuestos + Neto − Descuento vs. Importe">
            ⚠ No cierra: diferencia de {fmt$(Math.abs(diff))}
          </div>
        )
      })()}

      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Impuestos</span>
        {!addingImp && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingImp(true)}>
            <IcoPlus /> Añadir
          </button>
        )}
      </div>

      {(loadingImp || impuestos.length > 0) && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loadingImp ? (
                Array.from({ length: 3 }, (_, i) => (
                  <tr key={i} className="skel-row">
                    {Array.from({ length: 3 }, (_, j) => (
                      <td key={j}><span className="skel" style={{ width: `${50 + (j * 15 + i * 11) % 35}%` }} /></td>
                    ))}
                  </tr>
                ))
              ) : (
                impuestos.map((imp) => (
                  <tr key={imp.id}>
                    {editingImpId === imp.id ? (
                      <>
                        <td>
                          <div className="form-input-wrap" style={{ margin: 0 }}>
                            <select value={editImpForm.tipo} onChange={e => setEditImpForm(f => ({ ...f, tipo: e.target.value }))}>
                              {TIPOS_IMP.map(t => <option key={t}>{t}</option>)}
                            </select>
                          </div>
                        </td>
                        <td>
                          <div className="form-input-wrap" style={{ margin: 0 }}>
                            <input type="number" step="0.01" value={editImpForm.monto} onChange={e => setEditImpForm(f => ({ ...f, monto: e.target.value }))} style={{ width: 90 }} />
                          </div>
                        </td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => handleSaveImp(imp.id)}>✓</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => setEditingImpId(null)}>✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><span className="badge badge-blue">{imp.tipo}</span></td>
                        <td className="td-number">{fmt$(imp.monto)}</td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditImp(imp)}><IcoEdit /></button>
                          <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteImp(imp.id)}><IcoTrash /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {!loadingImp && impuestos.length === 0 && !addingImp && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin impuestos</div>
      )}

      {addingImp && (
        <form onSubmit={handleAddImp} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label className="form-label">Tipo</label>
            <div className="form-input-wrap">
              <select value={impForm.tipo} onChange={e => setImpForm({ ...impForm, tipo: e.target.value })}>
                {TIPOS_IMP.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label className="form-label">Monto *</label>
            <div className="form-input-wrap">
              <input type="number" step="0.01" required placeholder="0.00" value={impForm.monto} onChange={e => setImpForm({ ...impForm, monto: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={savingImp || !impForm.monto}>
            {savingImp ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlus />}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAddingImp(false)}>✕</button>
        </form>
      )}

      <div className="drawer-section-title" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Multimoneda</span>
        {!loadingMM && !multimoneda[0] && !addingMM && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingMM(true)}>
            <IcoPlus /> Añadir
          </button>
        )}
      </div>
      {loadingMM ? (
        <div className="skel" style={{ height: 36, borderRadius: 8, marginBottom: '1rem' }} />
      ) : multimoneda[0] && savingMM !== 'editing' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: '1rem' }}>
          <span className="badge badge-amber">{multimoneda[0].tipo}</span>
          <span className="td-mono" style={{ fontSize: 12 }}>TDC {Number(multimoneda[0].tdc).toFixed(4)}</span>
          <span className="td-number" style={{ flex: 1, fontSize: 13 }}>{Number(multimoneda[0].monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{multimoneda[0].fecha ? fmtDateArg(multimoneda[0].fecha) : ''}</span>
          <button className="btn btn-sm btn-secondary btn-icon" onClick={handleEditMM}><IcoEdit /></button>
          <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteMM(multimoneda[0].id)}><IcoTrash /></button>
        </div>
      ) : (multimoneda[0] || addingMM) ? (
        <form onSubmit={handleSaveMM} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div className="form-group" style={{ margin: 0, flex: '0 0 70px' }}>
            <label className="form-label">Moneda</label>
            <div className="form-input-wrap">
              <select value={mmForm.tipo} onChange={e => setMmForm(f => ({ ...f, tipo: e.target.value }))}>
                {['USD', 'EUR', 'BRL', 'UYU', 'BTC', 'OTRO'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label className="form-label">TDC *</label>
            <div className="form-input-wrap">
              <input type="number" step="0.0001" required placeholder="1000.00" value={mmForm.tdc} onChange={e => setMmForm(f => ({ ...f, tdc: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label className="form-label">Monto *</label>
            <div className="form-input-wrap">
              <input type="number" step="0.01" required placeholder="0.00" value={mmForm.monto} onChange={e => setMmForm(f => ({ ...f, monto: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="submit" className="btn btn-primary" disabled={savingMM === true || !mmForm.tdc || !mmForm.monto}>
              {savingMM === true ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlus />}
            </button>
            {savingMM === 'editing' && (
              <button type="button" className="btn btn-secondary" onClick={() => setSavingMM(false)}>✕</button>
            )}
            {!multimoneda[0] && (
              <button type="button" className="btn btn-secondary" onClick={() => setAddingMM(false)}>✕</button>
            )}
          </div>
        </form>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin multimoneda</div>
      )}

      <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>Historial de auditoría</div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Acción</th>{canAuditDc && <th>Circuito</th>}<th>Observación</th></tr>
          </thead>
          <tbody>
            {loadingHistory ? (
              <tr><td colSpan={canAuditDc ? 5 : 4}><span className="skel" style={{ width: '60%' }} /></td></tr>
            ) : auditHistory.length === 0 ? (
              <tr><td colSpan={canAuditDc ? 5 : 4} style={{ textAlign: 'center', padding: '1rem', color: 'var(--t3)' }}>Sin eventos de auditoría</td></tr>
            ) : (
              auditHistory.map((ev) => (
                <tr key={ev.id}>
                  <td className="td-muted">{fmtDateTimeArg(ev.fecha)}</td>
                  <td>{ev.user?.nombre ?? '—'}</td>
                  <td>
                    <span className={`badge ${ev.accion === 'auditado' ? 'badge-green' : 'badge-amber'}`}>
                      {ev.accion === 'auditado' ? 'Auditado' : 'Desauditado'}
                    </span>
                  </td>
                  {canAuditDc && (
                    <td>
                      <span className={`badge ${ev.audit_dc ? 'badge-purple' : 'badge-muted'}`}>
                        {ev.audit_dc ? 'DC' : 'Normal'}
                      </span>
                    </td>
                  )}
                  <td className="td-muted">{ev.observaciones || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Filtros ────────────────────────────────────────────────────────────────

const FILTER_INIT = {
  pagado: '', estado_op: '', campo_fecha: 'fecha', desde: '', hasta: '',
  id_tipo: '', id_rub: '', id_cat: '',
  audit: '', ingresa_egreso: '', id_metodo: '', cmv_quick: '',
  id_proveedores: [],
  id_rubcats: [],
}

const LIMIT     = 100

// ─── Componente principal ───────────────────────────────────────────────────

export default function PagoList() {
  const navigate    = useNavigate()
  const [searchParams] = useSearchParams()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const activeApp   = useAppStore((s) => s.activeApp)
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const role        = activeApp?.role
  const canEdit     = ['super_admin', 'dcsmart', 'admin'].includes(role)
  const canDelete   = ['super_admin', 'dcsmart'].includes(role)
  const canAuditDc  = ['super_admin', 'dcsmart'].includes(role)
  const canExport   = ['super_admin', 'dcsmart'].includes(role)
  const [exporting, setExporting] = useState(false)
  const [summary,        setSummary]        = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const [pagos,           setPagos]           = useState([])
  const [total,           setTotal]           = useState(0)
  const [loading,         setLoading]         = useState(true)
  const [page,            setPage]            = useState(1)
  const [filters,         setFilters]         = useState(FILTER_INIT)
  const [panelOpen,       setPanelOpen]       = useState(false)
  const [selectedPago,    setSelectedPago]    = useState(null)
  const [sortField,       setSortField]       = useState('nro_ord')
  const [sortDir,         setSortDir]         = useState('desc')
  const [search,          setSearch]          = useState(() => searchParams.get('search') || '')
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('search') || '')
  const autoOpenedRef = useRef(false)

  const [rubros,      setRubros]      = useState([])
  const [categorias,  setCategorias]  = useState([])
  const [rubcats,     setRubcats]     = useState([])
  const [metodos,     setMetodos]     = useState([])
  const [provSearchResults, setProvSearchResults] = useState([])
  const [provSearchLoading, setProvSearchLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectionMode, setSelectionMode] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  // ── Datos de referencia ───────────────────────────────────────────────────
  useEffect(() => {
    rubrosApi.list().then(r => setRubros(r.data || [])).catch(() => {})
    categoriasApi.list().then(r => setCategorias(r.data || [])).catch(() => {})
    rubcatApi.list().then(r => setRubcats(r.data || [])).catch(() => {})
    metodosApi.list().then(r => setMetodos(r.data || [])).catch(() => {})
  }, [])

  // ── Debounce búsqueda ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  // ── Parámetros de query ───────────────────────────────────────────────────
  const buildParams = useCallback((pageNum) => {
    const qStr = debouncedSearch.trim()
    return {
      ...(activeLocal?.id ? { id_local: activeLocal.id } : {}),
      page: pageNum,
      limit: LIMIT,
      sort_field: sortField,
      sort_dir:   sortDir,
      ...(qStr ? { q: qStr } : {}),
      ...(filters.pagado         !== '' ? { pagado:          filters.pagado }         : {}),
      ...(filters.estado_op            ? { estado_op:        filters.estado_op }       : {}),
      ...(filters.desde                ? { desde:            filters.desde }           : {}),
      ...(filters.hasta                ? { hasta:            filters.hasta }           : {}),
      ...((filters.desde || filters.hasta) ? { campo_fecha:   filters.campo_fecha }    : {}),
      ...(filters.id_tipo              ? { id_tipo:          filters.id_tipo }         : {}),
      ...(filters.id_rub               ? { id_rub:           filters.id_rub }          : {}),
      ...(filters.id_cat               ? { id_cat:           filters.id_cat }          : {}),
      ...(filters.audit          !== '' ? { audit:            filters.audit }           : {}),
      ...(filters.ingresa_egreso !== '' ? { ingresa_egreso:   filters.ingresa_egreso } : {}),
      ...(filters.id_metodo            ? { id_metodo:        filters.id_metodo }       : {}),
      ...(filters.cmv_quick === 'true' ? { cmv_quick: 'true' }                        : {}),
      ...(filters.id_proveedores.length > 0 ? { id_proveedores: filters.id_proveedores.map(p => p.id).join(',') } : {}),
      ...(filters.id_rubcats.length    > 0 ? { id_rubcats:    filters.id_rubcats.join(',') }    : {}),
    }
  }, [activeLocal?.id, sortField, sortDir, debouncedSearch, filters])

  // ── Volver a página 1 cuando cambian filtros / sort / búsqueda ────────────
  useEffect(() => { setPage(1) }, [buildParams])

  // ── Exportar CSV: mismos filtros ya aplicados, pero SIN paginar (limit: 0
  // → el backend trae todas las filas que matchean el where, no una página) ──
  const exportCsv = useCallback(async () => {
    setExporting(true)
    try {
      const { data } = await pagosApi.list({ ...buildParams(1), limit: 0 })
      if (!data.data.length) { notify('No hay filas para exportar con estos filtros', 'info'); return }
      downloadCsv(`pagos_${todayInputDate()}.csv`, data.data, PAGO_CSV_COLUMNS)
    } catch {
      notify('Error al exportar CSV', 'error')
    } finally {
      setExporting(false)
    }
  }, [buildParams, notify])

  const load = useCallback(() => {
    setLoading(true)
    pagosApi.list(buildParams(page))
      .then(({ data }) => { setPagos(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar pagos', 'error'))
      .finally(() => setLoading(false))
  }, [buildParams, page])

  // ── Carga de la página actual (reemplaza, no acumula) ──────────────────────
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setSelectedIds(new Set())
    pagosApi.list(buildParams(page), ctrl.signal)
      .then(({ data }) => {
        setPagos(data.data)
        setTotal(data.total)
        if (!autoOpenedRef.current && searchParams.get('search') && data.data.length === 1) {
          autoOpenedRef.current = true
          openDetail(data.data[0])
        }
      })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar pagos', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [buildParams, page])

  // ── Resumen agregado (total + impuestos) ───────────────────────────────────
  // Solo se calcula cuando hay un rango de fecha elegido (mismo gate que el
  // CSV) — usa los mismos filtros que la tabla pero sin paginar, porque el
  // total debe ser de TODOS los pagos filtrados, no solo la página visible.
  useEffect(() => {
    if (!(filters.desde && filters.hasta)) { setSummary(null); return }
    const ctrl = new AbortController()
    setSummaryLoading(true)
    pagosApi.summary(buildParams(1), ctrl.signal)
      .then(({ data }) => setSummary(data))
      .catch(() => { if (!ctrl.signal.aborted) { notify('Error al cargar el resumen', 'error'); setSummary(null) } })
      .finally(() => { if (!ctrl.signal.aborted) setSummaryLoading(false) })
    return () => ctrl.abort()
  }, [buildParams, filters.desde, filters.hasta])

  // ── Navegación de páginas ──────────────────────────────────────────────────
  const goToPage = (p) => {
    const next = Math.min(Math.max(1, p), totalPages)
    if (next !== page) {
      setPage(next)
      document.querySelector('.app-main')?.scrollTo({ top: 0 })
      window.scrollTo({ top: 0 })
    }
  }

  // ── Acciones ──────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!(await showConfirm('¿Eliminar este pago?'))) return
    try {
      await pagosApi.remove(id)
      notify('Pago eliminado', 'success')
      setPanelOpen(false)
      setPagos(prev => prev.filter(p => p.id !== id))
      setTotal(t => t - 1)
    }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const patchPagoAudit = (id, audit) => {
    setPagos(prev => prev.map(p => p.id === id ? { ...p, audit } : p))
    setSelectedPago(prev => prev?.id === id ? { ...prev, audit } : prev)
  }

  const patchPago = (id, fields) => {
    setPagos(prev => prev.map(p => p.id === id ? { ...p, ...fields } : p))
    setSelectedPago(prev => prev?.id === id ? { ...prev, ...fields } : prev)
  }

  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const allVisibleSelected = pagos.length > 0 && pagos.every(p => selectedIds.has(p.id))
  const toggleSelectAllVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(pagos.map(p => p.id)))
  }

  const selectedPagos    = pagos.filter(p => selectedIds.has(p.id))
  const canBulkAudit     = selectedPagos.some(p => !p.audit)
  const canBulkDesaudit  = selectedPagos.some(p => p.audit)

  const bulkCancel = () => setSelectedIds(new Set())

  const toggleSelectionMode = () => {
    setSelectionMode(m => !m)
    setSelectedIds(new Set())
  }

  const bulkAuditar = async () => {
    const targets = selectedPagos.filter(p => !p.audit)
    let ok = 0, fail = 0
    for (const p of targets) {
      try { await pagosApi.audit(p.id); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} pagos auditados` : `${ok}/${targets.length} auditados, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkDesauditar = async () => {
    const targets = selectedPagos.filter(p => p.audit)
    let ok = 0, fail = 0
    for (const p of targets) {
      try { await pagosApi.audit(p.id, { observaciones: null }); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} pagos desauditados` : `${ok}/${targets.length} desauditados, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkEliminar = async () => {
    if (!(await showConfirm(`¿Eliminar ${selectedPagos.length} pagos?`))) return
    let ok = 0, fail = 0
    for (const p of selectedPagos) {
      try { await pagosApi.remove(p.id); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} pagos eliminados` : `${ok}/${selectedPagos.length} eliminados, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const openDetail = (p) => { setSelectedPago(p); setPanelOpen(true) }
  const closePanel = () => setPanelOpen(false)

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false)
  const [draft, setDraft] = useState(FILTER_INIT)
  const filterRef = useRef(null)

  // Ancho fijo del panel de Filtros (debe coincidir con el `width: 520` del
  // style inline del panel) y margen mínimo respecto al sidebar/borde.
  // Nota: en viewports angostos/zoom alto el panel puede renderizar más
  // angosto que esto por el `maxWidth: '90vw'` del style inline; eso solo
  // hace el clamp un poco más conservador, nunca causa overlap.
  const PANEL_WIDTH  = 520
  const PANEL_MARGIN = 8
  const [panelLeft, setPanelLeft] = useState(0)

  // Calcula dónde debe quedar el panel (en vez del `right: 0` fijo de antes)
  // para que nunca se superponga al sidebar ni se salga de la pantalla,
  // sin importar el zoom del navegador o el ancho de la ventana.
  //
  // getBoundingClientRect()/window.innerWidth devuelven coordenadas de
  // viewport, pero el panel es `position: absolute` dentro de filterRef
  // (que es `position: relative`) — su `left` final tiene que ser relativo
  // a `buttonRect.left`, no una coordenada de viewport cruda.
  const computePanelLeft = () => {
    if (!filterRef.current) return
    const buttonRect  = filterRef.current.getBoundingClientRect()
    const sidebarEl    = document.querySelector('.sidebar')
    const sidebarRight = sidebarEl ? sidebarEl.getBoundingClientRect().right : 0
    const idealLeftViewport = buttonRect.right - PANEL_WIDTH
    const minLeftViewport   = sidebarRight + PANEL_MARGIN
    const maxLeftViewport   = window.innerWidth - PANEL_WIDTH - PANEL_MARGIN
    const clampedLeftViewport = Math.max(minLeftViewport, Math.min(idealLeftViewport, maxLeftViewport))
    setPanelLeft(clampedLeftViewport - buttonRect.left)
  }

  useLayoutEffect(() => {
    if (!filterOpen) return
    computePanelLeft()
    window.addEventListener('resize', computePanelLeft)
    return () => window.removeEventListener('resize', computePanelLeft)
  }, [filterOpen])

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'campo_fecha' && (Array.isArray(v) ? v.length > 0 : v !== '')).length
  const hasActiveFilters  = activeFilterCount > 0

  const openFilters = () => { setDraft(filters); setFilterOpen(true) }

  useEffect(() => {
    if (!filterOpen) return
    const handleClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [filterOpen])

  const applyFilters   = () => { setFilters(draft); setFilterOpen(false) }
  const clearFilters   = () => { setDraft(FILTER_INIT); setFilters(FILTER_INIT); setSearch('') }
  const setDraftField  = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  const toggleDraftArr = (k, v) => setDraft(d => {
    const arr = d[k] || []
    return { ...d, [k]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] }
  })

  const [provSearch,    setProvSearch]    = useState('')
  const [rubcatSearch,  setRubcatSearch]  = useState('')

  useEffect(() => {
    if (provSearch.trim().length < 2) { setProvSearchResults([]); return }
    setProvSearchLoading(true)
    const t = setTimeout(() => {
      proveedoresApi.list({ search: provSearch.trim(), activo: 'true', limit: 30 })
        .then(r => setProvSearchResults(r.data?.data || []))
        .catch(() => setProvSearchResults([]))
        .finally(() => setProvSearchLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [provSearch])

  const toggleDraftProv = (p) => setDraft(d => {
    const arr = d.id_proveedores || []
    const exists = arr.some(x => x.id === p.id)
    return { ...d, id_proveedores: exists ? arr.filter(x => x.id !== p.id) : [...arr, { id: p.id, nombre: p.nombre }] }
  })

  const hasCmvRubros = rubros.some(r => r.nombre?.toUpperCase().startsWith('CMV'))
  const CHIPS = [
    { label: 'STK',         filters: { id_tipo: 'STK' } },
    { label: 'CMV',         filters: { cmv_quick: 'true' }, disabled: !hasCmvRubros },
    { label: 'No auditado', filters: { audit: 'false' } },
    { label: 'No pagado',   filters: { pagado: 'false' } },
    { label: 'Egreso',      filters: { ingresa_egreso: 'false' } },
  ]

  const isChipActive = (chipFilters) =>
    Object.entries(chipFilters).every(([k, v]) => v !== '' && draft[k] === v)

  const toggleChip = (chipFilters) => {
    if (isChipActive(chipFilters)) {
      const cleared = Object.keys(chipFilters).reduce((acc, k) => ({ ...acc, [k]: '' }), {})
      setDraft(d => ({ ...d, ...cleared }))
    } else {
      setDraft(d => ({ ...d, ...chipFilters }))
    }
  }

  const catsForRubro = draft.id_rub
    ? rubcats.filter(rc => rc.id_rub === draft.id_rub).map(rc => rc.categoria).filter(Boolean)
    : categorias

  // ── Estilos ───────────────────────────────────────────────────────────────
  const SortTh = ({ field, children, minWidth }) => (
    <th className={`sortable${sortField === field ? ' active' : ''}`} style={minWidth ? { minWidth } : undefined} onClick={() => toggleSort(field)}>
      {children} <span className="sort-ico">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )

  const chipSt = (active) => ({
    padding: '3px 11px', borderRadius: 20, cursor: 'pointer', fontSize: 11,
    fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
    border: `1px solid ${active ? 'var(--gold-bright)' : 'var(--border)'}`,
    background: active ? 'rgba(212,175,55,0.15)' : 'transparent',
    color: active ? 'var(--gold-bright)' : 'var(--t2)',
  })

  const lbl = {
    fontSize: 10, color: 'var(--t3)', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: 3, display: 'block',
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // La columna "Local" se oculta si ya hay un local puntual seleccionado (es redundante).
  // Se sacaron las columnas de auditar/editar/eliminar de la fila (ahora viven en el detalle).
  const showLocalCol = !activeLocal
  const colCount = 19 + (showLocalCol ? 1 : 0) + (selectionMode ? 1 : 0)

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Pagos</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
        <div className="page-actions">
          {/* Buscador OP */}
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--t2)', pointerEvents: 'none', fontSize: 13,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              type="text"
              placeholder="Buscar por OP, proveedor o rubro/categoría…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                height: 36, paddingLeft: 32, paddingRight: search ? 28 : 12,
                background: 'var(--bg-input)', border: '1px solid var(--border-input)',
                borderRadius: 8, color: 'var(--t1)', fontSize: 13, width: 280,
                outline: 'none',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--t2)', padding: 2, display: 'flex', lineHeight: 1,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          <div style={{ position: 'relative' }} ref={filterRef}>
            <button
              className={`btn ${filterOpen || hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => filterOpen ? setFilterOpen(false) : openFilters()}
            >
              <IcoFilter />
              Filtros
              {activeFilterCount > 0 && (
                <span style={{ marginLeft: 6, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: panelLeft, zIndex: 200,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '1.25rem', width: 520, maxWidth: '90vw',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}>
                {/* Atajos */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.05em', marginRight: 2 }}>ATAJOS</span>
                  {CHIPS.filter(c => !c.disabled).map(chip => (
                    <button key={chip.label} style={chipSt(isChipActive(chip.filters))} onClick={() => toggleChip(chip.filters)}>
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <div>
                    <span style={lbl}>Tipo</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.id_tipo} onChange={e => setDraftField('id_tipo', e.target.value)}>
                      <option value="">Todos los tipos</option>
                      {TIPO_PAGO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Método</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.id_metodo} onChange={e => setDraftField('id_metodo', e.target.value)}>
                      <option value="">Todos los métodos</option>
                      {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Rubro</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.id_rub}
                      onChange={e => setDraft(d => ({ ...d, id_rub: e.target.value, id_cat: '' }))}>
                      <option value="">Todos los rubros</option>
                      {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Categoría</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.id_cat} onChange={e => setDraftField('id_cat', e.target.value)}>
                      <option value="">Todas las cats.</option>
                      {catsForRubro.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Pagado</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.pagado} onChange={e => setDraftField('pagado', e.target.value)}>
                      <option value="">Todos</option>
                      <option value="false">No pagados</option>
                      <option value="true">Pagados</option>
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Estado op.</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.estado_op} onChange={e => setDraftField('estado_op', e.target.value)}>
                      <option value="">Todos los estados</option>
                      {ESTADO_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Audit</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.audit} onChange={e => setDraftField('audit', e.target.value)}>
                      <option value="">Todos</option>
                      <option value="false">No auditado</option>
                      <option value="true">Auditado</option>
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Dirección</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.ingresa_egreso} onChange={e => setDraftField('ingresa_egreso', e.target.value)}>
                      <option value="">Todos</option>
                      <option value="true">Ingreso</option>
                      <option value="false">Egreso</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={lbl}>Tipo de fecha</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.campo_fecha} onChange={e => setDraftField('campo_fecha', e.target.value)}>
                      {CAMPO_FECHA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lbl}>Desde</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.desde} onChange={e => setDraftField('desde', e.target.value)} />
                  </div>
                  <div>
                    <span style={lbl}>Hasta</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.hasta} onChange={e => setDraftField('hasta', e.target.value)} />
                  </div>
                </div>

                {/* Multi-select proveedores */}
                <div style={{ marginTop: '0.75rem' }}>
                  <span style={lbl}>Proveedores {draft.id_proveedores.length > 0 && <span style={{ color: 'var(--gold-bright)' }}>({draft.id_proveedores.length})</span>}</span>
                  <input
                    type="text"
                    placeholder="Escribí para buscar…"
                    value={provSearch}
                    onChange={e => setProvSearch(e.target.value)}
                    style={{ width: '100%', marginBottom: 4, height: 30, padding: '0 8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 6, color: 'var(--t1)', fontSize: 12 }}
                  />
                  <div style={{ maxHeight: 110, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 0' }}>
                    {provSearch.trim().length >= 2 ? (
                      provSearchLoading
                        ? <div style={{ padding: '4px 8px', color: 'var(--t3)', fontSize: 12 }}>Buscando…</div>
                        : provSearchResults.length === 0
                          ? <div style={{ padding: '4px 8px', color: 'var(--t3)', fontSize: 12 }}>Sin resultados</div>
                          : provSearchResults.map(p => (
                              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>
                                <input type="checkbox" checked={draft.id_proveedores.some(x => x.id === p.id)} onChange={() => toggleDraftProv(p)} />
                                {p.nombre}
                              </label>
                            ))
                    ) : draft.id_proveedores.length === 0
                      ? <div style={{ padding: '4px 8px', color: 'var(--t3)', fontSize: 12 }}>Escribí al menos 2 letras para buscar</div>
                      : draft.id_proveedores.map(p => (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>
                            <input type="checkbox" checked onChange={() => toggleDraftProv(p)} />
                            {p.nombre}
                          </label>
                        ))
                    }
                  </div>
                </div>

                {/* Multi-select rubcats */}
                <div style={{ marginTop: '0.75rem' }}>
                  <span style={lbl}>Rubros/Cat (múltiple) {draft.id_rubcats.length > 0 && <span style={{ color: 'var(--gold-bright)' }}>({draft.id_rubcats.length})</span>}</span>
                  <input
                    type="text"
                    placeholder="Buscar rubro/cat…"
                    value={rubcatSearch}
                    onChange={e => setRubcatSearch(e.target.value)}
                    style={{ width: '100%', marginBottom: 4, height: 30, padding: '0 8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 6, color: 'var(--t1)', fontSize: 12 }}
                  />
                  <div style={{ maxHeight: 110, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 0' }}>
                    {rubcats
                      .filter(rc => !rubcatSearch.trim() || `${rc.rubro?.nombre} ${rc.categoria?.nombre}`.toLowerCase().includes(rubcatSearch.toLowerCase()))
                      .map(rc => (
                        <label key={rc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>
                          <input type="checkbox" checked={draft.id_rubcats.includes(rc.id)} onChange={() => toggleDraftArr('id_rubcats', rc.id)} />
                          <span style={{ color: 'var(--t2)' }}>{rc.rubro?.nombre}</span>
                          <span style={{ color: 'var(--t3)' }}>/</span>
                          <span>{rc.categoria?.nombre}</span>
                        </label>
                      ))
                    }
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-sm btn-secondary" onClick={clearFilters}>
                    Limpiar todo
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={applyFilters}>
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>
          <ActionsMenu label="Acciones" float>
            {(canEdit || canDelete) && (
              <button className={`btn ${selectionMode ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleSelectionMode}>
                <IcoCheckSquare /> {selectionMode ? 'Cancelar selección' : 'Seleccionar'}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => navigate('/pagos/nuevo?modo=rapido&tipo=B')} title="Carga Avión">
              <IcoPlane /> Carga Avión
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/pagos/nuevo?modo=rapido&tipo=STK')} title="MovStock">
              <IcoBox /> MovStock
            </button>
            {canExport && (
              <button
                className="btn btn-secondary"
                onClick={exportCsv}
                disabled={exporting || !(filters.desde && filters.hasta)}
                title={filters.desde && filters.hasta
                  ? 'Exportar a CSV los pagos con los filtros actuales'
                  : 'Elegí un tipo de fecha y un rango (Desde/Hasta) en Filtros para poder exportar'}
              >
                {exporting ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <IcoDownload />} Exportar CSV
              </button>
            )}
          </ActionsMenu>
          <button className="btn btn-primary" onClick={() => navigate('/pagos/nuevo')}>
            <IcoPlus /> Nuevo Pago
          </button>
        </div>
      </div>

      {filters.desde && filters.hasta && (summaryLoading || summary) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 1rem', minWidth: 140 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.03em' }}>TOTAL IMPORTE</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {summaryLoading ? <span className="skel" style={{ width: 80, height: 16, display: 'inline-block' }} /> : fmt$(summary?.total_importe)}
            </div>
          </div>
          {!summaryLoading && summary && Object.entries(summary.por_impuesto).map(([tipo, monto]) => (
            <div key={tipo} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 1rem', minWidth: 120 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.03em' }}>{tipo}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt$(monto)}</div>
            </div>
          ))}
        </div>
      )}

      {selectionMode && selectedIds.size > 0 && (
        <div className="bulk-bar">
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold-bright)' }}>
            {selectedIds.size} seleccionados
          </span>
          <button className="btn btn-sm btn-secondary" onClick={bulkAuditar} disabled={!canBulkAudit}>
            Auditar
          </button>
          <button className="btn btn-sm btn-secondary" onClick={bulkDesauditar} disabled={!canBulkDesaudit}>
            Desauditar
          </button>
          <button className="btn btn-sm btn-danger" onClick={bulkEliminar}>
            Eliminar
          </button>
          <button className="btn btn-sm btn-secondary" onClick={bulkCancel} style={{ marginLeft: 'auto' }}>
            Cancelar
          </button>
        </div>
      )}

      {/* ── Tabla ── */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {selectionMode && (
                <th style={{ width: 32 }}>
                  <input type="checkbox" className="select-checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                </th>
              )}
              <SortTh field="nro_ord" minWidth={70}>OP</SortTh>
              <th style={{ minWidth: 100 }}>Auditado</th>
              <SortTh field="fecha" minWidth={90}>Fecha</SortTh>
              <SortTh field="proveedor" minWidth={140}>Proveedor</SortTh>
              <th style={{ minWidth: 160 }}>Rubro / Cat</th>
              <th style={{ minWidth: 80 }}>Tipo</th>
              <th>PV</th>
              <th>Nro</th>
              <th>Neto</th>
              <SortTh field="importe" minWidth={90}>Importe</SortTh>
              <th>Método</th>
              <th>Cashflow</th>
              <th>Dirección</th>
              <th>Estado</th>
              <th>Pagado</th>
              <SortTh field="fecha_pago" minWidth={90}>Fecha Pago</SortTh>
              <SortTh field="periodo" minWidth={80}>Período</SortTh>
              <th style={{ minWidth: 40, textAlign: 'center' }}>Foto</th>
              <th style={{ minWidth: 40, textAlign: 'center' }}>PDF</th>
              {showLocalCol && <th>Local</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 12 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: colCount }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${45 + (j * 7 + i * 11) % 50}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : pagos.length === 0 ? (
              <tr>
                <td colSpan={colCount}>
                  <div className="table-empty">
                    <IcoPagoEmpty />
                    <p>No hay pagos que coincidan con los filtros.</p>
                  </div>
                </td>
              </tr>
            ) : (
              pagos.map((p) => (
                <tr key={p.id} className="row-clickable" onClick={() => openDetail(p)}>
                  {selectionMode && (
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="select-checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} />
                    </td>
                  )}
                  <td className="td-primary" style={{ minWidth: 70, whiteSpace: 'nowrap' }}>{p.nro_ord != null ? `OP-${p.nro_ord}` : <span className="td-muted">—</span>}</td>
                  <td style={{ minWidth: 40, textAlign: 'center' }}>
                    <span style={{ color: p.audit ? 'var(--green)' : 'var(--amber)' }} title={p.audit ? 'Auditado' : 'No auditado'}>
                      {p.audit ? <IcoThumbUp /> : <IcoEye />}
                    </span>
                  </td>
                  <td style={{ minWidth: 90 }}>{fmtDate(p.fecha)}</td>
                  <td style={{ minWidth: 140 }}>{p.proveedor?.nombre || <span className="td-muted">—</span>}</td>
                  <td style={{ minWidth: 160, fontSize: 12 }}>
                    {p.rubcat
                      ? <span>{p.rubcat.rubro?.nombre}<span className="td-muted"> / {p.rubcat.categoria?.nombre}</span></span>
                      : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 80 }}>
                    {p.id_tipo
                      ? <span className={`badge ${TIPO_BADGE[p.id_tipo] ?? 'badge-muted'}`}>{p.id_tipo}</span>
                      : <span className="td-muted">—</span>}
                  </td>
                  <td className="td-mono" style={{ textAlign: 'right', minWidth: 60 }}>{fmtPV(p.pv)}</td>
                  <td className="td-mono" style={{ minWidth: 80 }}>{fmtNro(p.nro)}</td>
                  <td className="td-number" style={{ minWidth: 100 }}>{fmt$(p.importe_neto)}</td>
                  <td className="td-number" style={{ minWidth: 100, color: 'var(--gold-bright)', fontWeight: 700 }}>{fmt$(p.importe)}</td>
                  <td style={{ minWidth: 120, fontSize: 12 }}>{p.metodo_pago?.nombre || <span className="td-muted">—</span>}</td>
                  <td style={{ minWidth: 90 }}>{fmtDate(p.cashflow)}</td>
                  <td style={{ minWidth: 40, textAlign: 'center' }}>
                    {p.ingresa_egreso != null
                      ? (
                        <span style={{ color: p.ingresa_egreso ? 'var(--green)' : 'var(--red)' }} title={p.ingresa_egreso ? 'Ingreso' : 'Egreso'}>
                          {p.ingresa_egreso ? <IcoArrowUp /> : <IcoArrowDown />}
                        </span>
                      )
                      : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 90 }}>
                    {p.estado_op
                      ? <span className={`badge ${ESTADO_BADGE[p.estado_op] ?? 'badge-muted'}`}>{ESTADO_OP_LABEL[p.estado_op] ?? p.estado_op}</span>
                      : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 70, textAlign: 'center' }}>
                    <span className={p.pagado ? 'bool-yes' : 'bool-no'}>{p.pagado ? '✓' : '✗'}</span>
                  </td>
                  <td style={{ minWidth: 90 }}>{fmtDate(p.fecha_pago)}</td>
                  <td style={{ minWidth: 80 }}>{fmtMonth(p.periodo)}</td>
                  <td style={{ minWidth: 40, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {p.foto_url
                      ? <FotoViewer pagoId={p.id} fotoUrl={p.foto_url} drawerWidth={0} compact />
                      : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ minWidth: 40, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {p.pdf_url
                      ? <FotoViewer pagoId={p.id} pdfUrl={p.pdf_url} drawerWidth={0} compact />
                      : <span className="td-muted">—</span>}
                  </td>
                  {showLocalCol && <td style={{ minWidth: 120, fontSize: 12 }}>{p.local?.nombre || <span className="td-muted">—</span>}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ── */}
      {!loading && total > 0 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span className="pagination-info">
            {`${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} de ${total} pagos`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(1)} disabled={page <= 1} title="Primera página">«</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Anterior</button>
            <span style={{ fontSize: 13, color: 'var(--t2)', padding: '0 0.5rem', whiteSpace: 'nowrap' }}>
              Página {page} de {totalPages}
            </span>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>Siguiente ›</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(totalPages)} disabled={page >= totalPages} title="Última página">»</button>
          </div>
        </div>
      )}

      <DrawerPanel
        open={panelOpen}
        onClose={closePanel}
        title={selectedPago ? `OP-${selectedPago.nro_ord ?? selectedPago.id?.slice(0, 8)}` : 'Detalle de Pago'}
        width={580}
      >
        {selectedPago && (
          <PagoDetailPanel pago={selectedPago} navigate={navigate} onDelete={handleDelete} onAudit={patchPagoAudit} onPatch={patchPago} metodos={metodos} canEdit={canEdit} canDelete={canDelete} canAuditDc={canAuditDc} />
        )}
      </DrawerPanel>
    </div>
  )
}
