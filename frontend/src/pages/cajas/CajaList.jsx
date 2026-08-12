import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { movimientosApi } from '../../api/movimientos.js'
import { detallesApi } from '../../api/detalles.js'
import { metodosApi } from '../../api/metodospago.js'
import { puedeEditar, puedeBorrarCajas, puedeCrearCajas } from '../../lib/roles.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import FotoViewer from '../../components/FotoViewer.jsx'
import AdjuntoUpload from '../../components/AdjuntoUpload.jsx'
import ActionsMenu from '../../components/ActionsMenu.jsx'
import TipoDetalleCombo from '../../components/TipoDetalleCombo.jsx'
import { clasificacionLabel, clasificacionDeDetalle, normalizarClasificacion } from '../../lib/clasificaciones.js'
import ClasificacionSelect from '../../components/ClasificacionSelect.jsx'
import TablaDesglose from '../../components/TablaDesglose.jsx'
import TipoMovimientoSelect from '../../components/TipoMovimientoSelect.jsx'
import { agruparDetalles, agruparMovimientos, sumaMontos } from '../../lib/desgloses.js'
import { claseBadgeMovimiento } from '../../lib/tiposMovimiento.js'
import { fmtPorcentajeAvion, claseAvion, porcentajeAvion } from '../../lib/avion.js'
import { conTipoElegido } from '../../lib/detalleForm.js'
import { downloadExcel } from '../../lib/excel.js'
import { fmtDateArg, fmtDateTimeArg, toDateTimeLocalInput, toUtcIsoFromDateTimeLocal, todayInputDate } from '../../lib/dates.js'
import MultiSelect from '../../components/MultiSelect.jsx'
import CajaCreatePanel from './CajaCreatePanel.jsx'
import { TIPOS_TURNO } from '../../lib/tiposTurno.js'
import { multiParam } from '../../lib/filtros.js'
import { AYUDA_EFECTIVO } from '../../lib/camposCaja.js'

// EMPTY_CAJA se fue con CajaCreatePanel: era el estado inicial del alta y este
// listado ya no lo usa.

// TIPOS_TURNO ahora vive en lib/tiposTurno.js: lo comparten este filtro, el alta
// de caja (CajaCreatePanel) y el filtro del reporte de Cajas.
const TURNO_OPTIONS = TIPOS_TURNO.map(t => ({ value: t, label: t }))

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
// Mismos accesos rápidos que la pantalla de Pagos (PagoList.jsx): crean un
// pago en modo rápido sin pasar por Pagos. Mismos íconos, para que se
// reconozcan como el mismo atajo en las dos pantallas.
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
function IcoCheckSquare() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}
function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}
function IcoCaja() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
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
function IcoEdit() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}
function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
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
function IcoDownload() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0 })}` : '—' }
function fmt$2(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }

// Origen de la caja: de dónde salieron los datos. Antes las cargadas a mano
// mostraban un guión y las de TapTap un gris igual al del resto de la fila, así
// que había que fijarse para distinguirlas. Ahora cada origen tiene su color.
const LABEL_ORIGEN = { DCSMART: 'Manual', TAPTAP: 'Tap Tap', FFUDO: 'FFUDO' }
const BADGE_ORIGEN = { DCSMART: 'badge-blue', TAPTAP: 'badge-purple', FFUDO: 'badge-amber' }

// Semáforo del cuadre en la tabla: ✅ cuadra, ⚠️ no cuadra, guión cuando no se
// puede saber (una caja sin total cargado no tiene contra qué comparar).
// El cálculo llega hecho del backend en `caja.cuadre` (lib/cuadreCaja.js).
function IcoCuadre({ cuadra }) {
  if (cuadra == null) return <span className="td-muted">—</span>
  return (
    <span style={{ color: cuadra ? 'var(--green)' : 'var(--amber)', fontSize: 13 }}>
      {cuadra ? '✅' : '⚠️'}
    </span>
  )
}

function tituloCuadre(cuadre) {
  if (!cuadre) return 'Sin datos para calcular el cuadre'
  if (cuadre.cuadra == null) return 'Sin total cargado: no hay contra qué comparar'
  const base = `Efectivo ${fmt$(cuadre.efectivo)} + cobros ${fmt$(cuadre.cobros)}`
    + `${cuadre.gastos ? ` − gastos ${fmt$(cuadre.gastos)}` : ''} = ${fmt$(cuadre.esperado)}`
    + ` vs. total declarado ${fmt$(cuadre.total)}. Los cobros salen de los ${cuadre.fuente} de esta caja.`
  if (cuadre.cuadra) return `Cuadra. ${base}`
  const signo = cuadre.diferencia > 0 ? 'sobra' : 'falta'
  return `No cuadra: ${signo} ${fmt$(Math.abs(cuadre.diferencia))}. ${base}`
}

function tituloAvion(caja) {
  if (caja.total == null || Number(caja.total) <= 0) return 'Sin total cargado'
  if (caja.fiscal == null) return 'Sin fiscal cargado'
  return `Total ${fmt$(caja.total)} − fiscal ${fmt$(caja.fiscal)} sobre el total`
}
// fecha_inicio/fecha_cierre son instantes reales (con hora), no fechas de
// calendario a medianoche UTC -- por eso el "día" y la hora completa se
// muestran siempre en hora de Argentina, no forzando UTC.
const fmtDate = fmtDateArg
const fmtDT = fmtDateTimeArg

// Montos como número plano (sin "$") para que Excel/Sheets los reconozca como
// numéricos al importar el CSV.
//
// El CSV lleva MÁS columnas que la tabla, a propósito: de la pantalla se sacaron
// Fiscal y Cierre porque estorbaban al revisar turnos, pero en una exportación
// que se abre en Sheets para analizar no molestan y sacarlas sería perder datos.
const CAJA_CSV_COLUMNS = [
  { label: 'Nro Turno',  get: (c) => c.nro_turno ? `TRN ${c.nro_turno}` : '' },
  { label: 'Tipo',       get: (c) => c.tipo_turno || '' },
  { label: 'Auditado',   get: (c) => c.audit ? 'Sí' : 'No' },
  { label: 'Cuadra',     get: (c) => c.cuadre?.cuadra == null ? '' : (c.cuadre.cuadra ? 'Sí' : 'No') },
  { label: 'Diferencia', get: (c) => c.cuadre?.diferencia ?? '' },
  { label: 'Inicio',     get: (c) => c.fecha_inicio ? fmtDate(c.fecha_inicio) : '' },
  { label: 'Cierre',     get: (c) => c.fecha_cierre ? fmtDate(c.fecha_cierre) : '' },
  { label: 'Cajero',     get: (c) => c.cajero || '' },
  { label: 'Total',      get: (c) => c.total ?? '' },
  { label: 'Efectivo',   get: (c) => c.efectivo ?? '' },
  { label: 'Total Detalles', get: (c) => c.total_detalles ?? '' },
  { label: 'Fiscal',     get: (c) => c.fiscal ?? '' },
  // Número sin el signo %, para poder sumar y promediar en la planilla.
  { label: '% Avión',    get: (c) => porcentajeAvion(c.total, c.fiscal) ?? '' },
  { label: 'Cub',        get: (c) => c.comensales ?? '' },
  { label: 'Tkt',        get: (c) => c.tickets ?? '' },
  { label: 'Origen',     get: (c) => LABEL_ORIGEN[c.origin] ?? c.origin ?? '' },
  { label: 'Local',      get: (c) => c.local?.nombre || '' },
  { label: 'Observaciones', get: (c) => c.observaciones || '' },
]

// La diferencia de caja se calcula en el backend (lib/cuadreCaja.js) y viene en
// `caja.cuadre`. Acá solo se muestran sumas crudas por sección, con `sumaMontos`
// de lib/desgloses.js — la misma que suma los grupos, para que el total de la
// tabla y la suma de sus grupos no puedan divergir.

function CajaDetailPanel({ cajaId, onRefreshList, canEdit, canDelete, canAuditDc, onEdit, onDelete }) {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)
  const [caja,       setCaja]      = useState(null)
  const [loading,    setLoading]   = useState(true)
  const [metodos,    setMetodos]   = useState([])
  const [tipos,      setTipos]     = useState([])
  const [newMov,     setNewMov]    = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [saving,     setSaving]    = useState(false)
  const [addingMov,  setAddingMov] = useState(false)
  const [newDet,     setNewDet]    = useState({ clasificacion: 'cobro', id_tipo: '', nombre: '', monto: '', observaciones: '' })
  const [savingDet,  setSavingDet] = useState(false)
  const [addingDet,  setAddingDet] = useState(false)
  const [editingMovId, setEditingMovId] = useState(null)
  const [editMovForm,  setEditMovForm]  = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [savingMovEdit, setSavingMovEdit] = useState(false)
  const [editingDetId, setEditingDetId] = useState(null)
  const [editDetForm,  setEditDetForm]  = useState({ id_tipo: '', nombre: '', monto: '', observaciones: '' })
  const [savingDetEdit, setSavingDetEdit] = useState(false)
  const [auditando,  setAuditando] = useState(false)
  const [auditandoDc, setAuditandoDc] = useState(false)
  const [auditHistory, setAuditHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const load = () => {
    setLoading(true)
    cajasApi.get(cajaId)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar caja', 'error'))
      .finally(() => setLoading(false))
  }

  const loadAuditHistory = () => {
    setLoadingHistory(true)
    cajasApi.auditHistory(cajaId)
      .then(({ data }) => setAuditHistory(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => {
    if (!cajaId) return
    load()
    loadAuditHistory()
    metodosApi.list()
      .then(r => setMetodos(r.data || []))
      .catch(() => {})
  }, [cajaId])

  // El catálogo se pide con o sin local. GET /caja-detalles/tipos ya devuelve los
  // tipos del grupo (id_local null) y le SUMA los del local cuando se le pasa uno,
  // así que cortar la llamada por no tener local dejaba el combo vacío teniendo 25
  // tipos disponibles. En LOS GALGOS los 25 son del grupo: sin local igual salen.
  useEffect(() => {
    detallesApi.tipos(caja?.id_local)
      .then(r => setTipos(r.data || []))
      .catch(() => notify('No se pudieron cargar los nombres de detalle', 'error'))
  }, [caja?.id_local, notify])

  const handleAddMov = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await movimientosApi.create({
        tipo:      newMov.tipo,
        id_metodo: newMov.id_metodo || null,
        monto:     parseFloat(newMov.monto),
        id_caja:   cajaId,
        cantidad:  newMov.cantidad ? parseInt(newMov.cantidad) : null
      })
      notify('Movimiento agregado', 'success')
      setNewMov({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
      setAddingMov(false)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error al agregar movimiento', 'error') }
    finally { setSaving(false) }
  }

  const handleDeleteMov = async (movId) => {
    if (!(await showConfirm('¿Eliminar movimiento?'))) return
    try { await movimientosApi.remove(movId); notify('Eliminado', 'success'); load() }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const handleAddDet = async (e) => {
    e.preventDefault()
    setSavingDet(true)
    try {
      await detallesApi.create({
        id_caja:       cajaId,
        id_tipo:       newDet.id_tipo       || null,
        clasificacion: newDet.clasificacion || null,
        nombre:        newDet.id_tipo ? null : (newDet.nombre || null),
        monto:         parseFloat(newDet.monto),
        observaciones: newDet.observaciones || null
      })
      notify('Detalle agregado', 'success')
      setNewDet({ clasificacion: 'cobro', id_tipo: '', nombre: '', monto: '', observaciones: '' })
      setAddingDet(false)
      load()
    } catch { notify('Error al agregar detalle', 'error') }
    finally { setSavingDet(false) }
  }

  const handleDeleteDet = async (detId) => {
    if (!(await showConfirm('¿Eliminar detalle?'))) return
    try { await detallesApi.remove(detId); notify('Eliminado', 'success'); load() }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const handleEditMov = (m) => {
    setEditingMovId(m.id)
    setEditMovForm({ tipo: m.tipo, id_metodo: m.id_metodo || '', monto: String(m.monto), cantidad: m.cantidad != null ? String(m.cantidad) : '' })
  }

  const handleSaveMov = async (movId) => {
    if (!editMovForm.monto) return
    setSavingMovEdit(true)
    try {
      await movimientosApi.update(movId, {
        tipo:      editMovForm.tipo,
        id_metodo: editMovForm.id_metodo || null,
        monto:     parseFloat(editMovForm.monto),
        cantidad:  editMovForm.cantidad ? parseInt(editMovForm.cantidad) : null
      })
      notify('Movimiento actualizado', 'success')
      setEditingMovId(null)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error al actualizar', 'error') }
    finally { setSavingMovEdit(false) }
  }

  const handleEditDet = (d) => {
    setEditingDetId(d.id)
    setEditDetForm({
      id_tipo:       d.id_tipo || '',
      clasificacion: normalizarClasificacion(clasificacionDeDetalle(d)),
      nombre:        d.detalle_tipo?.nombre || d.nombre || '',
      monto:         String(d.monto),
      observaciones: d.observaciones || ''
    })
  }

  const handleSaveDet = async (detId) => {
    if (!editDetForm.monto) return
    setSavingDetEdit(true)
    try {
      await detallesApi.update(detId, {
        id_tipo:       editDetForm.id_tipo || null,
        clasificacion: editDetForm.clasificacion || null,
        nombre:        editDetForm.id_tipo ? null : (editDetForm.nombre || null),
        monto:         parseFloat(editDetForm.monto),
        observaciones: editDetForm.observaciones || null
      })
      notify('Detalle actualizado', 'success')
      setEditingDetId(null)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error al actualizar', 'error') }
    finally { setSavingDetEdit(false) }
  }

  const handleAudit = async () => {
    let observaciones
    if (caja.audit) {
      observaciones = await showPrompt(
        'Esta caja ya está auditada. ¿Querés desauditarla? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditando(true)
    try {
      const { data } = await cajasApi.audit(cajaId, caja.audit ? { observaciones } : undefined)
      notify(data.audit ? 'Caja auditada' : 'Auditoría revertida', 'success')
      setCaja(prev => ({ ...prev, audit: data.audit }))
      onRefreshList?.()
      loadAuditHistory()
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }

  const handleAuditDc = async () => {
    let observaciones
    if (caja.audit_dc) {
      observaciones = await showPrompt(
        'Esta caja ya tiene audit DC. ¿Querés revertirlo? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditandoDc(true)
    try {
      const { data } = await cajasApi.auditDc(cajaId, caja.audit_dc ? { observaciones } : undefined)
      notify(data.audit_dc ? 'Audit DC aplicado' : 'Audit DC revertido', 'success')
      setCaja(prev => ({ ...prev, audit_dc: data.audit_dc, audit: data.audit }))
      onRefreshList?.()
      loadAuditHistory()
    } catch { notify('Error al auditar (DC)', 'error') }
    finally { setAuditandoDc(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>
  if (!caja) return <div style={{ color: 'var(--red)', padding: '1rem' }}>No se pudo cargar la caja.</div>

  // La diferencia la calcula el backend (lib/cuadreCaja.js). Antes se calculaba
  // acá y en CajaDetail, y las dos copias habían divergido: la misma caja
  // mostraba diferencias distintas según desde dónde se la mirara.
  const cuadre = caja.cuadre ?? {}
  const hayDescuadre = cuadre.cuadra === false
  const descuadre = cuadre.diferencia

  const gruposDetalles    = agruparDetalles(caja.detalles)
  const gruposMovimientos = agruparMovimientos(caja.movimientos)

  const rows = [
    ['Turno',      caja.nro_turno ? `TRN ${caja.nro_turno}` : '—'],
    ['Tipo Turno', caja.tipo_turno ?? '—'],
    ['Local',      caja.local?.nombre ?? '—'],
    ['Inicio',     fmtDT(caja.fecha_inicio)],
    ['Cierre',     fmtDT(caja.fecha_cierre)],
    ['Cajero',     caja.cajero ?? '—'],
    ['Total',      fmt$(caja.total)],
    ['Efectivo',   fmt$(caja.efectivo)],
    ['Fiscal',     fmt$(caja.fiscal)],
    ['Cobros',     fmt$(cuadre.cobros)],
    ...(cuadre.gastos ? [['Gastos', fmt$(cuadre.gastos)]] : []),
    ['Comensales', caja.comensales ?? '—'],
    ['Tickets',    caja.tickets ?? '—'],
    // Sumas crudas de cada tabla interna. Antes estaban en la cabecera de su
    // sección; se mueven acá para no competir con los totales por grupo, que son
    // los que se usan para revisar el turno. Suman todo sin signo ni sentido
    // contable (un VACIADO y un COBRO se apilan igual), así que no reemplazan a
    // Cobros/Gastos ni a la diferencia de caja: quedan de referencia.
    ['Total detalles',    fmt$(sumaMontos(caja.detalles))],
    ['Total movimientos', fmt$(sumaMontos(caja.movimientos))],
  ]

  return (
    <div>
      {/* Tags destacados: mismos indicadores que ya tienen color/badge en la lista */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
        <span className={`badge ${caja.audit ? 'badge-green' : 'badge-muted'}`}>{caja.audit ? '✓ Auditado' : 'No auditado'}</span>
        {canAuditDc && (
          <span className={`badge ${caja.audit_dc ? 'badge-purple' : 'badge-muted'}`}>{caja.audit_dc ? '✓ Audit DC' : 'Sin Audit DC'}</span>
        )}
        {caja.origin && caja.origin !== 'DCSMART' && (
          <span className="badge badge-muted">{caja.origin}</span>
        )}
        {hayDescuadre && (
          <span
            className="badge badge-red"
            title={`Total declarado ${fmt$(cuadre.total)} vs. efectivo ${fmt$(cuadre.efectivo)} + cobros ${fmt$(cuadre.cobros)}${cuadre.gastos ? ` − gastos ${fmt$(cuadre.gastos)}` : ''} = ${fmt$(cuadre.esperado)}. Los cobros salen de los ${cuadre.fuente} de esta caja.`}
          >
            ⚠ Diferencia: {fmt$(Math.abs(descuadre))} {descuadre > 0 ? '(sobra)' : '(falta)'}
          </span>
        )}
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <ActionsMenu label="Acciones">
          {canEdit && (
            <button
              className={`btn btn-sm ${caja.audit ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleAudit}
              disabled={auditando}
            >
              {auditando
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : caja.audit ? '✓ Auditado' : 'Auditar'
              }
            </button>
          )}
          {canAuditDc && (
            <button
              className={`btn btn-sm ${caja.audit_dc ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleAuditDc}
              disabled={auditandoDc}
            >
              {auditandoDc
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : caja.audit_dc ? '✓ Audit DC' : 'Audit DC'
              }
            </button>
          )}
          {canEdit && (
            <button className="btn btn-secondary btn-sm" onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcoEdit /> Editar
            </button>
          )}
          {canDelete && (
            <button className="btn btn-danger btn-sm" onClick={(e) => onDelete(cajaId, e)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcoTrash /> Eliminar
            </button>
          )}
        </ActionsMenu>
      </div>

      {caja.foto_url && (
        <div style={{ marginBottom: '0.5rem' }}>
          <div className="drawer-section-title">Adjuntos</div>
          <FotoViewer pagoId={caja.id} fotoUrl={caja.foto_url} entity="cajas" />
        </div>
      )}

      <div className="drawer-section-title">Datos del turno</div>
      <div className="drawer-detail">
        {rows.map(([k, v]) => (
          <div key={k} className="drawer-detail-row">
            <span className="drawer-detail-key">{k}</span>
            <span className="drawer-detail-val">{v}</span>
          </div>
        ))}
      </div>

      {caja.observaciones && (
        <div style={{ marginTop: '0.75rem', marginBottom: '1rem', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, color: 'var(--t2)' }}>
          {caja.observaciones}
        </div>
      )}

      {/* ── DETALLES ─────────────────────────────────────────────────────── */}
      {/* El total ya no vive acá: está arriba, en "Datos del turno". Lo que se
          muestra en la tabla son los totales por grupo, que es lo que se venía
          sumando a mano. */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Detalles ({caja.detalles?.length || 0})</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {canEdit && !addingDet && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingDet(true)}>
              <IcoPlus /> Añadir
            </button>
          )}
        </div>
      </div>
      {caja.detalles && caja.detalles.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }}>
          <TablaDesglose
            grupos={gruposDetalles}
            columnas={[{ label: 'Clasificación' }, { label: 'Nombre' }, { label: 'Monto' }, { label: '' }]}
            fmtMonto={fmt$2}
            renderFila={(d) => (
                <tr key={d.id}>
                  {editingDetId === d.id ? (
                    <>
                      <td>
                        <ClasificacionSelect
                          compact
                          value={editDetForm.clasificacion}
                          onChange={(clasificacion) => setEditDetForm(f => ({ ...f, clasificacion }))}
                        />
                      </td>
                      <td>
                        <TipoDetalleCombo
                          tipos={tipos}
                          idTipo={editDetForm.id_tipo}
                          nombre={editDetForm.nombre}
                          onChange={(id_tipo, nombre) => setEditDetForm(f => conTipoElegido(f, tipos, id_tipo, nombre))}
                        />
                      </td>
                      <td>
                        <input type="number" step="0.01" style={{ maxWidth: 100 }} value={editDetForm.monto} onChange={e => setEditDetForm(f => ({ ...f, monto: e.target.value }))} />
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-primary" disabled={savingDetEdit} onClick={() => handleSaveDet(d.id)}>Guardar</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingDetId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="td-muted">{clasificacionLabel(clasificacionDeDetalle(d))}</td>
                      <td>{d.detalle_tipo?.nombre || d.nombre || '—'}</td>
                      <td className="td-number">{fmt$2(d.monto)}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {canEdit && (
                          <button className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditDet(d)}>
                            <IcoEdit />
                          </button>
                        )}
                        {canDelete && (
                          <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteDet(d.id)}>
                            <IcoTrash />
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
            )}
          />
        </div>
      )}
      {(!caja.detalles || caja.detalles.length === 0) && !addingDet && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin detalles</div>
      )}

      {canEdit && addingDet && <form onSubmit={handleAddDet}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Clasificación *</label>
            <ClasificacionSelect
              ayuda
              value={newDet.clasificacion}
              onChange={(clasificacion) => setNewDet(d => ({ ...d, clasificacion }))}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nombre</label>
            <TipoDetalleCombo
              tipos={tipos}
              idTipo={newDet.id_tipo}
              nombre={newDet.nombre}
              onChange={(id_tipo, nombre) => setNewDet(d => conTipoElegido(d, tipos, id_tipo, nombre))}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Monto *</label>
            <div className="form-input-wrap">
              <input type="number" step="0.01" required placeholder="0.00" value={newDet.monto} onChange={e => setNewDet({ ...newDet, monto: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Observaciones</label>
            <div className="form-input-wrap">
              <input type="text" placeholder="Opcional" value={newDet.observaciones} onChange={e => setNewDet({ ...newDet, observaciones: e.target.value })} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem', marginBottom: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={savingDet || !newDet.monto}>
            {savingDet ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : <><IcoPlus /> Agregar</>}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAddingDet(false)}>✕</button>
        </div>
      </form>}

      {/* ── MOVIMIENTOS ──────────────────────────────────────────────────── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Movimientos ({caja.movimientos?.length || 0})</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {canEdit && !addingMov && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingMov(true)}>
              <IcoPlus /> Añadir
            </button>
          )}
        </div>
      </div>
      {caja.movimientos && caja.movimientos.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }}>
          <TablaDesglose
            grupos={gruposMovimientos}
            columnas={[{ label: 'Tipo' }, { label: 'Método' }, { label: 'Monto' }, { label: 'Cant.' }, { label: '' }]}
            fmtMonto={fmt$2}
            renderFila={(m) => (
                <tr key={m.id}>
                  {editingMovId === m.id ? (
                    <>
                      <td>
                        <TipoMovimientoSelect
                          className="filter-select"
                          style={{ width: '100%' }}
                          value={editMovForm.tipo}
                          onChange={(tipo) => setEditMovForm(f => ({ ...f, tipo }))}
                        />
                      </td>
                      <td>
                        <select className="filter-select" style={{ width: '100%' }} value={editMovForm.id_metodo} onChange={e => setEditMovForm(f => ({ ...f, id_metodo: e.target.value }))}>
                          <option value="">Sin método</option>
                          {metodos.map(mp => <option key={mp.id} value={mp.id}>{mp.nombre}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" style={{ maxWidth: 100 }} value={editMovForm.monto} onChange={e => setEditMovForm(f => ({ ...f, monto: e.target.value }))} />
                      </td>
                      <td>
                        <input type="number" min="1" step="1" style={{ maxWidth: 70 }} value={editMovForm.cantidad} onChange={e => setEditMovForm(f => ({ ...f, cantidad: e.target.value }))} />
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-primary" disabled={savingMovEdit} onClick={() => handleSaveMov(m.id)}>Guardar</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingMovId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <span className={`badge ${claseBadgeMovimiento(m.tipo)}`}>{m.tipo}</span>
                      </td>
                      <td className="td-muted">{m.metodo_pago?.nombre || '—'}</td>
                      <td className="td-number">{fmt$2(m.monto)}</td>
                      <td className="td-muted" style={{ textAlign: 'right' }}>{m.cantidad ?? '—'}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {canEdit && (
                          <button className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditMov(m)}>
                            <IcoEdit />
                          </button>
                        )}
                        {canDelete && (
                          <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteMov(m.id)}>
                            <IcoTrash />
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
            )}
          />
        </div>
      )}
      {(!caja.movimientos || caja.movimientos.length === 0) && !addingMov && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin movimientos</div>
      )}

      {canEdit && addingMov && <form onSubmit={handleAddMov}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Tipo</label>
            <div className="form-input-wrap">
              <TipoMovimientoSelect value={newMov.tipo} onChange={(tipo) => setNewMov({ ...newMov, tipo })} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Método</label>
            <div className="form-input-wrap">
              <select value={newMov.id_metodo} onChange={e => setNewMov({ ...newMov, id_metodo: e.target.value })}>
                <option value="">Sin método</option>
                {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Monto *</label>
            <div className="form-input-wrap">
              <input type="number" step="0.01" required placeholder="0.00" value={newMov.monto} onChange={e => setNewMov({ ...newMov, monto: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Cantidad</label>
            <div className="form-input-wrap">
              <input type="number" min="1" step="1" placeholder="Opcional" value={newMov.cantidad} onChange={e => setNewMov({ ...newMov, cantidad: e.target.value })} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving || !newMov.monto}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : <><IcoPlus /> Agregar</>}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAddingMov(false)}>✕</button>
        </div>
      </form>}

      <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>Historial de auditoría</div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Observación</th></tr>
          </thead>
          <tbody>
            {loadingHistory ? (
              <tr><td colSpan={4}><span className="skel" style={{ width: '60%' }} /></td></tr>
            ) : auditHistory.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: 'var(--t3)' }}>Sin eventos de auditoría</td></tr>
            ) : (
              auditHistory.map((ev) => (
                <tr key={ev.id}>
                  <td className="td-muted">{fmtDT(ev.fecha)}</td>
                  <td>{ev.user?.nombre ?? '—'}</td>
                  <td>
                    <span className={`badge ${ev.accion === 'auditado' ? 'badge-green' : 'badge-amber'}`}>
                      {ev.accion === 'auditado' ? 'Auditado' : 'Desauditado'}
                    </span>
                  </td>
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

function CajaEditPanel({ cajaId, onSaved, onBack }) {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const [form,   setForm]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [fotoFile,      setFotoFile]      = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)

  const [detalles,    setDetalles]    = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [tipos,       setTipos]       = useState([])
  const [metodos,     setMetodos]     = useState([])

  const [addingDet,  setAddingDet]  = useState(false)
  const [newDet,     setNewDet]     = useState({ clasificacion: 'cobro', id_tipo: '', nombre: '', monto: '', observaciones: '' })
  const [savingDet,  setSavingDet]  = useState(false)
  const [editingDetId, setEditingDetId] = useState(null)
  const [editDetForm,  setEditDetForm]  = useState({ id_tipo: '', nombre: '', monto: '', observaciones: '' })
  const [savingDetEdit, setSavingDetEdit] = useState(false)

  const [addingMov,  setAddingMov]  = useState(false)
  const [newMov,     setNewMov]     = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [savingMov,  setSavingMov]  = useState(false)
  const [editingMovId, setEditingMovId] = useState(null)
  const [editMovForm,  setEditMovForm]  = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [savingMovEdit, setSavingMovEdit] = useState(false)

  const loadRelacionales = (idLocal) => {
    cajasApi.get(cajaId).then(({ data }) => {
      setDetalles(data.detalles || [])
      setMovimientos(data.movimientos || [])
    }).catch(() => notify('Error al cargar detalles/movimientos', 'error'))
    detallesApi.tipos(idLocal)
      .then(r => setTipos(r.data || []))
      .catch(() => notify('No se pudieron cargar los nombres de detalle', 'error'))
  }

  useEffect(() => {
    if (!cajaId) return
    cajasApi.get(cajaId).then(({ data }) => {
      setForm({
        nro_turno:    data.nro_turno    ?? '',
        tipo_turno:   data.tipo_turno   ?? '',
        fecha_inicio: toDateTimeLocalInput(data.fecha_inicio),
        fecha_cierre: toDateTimeLocalInput(data.fecha_cierre),
        cajero:       data.cajero       ?? '',
        total:        data.total        != null ? String(data.total)        : '',
        efectivo:     data.efectivo     != null ? String(data.efectivo)     : '',
        fiscal:       data.fiscal       != null ? String(data.fiscal)       : '',
        comensales:   data.comensales   != null ? String(data.comensales)   : '',
        tickets:      data.tickets      != null ? String(data.tickets)      : '',
        observaciones: data.observaciones ?? '',
        foto_url:     data.foto_url     ?? '',
        id_local:     data.id_local     ?? '',
      })
      setDetalles(data.detalles || [])
      setMovimientos(data.movimientos || [])
      detallesApi.tipos(data.id_local).then(r => setTipos(r.data || [])).catch(() => {})
    }).catch(() => notify('Error al cargar caja', 'error'))
    metodosApi.list().then(r => setMetodos(r.data || [])).catch(() => {})
  }, [cajaId])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAddDet = async (e) => {
    e.preventDefault()
    if (!newDet.monto) return
    setSavingDet(true)
    try {
      await detallesApi.create({ id_caja: cajaId, id_tipo: newDet.id_tipo || null, clasificacion: newDet.clasificacion || null, nombre: newDet.id_tipo ? null : (newDet.nombre || null), monto: parseFloat(newDet.monto), observaciones: newDet.observaciones || null })
      notify('Detalle agregado', 'success')
      setNewDet({ clasificacion: 'cobro', id_tipo: '', nombre: '', monto: '', observaciones: '' })
      setAddingDet(false)
      loadRelacionales(form?.id_local)
    } catch (err) { notify(err.response?.data?.error || 'Error al agregar detalle', 'error') }
    finally { setSavingDet(false) }
  }

  const handleDeleteDet = async (detId) => {
    if (!(await showConfirm('¿Eliminar detalle?'))) return
    try { await detallesApi.remove(detId); notify('Eliminado', 'success'); loadRelacionales(form?.id_local) }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const handleEditDet = (d) => {
    setEditingDetId(d.id)
    setEditDetForm({
      id_tipo:       d.id_tipo || '',
      clasificacion: normalizarClasificacion(clasificacionDeDetalle(d)),
      nombre:        d.detalle_tipo?.nombre || d.nombre || '',
      monto:         String(d.monto),
      observaciones: d.observaciones || ''
    })
  }

  const handleSaveDet = async (detId) => {
    if (!editDetForm.monto) return
    setSavingDetEdit(true)
    try {
      await detallesApi.update(detId, { id_tipo: editDetForm.id_tipo || null, clasificacion: editDetForm.clasificacion || null, nombre: editDetForm.id_tipo ? null : (editDetForm.nombre || null), monto: parseFloat(editDetForm.monto), observaciones: editDetForm.observaciones || null })
      notify('Detalle actualizado', 'success')
      setEditingDetId(null)
      loadRelacionales(form?.id_local)
    } catch (err) { notify(err.response?.data?.error || 'Error al actualizar', 'error') }
    finally { setSavingDetEdit(false) }
  }

  const handleAddMov = async (e) => {
    e.preventDefault()
    if (!newMov.monto) return
    setSavingMov(true)
    try {
      await movimientosApi.create({ id_caja: cajaId, tipo: newMov.tipo, id_metodo: newMov.id_metodo || null, monto: parseFloat(newMov.monto), cantidad: newMov.cantidad ? parseInt(newMov.cantidad) : null })
      notify('Movimiento agregado', 'success')
      setNewMov({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
      setAddingMov(false)
      loadRelacionales(form?.id_local)
    } catch (err) { notify(err.response?.data?.error || 'Error al agregar movimiento', 'error') }
    finally { setSavingMov(false) }
  }

  const handleDeleteMov = async (movId) => {
    if (!(await showConfirm('¿Eliminar movimiento?'))) return
    try { await movimientosApi.remove(movId); notify('Eliminado', 'success'); loadRelacionales(form?.id_local) }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const handleEditMov = (m) => {
    setEditingMovId(m.id)
    setEditMovForm({ tipo: m.tipo, id_metodo: m.id_metodo || '', monto: String(m.monto), cantidad: m.cantidad != null ? String(m.cantidad) : '' })
  }

  const handleSaveMov = async (movId) => {
    if (!editMovForm.monto) return
    setSavingMovEdit(true)
    try {
      await movimientosApi.update(movId, { tipo: editMovForm.tipo, id_metodo: editMovForm.id_metodo || null, monto: parseFloat(editMovForm.monto), cantidad: editMovForm.cantidad ? parseInt(editMovForm.cantidad) : null })
      notify('Movimiento actualizado', 'success')
      setEditingMovId(null)
      loadRelacionales(form?.id_local)
    } catch (err) { notify(err.response?.data?.error || 'Error al actualizar', 'error') }
    finally { setSavingMovEdit(false) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      let foto_url = form.foto_url
      if (fotoFile) {
        setUploadingFoto(true)
        const fd = new FormData()
        fd.append('file', fotoFile)
        const r = await cajasApi.upload(fd, form.id_local)
        foto_url = r.data.url
        setUploadingFoto(false)
      }
      await cajasApi.update(cajaId, {
        nro_turno:    form.nro_turno    || null,
        tipo_turno:   form.tipo_turno   || null,
        fecha_inicio: toUtcIsoFromDateTimeLocal(form.fecha_inicio),
        fecha_cierre: toUtcIsoFromDateTimeLocal(form.fecha_cierre),
        cajero:       form.cajero       || null,
        total:        form.total        !== '' ? parseFloat(form.total)      : null,
        efectivo:     form.efectivo     !== '' ? parseFloat(form.efectivo)   : null,
        fiscal:       form.fiscal       !== '' ? parseFloat(form.fiscal)     : null,
        comensales:   form.comensales   !== '' ? parseInt(form.comensales)   : null,
        tickets:      form.tickets      !== '' ? parseInt(form.tickets)      : null,
        observaciones: form.observaciones || null,
        foto_url:     foto_url          || null,
      })
      notify('Caja actualizada', 'success')
      onSaved()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
      setUploadingFoto(false)
    } finally { setSaving(false) }
  }

  if (!form) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <IcoBack /> Volver al detalle
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fecha Inicio</label>
          <div className="form-input-wrap">
            <input type="datetime-local" required value={form.fecha_inicio} onChange={e => setF('fecha_inicio', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fecha Cierre</label>
          <div className="form-input-wrap">
            <input type="datetime-local" value={form.fecha_cierre} onChange={e => setF('fecha_cierre', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nro Turno</label>
          <div className="form-input-wrap">
            <input type="number" min="1" step="1" placeholder="1" value={form.nro_turno} onChange={e => setF('nro_turno', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Tipo de Turno</label>
          <div className="form-input-wrap">
            <select value={form.tipo_turno} onChange={e => setF('tipo_turno', e.target.value)}>
              <option value="">Sin especificar</option>
              {TIPOS_TURNO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Cajero</label>
          <div className="form-input-wrap">
            <input placeholder="Nombre del cajero" value={form.cajero} onChange={e => setF('cajero', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Total</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={form.total} onChange={e => setF('total', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Efectivo</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={form.efectivo} onChange={e => setF('efectivo', e.target.value)} />
          </div>
          {/* No es un dato informativo: el arqueo del local lo suma como el efectivo
              del periodo. El texto vive en lib/camposCaja.js porque el mismo campo se
              carga en el alta y en la edicion. */}
          <p className="form-hint" style={{ margin: '4px 0 0' }}>{AYUDA_EFECTIVO}</p>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fiscal</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={form.fiscal} onChange={e => setF('fiscal', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Comensales</label>
          <div className="form-input-wrap">
            <input type="number" placeholder="0" value={form.comensales} onChange={e => setF('comensales', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Tickets</label>
          <div className="form-input-wrap">
            <input type="number" placeholder="0" value={form.tickets} onChange={e => setF('tickets', e.target.value)} />
          </div>
        </div>
        <AdjuntoUpload
          label="Foto"
          accept="image/*"
          value={form.foto_url}
          file={fotoFile}
          onFileSelected={setFotoFile}
          onRemove={() => { setF('foto_url', ''); setFotoFile(null) }}
          uploading={uploadingFoto}
        />
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label className="form-label">Observaciones</label>
          <div className="form-input-wrap form-textarea-wrap">
            <textarea rows={2} value={form.observaciones} onChange={e => setF('observaciones', e.target.value)} placeholder="Notas opcionales..." />
          </div>
        </div>
      </div>

      {/* ── Detalles ─────────────────────────────────────────────────────── */}
      <div className="drawer-section-title" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Detalles ({detalles.length})</span>
        {!addingDet && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingDet(true)}>
            <IcoPlus /> Añadir
          </button>
        )}
      </div>
      {detalles.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }}>
          <table className="data-table">
            <thead><tr><th>Clasificación</th><th>Nombre</th><th>Monto</th><th></th></tr></thead>
            <tbody>
              {detalles.map((d) => (
                <tr key={d.id}>
                  {editingDetId === d.id ? (
                    <>
                      <td>
                        <ClasificacionSelect
                          compact
                          value={editDetForm.clasificacion}
                          onChange={(clasificacion) => setEditDetForm(f => ({ ...f, clasificacion }))}
                        />
                      </td>
                      <td>
                        <TipoDetalleCombo
                          tipos={tipos}
                          idTipo={editDetForm.id_tipo}
                          nombre={editDetForm.nombre}
                          onChange={(id_tipo, nombre) => setEditDetForm(f => conTipoElegido(f, tipos, id_tipo, nombre))}
                        />
                      </td>
                      <td>
                        <input type="number" step="0.01" style={{ maxWidth: 100 }} value={editDetForm.monto} onChange={e => setEditDetForm(f => ({ ...f, monto: e.target.value }))} />
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-primary" disabled={savingDetEdit} onClick={() => handleSaveDet(d.id)}>Guardar</button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingDetId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="td-muted">{clasificacionLabel(clasificacionDeDetalle(d))}</td>
                      <td>{d.detalle_tipo?.nombre || d.nombre || '—'}</td>
                      <td className="td-number">{fmt$2(d.monto)}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditDet(d)}>
                          <IcoEdit />
                        </button>
                        <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteDet(d.id)}>
                          <IcoTrash />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detalles.length === 0 && !addingDet && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin detalles</div>
      )}
      {addingDet && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Clasificación *</label>
              <ClasificacionSelect
                value={newDet.clasificacion}
                onChange={(clasificacion) => setNewDet(f => ({ ...f, clasificacion }))}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre</label>
              <TipoDetalleCombo
                tipos={tipos}
                idTipo={newDet.id_tipo}
                nombre={newDet.nombre}
                onChange={(id_tipo, nombre) => setNewDet(f => conTipoElegido(f, tipos, id_tipo, nombre))}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Monto *</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={newDet.monto} onChange={e => setNewDet(f => ({ ...f, monto: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Observaciones</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Opcional" value={newDet.observaciones} onChange={e => setNewDet(f => ({ ...f, observaciones: e.target.value }))} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-primary" disabled={savingDet || !newDet.monto} onClick={handleAddDet}>
              {savingDet ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlus />} Agregar
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAddingDet(false)}>✕</button>
          </div>
        </div>
      )}

      {/* ── Movimientos ──────────────────────────────────────────────────── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Movimientos ({movimientos.length})</span>
        {!addingMov && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAddingMov(true)}>
            <IcoPlus /> Añadir
          </button>
        )}
      </div>
      {movimientos.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }}>
          <table className="data-table">
            <thead><tr><th>Tipo</th><th>Método</th><th>Monto</th><th>Cant.</th><th></th></tr></thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  {editingMovId === m.id ? (
                    <>
                      <td>
                        <TipoMovimientoSelect
                          className="filter-select"
                          style={{ width: '100%' }}
                          value={editMovForm.tipo}
                          onChange={(tipo) => setEditMovForm(f => ({ ...f, tipo }))}
                        />
                      </td>
                      <td>
                        <select className="filter-select" style={{ width: '100%' }} value={editMovForm.id_metodo} onChange={e => setEditMovForm(f => ({ ...f, id_metodo: e.target.value }))}>
                          <option value="">Sin método</option>
                          {metodos.map(mp => <option key={mp.id} value={mp.id}>{mp.nombre}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" style={{ maxWidth: 100 }} value={editMovForm.monto} onChange={e => setEditMovForm(f => ({ ...f, monto: e.target.value }))} />
                      </td>
                      <td>
                        <input type="number" min="1" step="1" style={{ maxWidth: 70 }} value={editMovForm.cantidad} onChange={e => setEditMovForm(f => ({ ...f, cantidad: e.target.value }))} />
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-primary" disabled={savingMovEdit} onClick={() => handleSaveMov(m.id)}>Guardar</button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingMovId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <span className={`badge ${claseBadgeMovimiento(m.tipo)}`}>{m.tipo}</span>
                      </td>
                      <td className="td-muted">{m.metodo_pago?.nombre || '—'}</td>
                      <td className="td-number">{fmt$2(m.monto)}</td>
                      <td className="td-muted" style={{ textAlign: 'right' }}>{m.cantidad ?? '—'}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-secondary btn-icon" onClick={() => handleEditMov(m)}>
                          <IcoEdit />
                        </button>
                        <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteMov(m.id)}>
                          <IcoTrash />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {movimientos.length === 0 && !addingMov && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: '1rem' }}>Sin movimientos</div>
      )}
      {addingMov && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tipo</label>
              <div className="form-input-wrap">
                <TipoMovimientoSelect value={newMov.tipo} onChange={(tipo) => setNewMov(f => ({ ...f, tipo }))} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Método</label>
              <div className="form-input-wrap">
                <select value={newMov.id_metodo} onChange={e => setNewMov(f => ({ ...f, id_metodo: e.target.value }))}>
                  <option value="">Sin método</option>
                  {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Monto *</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={newMov.monto} onChange={e => setNewMov(f => ({ ...f, monto: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cantidad</label>
              <div className="form-input-wrap">
                <input type="number" min="1" step="1" placeholder="Opcional" value={newMov.cantidad} onChange={e => setNewMov(f => ({ ...f, cantidad: e.target.value }))} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-primary" disabled={savingMov || !newMov.monto} onClick={handleAddMov}>
              {savingMov ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlus />} Agregar
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAddingMov(false)}>✕</button>
          </div>
        </div>
      )}

      <div className="form-actions" style={{ marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : 'Guardar cambios'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onBack}>Cancelar</button>
      </div>
    </form>
  )
}

// Filas por pagina del listado.
const LIMIT = 100

export default function CajaList() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activeApp, activeLocal } = useAppStore()
  const locales     = activeApp?.locales ?? []
  const notify      = useUiStore((s) => s.notify)
  // Los dos borrados de esta pantalla (una caja y la tanda) piden confirmación Y un motivo,
  // que queda en activity_log. Por eso acá va showPrompt y no showConfirm.
  const showPrompt  = useUiStore((s) => s.showPrompt)
  const role        = activeApp?.role
  const canCreate = puedeCrearCajas(role)
  const canEdit    = puedeEditar(role)
  // Antes decia admin y el backend lo rechazaba con 403: el rol nunca tuvo
  // can_delete en caja. Ahora la pantalla ofrece lo que el backend permite.
  const canDelete  = puedeBorrarCajas(role)
  const canAuditDc = ['super_admin', 'dcsmart'].includes(role)
  const canExport  = ['super_admin', 'dcsmart'].includes(role)
  const [exporting, setExporting] = useState(false)

  const [cajas,      setCajas]      = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(true)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [panelMode,  setPanelMode]  = useState('create')
  const [selectedId, setSelectedId] = useState(null)
  const [sortField,  setSortField]  = useState('fecha_inicio')
  const [sortDir,    setSortDir]    = useState('desc')
  const FILTER_INIT_CAJAS = { desde: '', hasta: '', audit: '', tipo_turno: [] }
  const [filters, setFilters] = useState(FILTER_INIT_CAJAS)
  const [draft,   setDraft]   = useState(FILTER_INIT_CAJAS)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  // Un array vacío es "sin filtrar", igual que un string vacío.
  const activeFilterCount = Object.values(filters)
    .filter(v => (Array.isArray(v) ? v.length > 0 : v !== '')).length
  const hasActiveFilters  = activeFilterCount > 0

  const openFilters   = () => { setDraft(filters); setFilterOpen(true) }
  const applyFilters  = () => { setFilters(draft); setFilterOpen(false) }
  const clearFilters  = () => { setDraft(FILTER_INIT_CAJAS); setFilters(FILTER_INIT_CAJAS) }
  const setDraftField = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  useEffect(() => {
    if (!filterOpen) return
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])
  const autoOpenedRef = useRef(false)

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectionMode, setSelectionMode] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const cajaListParams = useCallback((pageNum) => ({
    id_local: activeLocal?.id,
    page: pageNum,
    limit: LIMIT,
    sort_field: sortField,
    sort_dir: sortDir,
    ...(filters.audit !== '' ? { audit: filters.audit } : {}),
    ...(filters.tipo_turno.length > 0 ? { tipo_turno: multiParam(filters.tipo_turno) } : {}),
    ...(filters.desde !== '' ? { desde: filters.desde } : {}),
    ...(filters.hasta !== '' ? { hasta: filters.hasta } : {})
  }), [activeLocal?.id, sortField, sortDir, filters])

  // Volver a página 1 cuando cambian filtros / sort / local
  useEffect(() => { setPage(1) }, [cajaListParams])

  // ── Exportar CSV: mismos filtros ya aplicados, pero SIN paginar (limit: 0
  // → el backend trae todas las filas que matchean el where, no una página) ──
  const exportCsv = useCallback(async () => {
    setExporting(true)
    try {
      const { data } = await cajasApi.list({ ...cajaListParams(1), limit: 0 })
      if (!data.data.length) { notify('No hay filas para exportar con estos filtros', 'info'); return }
      await downloadExcel(`cajas_${todayInputDate()}.xlsx`, data.data, CAJA_CSV_COLUMNS, 'Cajas')
    } catch {
      notify('Error al exportar Excel', 'error')
    } finally {
      setExporting(false)
    }
  }, [cajaListParams, notify])

  const load = useCallback(() => {
    setLoading(true)
    cajasApi.list(cajaListParams(page))
      .then(({ data }) => { setCajas(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar cajas', 'error'))
      .finally(() => setLoading(false))
  }, [cajaListParams, page])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setSelectedIds(new Set())
    cajasApi.list(cajaListParams(page), ctrl.signal)
      .then(({ data }) => {
        setCajas(data.data)
        setTotal(data.total)
        // ?caja=<id> abre el detalle de esa caja, venga de donde venga. El drawer
        // la trae por id (ver CajaDetailPanel), asi que NO hace falta que este en
        // la pagina cargada ni que pase los filtros: sirve para linkear una caja
        // puntual desde un aviso, un mail o donde sea.
        const cajaId = searchParams.get('caja')
        if (!autoOpenedRef.current && cajaId) {
          autoOpenedRef.current = true
          openDetail(cajaId)
          return
        }
        // ?turno=<nro> es el mecanismo anterior. Se mantiene, pero solo puede
        // encontrar cajas de la pagina actual y falla con las que no tienen numero
        // de turno cargado, que son muchas: para linkear conviene ?caja=<id>.
        const turno = searchParams.get('turno')
        if (!autoOpenedRef.current && turno) {
          const match = data.data.find(c => c.nro_turno === turno)
          if (match) {
            autoOpenedRef.current = true
            openDetail(match.id)
          }
        }
      })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar cajas', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [cajaListParams, page])

  // ── Totales (solo con rango de fecha aplicado) ──────────────────────────
  // Usa los mismos filtros que ya arma la tabla (fecha, auditado, tipo), sin
  // paginar, porque el total debe ser de TODAS las cajas filtradas, no solo
  // la página visible.
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    if (!(filters.desde && filters.hasta)) { setStats(null); return }
    const ctrl = new AbortController()
    setStatsLoading(true)
    cajasApi.stats(cajaListParams(1), ctrl.signal)
      .then(({ data }) => setStats(data))
      .catch(() => { if (!ctrl.signal.aborted) { notify('Error al cargar los totales', 'error'); setStats(null) } })
      .finally(() => { if (!ctrl.signal.aborted) setStatsLoading(false) })
    return () => ctrl.abort()
  }, [cajaListParams, filters.desde, filters.hasta])

  const goToPage = (p) => {
    const next = Math.min(Math.max(1, p), totalPages)
    if (next !== page) {
      setPage(next)
      document.querySelector('.app-main')?.scrollTo({ top: 0 })
    }
  }

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const handleDelete = async (id, e) => {
    e?.stopPropagation()
    // Se pide el motivo en vez de un sí/no: la caja se borra de verdad, con sus movimientos
    // y detalles, y el motivo es lo unico que despues explica por que no esta.
    const motivo = await showPrompt(
      'Se va a eliminar esta caja con todos sus movimientos y detalles. No se puede deshacer.',
      { title: 'Eliminar caja', placeholder: 'Por qué se elimina (opcional)' }
    )
    if (motivo === null) return
    try {
      await cajasApi.remove(id, motivo)
      notify('Caja eliminada', 'success')
      setCajas(prev => prev.filter(c => c.id !== id))
      setPanelOpen(false)
    }
    catch (err) { notify(err.response?.data?.error || 'Error al eliminar', 'error') }
  }

  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const allVisibleSelected = cajas.length > 0 && cajas.every(c => selectedIds.has(c.id))
  const toggleSelectAllVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(cajas.map(c => c.id)))
  }

  const selectedCajas    = cajas.filter(c => selectedIds.has(c.id))
  const canBulkAudit     = selectedCajas.some(c => !c.audit)
  const canBulkDesaudit  = selectedCajas.some(c => c.audit)

  const bulkCancel = () => setSelectedIds(new Set())

  const toggleSelectionMode = () => {
    setSelectionMode(m => !m)
    setSelectedIds(new Set())
  }

  const bulkAuditar = async () => {
    const targets = selectedCajas.filter(c => !c.audit)
    let ok = 0, fail = 0
    for (const c of targets) {
      try { await cajasApi.audit(c.id); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} cajas auditadas` : `${ok}/${targets.length} auditadas, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkDesauditar = async () => {
    const targets = selectedCajas.filter(c => c.audit)
    let ok = 0, fail = 0
    for (const c of targets) {
      try { await cajasApi.audit(c.id, { observaciones: null }); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} cajas desauditadas` : `${ok}/${targets.length} desauditadas, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkEliminar = async () => {
    // Un solo motivo para toda la tanda: se eliminan juntas por la misma razón, y pedirlo
    // una vez por caja haría abandonar a la tercera.
    const motivoMasivo = await showPrompt(
      `Se van a eliminar ${selectedCajas.length} cajas con todos sus movimientos y detalles. No se puede deshacer.`,
      { title: `Eliminar ${selectedCajas.length} cajas`, placeholder: 'Por qué se eliminan (opcional)' }
    )
    if (motivoMasivo === null) return
    let ok = 0, fail = 0
    for (const c of selectedCajas) {
      try { await cajasApi.remove(c.id, motivoMasivo); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} cajas eliminadas` : `${ok}/${selectedCajas.length} eliminadas, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const openCreate = () => { setPanelMode('create'); setPanelOpen(true) }
  const openDetail = (id) => { setSelectedId(id); setPanelMode('detail'); setPanelOpen(true) }
  const openEdit   = (id) => { setSelectedId(id); setPanelMode('edit');   setPanelOpen(true) }
  const backToDetail = ()  => { setPanelMode('detail') }
  const closePanel = () => setPanelOpen(false)

  const selectedCaja = cajas.find(c => c.id === selectedId)
  const selectedLabel = selectedCaja?.nro_turno ? `TRN ${selectedCaja.nro_turno}` : 'Detalle de Caja'

  const drawerTitle = panelMode === 'create'
    ? 'Nueva Caja'
    : panelMode === 'edit'
      ? `Editar — ${selectedLabel}`
      : selectedLabel

  const SortTh = ({ field, children }) => (
    <th className={`sortable${sortField === field ? ' active' : ''}`} onClick={() => toggleSort(field)}>
      {children} <span className="sort-ico">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )

  // La columna "Local" se oculta si ya hay un local puntual seleccionado (es redundante).
  // Se sacó la columna de acciones (borrar) de la fila (ahora vive en el detalle).
  const showLocalCol = !activeLocal
  // Nro Turno, Tipo, Auditado, Cuadre, Inicio, Cajero, Total, Efectivo,
  // Total Det., % Avión, Cub, Tkt, Origen, Foto
  const colCount = 14 + (showLocalCol ? 1 : 0) + (selectionMode ? 1 : 0)

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Cajas</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '1.25rem', width: 360, maxWidth: '90vw',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Desde</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.desde} max={draft.hasta || undefined} onChange={e => setDraftField('desde', e.target.value)} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Hasta</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.hasta} min={draft.desde || undefined} onChange={e => setDraftField('hasta', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Auditado</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.audit} onChange={e => setDraftField('audit', e.target.value)}>
                      <option value="">Todos</option>
                      <option value="false">No auditado</option>
                      <option value="true">Auditado</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Tipo de turno</span>
                    <MultiSelect
                      value={draft.tipo_turno}
                      onChange={(v) => setDraftField('tipo_turno', v)}
                      options={TURNO_OPTIONS}
                      placeholder="Todos"
                    />
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
            <button className="btn btn-secondary" onClick={exportCsv} disabled={exporting} title="Exportar a Excel las cajas con los filtros actuales">
              {exporting ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <IcoDownload />} Exportar Excel
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={openCreate}>
              <IcoPlus /> Nueva Caja
            </button>
          )}
        </div>
      </div>

      {filters.desde && filters.hasta && (statsLoading || stats) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            ['TOTAL RECAUDADO', stats ? fmt$2(stats.total_recaudado) : null],
            ['EFECTIVO',         stats ? fmt$2(stats.total_efectivo)  : null],
            ['TURNOS',           stats ? stats.count_turnos           : null],
            ['TICKETS',          stats ? stats.total_tickets          : null],
            ['COMENSALES',       stats ? stats.total_comensales       : null],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 1rem', minWidth: 120 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.03em' }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {value == null ? <span className="skel" style={{ width: 60, height: 16, display: 'inline-block' }} /> : value}
              </div>
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

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {selectionMode && (
                <th style={{ width: 32 }}>
                  <input type="checkbox" className="select-checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                </th>
              )}
              <SortTh field="nro_turno">Nro Turno</SortTh>
              <th>Tipo</th>
              <th>Auditado</th>
              <th title="Cuadre: el total declarado contra efectivo + cobros − gastos">Cuadre</th>
              <SortTh field="fecha_inicio">Inicio</SortTh>
              <SortTh field="cajero">Cajero</SortTh>
              <SortTh field="total">Total</SortTh>
              <th>Efectivo</th>
              {/* Puede dar más que el Total del turno y no es un error: los
                  detalles informativos (canales de venta, "Total Tarjetas")
                  desglosan plata que ya está contada en otro detalle. */}
              <th title="Suma de todos los detalles del turno, incluidos los informativos. Puede superar al Total porque los informativos desglosan algo ya contado.">Total Det.</th>
              <th title="Parte de la venta que no pasó por fiscal: (Total − Fiscal) / Total">% Avión</th>
              <th title="Comensales">Cub</th>
              <th title="Tickets">Tkt</th>
              <th>Origen</th>
              <th>Foto</th>
              {showLocalCol && <th>Local</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: colCount }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${48 + (j * 11 + i * 9) % 44}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : cajas.length === 0 ? (
              <tr>
                <td colSpan={colCount}>
                  <div className="table-empty">
                    <IcoCaja />
                    <p>No hay cajas registradas{activeLocal ? ' para este local' : ''}.</p>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {cajas.map((c) => (
                  <tr key={c.id} className="row-clickable" onClick={() => openDetail(c.id)}>
                    {selectionMode && (
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="select-checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} />
                      </td>
                    )}
                    <td className="td-primary">{c.nro_turno ? `TRN ${c.nro_turno}` : <span className="td-muted">—</span>}</td>
                    <td className="td-muted">{c.tipo_turno || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: c.audit ? 'var(--green)' : 'var(--amber)' }} title={c.audit ? 'Auditado' : 'No auditado'}>
                        {c.audit ? <IcoThumbUp /> : <IcoEye />}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }} title={tituloCuadre(c.cuadre)}>
                      <IcoCuadre cuadra={c.cuadre?.cuadra} />
                    </td>
                    <td>{fmtDate(c.fecha_inicio)}</td>
                    <td>{c.cajero || <span className="td-muted">—</span>}</td>
                    <td className="td-number">{fmt$(c.total)}</td>
                    <td className="td-number">{fmt$(c.efectivo)}</td>
                    <td className="td-number">{fmt$(c.total_detalles)}</td>
                    <td className={claseAvion(c.total, c.fiscal)} style={{ textAlign: 'right' }} title={tituloAvion(c)}>
                      {fmtPorcentajeAvion(c.total, c.fiscal)}
                    </td>
                    <td className="td-muted" style={{ textAlign: 'right' }}>{c.comensales ?? '—'}</td>
                    <td className="td-muted" style={{ textAlign: 'right' }}>{c.tickets ?? '—'}</td>
                    <td>
                      <span className={`badge ${BADGE_ORIGEN[c.origin] ?? 'badge-muted'}`}>
                        {LABEL_ORIGEN[c.origin] ?? c.origin ?? '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      {c.foto_url
                        ? <FotoViewer pagoId={c.id} fotoUrl={c.foto_url} entity="cajas" drawerWidth={0} compact />
                        : <span className="td-muted">—</span>}
                    </td>
                    {showLocalCol && <td className="td-muted">{c.local?.nombre ?? '—'}</td>}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span className="pagination-info">
            {`${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} de ${total} cajas`}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(1)} disabled={page <= 1} title="Primera página">«</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Anterior</button>
            <span className="pagination-info">Página {page} de {totalPages}</span>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>Siguiente ›</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(totalPages)} disabled={page >= totalPages} title="Última página">»</button>
          </div>
        </div>
      )}

      <DrawerPanel open={panelOpen} onClose={closePanel} title={drawerTitle} width={560}>
        {panelMode === 'create' && (
          <CajaCreatePanel
            activeLocal={activeLocal}
            locales={locales}
            onCreated={(newId) => {
              load()
              if (newId) { setSelectedId(newId); setPanelMode('detail') }
              else closePanel()
            }}
            onClose={closePanel}
          />
        )}
        {panelMode === 'detail' && (
          <CajaDetailPanel
            cajaId={selectedId}
            onRefreshList={load}
            canEdit={canEdit}
            canDelete={canDelete}
            canAuditDc={canAuditDc}
            onEdit={() => openEdit(selectedId)}
            onDelete={handleDelete}
          />
        )}
        {panelMode === 'edit' && (
          <CajaEditPanel
            cajaId={selectedId}
            onSaved={() => { load(); backToDetail() }}
            onBack={backToDetail}
          />
        )}
      </DrawerPanel>
    </div>
  )
}
