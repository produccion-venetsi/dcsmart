import { useEffect, useRef, useState } from 'react'
import { impuestosApi } from '../../api/impuestos.js'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { clientesApi } from '../../api/clientes.js'
import { rubcatApi, rubrosApi, categoriasApi } from '../../api/rubcat.js'
import { metodosApi } from '../../api/metodospago.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import AdjuntoUpload from '../../components/AdjuntoUpload.jsx'
import CargaIA from '../../components/CargaIA.jsx'
import Combobox from '../../components/Combobox.jsx'
import { nombreCliente } from '../../lib/clientes.js'
import { TIPOS_PAGO } from '../../lib/tiposPago.js'
import { patchDesdeLectura, faltaParaDuplicado } from '../../lib/precargaIA.js'
import { ESTADO_OP_OPTIONS, ESTADO_CTA_CTE_CLIENTE } from '../../lib/estadoOp.js'
import { saveDraft, loadDraft, clearDraft } from '../../lib/formDraft.js'
import { todayInputDate, nowDateTimeLocalInput, toDateTimeLocalInput, toUtcIsoFromDateTimeLocal, fmtMonthUTC, diasDesdeFinDePeriodo, periodoDemasiadoViejo, nroDesdeFecha } from '../../lib/dates.js'
import { nombreProveedor, razonSocialExtra } from '../../lib/proveedorLabel.js'
import { DESCUENTO_MOVSTOCK_DEFAULT, porcentajeDelLocal, siguienteDescuento, TIPO_MOVSTOCK } from '../../lib/descuentoMovstock.js'
import { cargarArranquePago, metodoPorDefecto, metodoDeArranque } from '../../lib/arranquePagoForm.js'
import { cashflowAutomatico, siguienteCashflow, soloFecha, ayudaCashflow } from '../../lib/cashflowPago.js'
import CampoCuit from '../../components/CampoCuit.jsx'

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

// El cálculo del cashflow (fecha + plazo en las ops con factura, fecha de pago
// en los modos rápidos) vive en lib/cashflowPago.js, con tests.
//
// Campos que lo arrastran al cambiar. `pagado` está porque destildarlo vacía la
// fecha de pago, y entonces el cashflow vuelve a ser la fecha de la op.
const CAMPOS_QUE_MUEVEN_CASHFLOW = ['fecha', 'fecha_pago', 'pagado']

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
// Mismo formato que la tabla de impuestos de más abajo
const fmtMoneda = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

function IcoAlerta() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}

export default function PagoForm() {
  const { id }          = useParams()
  const navigate        = useNavigate()
  const [searchParams]  = useSearchParams()
  const modoRapido      = searchParams.get('modo') === 'rapido'
  const tipoParam       = searchParams.get('tipo') // 'B' (Carga Avión), 'STK' (MovStock) o 'CM'
  // De dónde se entró, para saber a dónde volver. Se entra desde Caja Mayor a cargar
  // una op de tipo CM: devolver al listado de pagos dejaría al usuario lejos de donde
  // estaba trabajando.
  const volverParam     = searchParams.get('volver')
  const rutaVolver      = volverParam === 'caja-mayor' ? '/caja-mayor' : '/pagos'
  const activeLocal     = useAppStore((s) => s.activeLocal)
  const activeApp       = useAppStore((s) => s.activeApp)
  const notify          = useUiStore((s) => s.notify)
  const showConfirm     = useUiStore((s) => s.showConfirm)
  const isEditing       = Boolean(id)
  const esCargaAvion    = modoRapido && tipoParam === 'B'
  const draftKey        = `pago-draft:${id || 'nuevo'}${modoRapido ? `:${tipoParam || ''}` : ''}`
  const restoredFromDraftRef = useRef(false)
  const draftReadyRef        = useRef(false)
  // El Nro de los modos rápidos sigue a la fecha hasta que alguien lo escribe.
  const nroManualRef         = useRef(false)

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
  const [rubros,          setRubros]          = useState([])
  const [categorias,      setCategorias]      = useState([])
  const [loading,         setLoading]         = useState(false)
  const [localProveedor,  setLocalProveedor]  = useState(null)
  const [fotoFile,        setFotoFile]        = useState(null)
  const [pdfFile,         setPdfFile]         = useState(null)
  const [uploadingFoto,   setUploadingFoto]   = useState(false)
  const [uploadingPdf,    setUploadingPdf]    = useState(false)

  // proveedor y rubcat seleccionados (objeto completo, para mostrar su label en el Combobox)
  const [provSelected,   setProvSelected]   = useState(null)
  const [cliSelected,    setCliSelected]    = useState(null)
  const [provPlazo,      setProvPlazo]      = useState(null)
  const [rubcatSelected, setRubcatSelected] = useState(null)
  // Modalcitos para crear proveedor / rubcat cuando no existen (se abren desde
  // el "+ crear" de cada buscador).
  const [provModal,   setProvModal]   = useState(null)  // { nombre, razon_social, cuit }
  const [rubcatModal, setRubcatModal] = useState(null)  // { rubroSel, catSel }
  const [savingModal, setSavingModal] = useState(false)
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

  const [form, setForm] = useState(() => ({
    fecha: hoy,
    // El tipo tambien se precarga fuera del modo rapido: es lo que permite entrar
    // desde Caja Mayor con ?tipo=CM. El modo rapido arrastra un paquete entero
    // (pagado, numero desde la fecha, estado CAJA) que para una op con factura esta
    // mal, asi que el tipo va aparte del modo.
    id_proveedor: '', id_rubcat: '', id_tipo: modoRapido ? (tipoParam || 'STK') : (tipoParam || ''),
    // Carga Avión y MovStock no tienen comprobante fiscal: el número es la
    // fecha en DDMMYYYY (ver nroDesdeFecha) y se sigue actualizando con ella
    // mientras nadie lo escriba a mano.
    pv: '', nro: modoRapido ? nroDesdeFecha(hoy) : '',
    importe_neto: '', descuento: '', importe: '',
    id_metodo: '',
    // En los modos rápidos el pago nace pagado y con fecha: el cashflow es ese mismo día
    // y no hay que tipearlo (ver lib/cashflowPago.js). En una op con factura arranca
    // vacío: lo pone el plazo del proveedor cuando se lo elige.
    cashflow: cashflowAutomatico({ modoRapido, fecha: hoy, fechaPago: modoRapido ? ahoraDateTime : '' }),
    observaciones: '',
    pagado: modoRapido, fecha_pago: modoRapido ? ahoraDateTime : '', periodo: modoRapido ? hoy : '',
    // Son plata que sale de la caja del local, no cuenta corriente con un
    // proveedor: por eso el estado arranca en CAJA en los modos rápidos.
    estado_op: modoRapido ? 'CAJA' : 'CUENTA_CTE', ingresa_egreso: false,
    id_cliente: '',
    periodico: false,
    id_local: activeLocal?.id || '',
    foto_url: '', pdf_url: '',
  }))

  // MovStock descuenta un porcentaje fijo del neto (30% salvo que el local
  // tenga otro pactado). Se mira el tipo del formulario y no el de la URL: si
  // alguien cambia el comprobante a otra cosa, el descuento deja de aplicar.
  // Manda el tipo del formulario y NADA más: el descuento le corresponde a
  // todo MovStock, se haya entrado por el botón de carga rápida o eligiendo el
  // comprobante a mano en el formulario común. Antes exigía además el modo
  // rápido, así que elegir MovStock desde el formulario largo no descontaba.
  const esMovStock = form.id_tipo === TIPO_MOVSTOCK
  // Porcentaje del local activo. Se completa cuando llega la ficha del local;
  // hasta entonces vale el general, que es lo que corresponde a casi todos.
  const [pctDescuento, setPctDescuento] = useState(DESCUENTO_MOVSTOCK_DEFAULT)
  // Tipo del local activo (Gastronomía, etc.), para ordenar proveedores y
  // rubcat por afinidad. Sale del contexto del local: el activeLocal del store
  // no lo trae (my-apps proyecta solo id y nombre).
  const [tipoLocalCtx, setTipoLocalCtx] = useState(null)
  // Escribir el descuento a mano lo desengancha del cálculo, igual que el
  // cashflow con el plazo del proveedor: un valor puesto por una persona no se
  // pisa en silencio. Es estado y no un ref porque el aviso de abajo del campo
  // cambia según esto, y un ref no vuelve a renderizar.
  const [descuentoManual, setDescuentoManual] = useState(false)

  // Restaura un borrador guardado (si existe) antes que nada. Cubre el caso
  // de que la pestaña se haya recargado por completo mientras el usuario
  // sacaba una foto con la cámara (ver frontend/src/lib/formDraft.js).
  useEffect(() => {
    const draft = loadDraft(draftKey)
    if (draft) {
      restoredFromDraftRef.current = true
      // Lo que se recupera se respeta tal cual: si después se toca la fecha, el
      // número recuperado no se pisa.
      if (draft.data.form?.nro) nroManualRef.current = true
      if (draft.data.form)           setForm((f) => ({ ...f, ...draft.data.form }))
      if (draft.data.provSelected)   setProvSelected(draft.data.provSelected)
      if (draft.data.cliSelected)    setCliSelected(draft.data.cliSelected)
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

  // Catálogos de rubros y categorías (para los buscadores con opción de crear).
  useEffect(() => {
    rubrosApi.list().then(r => setRubros(r.data || [])).catch(() => {})
    categoriasApi.list().then(r => setCategorias(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    // El contexto del local (proveedor + descuento) solo hace falta al crear en
    // los modos rápidos. Va por pagosApi y no por localesApi: ver el comentario
    // de `contextoLocal` en api/pagos.js.
    // Se pide siempre que se cree, no solo en los modos rápidos: ahora que
    // MovStock se puede elegir desde el formulario común, sin el contexto el
    // descuento saldría con el 30 general en un local que tiene otro pactado.
    const pideContexto = !isEditing && Boolean(activeLocal)

    cargarArranquePago({
      metodos:  metodosApi.list(),
      pago:     isEditing ? pagosApi.get(id, ctrl.signal) : null,
      contexto: pideContexto ? pagosApi.contextoLocal(activeLocal.id, ctrl.signal) : null,
    })
      .then(async ({ metodos: mets, pago: d, contexto, fallas }) => {
        setMetodos(mets)
        draftReadyRef.current = true
        // Editar sin los datos del pago es peor que no abrir el formulario: se
        // guardaría un pago existente con los campos en blanco.
        if (fallas.pago) { notify('Error al cargar datos', 'error'); return }
        // El contexto sí es opcional: sin él se sigue cargando a mano, con el
        // descuento general. Antes su 403 se llevaba puestos los métodos de pago.
        if (fallas.contexto) notify('No se pudo leer la configuración del local: revisá proveedor y descuento', 'info')
        if (restoredFromDraftRef.current) {
          // Ya se restauró el formulario desde el borrador: no lo pisamos con
          // lo que vino del servidor, salvo el historial de impuestos guardados.
          if (d) setSavedImp(d.impuestos || [])
          return
        }
        if (!isEditing && modoRapido) {
          // Carga Avión arranca en Efectivo y MovStock en Intercompany: ver
          // metodoDeArranque en lib/arranquePagoForm.js.
          const met = metodoPorDefecto(mets, metodoDeArranque(tipoParam))
          if (met) setForm((f) => ({ ...f, id_metodo: f.id_metodo || met.id }))
        }
        // El porcentaje de descuento sale de la ficha del local. Se guarda
        // aunque no sea MovStock: el tipo se puede cambiar dentro del form.
        if (contexto) setPctDescuento(porcentajeDelLocal(contexto))
        if (contexto?.tipo_local) setTipoLocalCtx(contexto.tipo_local)
        if (d) {
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
            id_cliente:     d.id_cliente     || '',
            ingresa_egreso: d.ingresa_egreso,
            periodico:      d.periodico      ?? false,
            id_local:       d.id_local       || '',
            foto_url:       d.foto_url       || '',
            pdf_url:        d.pdf_url        || '',
            nro_ord:        d.nro_ord        ?? null,
          })
          // El nombre del cliente viene en el include del pago: sin esto el
          // combobox abriría vacío y parecería que la op perdió el cliente.
          if (d.cliente) setCliSelected(d.cliente)
        } else if (contexto?.id_proveedor && modoRapido) {
          // SOLO en los modos rápidos: Carga Avión y MovStock facturan contra
          // el proveedor del propio local (la sociedad que factura por él),
          // así que viene precargado. En el "nuevo pago" común ese default
          // metía la razón social del local en pagos de cualquier proveedor
          // cuando nadie tocaba el campo.
          const { data: prov } = await proveedoresApi.get(contexto.id_proveedor, ctrl.signal)
          setLocalProveedor(prov)
          setProvSelected(prov)
          setProvPlazo(prov.plazo || null)
          // Sin precarga de rubro, igual que en selectProveedor.
          setForm(f => ({
            ...f,
            id_proveedor: prov.id,
            // En modo rápido `cashflowAutomatico` ignora el plazo y deja la fecha de pago:
            // sin esto, un local cuyo proveedor tiene plazo cargado volvía a pisar el
            // cashflow con fecha + plazo justo después de precargarlo.
            cashflow: siguienteCashflow({
              actual:       f.cashflow,
              autoAnterior: cashflowAutomatico({ modoRapido, fecha: f.fecha, fechaPago: f.fecha_pago }),
              autoNuevo:    cashflowAutomatico({ modoRapido, fecha: f.fecha, fechaPago: f.fecha_pago, plazo: prov.plazo }),
            }),
          }))
        } else if (contexto) {
          // El local existe pero no tiene proveedor configurado: false (y no
          // null) para poder distinguirlo de "todavía no cargó" y avisarlo.
          setLocalProveedor(false)
        }
      })
      .catch(() => { if (!ctrl.signal.aborted) { draftReadyRef.current = true; notify('Error al cargar datos', 'error') } })

    return () => ctrl.abort()
  }, [id])

  // Al salir del formulario, el borrador se descarta.
  //
  // El borrador existe para sobrevivir a que la pestaña se RECARGUE con el
  // formulario abierto (Android puede matar el proceso mientras se saca una
  // foto), no para sobrevivir a que la persona se vaya. Sin esto, cancelar y
  // volver a entrar traía de vuelta la factura anterior con el cartel de "Se
  // recuperó la carga que tenías sin guardar", que no es lo que espera nadie
  // después de cancelar.
  //
  // Una recarga de verdad no ejecuta este cleanup, así que el caso de la
  // cámara sigue cubierto: ahí el borrador se restaura como siempre.
  const montadoRef = useRef(false)
  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      // En desarrollo, StrictMode desmonta y vuelve a montar enseguida. Si eso
      // pasa, el remount de acá arriba cancela el descarte y el borrador queda
      // intacto; en una salida real nadie lo vuelve a montar y se borra.
      setTimeout(() => { if (!montadoRef.current) clearDraft(draftKey) }, 0)
    }
  }, [draftKey])

  // Guarda un borrador (debounced) cada vez que cambia el formulario o los
  // archivos adjuntos, para poder recuperarlo si la pestaña se recarga (ver
  // el efecto de restauración más arriba y frontend/src/lib/formDraft.js).
  useEffect(() => {
    if (!draftReadyRef.current) return // todavía no terminó de cargar/restaurar: no pisar con datos a medio inicializar
    const t = setTimeout(() => {
      saveDraft(
        draftKey,
        { form, provSelected, cliSelected, provPlazo, rubcatSelected, pendingImp, mmForm },
        { foto: fotoFile, pdf: pdfFile }
      )
    }, 400)
    return () => clearTimeout(t)
  }, [draftKey, form, provSelected, cliSelected, provPlazo, rubcatSelected, pendingImp, mmForm, fotoFile, pdfFile])

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

  // PV y Nro de comprobante son opcionales para Carga Avión (tickets
  // manuscritos sin datos fiscales) y para facturas tipo B — el backend ya
  // los exime en ambos casos; exigirlos acá forzaba a inventar números al
  // editar una factura B creada sin ellos.
  const pvNroOpcional = esCargaAvion || form.id_tipo === 'B'

  // ── Lectura de la factura con IA ─────────────────────────────────────────
  // Se dispara desde el botón "Carga con IA" (no al adjuntar una foto, como
  // antes: se subían fotos de cualquier cosa y se gastaba una llamada al modelo
  // para nada, y encima se pisaban campos ya escritos a mano).
  //
  // Los datos se precargan pero no se guardan solos: la persona revisa. Los
  // campos que vinieron de la lectura quedan marcados, para que se sepa qué
  // revisar y qué escribió uno mismo.
  const [leyendoFactura, setLeyendoFactura] = useState(false)
  const [lectura, setLectura] = useState(null) // { marcados, aritmetica, proveedor, totalFactura }
  // Cuando la lectura no sale: { tono: 'warn' | 'error', titulo, detalle }. Se
  // muestra junto al botón, igual que el resultado bueno. Antes era un toast
  // arriba y se lo perdía la misma persona que no veía el aviso de éxito.
  const [fallaLectura, setFallaLectura] = useState(null)
  // 'foto' | 'pdf' | null: en qué slot cayó el archivo que se está leyendo, para
  // bloquear ese adjunto (y no el otro) mientras dura la lectura.
  const [leyendoTipo, setLeyendoTipo] = useState(null)

  const marcadoIA = (campo) => (lectura?.marcados?.includes(campo) ? ' campo-ia' : '')

  const esPdf = (file) =>
    file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name ?? '')

  // El archivo con el que se lee es también el comprobante del pago: se guarda
  // en el slot que le corresponde según lo que sea, así una sola acción carga
  // los datos y deja adjuntada la factura. Si ya había algo en ese slot, se
  // reemplaza — es el archivo del que salen los datos que se están viendo.
  const cargarConIA = (file) => {
    if (!file) return
    if (esPdf(file)) {
      setPdfFile(file)
      set('pdf_url', '')
      setLeyendoTipo('pdf')
    } else {
      setFotoFile(file)
      set('foto_url', '')
      setLeyendoTipo('foto')
    }
    leerFactura(file)
  }

  const leerFactura = async (file) => {
    if (!file) return
    setLeyendoFactura(true)
    setLectura(null)
    setFallaLectura(null)
    try {
      const { data } = await pagosApi.leerFactura(file)
      if (!data.legible) {
        setFallaLectura({
          tono: 'warn',
          titulo: 'No se pudieron leer los datos de ese archivo.',
          detalle: 'Quedó adjunto igual: cargá los datos a mano.'
        })
        return
      }
      const c = data.campos

      // El importe total NO se precarga: se calcula solo desde neto + impuestos
      // − descuento (ver el useEffect de abajo). Lo que sí se guarda es el total
      // que decía la factura, para poder avisar si no coincide.
      // El patch sale de lib/precargaIA.js: ahi viven el relleno con ceros de pv y
      // nro (antes se precargaba "3" en vez de "00003", porque el relleno estaba
      // solo en el onBlur del campo y cargando con IA nadie pasa por ahi) y el
      // periodo igual a la fecha de la factura.
      setForm((f) => ({ ...f, ...patchDesdeLectura(c) }))

      if (c.impuestos?.length && !isEditing) {
        setPendingImp(c.impuestos.map((i) => ({ tipo: i.tipo, monto: String(i.monto) })))
      }

      if (data.proveedor?.estado === 'encontrado') {
        setProvSelected(data.proveedor)
        setForm((f) => ({ ...f, id_proveedor: data.proveedor.id }))
      }

      // La factura dice "Contado" o "Cuenta Corriente"; el backend ya lo mapeó
      // al método del catálogo. Si no pudo, se muestra qué leyó y la persona elige.
      if (data.metodo?.id) {
        setForm((f) => ({ ...f, id_metodo: data.metodo.id }))
      }

      setLectura({
        marcados: data.marcados ?? [],
        aritmetica: data.aritmetica,
        proveedor: data.proveedor,
        metodo: data.metodo,
        totalFactura: c.importe
      })

    } catch (err) {
      // El archivo ya quedó adjunto: la lectura falló, la carga a mano no.
      setFallaLectura({
        tono: 'error',
        titulo: err.response?.data?.error || 'No se pudo leer la factura.',
        detalle: 'El archivo quedó adjunto: cargá los datos a mano.'
      })
    } finally {
      setLeyendoFactura(false)
      setLeyendoTipo(null)
    }
  }

  // Antigüedad del período, para el aviso de más abajo. Se recalcula en cada
  // render y no en un useMemo porque son dos restas.
  const diasPeriodo  = diasDesdeFinDePeriodo(form.periodo)
  // De dónde salió el cashflow que se está viendo, para el texto de abajo del campo. Se
  // recalcula en cada render (son comparaciones de strings) y no en un useMemo.
  const cashflowAyuda = ayudaCashflow({
    modoRapido, fecha: form.fecha, fechaPago: form.fecha_pago, plazo: provPlazo, actual: form.cashflow,
  })
  const periodoViejo = periodoDemasiadoViejo(form.periodo)

  // set con efectos encadenados.
  //
  // Las banderas de "esto lo escribió una persona" se marcan ACÁ y no dentro
  // del updater: en StrictMode el updater corre dos veces, y un efecto
  // secundario adentro se ejecuta de más.
  const set = (field, value) => {
    // Escribir el número o el descuento a mano los desengancha de su cálculo:
    // a partir de ahí manda lo que puso la persona.
    if (field === 'nro') nroManualRef.current = true
    if (field === 'descuento') setDescuentoManual(true)

    setForm(f => {
      const next = { ...f, [field]: value }
      // En MovStock el descuento sale del neto por el porcentaje del local.
      // Escucha el neto Y el tipo: el orden en que se cargan los campos no
      // puede decidir si se aplica o no. La regla vive en lib/descuentoMovstock.js.
      const nuevoDescuento = siguienteDescuento({
        campo:    field,
        tipo:     next.id_tipo,
        neto:     next.importe_neto,
        pct:      pctDescuento,
        editando: isEditing,
        manual:   descuentoManual,
      })
      if (nuevoDescuento !== undefined) next.descuento = nuevoDescuento
      if (field === 'fecha') {
        next.periodo = value
        // El número de los movimientos internos es la fecha, así que sigue a
        // la fecha mientras nadie lo haya tocado.
        if (modoRapido && !isEditing && !nroManualRef.current) {
          next.nro = nroDesdeFecha(value) || next.nro
        }
      }
      if (field === 'fecha_pago') next.pagado = Boolean(value)
      if (field === 'pagado' && !value) next.fecha_pago = ''
      // El cashflow acompaña a los campos de los que depende: la fecha (op con factura,
      // vía el plazo del proveedor) y la fecha de pago (modo rápido). Un valor puesto a
      // mano NUNCA se pisa en silencio -- el cliente carga vencimientos pactados que no
      // coinciden con ningún cálculo. La regla está en lib/cashflowPago.js.
      if (CAMPOS_QUE_MUEVEN_CASHFLOW.includes(field)) {
        next.cashflow = siguienteCashflow({
          actual:       f.cashflow,
          autoAnterior: cashflowAutomatico({ modoRapido, fecha: f.fecha,    fechaPago: f.fecha_pago,    plazo: provPlazo }),
          autoNuevo:    cashflowAutomatico({ modoRapido, fecha: next.fecha, fechaPago: next.fecha_pago, plazo: provPlazo }),
        })
      }
      return next
    })
  }

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

  // seleccionar proveedor desde el combobox: recalcula cashflow si hay plazo.
  //
  // El rubro NO se precarga desde el proveedor: arrastraba clasificaciones
  // equivocadas porque quien carga no revisa un campo que ya viene lleno
  // (pedido de Anaxi, reunión del 31/07/2026). El proveedor sigue teniendo su
  // id_rubcat guardado y configurable, solo dejó de autocompletar.
  const selectProveedor = (prov) => {
    const plazo = prov.plazo || null
    setProvPlazo(plazo)
    setProvSelected(prov)
    setForm(f => ({
      ...f,
      id_proveedor: prov.id,
      // Igual que al mover la fecha: el plazo del proveedor nuevo recalcula el cashflow
      // salvo que lo hayan escrito a mano. En modo rápido el plazo no aplica (la plata ya
      // salió de la caja) y `cashflowAutomatico` lo ignora.
      cashflow: siguienteCashflow({
        actual:       f.cashflow,
        autoAnterior: cashflowAutomatico({ modoRapido, fecha: f.fecha, fechaPago: f.fecha_pago, plazo: provPlazo }),
        autoNuevo:    cashflowAutomatico({ modoRapido, fecha: f.fecha, fechaPago: f.fecha_pago, plazo }),
      }),
    }))
  }

  const clearProveedor = () => {
    setProvPlazo(null)
    setProvSelected(null)
    setForm(f => {
      const auto = cashflowAutomatico({ modoRapido, fecha: f.fecha, fechaPago: f.fecha_pago, plazo: provPlazo })
      // Sin proveedor no hay plazo, así que en una op con factura el cashflow se vacía
      // (era eso lo que lo calculaba). En modo rápido no depende del proveedor y queda la
      // fecha de pago. Un valor escrito a mano se conserva en los dos casos.
      const manual = f.cashflow && soloFecha(f.cashflow) !== soloFecha(auto)
      return {
        ...f,
        id_proveedor: '',
        cashflow: manual ? f.cashflow : cashflowAutomatico({ modoRapido, fecha: f.fecha, fechaPago: f.fecha_pago }),
      }
    })
  }

  // tipo_local solo reordena el resultado (los proveedores del rubro del local
  // y los generales primero); nunca filtra. Si el local activo viene de una
  // sesion vieja y no lo trae, el backend responde alfabetico como siempre.
  // Solo activos: un cliente dado de baja no tiene que poder recibir ops nuevas.
  const fetchClientes = (search) =>
    clientesApi.list({ search, activo: 'true', limit: 50 }).then(r => r.data.data)

  const esCtaCteCliente = form.estado_op === ESTADO_CTA_CTE_CLIENTE

  // Cambiar de estado saca el cliente: el backend rechaza un id_cliente sin
  // CTA_CTE_CLI, así que dejarlo puesto haría fallar el guardado con un error que
  // desde la pantalla no se entiende.
  const cambiarEstadoOp = (valor) => {
    set('estado_op', valor)
    if (valor !== ESTADO_CTA_CTE_CLIENTE && form.id_cliente) {
      set('id_cliente', '')
      setCliSelected(null)
    }
  }

  const selectCliente = (cli) => {
    setCliSelected(cli)
    set('id_cliente', cli.id)
  }

  const clearCliente = () => {
    setCliSelected(null)
    set('id_cliente', '')
  }

  // El tipo del local llega por el contexto (tipoLocalCtx); el fallback a
  // activeLocal.tipo_local queda por si my-apps lo devuelve algún día.
  const tipoLocalActivo = tipoLocalCtx || activeLocal?.tipo_local || null

  const fetchProveedores = (search) =>
    proveedoresApi
      .list({ search, activo: 'true', limit: 60, ...(tipoLocalActivo ? { tipo_local: tipoLocalActivo } : {}) })
      .then(r => r.data.data)

  const fetchRubcats = (search) =>
    rubcatApi.list({ search, ...(tipoLocalActivo ? { tipo_local: tipoLocalActivo } : {}) }).then(r => {
      const data = r.data
      if (modoRapido && form.id_tipo === 'STK') {
        return data.filter(rc => rc.rubro?.nombre?.toUpperCase().startsWith('CMV'))
      }
      return data
    })

  // ── Proveedor: al no existir, se abre un modalcito con nombre / razón
  // social / CUIT (el resto de los datos se completan luego en Proveedores). ──
  const openProvModal = (nombre) => setProvModal({ nombre: nombre || '', razon_social: '', cuit: '' })

  const submitProvModal = async () => {
    if (!provModal.nombre && !provModal.razon_social) {
      notify('Ingresá al menos el nombre o la razón social', 'error'); return
    }
    setSavingModal(true)
    try {
      const { data } = await proveedoresApi.create({
        nombre:       provModal.nombre       || null,
        razon_social: provModal.razon_social || null,
        cuit:         provModal.cuit         || null
      })
      notify('Proveedor creado', 'success')
      setProvModal(null)
      selectProveedor(data)
    } catch (err) { notify(err.response?.data?.error || 'Error al crear proveedor', 'error') }
    finally { setSavingModal(false) }
  }

  // ── Rubro / Categoría: al no existir, se abre un modalcito que pide rubro y
  // categoría (cada uno se puede elegir o crear) y se crea la combinación. ──
  const fetchRubros = (search) => Promise.resolve(
    (search ? rubros.filter(r => r.nombre.toLowerCase().includes(search.toLowerCase())) : rubros).slice(0, 60)
  )
  const fetchCategorias = (search) => Promise.resolve(
    (search ? categorias.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase())) : categorias).slice(0, 60)
  )

  const openRubcatModal = () => setRubcatModal({ rubroSel: null, catSel: null })

  // Crear rubro / categoría desde dentro del modal (setea la selección del modal)
  const createRubroInModal = async (nombre) => {
    try {
      const { data } = await rubrosApi.create({ nombre })
      setRubros(rs => [...rs, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setRubcatModal(m => ({ ...m, rubroSel: data }))
    } catch (err) { notify(err.response?.data?.error || 'Error al crear rubro', 'error') }
  }
  const createCatInModal = async (nombre) => {
    try {
      const { data } = await categoriasApi.create({ nombre })
      setCategorias(cs => [...cs, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setRubcatModal(m => ({ ...m, catSel: data }))
    } catch (err) { notify(err.response?.data?.error || 'Error al crear categoría', 'error') }
  }

  // Confirmar el modal: busca el RubCat que combina rubro+categoría; si no
  // existe, lo crea, y lo asigna al pago.
  const submitRubcatModal = async () => {
    const { rubroSel, catSel } = rubcatModal
    if (!rubroSel || !catSel) { notify('Elegí rubro y categoría', 'error'); return }
    setSavingModal(true)
    try {
      const listRes = await rubcatApi.list({ search: rubroSel.nombre })
      const list = Array.isArray(listRes.data) ? listRes.data : (listRes.data?.data || [])
      let rc = list.find(x => x.id_rub === rubroSel.id && x.id_cat === catSel.id)
      if (!rc) {
        try {
          const res = await rubcatApi.create({ id_rub: rubroSel.id, id_cat: catSel.id })
          rc = res.data
        } catch (err) {
          if (err.response?.status === 409) {
            const retry = await rubcatApi.list({ search: rubroSel.nombre })
            const l2 = Array.isArray(retry.data) ? retry.data : (retry.data?.data || [])
            rc = l2.find(x => x.id_rub === rubroSel.id && x.id_cat === catSel.id)
          } else throw err
        }
      }
      if (rc) {
        setRubcatSelected(rc)
        set('id_rubcat', rc.id)
        setRubcatModal(null)
      }
    } catch (err) { notify(err.response?.data?.error || 'Error al asignar rubro/categoría', 'error') }
    finally { setSavingModal(false) }
  }

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
    // inventaran números para poder guardar. Idem facturas tipo B (el backend
    // también las exime). Para estos casos quedan opcionales.
    if (!pvNroOpcional && !form.pv)  { notify('El punto de venta es obligatorio', 'error'); return }
    if (!pvNroOpcional && !form.nro) { notify('El número de comprobante es obligatorio', 'error'); return }
    if (!form.cashflow)   { notify('El cashflow es obligatorio', 'error'); return }
    if (!form.importe)   { notify('Ingresá el importe neto (o un impuesto) para calcular el total', 'error'); return }
    // Solo al crear, igual que el backend: hay facturas viejas guardadas sin
    // período y exigirlo al editar dejaría esas ediciones trabadas hasta
    // completar un dato que quizá nadie sabe.
    if (!isEditing && !form.periodo) { notify('El período es obligatorio', 'error'); return }

    // Advertencia, no validación: la factura se guarda igual si el usuario
    // confirma. Puede ser una factura atrasada de verdad, pero también un año
    // mal tipeado en el período, que es el error que esto pesca.
    if (periodoDemasiadoViejo(form.periodo)) {
      const dias = diasDesdeFinDePeriodo(form.periodo)
      const seguir = await showConfirm(
        `El período ${fmtMonthUTC(form.periodo)} cerró hace ${dias} días. Revisá que sea el correcto antes de guardar. ¿Guardar la factura con ese período?`,
        'Período muy viejo'
      )
      if (!seguir) return
    }

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
        // Se marca en el momento de crear -- no se ofrece "Carga con IA" al
        // editar (ver el comentario en Adjuntos), así que solo importa acá.
        ...(!isEditing ? { cargado_con_ia: Boolean(lectura) } : {}),
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
      navigate(rutaVolver)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
      setUploadingFoto(false)
      setUploadingPdf(false)
    } finally { setLoading(false) }
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate(rutaVolver)}>
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
                <input type="date" required className={marcadoIA('fecha').trim()} value={form.fecha} onChange={e => set('fecha', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Período {isEditing ? '' : '*'}</label>
              <div className="form-input-wrap">
                <input type="date" required={!isEditing} value={form.periodo} onChange={e => set('periodo', e.target.value)} />
              </div>
              {/* Se avisa acá, al elegir el período, y no solo al guardar: si
                  aparece recién al final ya cargó toda la factura al lado del
                  dato equivocado. */}
              {periodoViejo && (
                <div className="aviso-periodo-viejo">
                  <IcoAlerta />
                  <span>
                    El período <strong>{fmtMonthUTC(form.periodo)}</strong> cerró hace {diasPeriodo} días.
                    Se puede guardar igual, pero revisá que sea el correcto.
                  </span>
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pago-cashflow">Cashflow *</label>
              <div className="form-input-wrap">
                <input
                  id="pago-cashflow"
                  type="date"
                  required
                  value={form.cashflow}
                  onChange={e => set('cashflow', e.target.value)}
                  aria-describedby="pago-cashflow-ayuda"
                  title={cashflowAyuda.titulo}
                />
              </div>
              {/* De dónde salió el valor y cómo volver a lo automático. Sin esto el campo es
                  una fecha obligatoria sin explicación: quien carga no sabe si el número que
                  ve lo puso el sistema o lo dejó otra persona. */}
              <span
                id="pago-cashflow-ayuda"
                style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, display: 'block' }}
              >
                {cashflowAyuda.texto}
                {cashflowAyuda.puedeVolver && (
                  <button
                    type="button"
                    onClick={() => set('cashflow', cashflowAyuda.automatico)}
                    style={{
                      background: 'none', border: 'none', padding: 0, marginLeft: 6,
                      color: 'var(--gold-bright)', cursor: 'pointer', fontSize: 11,
                      textDecoration: 'underline',
                    }}
                    title={`Volver a ${cashflowAyuda.automatico}`}
                  >
                    {cashflowAyuda.accion}
                  </button>
                )}
              </span>
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
                displayValue={nombreProveedor(provSelected)}
                getKey={p => p.id}
                getLabel={p => nombreProveedor(p)}
                getSublabel={p => razonSocialExtra(p)}
                onSelect={selectProveedor}
                onClear={clearProveedor}
                fetchItems={fetchProveedores}
                onCreate={openProvModal}
                createLabel="crear proveedor"
                placeholder="Buscar o crear proveedor…"
              />
              {/* En los modos rápidos el proveedor lo pone el local. Si el local
                  no lo tiene configurado no hay nada que precargar, y sin este
                  aviso parece que la precarga está rota cuando en realidad
                  falta el dato. Hoy son 55 de 59 locales. */}
              {modoRapido && !isEditing && localProveedor === false && (
                <span className="aviso-periodo-viejo" style={{ marginTop: 7 }}>
                  <span>
                    Este local todavía no tiene proveedor asociado, así que hay que elegirlo a mano.
                    Se configura una sola vez en <strong>Locales → {activeLocal?.nombre || 'el local'} → Proveedor</strong>.
                  </span>
                </span>
              )}
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
                onCreate={openRubcatModal}
                createLabel="crear rubro / categoría"
                placeholder="Buscar o crear rubro / categoría…"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Método de Pago *</label>
              <div className="form-input-wrap">
                <select required className={marcadoIA('id_metodo').trim()} value={form.id_metodo} onChange={e => set('id_metodo', e.target.value)}>
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
              <label className="form-label">Punto de Venta{pvNroOpcional ? '' : ' *'}</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  required={!pvNroOpcional}
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
              <label className="form-label">Nro Comprobante{pvNroOpcional ? '' : ' *'}</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  required={!pvNroOpcional}
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
                  {/* La lista sale de lib/tiposPago.js: estaba escrita a mano acá y en
                      PagoList, así que al agregar un tipo uno de los dos quedaba sin él. */}
                  {TIPOS_PAGO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <div className="form-input-wrap">
                <select value={form.estado_op} onChange={e => cambiarEstadoOp(e.target.value)}>
                  {ESTADO_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {esCtaCteCliente && !form.id_cliente && (
                <p className="form-hint form-hint-alerta" style={{ marginTop: 4, marginBottom: 0 }}>
                  Falta elegir el cliente de la cuenta corriente.
                </p>
              )}
            </div>

            {/* Cliente: solo con estado CTA CTE CLI, y ahí es obligatorio. Aparece
                recién al elegir el estado porque en el resto de las ops no significa
                nada -- un cliente con otro estado el backend lo rechaza, y este
                estado sin cliente sería una deuda a nombre de nadie que no entra en
                ninguna cuenta corriente (ver lib/cuentaCorriente.js). */}
            {esCtaCteCliente && (
              <div className="form-group form-span-2">
                <label className="form-label">Cliente *</label>
                <Combobox
                  value={form.id_cliente}
                  displayValue={cliSelected ? nombreCliente(cliSelected) : ''}
                  getKey={c => c.id}
                  getLabel={nombreCliente}
                  onSelect={selectCliente}
                  onClear={clearCliente}
                  fetchItems={fetchClientes}
                  placeholder="Buscar cliente…"
                />
                <p className="form-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                  Con quién es la cuenta. Entra a su cuenta corriente <strong>ya</strong>,
                  sin esperar el pago: como egreso es un gasto pendiente y como ingreso
                  es plata a cobrar. Al marcarla pagada pasa a gasto o a ingreso, y el
                  saldo no cambia. Solo se listan los clientes activos; se dan de alta
                  en <Link to="/clientes">Clientes</Link>.
                </p>
              </div>
            )}

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
              {/* Se dice de dónde salió el número: si no, aparece un descuento
                  que nadie escribió y no se sabe si está bien. */}
              {esMovStock && !isEditing && pctDescuento > 0 && (
                <span style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, display: 'block' }}>
                  {descuentoManual
                    ? `Escrito a mano (el automático de este local es ${pctDescuento}%)`
                    : `${pctDescuento}% automático de este local`}
                  {!descuentoManual && form.descuento && (
                    <button
                      type="button"
                      onClick={() => set('descuento', '')}
                      style={{
                        background: 'none', border: 'none', padding: 0, marginLeft: 6,
                        color: 'var(--gold-bright)', cursor: 'pointer', fontSize: 11,
                        textDecoration: 'underline',
                      }}
                      title="Quitar el descuento automático de este pago"
                    >
                      quitar
                    </button>
                  )}
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" title="Se calcula solo: Neto + Impuestos − Descuento">Importe Total</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.importe} disabled readOnly style={{ opacity: 0.75 }} />
              </div>
              {/* El total ya viene descontado, y eso no se ve mirando el número:
                  quien carga tiene que saber que el local aplicó su descuento,
                  o va a creer que el sistema le cambió el importe de la factura. */}
              {esMovStock && Number(form.descuento) > 0 && (
                <span style={{ fontSize: 11, color: 'var(--gold-bright)', marginTop: 3, display: 'block' }}>
                  Ya tiene descontados {fmtMoneda(form.descuento)}
                  {!descuentoManual && pctDescuento > 0 && ` (${pctDescuento}% de este local)`}
                </span>
              )}
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

          {/* ── Carga con IA ─────────────────────────────────────────────────
              Fila propia arriba del panel, y no una celda del `form-grid` de
              abajo: ahi el boton quedaba desalineado contra Foto y PDF, que van
              envueltos en un form-group CON label, asi que arrancaban 26px mas
              abajo. Ahora el boton tambien tiene su label y los tres alinean.

              Dos columnas: el boton a la izquierda con su ancho, y los avisos de
              la lectura a la derecha, ocupando el espacio que antes quedaba
              vacio. Antes los avisos iban abajo a todo el ancho y empujaban los
              adjuntos fuera de la pantalla.

              El de duplicado se repite aca a proposito: el original vive arriba,
              en la seccion del comprobante, y cargando con IA se esta mirando
              esta parte de la pantalla -- el aviso existia pero no se veia. */}
          {!isEditing && (
            <div className="carga-ia-fila">
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Carga con IA</label>
                <CargaIA
                  onArchivo={cargarConIA}
                  leyendo={leyendoFactura}
                  disabled={loading}
                />
              </div>

              {/* La columna derecha lleva su propio label, igual que la del boton.
                  Sin el, el panel arrancaba 21px mas arriba --el alto del label de
                  la izquierda-- y aunque los dos terminaban a la misma altura, el
                  escalon de arriba se veia como que uno era mas grande. */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Resultado de la lectura</label>
                <div className="carga-ia-panel">
                {(leyendoFactura || lectura || fallaLectura) && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    {/* El "Leyendo la factura…" NO se repite acá: ya lo dice el
                        boton de al lado, con su spinner, que es donde la persona
                        acaba de apretar. Estaba en los dos lugares y se leia como
                        si fueran dos procesos distintos. Acá se dice lo que el
                        boton no puede: que va a pasar cuando termine. */}
                    {leyendoFactura && (
                      <p className="form-hint" style={{ margin: 0 }}>
                        Cuando termine, acá van los campos que precargó y los avisos
                        {leyendoTipo === 'pdf' ? ' (los PDF tardan un poco más)' : ''}.
                      </p>
                    )}

                    {/* La lectura falló o el archivo no era legible. Antes salía como
                        toast arriba y se perdía; el archivo igual quedó adjunto. */}
                    {!leyendoFactura && fallaLectura && (
                      <div className={`aviso-lectura ${fallaLectura.tono}`} style={{ marginBottom: 0 }}>
                        <div>
                          <strong>{fallaLectura.titulo}</strong> {fallaLectura.detalle}
                        </div>
                      </div>
                    )}

                    {!leyendoFactura && lectura && (
                      <div className="aviso-lectura" style={{ marginBottom: 0 }}>
                        <div>
                          <strong>Leí la factura: {(lectura.marcados ?? []).length} campos precargados.</strong>{' '}
                          Revisá los que quedaron marcados antes de guardar.
                          {lectura.proveedor?.estado === 'encontrado' && (
                            <> Proveedor: <strong>{lectura.proveedor.nombre || lectura.proveedor.razon_social}</strong>.</>
                          )}
                          {lectura.proveedor?.estado === 'no_encontrado' && (
                            <> No hay proveedor con CUIT <strong>{lectura.proveedor.cuit}</strong>
                              {lectura.proveedor.razon_social ? <> ({lectura.proveedor.razon_social})</> : null}
                              : elegilo o crealo a mano.</>
                          )}
                          {/* Si leyó la condición de venta pero no la pudo mapear, se dice
                              qué decía la factura para que la persona elija con ese dato. */}
                          {lectura.metodo && !lectura.metodo.id && (
                            <div style={{ marginTop: 6 }}>
                              La factura dice <strong>«{lectura.metodo.texto}»</strong> como condición de venta,
                              pero no coincide con ningún método de pago del sistema: elegilo a mano.
                            </div>
                          )}
                          {/* El total no se precarga (se calcula solo), asi que si la factura
                              decia otro numero conviene avisarlo: o se leyo mal un importe, o
                              falta un impuesto. */}
                          {lectura.aritmetica?.verificable && lectura.aritmetica.cuadra === false && (
                            <div style={{ marginTop: 6 }}>
                              ⚠ La factura dice <strong>{fmtMoneda(lectura.totalFactura)}</strong> pero neto + impuestos − descuento
                              da <strong>{fmtMoneda(lectura.aritmetica.esperado)}</strong>. Revisá los importes.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Duplicado: el mismo estado que el aviso de arriba. */}
                {!leyendoFactura && duplicado && (
                  <div className="aviso-lectura warn" style={{ marginBottom: 0 }}>
                    <div>
                      <strong>Ojo: ya existe la OP-{duplicado.nro_ord ?? '—'}</strong> con este proveedor,
                      punto de venta y número de comprobante
                      {duplicado.fecha ? ` (cargada el ${new Date(duplicado.fecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })})` : ''}.
                      Se puede guardar igual si corresponde.
                    </div>
                  </div>
                )}

                {/* Si no se pudo mirar el duplicado, se dice: callarse se lee como
                    "no hay duplicado", y no es lo mismo que "no pude verificar". */}
                {!leyendoFactura && lectura && !duplicado && faltaParaDuplicado({
                  id_proveedor: form.id_proveedor, pv: form.pv, nro: form.nro,
                }).length > 0 && (
                  <div className="aviso-lectura" style={{ marginBottom: 0 }}>
                    <div>
                      No pude verificar si está duplicada: falta{' '}
                      {faltaParaDuplicado({ id_proveedor: form.id_proveedor, pv: form.pv, nro: form.nro }).join(' y ')}.
                    </div>
                  </div>
                )}

                {/* Estado inicial: el panel no queda como un hueco sin explicar. */}
                {!leyendoFactura && !lectura && !fallaLectura && !duplicado && (
                  <p className="form-hint" style={{ margin: 0 }}>
                    Elegí una foto o un PDF de la factura y se precargan fecha, tipo,
                    punto de venta, número, neto, descuento e impuestos. El período queda
                    igual a la fecha de la factura, y se avisa si la factura ya está cargada.
                    El archivo queda adjunto igual.
                  </p>
                )}
                </div>
              </div>
            </div>
          )}

          {/* Dos columnas parejas y no el auto-fill del form-grid: con el boton de
              IA fuera de esta grilla quedaban solo dos celdas de 220px pegadas a la
              izquierda y media seccion vacia, contra la fila de arriba que ocupa
              todo el ancho. */}
          <div className="form-grid adjuntos-grid">
            <AdjuntoUpload
              label="Foto"
              accept="image/*"
              value={form.foto_url}
              file={fotoFile}
              onFileSelected={setFotoFile}
              onRemove={() => { set('foto_url', ''); setFotoFile(null); setLectura(null); setFallaLectura(null) }}
              uploading={uploadingFoto || leyendoTipo === 'foto'}
            />
            <AdjuntoUpload
              label="PDF"
              accept=".pdf,application/pdf"
              value={form.pdf_url}
              file={pdfFile}
              onFileSelected={setPdfFile}
              onRemove={() => { set('pdf_url', ''); setPdfFile(null); setLectura(null); setFallaLectura(null) }}
              uploading={uploadingPdf || leyendoTipo === 'pdf'}
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
          <button type="button" className="btn btn-secondary" onClick={() => navigate(rutaVolver)}>
            Cancelar
          </button>
        </div>
      </form>

      {/* ── Modalcito: nuevo proveedor ── */}
      {provModal && (
        <div className="confirm-backdrop" onMouseDown={() => !savingModal && setProvModal(null)}>
          <div className="confirm-modal" onMouseDown={e => e.stopPropagation()} style={{ width: 'min(440px, 92vw)' }}>
            <div className="form-panel-title" style={{ marginBottom: 18 }}>Nuevo proveedor</div>
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <div className="form-input-wrap">
                  <input type="text" autoFocus value={provModal.nombre} onChange={e => setProvModal(m => ({ ...m, nombre: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Razón social</label>
                <div className="form-input-wrap">
                  <input type="text" value={provModal.razon_social} onChange={e => setProvModal(m => ({ ...m, razon_social: e.target.value }))} />
                </div>
              </div>
              <CampoCuit
                value={provModal.cuit}
                onChange={(v) => setProvModal(m => ({ ...m, cuit: v }))}
                ayuda="Opcional. Se verifica el dígito verificador."
              />
            </div>
            <div className="confirm-foot" style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setProvModal(null)} disabled={savingModal}>Cancelar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={submitProvModal} disabled={savingModal}>
                {savingModal ? 'Creando…' : 'Crear proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modalcito: nueva combinación rubro / categoría ── */}
      {rubcatModal && (
        <div className="confirm-backdrop" onMouseDown={() => !savingModal && setRubcatModal(null)}>
          <div className="confirm-modal" onMouseDown={e => e.stopPropagation()} style={{ width: 'min(440px, 92vw)', overflow: 'visible' }}>
            <div className="form-panel-title" style={{ marginBottom: 18 }}>Nueva combinación rubro / categoría</div>
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Rubro</label>
                <Combobox
                  value={rubcatModal.rubroSel?.id || ''}
                  displayValue={rubcatModal.rubroSel?.nombre || ''}
                  getKey={r => r.id}
                  getLabel={r => r.nombre}
                  onSelect={r => setRubcatModal(m => ({ ...m, rubroSel: r }))}
                  onClear={() => setRubcatModal(m => ({ ...m, rubroSel: null }))}
                  fetchItems={fetchRubros}
                  onCreate={createRubroInModal}
                  createLabel="crear rubro"
                  placeholder="Buscar o crear rubro…"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <Combobox
                  value={rubcatModal.catSel?.id || ''}
                  displayValue={rubcatModal.catSel?.nombre || ''}
                  getKey={c => c.id}
                  getLabel={c => c.nombre}
                  onSelect={c => setRubcatModal(m => ({ ...m, catSel: c }))}
                  onClear={() => setRubcatModal(m => ({ ...m, catSel: null }))}
                  fetchItems={fetchCategorias}
                  onCreate={createCatInModal}
                  createLabel="crear categoría"
                  placeholder="Buscar o crear categoría…"
                />
              </div>
            </div>
            <div className="confirm-foot" style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRubcatModal(null)} disabled={savingModal}>Cancelar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={submitRubcatModal} disabled={savingModal || !rubcatModal.rubroSel || !rubcatModal.catSel}>
                {savingModal ? 'Creando…' : 'Crear y asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
