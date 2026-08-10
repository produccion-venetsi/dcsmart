// Estado de cuenta de un cliente: sus movimientos y cuánto debe o tiene a favor.
//
// Los movimientos son los `Pago` con ese cliente, ya pagados. La dirección la da
// `ingresa_egreso`: un egreso es un gasto a nombre del cliente (debe más) y un ingreso
// es una cobranza (la deuda baja).
//
// Es una página y no un drawer porque la tabla es ancha: fecha, comprobante, local,
// proveedor, rubro, dirección e importe.

import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { clientesApi } from '../../api/clientes.js'
import { useUiStore } from '../../store/uiStore.js'
import { fmtDateUTC } from '../../lib/dates.js'
import { nombreClienteODefault } from '../../lib/clientes.js'

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(Number(n)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${Number(n) < 0 ? '-' : ''}$${abs}`
}

// El saldo nunca va como número pelado: sin la etiqueta no se sabe de qué lado está.
const COLOR_SALDO = {
  deudor:  'var(--red)',
  a_favor: 'var(--green)',
  saldado: 'var(--t2)',
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

  const { cliente, pagos, total_egresos, total_ingresos, resumen } = datos
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
        borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '1rem',
      }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Saldo
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLOR_SALDO[resumen.estado] ?? 'var(--t1)' }}>
            {resumen.etiqueta}{resumen.monto > 0 ? ` ${fmt$(resumen.monto)}` : ''}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Gastos a su nombre</div>
          <div style={{ fontSize: 15, color: 'var(--t1)' }}>{fmt$(total_egresos)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Cobrado</div>
          <div style={{ fontSize: 15, color: 'var(--t1)' }}>{fmt$(total_ingresos)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase' }}>Movimientos</div>
          <div style={{ fontSize: 15, color: 'var(--t1)' }}>{pagos.length}</div>
        </div>
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
              <th style={{ textAlign: 'right' }}>Importe</th>
              <th>Concepto</th>
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="table-empty">
                    <p>Este cliente todavía no tiene movimientos.</p>
                    {/* Sin esto el vacío no se explica: la op existe pero no cumple
                        las dos condiciones para entrar al saldo. */}
                    <p style={{ fontSize: 12, color: 'var(--t3)' }}>
                      Entran las ops con estado <strong>CTA CTE CLI</strong> que ya estén marcadas como pagadas.
                    </p>
                  </div>
                </td>
              </tr>
            ) : pagos.map((p) => {
              const esCobranza = p.ingresa_egreso === true
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
                  {/* El signo se ve en el color y en el prefijo, no solo en una columna
                      aparte: es lo que se lee al recorrer la tabla. */}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: esCobranza ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {esCobranza ? '−' : '+'}{fmt$(p.importe)}
                  </td>
                  <td className="td-muted" style={{ maxWidth: 240 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.observaciones || undefined}>
                      {esCobranza ? 'Cobranza' : (p.observaciones || 'Gasto a su nombre')}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pagos.length > 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 10 }}>
          El <strong>+</strong> aumenta lo que el cliente debe; el <strong>−</strong> es una cobranza que lo baja.
          Solo entran las ops ya pagadas de todos los locales del grupo.
        </p>
      )}
    </div>
  )
}
