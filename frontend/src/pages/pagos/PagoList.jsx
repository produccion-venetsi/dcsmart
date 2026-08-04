import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { impuestosApi } from '../../api/impuestos.js'
import { rubrosApi, categoriasApi, rubcatApi } from '../../api/rubcat.js'
import { metodosApi } from '../../api/metodospago.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { filtroPresetsApi } from '../../api/filtroPresets.js'
import { useAppStore } from '../../store/appStore.js'
import { useAuthStore } from '../../store/authStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import FotoViewer from '../../components/FotoViewer.jsx'
import ActionsMenu from '../../components/ActionsMenu.jsx'
import MultiSelect from '../../components/MultiSelect.jsx'
import { esRolDc, puedeEditar, puedeBorrarPagos } from '../../lib/roles.js'
import { multiParam, normalizarMulti, normalizarRangos } from '../../lib/filtros.js'
import { downloadExcel, excelBlob } from '../../lib/excel.js'
import { sheetsDisponible, subirComoSheet, pedirAccessToken, precargarGoogle } from '../../lib/googleSheets.js'
import { tiposImpuestoPresentes, columnasImpuesto, filaTotales, conSignoNotaCredito } from '../../lib/exportPagos.js'
import { todayInputDate, nowDateTimeLocalInput, toUtcIsoFromDateTimeLocal, fmtDateArg, fmtDateTimeArg, fmtDateUTC, fmtMonthUTC, periodoDistintoDeFecha } from '../../lib/dates.js'

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
const TIPO_PAGO_MULTI = TIPO_PAGO_OPTIONS.map(t => ({ value: t, label: t }))
const CAMPO_FECHA_OPTIONS = [
  { value: 'fecha',      label: 'Fecha' },
  { value: 'fecha_pago', label: 'Fecha de Pago' },
  { value: 'cashflow',   label: 'Cashflow' },
  { value: 'periodo',    label: 'Período' },
  { value: 'created_at', label: 'Fecha de Creación' },
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
// Planilla con grilla: mismo trazo que el resto de los iconos de la barra.
function IcoSheets() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
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
  // La fecha de creación va primera por pedido explícito. Solo exportan DC y
  // super admin (canExport), que son los mismos roles que la ven en pantalla,
  // así que no hace falta condicionarla acá.
  { label: 'Creado',      get: (p) => p.created_at ? fmtDateTimeArg(p.created_at) : '' },
  { label: 'OP',          get: (p) => p.nro_ord != null ? `OP-${p.nro_ord}` : '' },
  { label: 'Auditado',    get: (p) => p.audit ? 'Sí' : 'No' },
  { label: 'Fecha',       get: (p) => p.fecha ? fmtDate(p.fecha) : '' },
  { label: 'Proveedor',   get: (p) => p.proveedor?.nombre || '' },
  { label: 'Rubro',       get: (p) => p.rubcat?.rubro?.nombre || '' },
  { label: 'Categoría',   get: (p) => p.rubcat?.categoria?.nombre || '' },
  { label: 'Tipo',        get: (p) => p.id_tipo || '' },
  { label: 'PV',          get: (p) => p.pv != null ? fmtPV(p.pv) : '' },
  { label: 'Nro',         get: (p) => p.nro != null ? fmtNro(p.nro) : '' },
  { label: 'Neto',        get: (p) => p.importe_neto ?? '', total: true },
  { label: 'Importe',     get: (p) => p.importe ?? '', total: true },
  { label: 'Método',      get: (p) => p.metodo_pago?.nombre || '' },
  { label: 'Observaciones', get: (p) => p.observaciones || '' },
  { label: 'Cashflow',    get: (p) => p.cashflow ? fmtDate(p.cashflow) : '' },
  { label: 'Dirección',   get: (p) => p.ingresa_egreso == null ? '' : (p.ingresa_egreso ? 'Ingreso' : 'Egreso') },
  { label: 'Estado',      get: (p) => ESTADO_OP_LABEL[p.estado_op] ?? p.estado_op ?? '' },
  { label: 'Pagado',      get: (p) => p.pagado ? 'Sí' : 'No' },
  { label: 'Fecha Pago',  get: (p) => p.fecha_pago ? fmtDateArg(p.fecha_pago) : '' },
  { label: 'Período',     get: (p) => p.periodo ? fmtMonth(p.periodo) : '' },
  { label: 'Local',       get: (p) => p.local?.nombre || '' },
]

// Mismas etiquetas y colores que la pantalla Actividad, para que el badge se
// lea igual en los dos lados.
const ACTIVIDAD_LABEL = { creado: 'Creado', editado: 'Editado', eliminado: 'Eliminado' }
const ACTIVIDAD_BADGE = { creado: 'badge-green', editado: 'badge-blue', eliminado: 'badge-red' }

function PagoDetailPanel({ pago, navigate, onDelete, onAudit, onPatch, metodos = [], canEdit = false, canDelete = false, canAuditDc = false, canSeeCreated = false, canSeeActivity = false }) {
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
  const [activityHistory, setActivityHistory] = useState([])
  const [loadingActivity, setLoadingActivity] = useState(false)
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

  // Quién creó / editó / eliminó el pago. Solo se pide si el rol lo puede ver:
  // para el resto el backend responde 403 y no tiene sentido gastar el request.
  const loadActivityHistory = () => {
    if (!canSeeActivity) return
    setLoadingActivity(true)
    pagosApi.activityHistory(pago.id)
      .then(({ data }) => setActivityHistory(data))
      .catch(() => {})
      .finally(() => setLoadingActivity(false))
  }

  useEffect(() => { if (pago) { loadImpuestos(); loadMM(); loadAuditHistory(); loadActivityHistory() } }, [pago?.id])

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
      const { data } = await pagosApi.pagar([pago.id], { fecha_pago: fechaPagoIso, id_metodo: pagarForm.id_metodo })
      notify('Pago registrado', 'success')
      setPagarOpen(false)
      onPatch?.(pago.id, {
        pagado: true,
        fecha_pago: fechaPagoIso,
        id_metodo: pagarForm.id_metodo,
        ...(data?.ids_caja?.includes(pago.id) ? { estado_op: 'CAJA' } : {}),
      })
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
    ['Fecha Pago',  fmtDateArg(pago.fecha_pago)],
    ['Período',     fmtMonth(pago.periodo)],
    ['Local',       pago.local?.nombre || '—'],
    ['Periódico',   periodico ? 'Sí' : 'No'],
    // Dato interno: solo DC y super admin (ver canSeeCreated en PagoList).
    ...(canSeeCreated ? [['Creado', fmtDateTimeArg(pago.created_at)]] : []),
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

      {/* Historial de actividad: quién cargó y quién tocó el pago. Es el mismo
          dato de la pantalla Actividad pero acotado a este pago, para no tener
          que ir a buscarlo por OP. Solo roles internos, igual que el resto de
          la información de control de este panel. */}
      {canSeeActivity && (
        <>
          <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>Historial de actividad</div>

          <div className="table-wrap" style={{ marginBottom: '1rem' }}>
            <table className="data-table">
              <thead>
                <tr><th>Fecha</th><th>Usuario</th><th>Acción</th></tr>
              </thead>
              <tbody>
                {loadingActivity ? (
                  <tr><td colSpan={3}><span className="skel" style={{ width: '60%' }} /></td></tr>
                ) : activityHistory.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '1rem', color: 'var(--t3)' }}>
                      {/* El log arrancó después de que se cargaran muchos pagos:
                          vacío no significa que nadie lo tocó. */}
                      Sin actividad registrada para este pago
                    </td>
                  </tr>
                ) : (
                  activityHistory.map((ev) => (
                    <tr key={ev.id}>
                      <td className="td-muted">{fmtDateTimeArg(ev.fecha)}</td>
                      <td>{ev.user?.nombre ?? '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className={`badge ${ACTIVIDAD_BADGE[ev.accion] ?? 'badge-muted'}`}>
                            {ACTIVIDAD_LABEL[ev.accion] ?? ev.accion}
                          </span>
                        </div>
                        {/* Las dos fechas se escriben enteras en vez de dejarlas
                            en un tooltip: es el dato que hay que comparar, y un
                            title no se ve en celular ni se puede copiar. Va por
                            fila y no arriba de la tabla porque así se ve con qué
                            período quedó el pago en cada edición. */}
                        {periodoDistintoDeFecha(ev.snapshot?.fecha, ev.snapshot?.periodo) && (
                          <div style={{
                            display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
                            marginTop: 5, fontSize: 11.5, lineHeight: 1.45, color: 'var(--amber)',
                          }}>
                            <span style={{ fontWeight: 700 }}>⚠ Período fuera del mes de la factura:</span>
                            <span>
                              factura del <strong>{fmtDateUTC(ev.snapshot.fecha)}</strong>
                              {' '}imputada a <strong>{fmtMonthUTC(ev.snapshot.periodo)}</strong>
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Filtros ────────────────────────────────────────────────────────────────

const FILTER_INIT = {
  pagado: '', estado_op: [], rangos_fecha: [],
  id_tipo: [], id_rub: '', id_cat: '',
  audit: '', ingresa_egreso: '', id_metodo: [], cmv_quick: '',
  observaciones: '',
  id_proveedores: [],
  id_rubcats: [],
}

const LIMIT     = 100

// Sin rango de fechas se permite exportar igual, pero acotado: traer la
// historia completa de un local son decenas de miles de filas. Con fechas no
// hay tope, como siempre.
const MAX_EXPORT_SIN_FECHA = 300

// ─── Componente principal ───────────────────────────────────────────────────

export default function PagoList() {
  const navigate    = useNavigate()
  const [searchParams] = useSearchParams()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const activeApp   = useAppStore((s) => s.activeApp)
  // Solo para sugerirle a Google con qué cuenta crear la planilla.
  const user        = useAuthStore((s) => s.user)
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)
  // El panel de filtros colapsa el sidebar mientras está abierto (ver openFilters).
  const sidebarOpen    = useUiStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const role        = activeApp?.role
  const canEdit     = puedeEditar(role)
  const canDelete   = puedeBorrarPagos(role)
  const canAuditDc  = esRolDc(role)
  const canExport   = esRolDc(role)
  // La fecha de creación de la OP es dato interno: solo la ven DC y super admin,
  // en la tabla y en el detalle.
  const canSeeCreated = esRolDc(role)
  // Quién cargó y quién tocó el pago. Mismo criterio: control interno. El
  // backend valida lo mismo, esto solo evita pedir algo que va a dar 403.
  const canSeeActivity = esRolDc(role)
  const [exporting, setExporting] = useState(false)
  const [sheetsLoading, setSheetsLoading] = useState(false)
  // Se baja el script de Google al entrar a la pantalla, no al apretar el
  // botón: si llegara tarde, el popup de permisos quedaría fuera del click.
  useEffect(() => { if (canExport) precargarGoogle() }, [canExport])
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
      ...(filters.estado_op.length > 0 ? { estado_op:        multiParam(filters.estado_op) } : {}),
      // Los rangos viajan como tres CSV paralelos y posicionales. Con un solo
      // rango queda idéntico al formato de siempre. Ver lib/rangosFecha.js.
      ...(filters.rangos_fecha.length > 0 ? {
        campo_fecha: filters.rangos_fecha.map(r => r.campo).join(','),
        desde:       filters.rangos_fecha.map(r => r.desde || '').join(','),
        hasta:       filters.rangos_fecha.map(r => r.hasta || '').join(','),
      } : {}),
      ...(filters.id_tipo.length   > 0 ? { id_tipo:          multiParam(filters.id_tipo) }   : {}),
      ...(filters.id_rub               ? { id_rub:           filters.id_rub }          : {}),
      ...(filters.id_cat               ? { id_cat:           filters.id_cat }          : {}),
      ...(filters.audit          !== '' ? { audit:            filters.audit }           : {}),
      ...(filters.ingresa_egreso !== '' ? { ingresa_egreso:   filters.ingresa_egreso } : {}),
      ...(filters.id_metodo.length > 0 ? { id_metodo:        multiParam(filters.id_metodo) } : {}),
      ...(filters.cmv_quick === 'true' ? { cmv_quick: 'true' }                        : {}),
      ...(filters.observaciones.trim()  ? { observaciones:   filters.observaciones.trim() } : {}),
      ...(filters.id_proveedores.length > 0 ? { id_proveedores: multiParam(filters.id_proveedores) } : {}),
      ...(filters.id_rubcats.length    > 0 ? { id_rubcats:    multiParam(filters.id_rubcats) }  : {}),
    }
  }, [activeLocal?.id, sortField, sortDir, debouncedSearch, filters])

  // ── Volver a página 1 cuando cambian filtros / sort / búsqueda ────────────
  useEffect(() => { setPage(1) }, [buildParams])

  // ── Datos del export: mismos filtros ya aplicados, pero SIN paginar
  // (limit: 0 → el backend trae todas las filas que matchean el where, no una
  // página). Lo comparten los dos destinos, Excel y Google Sheets, para que la
  // planilla sea idéntica salga por donde salga. Devuelve null si no hay filas.
  const prepararExport = useCallback(async () => {
    const { data } = await pagosApi.list({ ...buildParams(1), limit: 0, include_impuestos: 'true' })
    if (!data.data.length) return null

    const pagos = data.data
    // Las columnas de impuesto van entre Neto e Importe.
    const idxImporte = PAGO_CSV_COLUMNS.findIndex(c => c.label === 'Importe')
    // conSignoNotaCredito envuelve al final, sobre las columnas ya armadas,
    // para que las de impuesto entren con el mismo criterio que Neto e
    // Importe y no haya que acordarse de aplicarlo en cada lado.
    const columns = conSignoNotaCredito([
      ...PAGO_CSV_COLUMNS.slice(0, idxImporte),
      ...columnasImpuesto(tiposImpuestoPresentes(pagos)),
      ...PAGO_CSV_COLUMNS.slice(idxImporte),
    ])
    return { pagos, columns, totalsRow: filaTotales(pagos, columns) }
  }, [buildParams])

  const exportCsv = useCallback(async () => {
    setExporting(true)
    try {
      const prep = await prepararExport()
      if (!prep) { notify('No hay filas para exportar con estos filtros', 'info'); return }
      await downloadExcel(`pagos_${todayInputDate()}.xlsx`, prep.pagos, prep.columns, 'Pagos', prep.totalsRow)
    } catch {
      notify('Error al exportar Excel', 'error')
    } finally {
      setExporting(false)
    }
  }, [prepararExport, notify])

  // ── Abrir en Google Sheets ────────────────────────────────────────────────
  // Sube la misma planilla al Drive del usuario, convertida a Sheets nativo, y
  // la abre. Ver lib/googleSheets.js para por qué no pasa por el backend.
  const abrirEnSheets = useCallback(async () => {
    setSheetsLoading(true)
    try {
      // El permiso de Google va PRIMERO, sin ningún await antes: así el popup
      // sigue contando como abierto por el click. Si se pidiera después de
      // traer las filas y armar el archivo, el navegador lo bloquea.
      const token = await pedirAccessToken(user?.email)

      const prep = await prepararExport()
      if (!prep) { notify('No hay filas para exportar con estos filtros', 'info'); return }

      const blob = await excelBlob(prep.pagos, prep.columns, 'Pagos', prep.totalsRow)
      const link = await subirComoSheet(`Pagos DCSmart ${todayInputDate()}`, blob, token)

      // Acá ya pasaron varios awaits, así que este window.open puede venir
      // bloqueado. Si pasa, se ofrece abrirla con un click, que nunca se bloquea.
      if (!window.open(link, '_blank')) {
        const abrir = await showConfirm('La planilla ya está creada en tu Google Drive. ¿La abrimos?', 'Planilla lista')
        if (abrir) window.open(link, '_blank')
      }
      notify('Planilla creada en tu Google Drive', 'success')
    } catch (err) {
      notify(err?.message || 'No se pudo abrir en Google Sheets', 'error')
    } finally {
      setSheetsLoading(false)
    }
  }, [prepararExport, notify, showConfirm, user?.email])

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

  // ── ¿Hay algún filtro que realmente acote la consulta? ─────────────────────
  // Una fila de fecha vacía no cuenta: el panel siembra una al abrirse y
  // buildParams la descarta, así que contarla mostraría el resumen de todo el
  // local creyendo que está filtrado. La búsqueda sí cuenta: acota igual que
  // un filtro, aunque viva fuera de `filters`.
  const hayFiltroAplicado = useMemo(() => {
    if (debouncedSearch.trim()) return true
    return Object.entries(filters).some(([campo, valor]) => {
      if (campo === 'rangos_fecha') return valor.some(r => r.desde || r.hasta)
      return Array.isArray(valor) ? valor.length > 0 : valor !== ''
    })
  }, [filters, debouncedSearch])

  // ── Resumen agregado (total + deuda + impuestos) ───────────────────────────
  // Solo con al menos un filtro aplicado. Sin filtros, el resumen obliga a la
  // base a agregar TODOS los pagos del local en cada visita a la pantalla —
  // son decenas de miles de filas — y el número que sale no le sirve a nadie.
  // Usa los mismos filtros que la tabla pero sin paginar, porque el total debe
  // ser de TODOS los pagos filtrados, no solo la página visible.
  useEffect(() => {
    if (loading || total === 0 || !hayFiltroAplicado) { setSummary(null); return }
    const ctrl = new AbortController()
    setSummaryLoading(true)
    pagosApi.summary(buildParams(1), ctrl.signal)
      .then(({ data }) => setSummary(data))
      .catch(() => { if (!ctrl.signal.aborted) { notify('Error al cargar el resumen', 'error'); setSummary(null) } })
      .finally(() => { if (!ctrl.signal.aborted) setSummaryLoading(false) })
    return () => ctrl.abort()
  }, [buildParams, loading, total, hayFiltroAplicado])

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
  // El panel es parte del layout (`.filters-inline`), no un overlay: la tabla
  // se encoge en vez de quedar tapada, así que se ve el resultado mientras se
  // ajustan los filtros. Al abrirlo se colapsa el sidebar para devolverle a la
  // tabla el ancho que ocupa el panel, y al cerrarlo se restaura el sidebar
  // como estaba antes de abrir.
  const [filterOpen, setFilterOpen] = useState(false)
  const [draft, setDraft] = useState(FILTER_INIT)
  const sidebarAntesRef = useRef(null)

  const activeFilterCount = Object.entries(filters).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== '')).length
  const hasActiveFilters  = activeFilterCount > 0

  // Sin ningún rango de fecha se puede exportar igual, pero solo si el
  // resultado es chico. `total` arranca en 0 y conserva el valor anterior
  // durante un refetch, así que se mira `loading` para no decidir con un
  // número viejo.
  const hayFiltroFecha  = filters.rangos_fecha.some(r => r.desde || r.hasta)
  const exportBloqueado = !loading && !hayFiltroFecha && total > MAX_EXPORT_SIN_FECHA

  const openFilters = () => {
    sidebarAntesRef.current = sidebarOpen
    setSidebarOpen(false)
    // Se siembra una fila de fecha vacía para que los campos se vean sin tener
    // que apretar "agregar" primero. Una fila sin fechas no filtra ni cuenta
    // como filtro activo (la descartan buildParams y normalizarRangos).
    setDraft(filters.rangos_fecha.length > 0
      ? filters
      : { ...filters, rangos_fecha: [{ campo: 'fecha', desde: '', hasta: '' }] })
    setFilterOpen(true)
  }

  const setRangoField = (i, campo, valor) => {
    setDraft(d => ({
      ...d,
      rangos_fecha: d.rangos_fecha.map((r, j) => j === i ? { ...r, [campo]: valor } : r)
    }))
  }

  // Arranca en el primer campo que no esté usado: así dos filas seguidas no
  // quedan las dos en "Fecha de factura", que es el error fácil de cometer.
  const agregarRango = () => {
    setDraft(d => {
      const usados = d.rangos_fecha.map(r => r.campo)
      const libre  = CAMPO_FECHA_OPTIONS.find(o => !usados.includes(o.value))
      return {
        ...d,
        rangos_fecha: [...d.rangos_fecha, { campo: libre?.value ?? 'fecha', desde: '', hasta: '' }]
      }
    })
  }

  const quitarRango = (i) => {
    setDraft(d => ({ ...d, rangos_fecha: d.rangos_fecha.filter((_, j) => j !== i) }))
  }

  // Solo se restaura si el sidebar sigue colapsado: si el usuario lo volvió a
  // abrir a mano con el panel abierto, esa decisión es más nueva que la
  // nuestra y no se pisa.
  const closeFilters = useCallback(() => {
    setFilterOpen(false)
    if (sidebarAntesRef.current && !sidebarOpen) setSidebarOpen(true)
    sidebarAntesRef.current = null
  }, [sidebarOpen, setSidebarOpen])

  const applyFilters   = () => { setFilters(draft); closeFilters() }
  const clearFilters   = () => { setDraft(FILTER_INIT); setFilters(FILTER_INIT); setSearch('') }

  // ── Mis filtros (presets guardados) ───────────────────────────────────────
  // Privados por usuario y solo para DC/super admin, igual que en el backend.
  const [presets,      setPresets]      = useState([])
  const [presetsMax,   setPresetsMax]   = useState(5)
  const [presetSaving, setPresetSaving] = useState(false)

  useEffect(() => {
    if (!canSeeCreated) return
    filtroPresetsApi.list('pagos')
      .then(({ data }) => { setPresets(data.data); setPresetsMax(data.max) })
      .catch(() => {})
  }, [canSeeCreated])

  // Guarda lo que está en el borrador, no lo aplicado: así se puede armar una
  // combinación y guardarla sin tener que aplicarla primero.
  const savePreset = async () => {
    const nombre = await showPrompt('¿Con qué nombre guardás este filtro?', { placeholder: 'Ej: CMV sin auditar' })
    if (nombre === null) return
    if (!nombre.trim()) return notify('El filtro necesita un nombre', 'error')

    setPresetSaving(true)
    try {
      const { data } = await filtroPresetsApi.create({ modulo: 'pagos', nombre, filtros: draft })
      setPresets(ps => [...ps, data])
      notify('Filtro guardado', 'success')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar el filtro', 'error')
    } finally { setPresetSaving(false) }
  }

  // Aplica el preset directamente (no solo al borrador): elegirlo de la lista
  // es una acción deliberada, no hace falta confirmar con Aplicar.
  // Los presets guardados antes del multiselect tienen strings donde ahora van
  // arrays -- se normalizan al aplicarlos, sin migrar nada en la base. Esto
  // incluye id_rubcats (antes array de ids sueltos) e id_proveedores (antes
  // array de {id,nombre}), migrados al formato {value,label} en la Task 10.
  const applyPreset = (preset) => {
    const guardado = preset.filtros || {}
    const metodoOptions = metodos.map(m => ({ value: m.id, label: m.nombre }))
    const rubcatOptions = rubcats.map(rc => ({
      value: rc.id,
      label: `${rc.rubro?.nombre ?? ''} / ${rc.categoria?.nombre ?? ''}`,
    }))
    const filtros = {
      ...FILTER_INIT,
      ...guardado,
      rangos_fecha:   normalizarRangos(guardado),
      id_tipo:        normalizarMulti(guardado.id_tipo, TIPO_PAGO_MULTI),
      estado_op:      normalizarMulti(guardado.estado_op, ESTADO_OP_OPTIONS),
      id_metodo:      normalizarMulti(guardado.id_metodo, metodoOptions),
      id_rubcats:     normalizarMulti(guardado.id_rubcats, rubcatOptions),
      id_proveedores: normalizarMulti(guardado.id_proveedores),
    }
    // El spread de `guardado` puede traer las claves del formato viejo. Se
    // borran para que no queden como zombies: ya se leyeron en normalizarRangos
    // y si quedaran inflarían el contador de filtros activos y habilitarían el
    // export con un filtro que ya no aplica.
    delete filtros.campo_fecha
    delete filtros.desde
    delete filtros.hasta
    setDraft(filtros)
    setFilters(filtros)
  }

  const deletePreset = async (preset, e) => {
    e.stopPropagation()
    if (!(await showConfirm(`¿Borrar el filtro "${preset.nombre}"?`))) return
    try {
      await filtroPresetsApi.remove(preset.id)
      setPresets(ps => ps.filter(p => p.id !== preset.id))
      notify('Filtro borrado', 'success')
    } catch { notify('Error al borrar el filtro', 'error') }
  }

  // Pisa un preset existente con el borrador actual.
  const overwritePreset = async (preset, e) => {
    e.stopPropagation()
    if (!(await showConfirm(`¿Reemplazar "${preset.nombre}" con los filtros que tenés ahora?`))) return
    try {
      const { data } = await filtroPresetsApi.update(preset.id, { filtros: draft })
      setPresets(ps => ps.map(p => (p.id === preset.id ? data : p)))
      notify('Filtro actualizado', 'success')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al actualizar el filtro', 'error')
    }
  }

  // Escape cierra el panel. DrawerPanel lo traía incluido; el aside no, y sin
  // esto la única salida sería el botón.
  useEffect(() => {
    if (!filterOpen) return
    const onKey = (e) => { if (e.key === 'Escape') closeFilters() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filterOpen, closeFilters])
  const setDraftField  = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  // El MultiSelect ya hace el debounce; acá solo se traduce la respuesta del
  // backend al formato { value, label }.
  const buscarProveedores = useCallback(async (q) => {
    const r = await proveedoresApi.list({ search: q, activo: 'true', limit: 30 })
    return (r.data?.data || []).map(p => ({ value: p.id, label: p.nombre }))
  }, [])

  const hasCmvRubros = rubros.some(r => r.nombre?.toUpperCase().startsWith('CMV'))
  const CHIPS = [
    { label: 'STK',         filters: { id_tipo: [{ value: 'STK', label: 'STK' }] } },
    { label: 'CMV',         filters: { cmv_quick: 'true' }, disabled: !hasCmvRubros },
    { label: 'No auditado', filters: { audit: 'false' } },
    { label: 'No pagado',   filters: { pagado: 'false' } },
    { label: 'Egreso',      filters: { ingresa_egreso: 'false' } },
  ]

  const mismoValor = (a, b) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      const va = (a || []).map(x => x.value).join(',')
      const vb = (b || []).map(x => x.value).join(',')
      return va !== '' && va === vb
    }
    return b !== '' && a === b
  }

  const isChipActive = (chipFilters) =>
    Object.entries(chipFilters).every(([k, v]) => mismoValor(draft[k], v))

  const toggleChip = (chipFilters) => {
    if (isChipActive(chipFilters)) {
      const cleared = Object.keys(chipFilters).reduce(
        (acc, k) => ({ ...acc, [k]: Array.isArray(FILTER_INIT[k]) ? [] : '' }), {})
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
  const colCount = 19 + (showLocalCol ? 1 : 0) + (selectionMode ? 1 : 0) + (canSeeCreated ? 1 : 0)

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

          {/* El panel de filtros es el aside .filters-inline, al lado de la tabla */}
          <button
            className={`btn ${filterOpen || hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => filterOpen ? closeFilters() : openFilters()}
          >
            <IcoFilter />
            Filtros
            {activeFilterCount > 0 && (
              <span style={{ marginLeft: 6, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                {activeFilterCount}
              </span>
            )}
          </button>
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
                disabled={exporting || loading || exportBloqueado}
                title={exportBloqueado
                  ? `Hay ${total} pagos y sin filtro de fecha el máximo es ${MAX_EXPORT_SIN_FECHA}. Poné un rango de fechas o afiná los filtros.`
                  : 'Exportar a Excel los pagos con los filtros actuales'}
              >
                {exporting ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <IcoDownload />} Exportar Excel
              </button>
            )}
            {canExport && sheetsDisponible() && (
              <button
                className="btn btn-secondary"
                onClick={abrirEnSheets}
                disabled={sheetsLoading || loading || exportBloqueado}
                title={exportBloqueado
                  ? `Hay ${total} pagos y sin filtro de fecha el máximo es ${MAX_EXPORT_SIN_FECHA}. Poné un rango de fechas o afiná los filtros.`
                  : 'Crear la planilla en tu Google Drive y abrirla en una pestaña nueva'}
              >
                {sheetsLoading ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <IcoSheets />} Abrir en Sheets
              </button>
            )}
          </ActionsMenu>
          <button className="btn btn-primary" onClick={() => navigate('/pagos/nuevo')}>
            <IcoPlus /> Nuevo Pago
          </button>
        </div>
      </div>

      <div className="page-with-filters">
      <div className="page-with-filters-main">

      {/* Sin filtros no se calcula el resumen (es una agregación sobre todos los
          pagos del local). Se avisa en vez de no mostrar nada, así no parece
          que la pantalla se rompió. */}
      {!hayFiltroAplicado && !loading && total > 0 && (
        <div style={{
          background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 10,
          padding: '0.6rem 1rem', marginBottom: '1rem', fontSize: 13, color: 'var(--t3)',
        }}>
          Aplicá un filtro para ver los totales del resultado.
        </div>
      )}

      {(summaryLoading || summary) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 1rem', minWidth: 140 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.03em' }}>TOTAL IMPORTE</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {summaryLoading ? <span className="skel" style={{ width: 80, height: 16, display: 'inline-block' }} /> : fmt$(summary?.total_importe)}
            </div>
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 1rem', minWidth: 140 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.03em' }}
                 title="Egresos impagos menos ingresos impagos: las notas de crédito restan">
              TOTAL DEUDA
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {summaryLoading ? <span className="skel" style={{ width: 80, height: 16, display: 'inline-block' }} /> : fmt$(summary?.total_deuda)}
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
              <th style={{ width: 44, textAlign: 'center' }} title="Auditado">Aud</th>
              <SortTh field="nro_ord" minWidth={70}>OP</SortTh>
              <SortTh field="fecha" minWidth={90}>Fecha</SortTh>
              <SortTh field="proveedor" minWidth={140}>Proveedor</SortTh>
              <th style={{ minWidth: 160 }}>Rubro / Cat</th>
              <th style={{ minWidth: 80 }}>Tipo</th>
              <th style={{ minWidth: 90 }}>PV / Nro</th>
              <th>Neto</th>
              <SortTh field="importe" minWidth={90}>Importe</SortTh>
              <th>Método</th>
              <th style={{ minWidth: 140 }}>Observaciones</th>
              <th>Cashflow</th>
              <th style={{ width: 44, textAlign: 'center' }} title="Ingreso / Egreso">E/I</th>
              <th>Estado</th>
              <th>Pagado</th>
              <SortTh field="fecha_pago" minWidth={90}>Fecha Pago</SortTh>
              <SortTh field="periodo" minWidth={80}>Período</SortTh>
              <th style={{ minWidth: 40, textAlign: 'center' }}>Foto</th>
              <th style={{ minWidth: 40, textAlign: 'center' }}>PDF</th>
              {showLocalCol && <th>Local</th>}
              {canSeeCreated && <SortTh field="created_at" minWidth={120}>Creado</SortTh>}
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
                  <td style={{ width: 44, textAlign: 'center' }}>
                    <span style={{ color: p.audit ? 'var(--green)' : 'var(--amber)' }} title={p.audit ? 'Auditado' : 'No auditado'}>
                      {p.audit ? <IcoThumbUp /> : <IcoEye />}
                    </span>
                  </td>
                  <td className="td-primary" style={{ minWidth: 70, whiteSpace: 'nowrap' }}>{p.nro_ord != null ? `OP-${p.nro_ord}` : <span className="td-muted">—</span>}</td>
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
                  <td className="td-mono" style={{ minWidth: 90, whiteSpace: 'nowrap' }}>
                    {(p.pv != null || p.nro != null)
                      ? <span>{fmtPV(p.pv)}<span className="td-muted">-</span>{fmtNro(p.nro)}</span>
                      : <span className="td-muted">—</span>}
                  </td>
                  <td className="td-number" style={{ minWidth: 100 }}>{fmt$(p.importe_neto)}</td>
                  <td className="td-number" style={{ minWidth: 100, color: 'var(--gold-bright)', fontWeight: 700 }}>{fmt$(p.importe)}</td>
                  <td style={{ minWidth: 120, fontSize: 12 }}>{p.metodo_pago?.nombre || <span className="td-muted">—</span>}</td>
                  {/* El truncado va en un span inline-block y no en el td:
                      .data-table es width 100% sin table-layout fixed, y el
                      max-width de una celda de tabla no se respeta de forma
                      confiable en layout automatico. */}
                  <td style={{ fontSize: 12 }} title={p.observaciones || ''}>
                    {p.observaciones
                      ? <span style={{ display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                          {p.observaciones}
                        </span>
                      : <span className="td-muted">—</span>}
                  </td>
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
                  <td style={{ minWidth: 90 }}>{fmtDateArg(p.fecha_pago)}</td>
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
                  {canSeeCreated && <td style={{ minWidth: 120, fontSize: 12 }} className="td-muted">{fmtDateTimeArg(p.created_at)}</td>}
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

      </div>{/* /page-with-filters-main */}

      {filterOpen && (
        <aside className="filters-inline">
          <div className="filters-inline-head">
            <span className="filters-inline-title">
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </span>
            <button className="filters-inline-close" onClick={closeFilters} type="button" title="Cerrar filtros">
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="filters-inline-body">
            {/* Mis filtros (presets guardados). Solo DC/super admin. */}
            {canSeeCreated && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={lbl}>Mis filtros ({presets.length}/{presetsMax})</span>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={savePreset}
                    disabled={presetSaving || presets.length >= presetsMax}
                    title={presets.length >= presetsMax
                      ? `Llegaste al máximo de ${presetsMax}. Borrá uno para guardar otro.`
                      : 'Guardar los filtros que tenés puestos ahora'}
                    style={{ padding: '2px 8px', fontSize: 11 }}
                  >
                    {presetSaving ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} /> : '+ Guardar'}
                  </button>
                </div>
                {presets.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                    Armá una combinación de filtros y guardala para reusarla.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {presets.map(p => (
                      <div
                        key={p.id}
                        onClick={() => applyPreset(p)}
                        title="Aplicar este filtro"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          padding: '5px 8px', borderRadius: 8, fontSize: 12,
                          background: 'var(--bg-input)', border: '1px solid var(--border)',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.nombre}
                        </span>
                        <button
                          onClick={(e) => overwritePreset(p, e)}
                          title="Reemplazar con los filtros actuales"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 11, padding: '0 2px' }}
                        >
                          ↻
                        </button>
                        <button
                          onClick={(e) => deletePreset(p, e)}
                          title="Borrar este filtro"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Atajos */}
            <span style={lbl}>Atajos</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {CHIPS.filter(c => !c.disabled).map(chip => (
                <button key={chip.label} style={chipSt(isChipActive(chip.filters))} onClick={() => toggleChip(chip.filters)}>
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Clasificación</div>
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              <div>
                <span style={lbl}>Tipo</span>
                <MultiSelect
                  value={draft.id_tipo}
                  onChange={(v) => setDraftField('id_tipo', v)}
                  options={TIPO_PAGO_MULTI}
                  placeholder="Todos los tipos"
                />
              </div>
              <div>
                <span style={lbl}>Método</span>
                <MultiSelect
                  value={draft.id_metodo}
                  onChange={(v) => setDraftField('id_metodo', v)}
                  options={metodos.map(m => ({ value: m.id, label: m.nombre }))}
                  placeholder="Todos los métodos"
                />
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
            </div>

            {/* Multi-select rubcats */}
            <div style={{ marginTop: '0.75rem' }}>
              <span style={lbl}>Rubros/Cat (múltiple)</span>
              <MultiSelect
                value={draft.id_rubcats}
                onChange={(v) => setDraftField('id_rubcats', v)}
                options={rubcats.map(rc => ({
                  value: rc.id,
                  label: `${rc.rubro?.nombre ?? ''} / ${rc.categoria?.nombre ?? ''}`,
                }))}
                placeholder="Todos los rubros/cat"
              />
            </div>

            <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Proveedor</div>
            <div>
              <span style={lbl}>Proveedores</span>
              <MultiSelect
                value={draft.id_proveedores}
                onChange={(v) => setDraftField('id_proveedores', v)}
                fetchOptions={buscarProveedores}
                placeholder="Todos los proveedores"
              />
            </div>

            <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Estado</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
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
                <MultiSelect
                  value={draft.estado_op}
                  onChange={(v) => setDraftField('estado_op', v)}
                  options={ESTADO_OP_OPTIONS}
                  placeholder="Todos"
                />
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
            </div>

            <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>
              Fechas
              {draft.rangos_fecha.length > 1 && (
                <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.7 }}> — se combinan con Y</span>
              )}
            </div>

            {draft.rangos_fecha.map((rango, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.6rem', alignItems: 'end', marginBottom: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={lbl}>Tipo de fecha</span>
                  <select
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={rango.campo}
                    onChange={e => setRangoField(i, 'campo', e.target.value)}
                  >
                    {CAMPO_FECHA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <span style={lbl}>Desde</span>
                  <input type="date" className="filter-select" style={{ width: '100%' }}
                    value={rango.desde}
                    onChange={e => setRangoField(i, 'desde', e.target.value)} />
                </div>
                <div>
                  <span style={lbl}>Hasta</span>
                  <input type="date" className="filter-select" style={{ width: '100%' }}
                    value={rango.hasta}
                    onChange={e => setRangoField(i, 'hasta', e.target.value)} />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  aria-label="Quitar este filtro de fecha"
                  title="Quitar este filtro de fecha"
                  onClick={() => quitarRango(i)}
                >
                  ✕
                </button>
              </div>
            ))}

            <button type="button" className="btn btn-secondary btn-sm" onClick={agregarRango}>
              + agregar fecha
            </button>

            <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Texto</div>
            <div>
              <span style={lbl}>Observaciones</span>
              <div className="form-input-wrap">
                <input
                  placeholder="Contiene el texto..."
                  value={draft.observaciones}
                  onChange={e => setDraftField('observaciones', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="filters-inline-foot">
            <button className="btn btn-secondary" onClick={clearFilters}>Limpiar todo</button>
            <button className="btn btn-primary" onClick={applyFilters}>Aplicar</button>
          </div>
        </aside>
      )}

      </div>{/* /page-with-filters */}

      <DrawerPanel
        open={panelOpen}
        onClose={closePanel}
        title={selectedPago ? `OP-${selectedPago.nro_ord ?? selectedPago.id?.slice(0, 8)}` : 'Detalle de Pago'}
        width={580}
      >
        {selectedPago && (
          <PagoDetailPanel pago={selectedPago} navigate={navigate} onDelete={handleDelete} onAudit={patchPagoAudit} onPatch={patchPago} metodos={metodos} canEdit={canEdit} canDelete={canDelete} canAuditDc={canAuditDc} canSeeCreated={canSeeCreated} canSeeActivity={canSeeActivity} />
        )}
      </DrawerPanel>

    </div>
  )
}
