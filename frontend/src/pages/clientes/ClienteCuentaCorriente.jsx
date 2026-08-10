// Estado de cuenta de un cliente.
//
// Los movimientos son los `Pago` con ese cliente -- pagados Y sin pagar, los cuatro
// cuadrantes (ver lib/cuentaCorriente.js):
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

export default function ClienteCuentaCorriente() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)

  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  // Arranca en lo abierto: lo que trae al usuario aca es qué falta cobrar y qué falta
  // pagar, no el historial cerrado.
  const [filtro, setFiltro] = useState(FILTRO_ABIERTOS)

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
  const visibles = filtrarPorCuadrante(pagos, filtro)
  const nombre = nombreClienteODefault(cliente, 'Cliente')

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
          <div style={{ fontSize: 22, fontWeight: 700, color: datos.debe_cliente > 0 ? 'var(--amber)' : 'var(--t2)' }}>
            {datos.debe_cliente > 0 ? fmt$(datos.debe_cliente) : 'nada'}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}>
            ingresos que todavía no pagó
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
          <div style={{ fontSize: 15, color: 'var(--t1)' }}>{pagos.length}</div>
        </div>
      </div>

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
    </div>
  )
}
