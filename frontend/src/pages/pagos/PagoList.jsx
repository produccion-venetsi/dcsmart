import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
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
import PagoDetailPanel from './PagoDetailPanel.jsx'
import { esRolDc, puedeEditar, puedeBorrarPagos, puedeExportar } from '../../lib/roles.js'
import { multiParam, normalizarMulti, normalizarRangos } from '../../lib/filtros.js'
import { downloadExcel, excelBlob } from '../../lib/excel.js'
import { sheetsDisponible, subirComoSheet, pedirAccessToken, precargarGoogle } from '../../lib/googleSheets.js'
import { tiposImpuestoPresentes, columnasImpuesto, filaTotales, conSignoNotaCredito } from '../../lib/exportPagos.js'
import { todayInputDate, fmtDateArg, fmtDateTimeArg } from '../../lib/dates.js'
import { TIPO_BADGE } from '../../lib/tipoPagoBadges.js'
import { nombreProveedor, razonSocialExtra, etiquetaProveedor } from '../../lib/proveedorLabel.js'
import { ESTADO_OP_OPTIONS, ESTADO_OP_LABEL, ESTADO_OP_BADGE } from '../../lib/estadoOp.js'
import { TIPOS_PAGO } from '../../lib/tiposPago.js'

// Etiquetas, colores y opciones salen de lib/estadoOp.js: estaban duplicados acá y
// en PagoForm, y un enum copiado es un enum que se desincroniza.
const ESTADO_BADGE = ESTADO_OP_BADGE
// Lo mismo pasaba con los tipos de comprobante: la lista estaba escrita a mano acá y en
// PagoForm, así que al agregar NDC uno de los dos se quedaba sin él. Ahora sale de
// lib/tiposPago.js, con un test que la compara contra el enum de Prisma.
const TIPO_PAGO_OPTIONS = TIPOS_PAGO
const TIPO_PAGO_MULTI = TIPO_PAGO_OPTIONS.map(t => ({ value: t, label: t }))
const CAMPO_FECHA_OPTIONS = [
  { value: 'fecha',      label: 'Fecha' },
  { value: 'fecha_pago', label: 'Fecha de Pago' },
  { value: 'cashflow',   label: 'Cashflow' },
  { value: 'periodo',    label: 'Período' },
  { value: 'created_at', label: 'Fecha de Creación' },
]

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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
function IcoThumbUp() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 11v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z"/>
      <path d="M7 11l4-8a2 2 0 0 1 2 2v5h5.5a2 2 0 0 1 1.94 2.5l-1.5 6A2 2 0 0 1 16.97 21H7"/>
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
  // La fecha de creación va primera por pedido explícito. Es dato interno: se
  // saca del archivo para quien no la ve en pantalla (ver canSeeCreated en
  // prepararExport). Antes no hacía falta condicionarla porque exportaban
  // exactamente los mismos roles que la veían; ahora `externo` también exporta.
  { label: 'Creado',      get: (p) => p.created_at ? fmtDateTimeArg(p.created_at) : '' },
  { label: 'OP',          get: (p) => p.nro_ord != null ? `OP-${p.nro_ord}` : '' },
  { label: 'Auditado',    get: (p) => p.audit ? 'Sí' : 'No' },
  { label: 'Fecha',       get: (p) => p.fecha ? fmtDate(p.fecha) : '' },
  { label: 'Proveedor',   get: (p) => nombreProveedor(p.proveedor) },
  { label: 'Razón Social', get: (p) => p.proveedor?.razon_social || '' },
  { label: 'Rubro',       get: (p) => p.rubcat?.rubro?.nombre || '' },
  { label: 'Categoría',   get: (p) => p.rubcat?.categoria?.nombre || '' },
  { label: 'Tipo',        get: (p) => p.id_tipo || '' },
  { label: 'PV',          get: (p) => p.pv != null ? fmtPV(p.pv) : '' },
  { label: 'Nro',         get: (p) => p.nro != null ? fmtNro(p.nro) : '' },
  { label: 'Neto',        get: (p) => p.importe_neto ?? '', total: true },
  // Firmado: una nota de crédito exporta negativa, así la planilla suma sola.
  { label: 'Importe',     get: (p) => p.importe == null ? '' : (p.ingresa_egreso ? -Number(p.importe) : Number(p.importe)), total: true },
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

// ── Columnas fijas al deslizar ────────────────────────────────────────────────
//
// La tabla tiene 18 columnas: deslizando a la derecha se pierde de vista de que pago es
// cada fila. Quedan fijas las primeras, hasta Proveedor inclusive (pedido del usuario).
//
// El ancho es FIJO y no minimo porque el desplazamiento de cada columna se calcula sumando
// los anchos de las anteriores: con anchos flexibles el cuerpo se desalinea del encabezado.
// Una sola lista para las dos filas, asi que agregar una columna fija es una linea.
const COLS_FIJAS = [
  { key: 'sel',   ancho: 34, soloEnSeleccion: true },
  { key: 'aud',   ancho: 44 },
  { key: 'op',    ancho: 78 },
  { key: 'fecha', ancho: 92 },
  { key: 'prov',  ancho: 190 },
]

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
  // `externo` también exporta: es el rol de la gente de afuera que ordena la
  // carga y necesita la planilla.
  const canExport   = puedeExportar(role)
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
    // "Creado" es dato interno de control: no viaja en el archivo de quien no
    // lo ve en pantalla. Exportar no puede ser una puerta lateral a un dato
    // que la tabla esconde.
    const base = canSeeCreated ? PAGO_CSV_COLUMNS : PAGO_CSV_COLUMNS.filter(c => c.label !== 'Creado')
    // Las columnas de impuesto van entre Neto e Importe.
    const idxImporte = base.findIndex(c => c.label === 'Importe')
    // conSignoNotaCredito envuelve al final, sobre las columnas ya armadas,
    // para que las de impuesto entren con el mismo criterio que Neto e
    // Importe y no haya que acordarse de aplicarlo en cada lado.
    const columns = conSignoNotaCredito([
      ...base.slice(0, idxImporte),
      ...columnasImpuesto(tiposImpuestoPresentes(pagos)),
      ...base.slice(idxImporte),
    ])
    return { pagos, columns, totalsRow: filaTotales(pagos, columns) }
  }, [buildParams, canSeeCreated])

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
    // Se pide el motivo en vez de un sí/no: el borrado es real (se van el pago, sus
    // impuestos y su copia en caja mayor) y el motivo es lo único que después explica por
    // qué no está. Queda en activity_log junto al snapshot.
    const motivo = await showPrompt(
      'Se va a eliminar este pago con sus impuestos. No se puede deshacer.',
      { title: 'Eliminar pago', placeholder: 'Por qué se elimina (opcional)' }
    )
    if (motivo === null) return
    try {
      await pagosApi.remove(id, motivo)
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
    // Un motivo para toda la tanda: se eliminan juntos por la misma razón, y pedirlo de a
    // uno haría abandonar a la tercera op.
    const motivo = await showPrompt(
      `Se van a eliminar ${selectedPagos.length} pagos con sus impuestos. No se puede deshacer.`,
      { title: `Eliminar ${selectedPagos.length} pagos`, placeholder: 'Por qué se eliminan (opcional)' }
    )
    if (motivo === null) return
    let ok = 0, fail = 0
    for (const p of selectedPagos) {
      try { await pagosApi.remove(p.id, motivo); ok++ }
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
  // backend al formato { value, label }. La etiqueta lleva nombre Y razón
  // social: el backend matchea por las dos, y con solo el nombre buscabas por
  // razón social y el resultado parecía no tener nada que ver con lo tipeado.
  const buscarProveedores = useCallback(async (q) => {
    const r = await proveedoresApi.list({ search: q, activo: 'true', limit: 30 })
    return (r.data?.data || []).map(p => ({ value: p.id, label: etiquetaProveedor(p) }))
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
  //
  // Desplazamiento lateral de cada columna fija: la suma de los anchos de las anteriores.
  // La del checkbox solo cuenta cuando el modo seleccion esta activo, si no las demas
  // quedarian corridas 34px.
  const fijas = useMemo(() => {
    let acc = 0
    const m = new Map()
    for (const c of COLS_FIJAS) {
      if (c.soloEnSeleccion && !selectionMode) continue
      m.set(c.key, { left: acc, ancho: c.ancho })
      acc += c.ancho
    }
    return m
  }, [selectionMode])

  // Lo que hay que ponerle a la celda (th o td) de una columna fija. `ultima` dibuja la
  // linea que separa lo fijo de lo que se desliza.
  const fija = (key, { ultima = false } = {}) => {
    const c = fijas.get(key)
    if (!c) return {}
    return {
      className: `col-fija${ultima ? ' col-fija-ultima' : ''}`,
      style: { left: c.left, width: c.ancho, minWidth: c.ancho, maxWidth: c.ancho },
    }
  }

  const SortTh = ({ field, children, minWidth, fijaKey, ultima }) => {
    const f = fijaKey ? fija(fijaKey, { ultima }) : {}
    return (
      <th
        className={`sortable${sortField === field ? ' active' : ''}${f.className ? ` ${f.className}` : ''}`}
        style={{ ...(minWidth ? { minWidth } : {}), ...f.style }}
        onClick={() => toggleSort(field)}
      >
        {children} <span className="sort-ico">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </th>
    )
  }

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
                <th {...fija('sel')}>
                  <input type="checkbox" className="select-checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                </th>
              )}
              <th {...fija('aud')} style={{ ...fija('aud').style, textAlign: 'center' }} title="Auditado">Aud</th>
              <SortTh field="nro_ord" fijaKey="op">OP</SortTh>
              <SortTh field="fecha" fijaKey="fecha">Fecha</SortTh>
              <SortTh field="proveedor" fijaKey="prov" ultima>Proveedor</SortTh>
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
                    <td {...fija('sel')} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="select-checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} />
                    </td>
                  )}
                  <td {...fija('aud')} style={{ ...fija('aud').style, textAlign: 'center' }}>
                    <span style={{ color: p.audit ? 'var(--green)' : 'var(--amber)' }} title={p.audit ? 'Auditado' : 'No auditado'}>
                      {p.audit ? <IcoThumbUp /> : <IcoEye />}
                    </span>
                  </td>
                  <td className={`td-primary ${fija('op').className}`} style={{ ...fija('op').style, whiteSpace: 'nowrap' }}>
                    {p.nro_ord != null ? `OP-${p.nro_ord}` : <span className="td-muted">—</span>}
                    {p.cargado_con_ia && (
                      <span style={{ color: 'var(--gold-bright)', marginLeft: 5 }} title="Cargado con IA">
                        <IcoSparkles />
                      </span>
                    )}
                  </td>
                  <td {...fija('fecha')} style={{ ...fija('fecha').style, whiteSpace: 'nowrap' }}>{fmtDate(p.fecha)}</td>
                  {/* El nombre largo se recorta con puntos suspensivos: el ancho es fijo
                      porque de el depende el desplazamiento de las columnas que siguen.
                      La razon social va como segunda linea apagada cuando difiere del
                      nombre (es la que figura impresa en la factura); el title lleva
                      las dos completas para el hover. */}
                  <td {...fija('prov', { ultima: true })} style={{ ...fija('prov', { ultima: true }).style, overflow: 'hidden' }}
                    title={etiquetaProveedor(p.proveedor) || undefined}>
                    {nombreProveedor(p.proveedor)
                      ? <>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreProveedor(p.proveedor)}</div>
                          {razonSocialExtra(p.proveedor) && (
                            <div className="td-muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {razonSocialExtra(p.proveedor)}
                            </div>
                          )}
                        </>
                      : <span className="td-muted">—</span>}
                  </td>
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
                  {/* El ingreso (nota de crédito) se ve NEGATIVO y en verde:
                      esa plata volvió. Mostrarla igual que un gasto era lo que
                      hacía creer que la NC sumaba (y en los KPI, sumaba). */}
                  <td className="td-number" style={{ minWidth: 100, color: p.ingresa_egreso ? 'var(--green)' : 'var(--gold-bright)', fontWeight: 700 }}>
                    {p.ingresa_egreso ? `−${fmt$(p.importe)}` : fmt$(p.importe)}
                  </td>
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
