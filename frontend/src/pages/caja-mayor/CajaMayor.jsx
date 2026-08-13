// Caja Mayor — reemplazo del AppSheet DC-CAJA MAYOR. Solo super_admin.
//
// Se entra a la vista consolidada de TODOS los grupos (equivalente a la pantalla
// CM GENERAL de la app vieja) y desde ahí se baja al detalle de un local.
//
// Las 4 monedas se manejan con el selector, no con pantallas separadas: la app
// vieja tenía una tabla espejo por moneda (CM y CM_DOLAR, 39 columnas duplicadas)
// y hojas por grupo (PERROS_PESOS, JD_DOLARES...) que eran todas subconjuntos de
// la misma tabla.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { cajaMayorApi } from '../../api/cajaMayor.js'
import { authApi } from '../../api/auth.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { fmtDateUTC } from '../../lib/dates.js'
import {
  ESTADOS, ESTADO_LABEL, MONEDAS, ORIGEN_LABEL, fmtMonto, filtroDeSeleccion,
  tieneCicloDeRecepcion,
} from '../../lib/cajaMayor.js'
import MovimientoForm from './MovimientoForm.jsx'
import SelectorGrupoLocal from '../../components/SelectorGrupoLocal.jsx'
import { dividirPorDireccion, proporcion } from '../../lib/cajaMayorVista.js'
import { MODOS_ALTA, tieneOp, etiquetaOp, rutaDeLaOp, resolverAlta } from '../../lib/altaCajaMayor.js'
import { resolverApertura, mensajeDeCambio } from '../../lib/destinoAviso.js'

const LIMIT = 100

// Un saldo negativo se lee de un vistazo: es la diferencia entre que el local
// deba plata a la caja mayor o al revés.
function Saldo({ valor, moneda }) {
  const n = Number(valor ?? 0)
  const color = n < 0 ? 'var(--red)' : n > 0 ? 'var(--green)' : 'var(--t2)'
  return <span style={{ color, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMonto(n, moneda)}</span>
}

function BadgeEstado({ estado }) {
  return (
    <span className={`badge ${estado === ESTADOS.RECIBIDA ? 'badge-green' : 'badge-amber'}`}>
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  )
}

function BadgeDireccion({ ingreso, corregida }) {
  return (
    <span
      className={`badge ${ingreso ? 'badge-green' : 'badge-red'}`}
      title={corregida
        ? 'La dirección se corrigió a mano'
        : 'Dirección deducida de la op de gestión — se puede corregir'}
    >
      {ingreso ? '↑ Ingreso' : '↓ Egreso'}{corregida ? ' ✎' : ''}
    </span>
  )
}

export default function CajaMayor() {
  const notify = useUiStore((s) => s.notify)
  const navigate = useNavigate()

  // Caja Mayor es global: no pasa por appContext y se ven todos los grupos juntos. El
  // formulario de un pago vive dentro de un grupo y un local, y el backend corta por
  // allowedLocalIds. Asi que para abrir una op --o cargar una nueva-- hay que poner el
  // contexto antes de navegar. Es el mismo problema de los avisos y se resuelve con el
  // mismo lib (destinoAviso.js), en vez de escribir otro criterio que se desincronice.
  const [misApps, setMisApps] = useState([])
  const appActiva = useAppStore((s) => s.activeApp)
  const localActivo = useAppStore((s) => s.activeLocal)
  const setActiveApp = useAppStore((s) => s.setActiveApp)
  const setActiveLocal = useAppStore((s) => s.setActiveLocal)
  const [menuAlta, setMenuAlta] = useState(false)

  const [tab, setTab] = useState('saldos') // saldos | movimientos
  const [moneda, setMoneda] = useState('ARS')
  const [locales, setLocales] = useState([])
  const [grupos, setGrupos] = useState([])
  // Grupo y local, en cascada: el local solo aplica dentro del grupo elegido.
  const [idApp, setIdApp] = useState('')
  const [idLocal, setIdLocal] = useState('')
  const [estado, setEstado] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const [saldos, setSaldos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  // La tabla se pagina: sin esto llegaban las 3549 filas de una vez (2 MB) y el
  // navegador se colgaba al renderizarlas.
  const [page, setPage] = useState(1)
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(null)

  const [formMov, setFormMov] = useState(null)     // null | {} | movimiento a editar
  const [expandido, setExpandido] = useState(null)

  // Si falla, abrir una op avisa que no hay acceso en vez de mandar a un 403.
  useEffect(() => {
    authApi.myApps().then(({ data }) => setMisApps(data ?? [])).catch(() => setMisApps([]))
  }, [])

  useEffect(() => {
    cajaMayorApi.locales()
      .then(({ data }) => { setLocales(data.locales ?? []); setGrupos(data.grupos ?? []) })
      .catch(() => notify('No se pudieron cargar los locales', 'error'))
  }, [])

  const params = useMemo(() => ({
    ...filtroDeSeleccion({ idApp, idLocal }),
    ...(moneda ? { moneda } : {}),
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
  }), [idApp, idLocal, moneda, desde, hasta])

  const cargar = useCallback((signal) => {
    setLoading(true)
    const pedido = tab === 'saldos'
      ? cajaMayorApi.saldos(params, signal).then(({ data }) => setSaldos(data.saldos ?? []))
      : cajaMayorApi.list({ ...params, ...(estado ? { estado } : {}), page, limit: LIMIT }, signal)
        .then(({ data }) => { setMovimientos(data.movimientos ?? []); setResumen(data) })

    return pedido
      .catch((err) => {
        if (signal?.aborted) return
        notify(err.response?.data?.error || 'Error al cargar la caja mayor', 'error')
      })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [tab, params, estado, page])

  // Cambiar de filtro vuelve a la primera página: la 7 de un filtro no significa
  // nada en el siguiente, y quedaría mostrando vacío.
  useEffect(() => { setPage(1) }, [params, estado, tab])

  useEffect(() => {
    const ctrl = new AbortController()
    cargar(ctrl.signal)
    return () => ctrl.abort()
  }, [cargar])

  const recargar = () => cargar()

  // Cambiar el estado sirve igual para una op de gestión (que puede no tener fila
  // todavía, y entonces va por id_pago) y para un movimiento propio.
  const cambiarEstado = async (mov, nuevoEstado) => {
    const clave = mov.id ?? mov.id_pago
    setGuardando(clave)
    try {
      await cajaMayorApi.estado({
        ...(mov.id ? { id: mov.id } : { id_pago: mov.id_pago }),
        estado: nuevoEstado,
      })
      notify(nuevoEstado === ESTADOS.RECIBIDA ? 'Marcada como recibida' : 'Volvió a enviada', 'success')
      await recargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo cambiar el estado', 'error')
    } finally {
      setGuardando(null)
    }
  }

  // Corregir la dirección que dedujo la regla del signo (ver lib/cajaMayor.js en
  // el backend). Se manda junto con el estado actual para no pisarlo.
  const invertirDireccion = async (mov) => {
    const clave = mov.id ?? mov.id_pago
    setGuardando(clave)
    try {
      await cajaMayorApi.estado({
        ...(mov.id ? { id: mov.id } : { id_pago: mov.id_pago }),
        estado: mov.estado,
        ingreso: !mov.ingreso,
      })
      notify(`Ahora es ${!mov.ingreso ? 'un ingreso' : 'un egreso'} de la caja mayor`, 'success')
      await recargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo corregir la dirección', 'error')
    } finally {
      setGuardando(null)
    }
  }

  const borrar = async (mov) => {
    if (!window.confirm(`¿Borrar el movimiento de ${fmtMonto(mov.importe, mov.moneda)}?`)) return
    try {
      await cajaMayorApi.borrar(mov.id)
      notify('Movimiento borrado', 'success')
      await recargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo borrar', 'error')
    }
  }

  // Pone el contexto en un local y navega.
  const irConContexto = (idLocal, ruta) => {
    const plan = resolverApertura(
      { tabla: 'pagos', id_registro: 'x', id_local: idLocal },
      { misApps, appActiva, localActivo }
    )
    if (plan.accion === 'sin-acceso') { notify(plan.mensaje, 'error'); return }
    if (plan.accion === 'cambiar-contexto') {
      // setActiveApp limpia el local, asi que el orden importa: primero la app.
      if (plan.cambiaGrupo) setActiveApp(plan.app)
      setActiveLocal(plan.local)
      notify(mensajeDeCambio(plan), 'info')
    }
    navigate(ruta)
  }

  // Ir a la op de gestion de la que salio el movimiento.
  const abrirOp = (mov) => {
    const ruta = rutaDeLaOp(mov)
    if (ruta) irConContexto(mov.id_local, ruta)
  }

  // Los dos modos de alta: el formulario rapido de siempre, o una op con factura.
  const elegirAlta = (modo) => {
    setMenuAlta(false)
    const plan = resolverAlta(modo, { idLocal })
    if (plan.accion === 'drawer') { setFormMov({}); return }
    if (plan.accion === 'falta-local') { notify(plan.mensaje, 'error'); return }
    irConContexto(plan.id_local, plan.ruta)
  }

  const localesPorGrupo = useMemo(() => {
    const grupos = new Map()
    for (const l of locales) {
      const g = l.grupo ?? 'Sin grupo'
      if (!grupos.has(g)) grupos.set(g, [])
      grupos.get(g).push(l)
    }
    return [...grupos.entries()]
  }, [locales])

  // Las dos mitades de la vista. La direccion del dato viene cruzada desde el
  // backend (un egreso del local es un ingreso a la caja mayor): la traduccion vive
  // en lib/cajaMayorVista.js, con tests.
  // `vista.neto` reemplaza al viejo `totalConsolidado`: la suma de los saldos por
  // local es, por definición, enviado menos recibido. Era el mismo número calculado
  // dos veces.
  const vista = useMemo(() => dividirPorDireccion(saldos), [saldos])

  // Título del resumen: el local si hay uno elegido, si no el grupo, si no nada.
  const nombreSeleccion = idLocal
    ? locales.find(l => l.id === idLocal)?.nombre
    : grupos.find(g => g.id === idApp)?.nombre

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Caja Mayor</h1>
          <p className="page-sub">
            Movimientos de caja mayor de todos los grupos. Las ops de tipo CM llegan de gestión;
            los ajustes y aperturas se cargan acá.
          </p>
        </div>
        <div className="page-head-right" style={{ position: 'relative' }}>
          <button className="btn btn-primary" onClick={() => setMenuAlta(v => !v)}>
            Nuevo movimiento ▾
          </button>

          {/* Dos caminos, porque son dos cosas distintas: plata que se movio sin
              comprobante, o una operacion con factura --que se carga como op de
              gestion y llega a caja mayor por la copia que ya existe. */}
          {menuAlta && (
            <>
              {/* Capa para cerrar tocando afuera: un menu que solo cierra con el
                  boton se queda abierto y tapa la tabla. */}
              <div
                onClick={() => setMenuAlta(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 20 }}
              />
              <div className="carga-ia-menu" style={{ right: 0, left: 'auto', top: '100%', minWidth: 320, zIndex: 21 }}>
                <button type="button" onClick={() => elegirAlta(MODOS_ALTA.RAPIDA)}>
                  <span>
                    <strong style={{ display: 'block' }}>Carga rápida</strong>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                      Plata que se movió, sin comprobante
                    </span>
                  </span>
                </button>
                <button type="button" onClick={() => elegirAlta(MODOS_ALTA.OPERACION)}>
                  <span>
                    <strong style={{ display: 'block' }}>Operación con factura</strong>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                      Se carga como op tipo CM{idLocal ? '' : ' — elegí el local primero'}
                    </span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        {[
          ['saldos', 'Saldos por local'],
          ['movimientos', 'Movimientos'],
        ].map(([valor, label]) => (
          <button
            key={valor}
            onClick={() => setTab(valor)}
            className="btn btn-sm"
            style={{
              background: 'none', border: 'none', borderRadius: 0,
              borderBottom: tab === valor ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === valor ? 'var(--t1)' : 'var(--t3)',
              fontWeight: tab === valor ? 700 : 500,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <SelectorGrupoLocal
          grupos={grupos}
          locales={locales}
          idApp={idApp}
          idLocal={idLocal}
          onChange={({ idApp: a, idLocal: l }) => { setIdApp(a); setIdLocal(l) }}
        />
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Moneda</label>
          <select className="filter-select" value={moneda} onChange={e => setMoneda(e.target.value)}>
            {MONEDAS.map(m => <option key={m.valor} value={m.valor}>{m.label}</option>)}
          </select>
        </div>
        {tab === 'movimientos' && (
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Estado</label>
            <select className="filter-select" value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {Object.values(ESTADOS).map(v => (
                <option key={v} value={v}>{ESTADO_LABEL[v]}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Desde</label>
          <div className="form-input-wrap">
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Hasta</label>
          <div className="form-input-wrap">
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── SALDOS ──────────────────────────────────────────────────────── */}
      {tab === 'saldos' && (
        <>
          {/* Los dos totales de la division, y el neto entre ellos. */}
          {!loading && vista.locales > 0 && (
            <div style={{
              display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem',
              background: 'var(--bg-input)', borderRadius: 8, padding: '0.9rem 1.1rem',
            }}>
              {/* Los títulos dicen DEPOSITADO y EXTRAÍDO, no "enviado/recibido": esas dos
                  palabras son los valores del estado (ENVIADA/RECIBIDA) y usarlas para la
                  dirección hacía que un movimiento RECIBIDA apareciera bajo "enviadas". */}
              <div title="Plata que los locales pusieron en la caja mayor">
                <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Depositado</div>
                <div style={{ fontSize: 18, color: 'var(--green)' }}>{fmtMonto(vista.totalDepositado, moneda)}</div>
              </div>
              <div title="Plata que los locales sacaron de la caja mayor">
                <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Extraído</div>
                <div style={{ fontSize: 18, color: 'var(--red)' }}>{fmtMonto(vista.totalExtraido, moneda)}</div>
              </div>
              <div title="Depositado menos extraído, contando todo">
                <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Neto</div>
                <div style={{ fontSize: 18 }}><Saldo valor={vista.neto} moneda={moneda} /></div>
              </div>
              {/* El neto confirmado solo se muestra si difiere: dos números iguales al lado
                  hacen dudar de cuál mirar. */}
              {vista.totalPendiente > 0 && (
                <div title="El neto contando solo lo que la caja mayor ya confirmó">
                  <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Neto confirmado</div>
                  <div style={{ fontSize: 18 }}><Saldo valor={vista.netoConfirmado} moneda={moneda} /></div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Locales</div>
                <div style={{ fontSize: 18, color: 'var(--t1)' }}>{vista.locales}</div>
              </div>
              {/* "Sin confirmar" y no "sin recibir": es el estado ENVIADA, y decirlo con la
                  palabra del estado evita confundirlo con la dirección. */}
              <div title="Movimientos cargados que la caja mayor todavía no confirmó (estado ENVIADA)">
                <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Sin confirmar</div>
                <div style={{ fontSize: 18, color: vista.sinRecibir ? 'var(--amber)' : 'var(--t2)' }}>
                  {vista.sinRecibir}
                  {vista.totalPendiente > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--amber)', marginLeft: 6 }}>
                      {fmtMonto(vista.totalPendiente, moneda)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── La vista partida en dos, por DIRECCION ───────────────────────
              Los DOS lados listan los mismos locales en el mismo orden, incluso con
              cero de un lado: leer las dos columnas a la misma altura es lo que
              permite comparar, y filtrar los ceros desalinearia las filas.

              Los titulos son DEPOSITADO / EXTRAIDO y no "enviado/recibido" a
              proposito: esas dos palabras son los valores del estado
              (ENVIADA/RECIBIDA), y usarlas para la direccion hacia que un movimiento
              en estado RECIBIDA apareciera bajo la columna "enviadas" -- que es
              exactamente lo que se reporto de ADA. El estado va aparte, en la columna
              "Sin confirmar".

              Ojo con el dato: `ingresos` y `egresos` vienen desde la CAJA MAYOR, y un
              egreso del local es un ingreso a la caja mayor. Leerlo al derecho
              invierte los dos totales y los numeros igual parecen correctos. */}
          <div className="cm-split">
            {[
              { clave: 'depositado', pend: 'pendiente_depositado', ops: 'ops_depositado',
                titulo: 'Depositado en caja mayor', ayuda: 'Plata que el local puso',
                color: 'var(--green)', total: vista.totalDepositado },
              { clave: 'extraido', pend: 'pendiente_extraido', ops: 'ops_extraido',
                titulo: 'Extraído de caja mayor', ayuda: 'Plata que el local sacó',
                color: 'var(--red)', total: vista.totalExtraido },
            ].map((lado) => (
              <div key={lado.clave} className="cm-split-panel">
                <div className="cm-split-head">
                  <span style={{ color: lado.color, fontWeight: 700 }}>{lado.titulo}</span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{lado.ayuda}</span>
                </div>

                <div className="table-wrap" style={{ marginBottom: 0 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Local</th>
                        <th style={{ textAlign: 'right' }}>Monto</th>
                        <th style={{ textAlign: 'right', width: 74 }}>Ops</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 6 }, (_, i) => (
                          <tr key={i} className="skel-row">
                            {Array.from({ length: 3 }, (_, j) => <td key={j}><span className="skel" style={{ width: `${50 + (j * 13 + i * 9) % 40}%` }} /></td>)}
                          </tr>
                        ))
                      ) : vista.filas.length === 0 ? (
                        <tr><td colSpan={3}><div className="table-empty">
                          <p>Sin movimientos en {MONEDAS.find(m => m.valor === moneda)?.label.toLowerCase()} para los filtros aplicados.</p>
                        </div></td></tr>
                      ) : vista.filas.map(f => (
                        <tr
                          key={`${f.id_local}-${f.moneda}-${lado.clave}`}
                          className="row-clickable"
                          onClick={() => {
                            const l = locales.find(x => x.id === f.id_local)
                            setIdApp(l?.id_app ?? '')
                            setIdLocal(f.id_local)
                            setTab('movimientos')
                          }}
                          title={`Ver los movimientos de ${f.local}`}
                        >
                          <td>
                            {f.local}
                            {f.grupo && <div style={{ fontSize: 10.5, color: 'var(--t4)' }}>{f.grupo}</div>}
                          </td>
                          {/* La barra dice quien mueve la caja: una lista de numeros
                              obliga a compararlos de memoria. */}
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ color: f[lado.clave] ? lado.color : 'var(--t4)' }}>
                              {fmtMonto(f[lado.clave], f.moneda)}
                            </div>
                            {/* Lo que de ese monto todavía no confirmó la caja mayor. Va
                                debajo del número y no en otra columna: es una aclaración
                                del mismo importe, no un dato aparte. */}
                            {f[lado.pend] > 0 && (
                              <div style={{ fontSize: 10.5, color: 'var(--amber)' }}>
                                {fmtMonto(f[lado.pend], f.moneda)} sin confirmar
                              </div>
                            )}
                            <div style={{ height: 3, borderRadius: 2, marginTop: 3, background: 'rgba(var(--velo-rgb), 0.07)' }}>
                              <div style={{
                                height: '100%', borderRadius: 2, background: lado.color,
                                width: `${proporcion(f[lado.clave], lado.total)}%`,
                              }} />
                            </div>
                          </td>
                          {/* Los movimientos de ESTE lado, no los del local entero: en la
                              columna de depositado, contar también los extraídos hacía que
                              los dos lados mostraran el mismo número. */}
                          <td style={{ textAlign: 'right' }} className="td-muted">
                            {f[lado.ops]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {!loading && vista.filas.length > 0 && (
                      <tfoot>
                        <tr>
                          <td style={{ fontWeight: 700 }}>Total</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: lado.color, whiteSpace: 'nowrap' }}>
                            {fmtMonto(lado.total, moneda)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── MOVIMIENTOS ─────────────────────────────────────────────────── */}
      {tab === 'movimientos' && (
        <>
          {!loading && resumen?.saldo && (
            <div style={{
              display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem',
              background: 'var(--bg-input)', borderRadius: 8, padding: '0.9rem 1.1rem',
            }}>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>
                  Saldo {nombreSeleccion ? `de ${nombreSeleccion}` : 'consolidado'}
                </div>
                <div style={{ fontSize: 18 }}><Saldo valor={resumen.saldo.saldo} moneda={moneda} /></div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Ya recibido</div>
                <div style={{ fontSize: 18 }}><Saldo valor={resumen.saldo_recibido?.saldo} moneda={moneda} /></div>
              </div>
              <div title="Lo que suma o resta cuando se confirme lo que está enviado">
                <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Pendiente</div>
                <div style={{ fontSize: 18, color: 'var(--amber)', fontWeight: 700 }}>
                  {fmtMonto(resumen.saldo_recibido?.pendiente, moneda)}
                </div>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Fecha</th>
                  <th>Local</th>
                  <th>Concepto</th>
                  <th>Origen</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                  <th>Dirección</th>
                  <th>Estado</th>
                  <th style={{ width: 190 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }, (_, i) => (
                    <tr key={i} className="skel-row">
                      {Array.from({ length: 9 }, (_, j) => <td key={j}><span className="skel" style={{ width: `${45 + (j * 9 + i * 11) % 45}%` }} /></td>)}
                    </tr>
                  ))
                ) : movimientos.length === 0 ? (
                  <tr><td colSpan={9}><div className="table-empty">
                    <p>Sin movimientos para los filtros aplicados.</p>
                  </div></td></tr>
                ) : movimientos.map(m => {
                  const clave = m.id ?? m.id_pago
                  const abierto = expandido === clave
                  const ocupado = guardando === clave
                  return (
                    <tr key={clave} className={abierto ? '' : ''}>
                      <td className="td-muted row-clickable" onClick={() => setExpandido(abierto ? null : clave)}>
                        {abierto ? '▾' : '▸'}
                      </td>
                      <td className="td-muted">{fmtDateUTC(m.fecha)}</td>
                      <td>
                        {m.local ?? '—'}
                        {m.grupo && <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{m.grupo}</div>}
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        {/* El concepto puede ser una observación larga (los movimientos
                            migrados no tienen categoría). Se recorta a dos líneas para que
                            no desarme la fila, con el texto completo en el title y en el
                            detalle de abajo: se recorta la vista, nunca el acceso al dato. */}
                        <div
                          style={{
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            overflow: 'hidden', wordBreak: 'break-word',
                          }}
                          title={m.categoria ?? m.observaciones ?? undefined}
                        >
                          {m.categoria ?? m.observaciones ?? '—'}
                        </div>
                        {/* Link a la op: el dato ya venia del backend y solo se
                            mostraba como texto. Los movimientos cargados a mano no
                            tienen op, asi que no llevan link. */}
                        {tieneOp(m) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); abrirOp(m) }}
                            title="Abrir la op en gestión"
                            style={{
                              background: 'none', border: 'none', padding: 0, marginTop: 2,
                              color: 'var(--gold-bright)', cursor: 'pointer',
                              fontSize: 10.5, textDecoration: 'underline',
                            }}
                          >
                            {etiquetaOp(m)}
                          </button>
                        )}
                        {abierto && (
                          <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 6, lineHeight: 1.6 }}>
                            {m.rubro && <div>Rubro: {m.rubro}</div>}
                            {m.recibe && <div>Recibe: {m.recibe}</div>}
                            {m.extrae && <div>Responsable: {m.extrae}</div>}
                            {m.fecha_extraccion && <div>Extracción: {fmtDateUTC(m.fecha_extraccion)}</div>}
                            {/* Acá va completo y respetando los saltos de línea: es el
                                lugar donde se lee la observación entera. */}
                            {m.observaciones && (
                              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                Obs: {m.observaciones}
                              </div>
                            )}
                            {m.recibida_por && <div>Recibida por {m.recibida_por}</div>}
                            {(m.foto_url || m.pdf_url) && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                {m.foto_url && <a href={m.foto_url} target="_blank" rel="noreferrer">Foto</a>}
                                {m.pdf_url && <a href={m.pdf_url} target="_blank" rel="noreferrer">PDF</a>}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${m.origen === 'PAGO' ? 'badge-blue' : 'badge-muted'}`}>
                          {ORIGEN_LABEL[m.origen] ?? m.origen}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMonto(m.importe, m.moneda)}</td>
                      <td><BadgeDireccion ingreso={m.ingreso} corregida={m.direccion_corregida} /></td>
                      <td><BadgeEstado estado={m.estado} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {/* Solo los movimientos que vienen de una op de gestion
                              tienen ciclo enviada -> recibida: el local manda la plata
                              y la caja mayor confirma que llego. Uno cargado a mano
                              aca ya esta en la caja mayor, asi que "Recibir" no
                              significa nada. Ver naceEnCajaMayor en lib/cajaMayor.js. */}
                          {tieneCicloDeRecepcion(m.origen) && (
                            <button
                              className={`btn btn-sm ${m.estado === ESTADOS.RECIBIDA ? 'btn-secondary' : 'btn-primary'}`}
                              disabled={ocupado}
                              onClick={() => cambiarEstado(m, m.estado === ESTADOS.RECIBIDA ? ESTADOS.ENVIADA : ESTADOS.RECIBIDA)}
                              title={m.estado === ESTADOS.RECIBIDA ? 'Volver a enviada' : 'Confirmar que la plata llegó'}
                            >
                              {ocupado ? '…' : m.estado === ESTADOS.RECIBIDA ? 'A enviada' : 'Recibir'}
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-secondary"
                            disabled={ocupado}
                            onClick={() => invertirDireccion(m)}
                            title="Invertir la dirección: pasarlo de ingreso a egreso o al revés"
                          >
                            ⇅
                          </button>
                          {m.editable && (
                            <>
                              <button className="btn btn-sm btn-secondary" onClick={() => setFormMov(m)} title="Editar">✎</button>
                              <button className="btn btn-sm btn-danger" onClick={() => borrar(m)} title="Borrar">✕</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'movimientos' && !loading && resumen?.total > LIMIT && (
        <div
          className="pagination"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
        >
          <span className="pagination-info">
            {`${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, resumen.total)} de ${resumen.total} movimientos`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setPage(1)} disabled={page <= 1} title="Primera página">«</button>
            <button className="btn btn-sm btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹ Anterior</button>
            <span style={{ fontSize: 13, color: 'var(--t2)', padding: '0 0.5rem', whiteSpace: 'nowrap' }}>
              Página {page} de {Math.ceil(resumen.total / LIMIT)}
            </span>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setPage(p => Math.min(Math.ceil(resumen.total / LIMIT), p + 1))}
              disabled={page >= Math.ceil(resumen.total / LIMIT)}
            >Siguiente ›</button>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setPage(Math.ceil(resumen.total / LIMIT))}
              disabled={page >= Math.ceil(resumen.total / LIMIT)}
              title="Última página"
            >»</button>
          </div>
        </div>
      )}

      {formMov && (
        <MovimientoForm
          movimiento={formMov.id ? formMov : null}
          localesPorGrupo={localesPorGrupo}
          monedas={MONEDAS}
          idLocalSugerido={idLocal}
          monedaSugerida={moneda}
          onClose={() => setFormMov(null)}
          onSaved={async () => { setFormMov(null); await recargar() }}
        />
      )}

    </div>
  )
}
