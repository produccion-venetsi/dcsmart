// Estado de cuenta de un cliente.
//
// Tiene DOS ventanas, porque la deuda se genera en dos lugares distintos del sistema y
// mirar solo uno da un saldo incompleto:
//
//   Pagos  -> las ops a su nombre con estado CTA CTE CLI (lo de siempre, abajo).
//   Cajas  -> el consumo que se anotó en su cuenta desde una caja, en vez de cobrarse.
//             Ver lib/cuentaCorrienteCaja.js.
//
// Son ventanas y no una sola tabla mezclada: las columnas no se parecen (una op tiene
// número, proveedor y rubro; un detalle de caja tiene turno y tipo de detalle) y el
// origen del cargo es lo primero que se pregunta cuando un saldo no cierra.
//
// Los movimientos del lado pagos son los `Pago` con ese cliente -- pagados Y sin pagar,
// los cuatro cuadrantes (ver lib/cuentaCorriente.js):
//
//                       sin pagar              pagado
//   egreso        Gastos pendientes    ->    Gastos
//   ingreso       A cobrar             ->    Ingresos
//
// Marcar un pago como pagado no agrega ni saca plata de la cuenta: la mueve de un
// cuadrante al de al lado, y los cuatro tags se recalculan entre si.
//
// Es una pagina y no un drawer porque la tabla es ancha: fecha, comprobante, local,
// proveedor, rubro, estado e importe.

import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { clientesApi } from '../../api/clientes.js'
import { useUiStore } from '../../store/uiStore.js'
import { fmtDateUTC } from '../../lib/dates.js'
import { nombreClienteODefault } from '../../lib/clientes.js'
import {
  ORDEN_CUADRANTES, CUADRANTE_INFO, cuadranteDe, sumaALaDeuda,
  filtrarPorCuadrante, FILTRO_TODOS, FILTRO_ABIERTOS,
} from '../../lib/cuentaCorriente.js'
import { VENTANAS, VENTANA_INFO, ventanaInicial } from '../../lib/cuentaCorrienteCaja.js'
import { clasificacionLabel } from '../../lib/clasificaciones.js'

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(Number(n)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${Number(n) < 0 ? '-' : ''}$${abs}`
}

function IcoVolver() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  )
}

// ── La ventana de cajas ─────────────────────────────────────────────────────
//
// Cargos que salieron de una caja. No tiene los cuatro cuadrantes de la ventana de pagos
// porque de este lado no hay eje "pagado": lo que cierra un cargo de caja es una cobranza,
// y esa se carga como op y aparece en la otra ventana.
// Exportada para poder renderizarla sola en las pruebas (la pagina entera necesita la
// llamada a la API; esta es pura y es donde esta la logica de presentacion nueva).
export function VentanaCajas({ caja, detalles, navigate }) {
  if (detalles.length === 0) {
    return (
      <div className="table-wrap">
        <div className="table-empty">
          <p>Este cliente no tiene consumo cargado desde cajas.</p>
          <p style={{ fontSize: 12, color: 'var(--t3)' }}>
            Entra acá lo que se carga a su cuenta desde el detalle de una caja: una venta que
            no se cobró y quedó anotada a su nombre. Se elige al cargar el detalle, en el
            campo <strong>Cuenta corriente</strong>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--t3)' }}>
          {caja.cantidad} {caja.cantidad === 1 ? 'cargo' : 'cargos'} por {fmt$(caja.cargado)}
        </span>
        {/* Los que quedaron con cliente pero con una clasificación que no mueve la cuenta.
            Se avisa en vez de esconderlos: si no, un monto cargado a nombre de alguien
            desaparece sin explicación y nadie sabe por qué el saldo no cierra. */}
        {caja.cantidad_informativos > 0 && (
          <span style={{ color: 'var(--amber)' }}>
            · {caja.cantidad_informativos} sin sumar ({fmt$(caja.informativos)}): están
            clasificados como informativos
          </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Local</th>
              <th>Turno</th>
              <th>Detalle</th>
              <th>Clasificación</th>
              <th style={{ textAlign: 'right' }}>Monto</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {detalles.map((d) => {
              const suma = d.carga_cuenta !== false
              return (
                <tr
                  key={d.id}
                  className="row-clickable"
                  onClick={() => navigate(`/cajas?id=${d.caja?.id ?? ''}`)}
                  title="Abrir la caja"
                >
                  <td className="td-muted">{fmtDateUTC(d.caja?.fecha_inicio)}</td>
                  <td className="td-muted">{d.caja?.local?.nombre ?? '—'}</td>
                  <td className="td-muted">
                    {d.caja?.nro_turno || d.caja?.tipo_turno || '—'}
                  </td>
                  <td>{d.nombre || d.detalle_tipo?.nombre || '—'}</td>
                  <td className="td-muted">{clasificacionLabel(d.tipo ?? d.detalle_tipo?.clasificacion)}</td>
                  {/* Un cargo suma a lo que el cliente debe, igual que un gasto del lado de
                      pagos: mismo signo y mismo color para que las dos ventanas se lean con
                      el mismo criterio. Los que no suman van apagados y sin signo. */}
                  <td style={{
                    textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600,
                    color: suma ? 'var(--red)' : 'var(--t3)',
                  }}>
                    {suma ? '+' : ''}{fmt$(d.monto)}
                  </td>
                  <td className="td-muted" style={{ maxWidth: 240 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={d.observaciones || undefined}>
                      {d.observaciones || (suma ? 'Consumo a su cuenta' : 'No suma a la cuenta')}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 10, maxWidth: '80ch' }}>
        Estos cargos <strong>suman</strong> a lo que el cliente debe. No tienen estado
        pagado/sin pagar: lo que los cierra es una cobranza, y esa se carga como op con estado
        CTA CTE CLI y aparece en la ventana de <em>Pagos</em>. Atribuir un detalle a una cuenta
        no cambia el cuadre de la caja. Entran los detalles de todos los locales del grupo.
      </p>
    </>
  )
}

export default function ClienteCuentaCorriente() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)

  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  // Arranca en lo abierto: lo que trae al usuario aca es qué falta cobrar y qué falta
  // pagar, no el historial cerrado.
  const [filtro, setFiltro] = useState(FILTRO_ABIERTOS)
  // Cuál de las dos ventanas se está mirando. `null` hasta que llegan los datos: la
  // ventana inicial depende de dónde estén los movimientos (ver ventanaInicial), y elegirla
  // antes obligaría a saltar de pestaña sola después de cargar.
  const [ventana, setVentana] = useState(null)

  const cargar = useCallback((signal) => {
    setLoading(true)
    clientesApi.cuentaCorriente(id, signal)
      .then(({ data }) => setDatos(data))
      .catch((err) => {
        if (signal?.aborted) return
        notify(err.response?.data?.error || 'No se pudo cargar el estado de cuenta', 'error')
        navigate('/clientes')
      })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [id])

  useEffect(() => {
    const ctrl = new AbortController()
    cargar(ctrl.signal)
    return () => ctrl.abort()
  }, [cargar])

  if (loading) {
    return <div className="page"><div className="page-loading"><div className="spinner" /></div></div>
  }
  if (!datos) return null

  const { cliente, pagos } = datos
  // `caja` puede no venir si la respuesta quedó cacheada de antes del cambio: la pantalla
  // tiene que abrir igual, con la ventana de cajas vacía.
  const caja = datos.caja ?? { detalles: [], cargado: 0, cantidad: 0, informativos: 0, cantidad_informativos: 0 }
  const detallesCaja = caja.detalles ?? []
  const visibles = filtrarPorCuadrante(pagos, filtro)
  const nombre = nombreClienteODefault(cliente, 'Cliente')
  const activa = ventana ?? ventanaInicial({ pagos: pagos.length, cajas: detallesCaja.length })
  // Lo que el cliente debe contando las dos mitades. El número de pagos se sigue mostrando
  // por separado abajo: este es el total, no un reemplazo.
  const debeTotal = Number(datos.debe_cliente || 0) + Number(caja.cargado || 0)

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => navigate('/clientes')}
            style={{ marginBottom: 8 }}
          ><IcoVolver /> Clientes</button>
          <h1 className="page-title">{nombre}</h1>
          <p className="page-sub">
            Estado de cuenta
            {cliente.cuit ? ` · CUIT ${cliente.cuit}` : ''}
            {!cliente.activo ? ' · cliente dado de baja' : ''}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => navigate(`/clientes/${id}/editar`)}>
            Editar cliente
          </button>
        </div>
      </div>

      {/* El saldo primero y con su etiqueta: es la pregunta que trae al usuario acá. */}
      <div style={{
        display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'baseline',
        background: 'var(--bg-input)', border: '1px solid var(--glass-border)',
        borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '0.75rem',
      }}>
{/* Los dos numeros que se preguntan al abrir la ficha, por separado. No hay un
            "saldo" unico con signo: lo que el cliente debe y lo que el local le falta
            pagar son dos cosas distintas, y meterlas en una resta da el signo al
            reves (un ingreso sin cobrar de 1.000.000 se leia como "a favor"). */}
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            El cliente debe
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: debeTotal > 0 ? 'var(--amber)' : 'var(--t2)' }}>
            {debeTotal > 0 ? fmt$(debeTotal) : 'nada'}
          </div>
          {/* De dónde viene la deuda, siempre que venga de los dos lados. Sin esto el número
              grande cambió de significado (antes era solo ops) y nadie podría reconciliarlo
              con lo que ve en las dos ventanas. */}
          <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}>
            {caja.cargado > 0 && datos.debe_cliente > 0 ? (
              <>{fmt$(datos.debe_cliente)} en ops · {fmt$(caja.cargado)} en cajas</>
            ) : caja.cargado > 0 ? (
              'cargado desde cajas y sin cobrar'
            ) : (
              'ingresos que todavía no pagó'
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Falta pagar
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: datos.falta_pagar > 0 ? 'var(--blue)' : 'var(--t2)' }}>
            {datos.falta_pagar > 0 ? fmt$(datos.falta_pagar) : 'nada'}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}>
            gastos a su nombre sin pagar
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Movimientos</div>
          <div style={{ fontSize: 15, color: 'var(--t1)' }}>{pagos.length + detallesCaja.length}</div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}>
            {pagos.length} en ops · {detallesCaja.length} en cajas
          </div>
        </div>
      </div>

      {/* ── Las dos ventanas ─────────────────────────────────────────────────
          Con la cantidad en cada una: una pestaña sin número obliga a entrar para
          descubrir que está vacía. */}
      <div
        role="tablist"
        aria-label="Origen de los movimientos"
        style={{ display: 'flex', gap: 4, marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)' }}
      >
        {VENTANAS.map((v) => {
          const info = VENTANA_INFO[v]
          const esActiva = activa === v
          const cantidad = v === 'pagos' ? pagos.length : detallesCaja.length
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={esActiva}
              onClick={() => setVentana(v)}
              title={info.ayuda}
              style={{
                font: 'inherit', cursor: 'pointer', background: 'none',
                border: 'none', borderBottom: `2px solid ${esActiva ? 'var(--gold)' : 'transparent'}`,
                color: esActiva ? 'var(--t1)' : 'var(--t3)',
                fontWeight: esActiva ? 600 : 400,
                padding: '8px 14px', marginBottom: -1,
              }}
            >
              {info.label}
              <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 6 }}>{cantidad}</span>
            </button>
          )
        })}
      </div>

      {activa === 'pagos' && <>
      {/* ── Los cuatro tags ──────────────────────────────────────────────────
          Son botones: el numero y el filtro son la misma cosa. Ver "$120.000 a
          cobrar" y no poder llegar a esas tres ops es la mitad de la respuesta. */}
      <div
        role="group"
        aria-label="Filtrar movimientos por estado"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}
      >
        {ORDEN_CUADRANTES.map((c) => {
          const info = CUADRANTE_INFO[c]
          const activo = filtro === c
          const cantidad = datos.cantidad?.[c] ?? 0
          return (
            <button
              key={c}
              type="button"
              onClick={() => setFiltro(activo ? FILTRO_ABIERTOS : c)}
              aria-pressed={activo}
              title={`${info.ayuda}${cantidad ? ` (${cantidad} ${cantidad === 1 ? 'movimiento' : 'movimientos'})` : ' Sin movimientos.'}`}
              style={{
                textAlign: 'left', cursor: 'pointer', font: 'inherit',
                background: activo ? 'var(--bg-hover)' : 'var(--bg-input)',
                border: `1px solid ${activo ? info.color : 'var(--glass-border)'}`,
                borderLeft: `3px solid ${info.color}`,
                borderRadius: 10, padding: '8px 14px', minWidth: 150,
                // Sin esto un tag en cero se ve igual que uno con plata y se clickea
                // para nada.
                opacity: cantidad ? 1 : 0.55,
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {info.label}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: cantidad ? info.color : 'var(--t3)' }}>
                {fmt$(datos[c])}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--t4)' }}>
                {cantidad === 0 ? 'sin movimientos' : `${cantidad} ${cantidad === 1 ? 'movimiento' : 'movimientos'}`}
              </div>
            </button>
          )
        })}
      </div>

      {/* Qué se está viendo, y cómo volver. Un filtro activo sin cartel hace que la
          tabla parezca incompleta. */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--t3)' }}>
          {filtro === FILTRO_TODOS
            ? `Todos los movimientos (${visibles.length})`
            : filtro === FILTRO_ABIERTOS
              ? `Sin cerrar: a cobrar y gastos pendientes (${visibles.length})`
              : `${CUADRANTE_INFO[filtro]?.label} (${visibles.length})`}
        </span>
        {filtro !== FILTRO_TODOS && (
          <button
            type="button"
            onClick={() => setFiltro(FILTRO_TODOS)}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold-bright)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
          >
            ver todos
          </button>
        )}
        {filtro !== FILTRO_ABIERTOS && (
          <button
            type="button"
            onClick={() => setFiltro(FILTRO_ABIERTOS)}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold-bright)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
          >
            ver solo lo que falta cerrar
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>OP</th>
              <th>Local</th>
              <th>Proveedor</th>
              <th>Rubro</th>
              <th>Método</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Importe</th>
              <th>Concepto</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="table-empty">
                    {/* Se distingue "no hay nada" de "el filtro los esconde": con un
                        filtro puesto, un vacio sin explicar parece que se perdieron. */}
                    {pagos.length === 0 ? (
                      <>
                        <p>Este cliente todavía no tiene movimientos.</p>
                        <p style={{ fontSize: 12, color: 'var(--t3)' }}>
                          Entran las ops con estado <strong>CTA CTE CLI</strong>, estén pagadas o no.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>Ningún movimiento en este filtro.</p>
                        <p style={{ fontSize: 12, color: 'var(--t3)' }}>
                          El cliente tiene {pagos.length} {pagos.length === 1 ? 'movimiento' : 'movimientos'} en total.
                        </p>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : visibles.map((p) => {
              const cuadrante = p.cuadrante ?? cuadranteDe(p)
              const info = CUADRANTE_INFO[cuadrante]
              const suma = sumaALaDeuda(cuadrante)
              return (
                <tr key={p.id} className="row-clickable" onClick={() => navigate(`/pagos/${p.id}/editar`)} title="Abrir la op">
                  <td className="td-muted">{fmtDateUTC(p.fecha)}</td>
                  <td>{p.nro_ord != null ? `OP-${p.nro_ord}` : '—'}</td>
                  <td className="td-muted">{p.local?.nombre ?? '—'}</td>
                  <td className="td-muted" style={{ maxWidth: 180 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={p.proveedor?.razon_social || p.proveedor?.nombre || undefined}>
                      {p.proveedor?.nombre || p.proveedor?.razon_social || '—'}
                    </div>
                  </td>
                  <td className="td-muted">{p.rubcat?.rubro?.nombre ?? '—'}</td>
                  <td className="td-muted">{p.metodo_pago?.nombre ?? '—'}</td>
                  {/* El cuadrante como badge: la fila tiene que decir sola si eso ya
                      se cobró o todavía está pendiente. */}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className={`badge ${info?.badge ?? 'badge-muted'}`}>{info?.label ?? '—'}</span>
                  </td>
                  {/* El signo se ve en el color y en el prefijo, no solo en una columna
                      aparte: es lo que se lee al recorrer la tabla. Los pendientes van
                      en punteado para que no se confundan con plata ya movida. */}
                  <td style={{
                    textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600,
                    color: info?.color ?? 'var(--t1)',
                    borderBottom: info?.abierto ? '1px dashed var(--glass-border)' : undefined,
                  }}>
                    {suma ? '+' : '−'}{fmt$(p.importe)}
                  </td>
                  <td className="td-muted" style={{ maxWidth: 240 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.observaciones || undefined}>
                      {p.observaciones || (suma ? 'Gasto a su nombre' : 'Cobranza')}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pagos.length > 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 10, maxWidth: '80ch' }}>
          El <strong>+</strong> aumenta lo que el cliente debe; el <strong>−</strong> lo baja.
          Los importes <span style={{ borderBottom: '1px dashed var(--glass-border)' }}>subrayados</span> son
          los que todavía no se pagaron. Marcar una op como pagada no cambia el saldo:
          mueve el importe de <em>a cobrar</em> a <em>ingresos</em>, o de <em>gastos pendientes</em> a <em>gastos</em>.
          Entran las ops de todos los locales del grupo.
        </p>
      )}
      </>}

      {activa === 'cajas' && <VentanaCajas caja={caja} detalles={detallesCaja} navigate={navigate} />}
    </div>
  )
}
