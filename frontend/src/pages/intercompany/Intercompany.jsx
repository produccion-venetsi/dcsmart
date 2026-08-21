// Intercompany — pasar plata de un local a otro del MISMO grupo.
//
// Una op de tipo STK cargada en el local que envía se espeja en el local que
// recibe: nace una op nueva, igual pero como INGRESO, y las dos quedan unidas.
// El neto del grupo no cambia; la plata cambia de bolsillo.
//
// La pantalla está partida en tres porque son tres preguntas distintas:
//   Por enviar  — STK que todavía no se mandaron a ningún lado.
//   Enviadas    — con su destino, y la opción de revertir si nadie las tocó.
//   Recibidas   — lo que entró desde otro local, con de dónde vino.
//
// Solo la ven los roles operativos del grupo (ver el sidebar y, del lado que
// importa, requireOperativo en el backend).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { intercompanyApi } from '../../api/intercompany.js'
import { pagosApi } from '../../api/pagos.js'
import { metodosApi } from '../../api/metodospago.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import PagoDetailPanel from '../pagos/PagoDetailPanel.jsx'
import { esRolDc, puedeEditar, puedeBorrarPagos } from '../../lib/roles.js'
import { fmtDateUTC, todayInputDate } from '../../lib/dates.js'

const fmt$ = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

const etiquetaOp = (o) => (o.nro_ord != null ? `OP-${o.nro_ord}` : o.id.slice(0, 8))

// Los primeros días del mes hay que poder mirar el cierre del anterior, así que
// el rango arranca en los últimos 60 días y no en "este mes".
function rangoInicial() {
  const hasta = new Date()
  const desde = new Date(hasta.getTime() - 60 * 24 * 60 * 60 * 1000)
  return { desde: desde.toISOString().slice(0, 10), hasta: todayInputDate() }
}

// El número de OP abre su detalle. Es un botón y no la fila entera: las filas
// tienen sus propios botones (Enviar, Revertir) y un click de más no puede
// terminar mandando plata a otro local.
function BotonOp({ id, children, title, onOpen, abriendo }) {
  return (
    <button
      type="button"
      className="link-op"
      onClick={() => onOpen(id)}
      disabled={abriendo === id}
      title={title || 'Ver el detalle de la op'}
    >
      {abriendo === id ? '…' : children}
    </button>
  )
}

export default function Intercompany() {
  const navigate = useNavigate()
  const activeApp = useAppStore((s) => s.activeApp)
  const notify = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt = useUiStore((s) => s.showPrompt)
  const role = activeApp?.role

  const [rango, setRango] = useState(rangoInicial)
  const [locales, setLocales] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  // Qué op tiene abierto su selector de destino, y a dónde va: uno a la vez.
  const [enviando, setEnviando] = useState(null)   // id de la op elegida
  const [destino, setDestino] = useState('')
  const [trabajando, setTrabajando] = useState(null)
  // El detalle de la op: el mismo panel completo de Pagos. Antes había que
  // anotarse el número, ir a Pagos, filtrar y buscarlo para ver la factura o
  // el proveedor de una op que se estaba a punto de mandar a otro local.
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedPago, setSelectedPago] = useState(null)
  const [abriendo, setAbriendo] = useState(null)   // id de la op que se está pidiendo
  const [metodos, setMetodos] = useState([])

  const cargar = useCallback((signal) => {
    setLoading(true)
    return intercompanyApi.list({ desde: rango.desde, hasta: rango.hasta }, signal)
      .then(({ data }) => setData(data))
      .catch((err) => { if (!signal?.aborted) notify(err.response?.data?.error || 'No se pudo cargar', 'error') })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [rango.desde, rango.hasta, notify])

  useEffect(() => {
    const ctrl = new AbortController()
    cargar(ctrl.signal)
    return () => ctrl.abort()
  }, [cargar, activeApp?.id])

  useEffect(() => {
    const ctrl = new AbortController()
    intercompanyApi.locales(ctrl.signal)
      .then(({ data }) => setLocales(data.locales ?? []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [activeApp?.id])

  // Los métodos de pago los pide el panel de detalle para poder cambiar el
  // método sin salir de acá; si fallan, el panel simplemente no ofrece el
  // cambio y el resto del detalle se ve igual.
  useEffect(() => {
    metodosApi.list().then((r) => setMetodos(r.data || [])).catch(() => {})
  }, [])

  const pendientes = data?.pendientes ?? []
  const enviadas   = data?.enviadas ?? []
  const recibidas  = data?.recibidas ?? []

  const totales = useMemo(() => ({
    pendientes: pendientes.reduce((a, o) => a + Number(o.importe ?? 0), 0),
    enviadas: enviadas.reduce((a, o) => a + Number(o.importe ?? 0), 0),
    recibidas: recibidas.reduce((a, o) => a + Number(o.importe ?? 0), 0),
  }), [pendientes, enviadas, recibidas])

  // Los destinos posibles de una op: todos los locales del grupo menos el suyo.
  const destinosDe = (op) => locales.filter((l) => l.id !== op.id_local)

  const abrirEnvio = (op) => {
    setEnviando(op.id)
    // Si hay un solo destino posible, ya viene elegido: no tiene sentido pedir
    // que elijan de una lista de uno.
    const posibles = destinosDe(op)
    setDestino(posibles.length === 1 ? posibles[0].id : '')
  }

  const confirmarEnvio = async (op) => {
    if (!destino) { notify('Elegí el local que recibe', 'error'); return }
    const nombreDestino = locales.find((l) => l.id === destino)?.nombre ?? 'ese local'
    const ok = await showConfirm(
      `Se va a crear una op de ${fmt$(op.importe)} como INGRESO en ${nombreDestino}, ` +
      `copiada de ${etiquetaOp(op)} de ${op.local?.nombre}. La original no se modifica.`,
      { title: 'Enviar a otro local' }
    )
    if (!ok) return
    setTrabajando(op.id)
    try {
      const { data } = await intercompanyApi.enviar({ id_pago: op.id, id_local_destino: destino })
      notify(`Enviado a ${nombreDestino} como ${etiquetaOp(data.copia)}`, 'success')
      setEnviando(null); setDestino('')
      await cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo enviar', 'error')
    } finally { setTrabajando(null) }
  }

  const revertir = async (op) => {
    const ok = await showConfirm(
      `Se va a borrar la op que recibió ${op.copias?.[0]?.local?.nombre ?? 'el otro local'}. ` +
      `La original de ${op.local?.nombre} queda como está.`,
      { title: 'Revertir el envío' }
    )
    if (!ok) return
    setTrabajando(op.id)
    try {
      await intercompanyApi.revertir(op.id)
      notify('Envío revertido', 'success')
      await cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo revertir', 'error')
    } finally { setTrabajando(null) }
  }

  // El listado de Intercompany trae una proyección corta de la op (lo que la
  // tabla muestra), así que el detalle se pide completo: el panel necesita
  // impuestos, adjuntos, estado y auditoría, y sin eso abriría a medias.
  const abrirDetalle = async (idPago) => {
    if (!idPago) return
    setAbriendo(idPago)
    try {
      const { data } = await pagosApi.get(idPago)
      setSelectedPago(data)
      setPanelOpen(true)
    } catch (err) {
      // El 403 acá no es un error de la pantalla: la op del otro lado puede
      // estar en un local al que este usuario no llega (el listado se recorta
      // por locales permitidos, pero la copia y el origen viven en otro).
      const msg = err.response?.status === 403
        ? 'Esa op es de un local al que no tenés acceso'
        : err.response?.data?.error || 'No se pudo abrir el detalle de la op'
      notify(msg, err.response?.status === 403 ? 'info' : 'error')
    } finally { setAbriendo(null) }
  }

  // Cualquier acción del panel (auditar, pagar, borrar) puede cambiar lo que
  // esta pantalla muestra, así que se recarga la lista además del pago abierto.
  const patchPagoAudit = (id, audit) => {
    setSelectedPago((prev) => (prev?.id === id ? { ...prev, audit } : prev))
    cargar()
  }

  const patchPago = (id, fields) => {
    setSelectedPago((prev) => (prev?.id === id ? { ...prev, ...fields } : prev))
    cargar()
  }

  const handleDeletePago = async (id) => {
    const motivo = await showPrompt(
      'Se va a eliminar este pago con sus impuestos. No se puede deshacer.',
      { title: 'Eliminar pago', placeholder: 'Por qué se elimina (opcional)' }
    )
    if (motivo === null) return
    try {
      await pagosApi.remove(id, motivo)
      notify('Pago eliminado', 'success')
      setPanelOpen(false)
      await cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al eliminar', 'error')
    }
  }

  const filaBase = (op) => (
    <>
      <td className="td-mono" style={{ whiteSpace: 'nowrap' }}><BotonOp id={op.id} onOpen={abrirDetalle} abriendo={abriendo}>{etiquetaOp(op)}</BotonOp></td>
      <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>{op.fecha ? fmtDateUTC(op.fecha) : '—'}</td>
      <td>{op.local?.nombre ?? '—'}</td>
      <td className="td-number" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{fmt$(op.importe)}</td>
      <td className="td-muted">{op.metodo_pago?.nombre ?? '—'}</td>
    </>
  )

  const Vacio = ({ children, cols }) => (
    <tr><td colSpan={cols}><div className="table-empty"><p>{children}</p></div></td></tr>
  )
  const Cargando = ({ cols }) => (
    Array.from({ length: 3 }, (_, i) => (
      <tr key={i} className="skel-row">
        {Array.from({ length: cols }, (_, j) => <td key={j}><span className="skel" style={{ width: `${45 + (j * 11 + i * 7) % 40}%` }} /></td>)}
      </tr>
    ))
  )

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Intercompany</h1>
          <p className="page-sub">
            Pasar plata de un local a otro del grupo{activeApp?.nombre ? ` ${activeApp.nombre}` : ''}.
            La op de tipo STK se copia en el local que recibe como un ingreso; la original no se toca.
          </p>
        </div>
      </div>

      <div className="filters-bar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Desde</label>
          <div className="form-input-wrap">
            <input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Hasta</label>
          <div className="form-input-wrap">
            <input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* ── Por enviar ── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>Por enviar ({pendientes.length})</span>
        {!loading && pendientes.length > 0 && <span className="td-muted" style={{ fontSize: 12 }}>{fmt$(totales.pendientes)}</span>}
      </div>
      <div className="table-wrap" style={{ marginBottom: '1.5rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>OP</th><th>Fecha</th><th>Local</th><th className="num">Importe</th><th>Método</th>
              <th style={{ width: 320 }}>Enviar a</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <Cargando cols={6} />
              : pendientes.length === 0 ? <Vacio cols={6}>No hay ops STK sin enviar en el período.</Vacio>
                : pendientes.map((op) => {
                  const abierta = enviando === op.id
                  const posibles = destinosDe(op)
                  return (
                    <tr key={op.id}>
                      {filaBase(op)}
                      <td>
                        {posibles.length === 0 ? (
                          <span className="td-muted" style={{ fontSize: 12 }}>El grupo no tiene otro local al que enviar</span>
                        ) : abierta ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                              className="filter-select"
                              value={destino}
                              onChange={(e) => setDestino(e.target.value)}
                              style={{ minWidth: 150 }}
                            >
                              <option value="">Elegí el local…</option>
                              {posibles.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                            </select>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => confirmarEnvio(op)}
                              disabled={!destino || trabajando === op.id}
                            >
                              {trabajando === op.id ? '…' : 'Enviar'}
                            </button>
                            <button className="btn btn-sm btn-secondary" onClick={() => { setEnviando(null); setDestino('') }}>
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button className="btn btn-sm btn-secondary" onClick={() => abrirEnvio(op)}>
                            Enviar a otro local
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>

      {/* ── Enviadas ── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>Enviadas ({enviadas.length})</span>
        {!loading && enviadas.length > 0 && <span className="td-muted" style={{ fontSize: 12 }}>{fmt$(totales.enviadas)}</span>}
      </div>
      <div className="table-wrap" style={{ marginBottom: '1.5rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>OP</th><th>Fecha</th><th>Local</th><th className="num">Importe</th><th>Método</th>
              <th>Recibió</th><th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <Cargando cols={7} />
              : enviadas.length === 0 ? <Vacio cols={7}>Todavía no se envió ninguna en el período.</Vacio>
                : enviadas.map((op) => (
                  <tr key={op.id}>
                    {filaBase(op)}
                    <td>
                      {/* La OP del destino abre SU detalle: es otra op, del otro
                          local, y es la que hay que mirar para ver si allá ya la
                          operaron antes de revertir. */}
                      {op.copias.map((c) => (
                        <div key={c.id}>
                          <span className="badge badge-green">{c.local?.nombre}</span>
                          <span style={{ fontSize: 11, marginLeft: 6 }}>
                            <BotonOp id={c.id} onOpen={abrirDetalle} abriendo={abriendo} title={`Ver el detalle de la op en ${c.local?.nombre ?? 'el otro local'}`}>
                              {c.nro_ord != null ? `OP-${c.nro_ord}` : 'ver op'}
                            </BotonOp>
                          </span>
                        </div>
                      ))}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => revertir(op)}
                        disabled={trabajando === op.id}
                        title="Borra la op que recibió el otro local"
                      >
                        {trabajando === op.id ? '…' : 'Revertir'}
                      </button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* ── Recibidas ── */}
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>Recibidas ({recibidas.length})</span>
        {!loading && recibidas.length > 0 && <span className="td-muted" style={{ fontSize: 12 }}>{fmt$(totales.recibidas)}</span>}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>OP</th><th>Fecha</th><th>Local</th><th className="num">Importe</th><th>Método</th><th>Vino de</th></tr>
          </thead>
          <tbody>
            {loading ? <Cargando cols={6} />
              : recibidas.length === 0 ? <Vacio cols={6}>Ningún local recibió plata de otro en el período.</Vacio>
                : recibidas.map((op) => (
                  <tr key={op.id}>
                    {filaBase(op)}
                    {/* La nota que dejó el envío: dice el local de origen y su
                        OP. Se muestra tal cual para que coincida con lo que se
                        lee al abrir la op en Pagos, y al lado va el acceso a la
                        op original -- la pregunta que sigue a "vino de" es
                        siempre "a ver la de allá". */}
                    <td className="td-muted" style={{ fontSize: 12, maxWidth: 320 }}>
                      {op.observaciones ?? '—'}
                      {op.id_pago_origen && (
                        <div style={{ marginTop: 4 }}>
                          <BotonOp id={op.id_pago_origen} onOpen={abrirDetalle} abriendo={abriendo} title="Ver el detalle de la op original">
                            Ver la op de origen
                          </BotonOp>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <DrawerPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={selectedPago
          ? `OP-${selectedPago.nro_ord ?? selectedPago.id?.slice(0, 8)}${selectedPago.local?.nombre ? ` · ${selectedPago.local.nombre}` : ''}`
          : 'Detalle de la op'}
        width={580}
      >
        {selectedPago && (
          <PagoDetailPanel
            pago={selectedPago}
            navigate={navigate}
            onDelete={handleDeletePago}
            onAudit={patchPagoAudit}
            onPatch={patchPago}
            metodos={metodos}
            canEdit={puedeEditar(role)}
            canDelete={puedeBorrarPagos(role)}
            canAuditDc={esRolDc(role)}
            canSeeCreated={esRolDc(role)}
            canSeeActivity={esRolDc(role)}
          />
        )}
      </DrawerPanel>
    </div>
  )
}
