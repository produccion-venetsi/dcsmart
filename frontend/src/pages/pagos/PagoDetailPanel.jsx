// Detalle completo de un pago, con el menú Acciones (Auditar, Audit DC, PDP,
// Pagar, Periódico, Eliminar) y las secciones de impuestos, multimoneda e
// historiales. Vivía como función privada de PagoList y el dashboard de PDP
// tenía su propia copia reducida de solo lectura, así que desde PDP no se
// podía auditar una OP. Ahora es un componente compartido: cada página le
// pasa sus handlers (onDelete/onAudit/onPatch) para refrescar su propia vista.
import { useEffect, useState } from 'react'
import { pagosApi } from '../../api/pagos.js'
import { impuestosApi } from '../../api/impuestos.js'
import { useUiStore } from '../../store/uiStore.js'
import FotoViewer from '../../components/FotoViewer.jsx'
import ActionsMenu from '../../components/ActionsMenu.jsx'
import { nowDateTimeLocalInput, toUtcIsoFromDateTimeLocal, fmtDateArg, fmtDateTimeArg, fmtDateUTC, fmtMonthUTC, periodoDistintoDeFecha } from '../../lib/dates.js'
import { TIPO_BADGE } from '../../lib/tipoPagoBadges.js'
import { nombreProveedor, razonSocialExtra } from '../../lib/proveedorLabel.js'
import { ESTADO_OP_LABEL, ESTADO_OP_BADGE } from '../../lib/estadoOp.js'

const ESTADO_BADGE = ESTADO_OP_BADGE
// Sin PERCEPCION en el alta: se reemplazo por PERC_IVA / PERC_IIBB. Al editar
// un impuesto historico que ya es PERCEPCION, la opcion se agrega para que el
// select no muestre otra cosa que la guardada.
const TIPOS_IMP = ['IVA21', 'IVA27', 'IVA10', 'RETENCION', 'PERC_IVA', 'PERC_IIBB', 'IMP_INTERNOS']

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
function IcoPlane() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
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
function IcoSparkles() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  )
}

function fmt$(n)     { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }
function fmtDate(d)  { return d ? new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—' }
function fmtMonth(d) { return d ? new Date(d).toLocaleDateString('es-AR', { year: 'numeric', month: 'short', timeZone: 'UTC' }) : '—' }
function fmtPV(v)    { return v != null ? String(v).padStart(5, '0') : '—' }
function fmtNro(v)   { return v != null ? String(v).padStart(8, '0') : '—' }

// Mismas etiquetas y colores que la pantalla Actividad, para que el badge se
// lea igual en los dos lados.
const ACTIVIDAD_LABEL = { creado: 'Creado', editado: 'Editado', eliminado: 'Eliminado' }
const ACTIVIDAD_BADGE = { creado: 'badge-green', editado: 'badge-blue', eliminado: 'badge-red' }

export default function PagoDetailPanel({ pago, navigate, onDelete, onAudit, onPatch, metodos = [], canEdit = false, canDelete = false, canAuditDc = false, canSeeCreated = false, canSeeActivity = false }) {
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
    ['Proveedor',   nombreProveedor(pago.proveedor) || '—'],
    // La razón social va como fila propia solo cuando difiere del nombre: es
    // la que figura impresa en la factura y antes no se veía en ningún lado.
    ...(razonSocialExtra(pago.proveedor) ? [['Razón Social', razonSocialExtra(pago.proveedor)]] : []),
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
        {pago.cargado_con_ia && (
          <span className="badge badge-gold" style={{ gap: 4 }}><IcoSparkles /> Carga con IA</span>
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
        <div style={{ marginTop: '0.75rem', marginBottom: '1rem', padding: '10px 14px', background: 'rgba(var(--velo-rgb), 0.04)', borderRadius: 10, fontSize: 13, color: 'var(--t2)' }}>
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
                              {(TIPOS_IMP.includes(editImpForm.tipo) ? TIPOS_IMP : [...TIPOS_IMP, editImpForm.tipo]).map(t => <option key={t}>{t}</option>)}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(var(--velo-rgb), 0.04)', borderRadius: 8, marginBottom: '1rem' }}>
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
