// Clientes del grupo activo: a nombre de quién se generó un gasto.
//
// Es lo contrario de Proveedores -- a quién se le paga -- y no comparte catálogo: un
// cliente pertenece a un grupo. Desde acá se entra al estado de cuenta de cada uno.

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { clientesApi } from '../../api/clientes.js'
import { useUiStore } from '../../store/uiStore.js'
import { nombreClienteODefault } from '../../lib/clientes.js'
import { CUADRANTES, CUADRANTE_INFO } from '../../lib/cuentaCorriente.js'

// Los dos numeros que importan de un vistazo en el listado: lo que falta cobrar y lo
// que falta pagar. Los cerrados (gastos e ingresos ya movidos) estan en la ficha; aca
// solo estorbarian.
const PENDIENTES = [CUADRANTES.A_COBRAR, CUADRANTES.GASTOS_PENDIENTES]

const fmtPlata = (n) => {
  const v = Number(n)
  if (!v) return null
  return `$${Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

const LIMIT = 50

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
function IcoCuenta() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function IcoClientesEmpty() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    </svg>
  )
}

export default function ClienteList() {
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)

  const [clientes, setClientes] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [loading, setLoading] = useState(true)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const cargar = useCallback((signal) => {
    setLoading(true)
    clientesApi.list({
      page, limit: LIMIT,
      ...(search.trim() ? { search: search.trim() } : {}),
      // Sin el filtro puesto se ven solo los activos: los dados de baja no se borran
      // (los pagos los referencian) pero tampoco tienen que estorbar la lista.
      ...(verInactivos ? {} : { activo: 'true' }),
    }, signal)
      .then(({ data }) => { setClientes(data.data ?? []); setTotal(data.total ?? 0) })
      .catch((err) => {
        if (signal?.aborted) return
        notify(err.response?.data?.error || 'No se pudieron cargar los clientes', 'error')
      })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [page, search, verInactivos])

  // El buscador espera a que se termine de tipear: sin esto cada tecla es un pedido.
  useEffect(() => {
    const id = setTimeout(() => setPage(1), 350)
    return () => clearTimeout(id)
  }, [search, verInactivos])

  useEffect(() => {
    const ctrl = new AbortController()
    const id = setTimeout(() => cargar(ctrl.signal), search ? 350 : 0)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [cargar])

  const darDeBaja = async (cliente) => {
    // El mensaje dice qué NO pasa: el miedo al dar de baja es perder la historia.
    const ok = await showConfirm(
      `${nombreClienteODefault(cliente)} deja de aparecer para cargar ops nuevas. Sus movimientos y su cuenta corriente se conservan.`,
      '¿Dar de baja el cliente?'
    )
    if (!ok) return
    try {
      await clientesApi.remove(cliente.id)
      notify('Cliente dado de baja', 'success')
      cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo dar de baja', 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Clientes</h1>
          <p className="page-sub">
            Con quién el local tiene una cuenta abierta. La columna <strong>Sin cerrar</strong> es
            lo que falta cobrar y lo que falta pagar; el detalle completo está en la cuenta de cada uno.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => navigate('/clientes/nuevo')}>
            <IcoPlus /> Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="filter-bar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Buscar</label>
          <div className="form-input-wrap" style={{ width: 280 }}>
            <input
              type="text"
              placeholder="Nombre, razón social o CUIT"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Estado</label>
          <select
            className="filter-select"
            value={verInactivos ? 'todos' : 'activos'}
            onChange={(e) => setVerInactivos(e.target.value === 'todos')}
          >
            <option value="activos">Solo activos</option>
            <option value="todos">Incluir dados de baja</option>
          </select>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--t3)', paddingBottom: 10 }}>
          {loading ? '' : `${total} ${total === 1 ? 'cliente' : 'clientes'}`}
        </span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Razón social</th>
              <th>CUIT</th>
              <th>Contacto</th>
              <th>Sin cerrar</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 7 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 13 + i * 11) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : clientes.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="table-empty">
                    <IcoClientesEmpty />
                    <p>
                      {search
                        ? 'Ningún cliente coincide con la búsqueda.'
                        : 'Todavía no hay clientes en este grupo.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : clientes.map((c) => (
              <tr
                key={c.id}
                className="row-clickable"
                onClick={() => navigate(`/clientes/${c.id}/cuenta-corriente`)}
                title="Ver el estado de cuenta"
              >
                {/* La primera celda es la identidad de la fila: si el cliente solo
                    tiene razón social se muestra esa, aunque se repita en la celda
                    de al lado. Una fila cuyo nombre dice "—" no se puede usar. */}
                <td className="td-primary">{nombreClienteODefault(c)}</td>
                <td className="td-muted">{c.razon_social || '—'}</td>
                <td className="td-muted">{c.cuit || '—'}</td>
                <td className="td-muted" style={{ maxWidth: 220 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={[c.mail, c.telefono].filter(Boolean).join(' · ') || undefined}>
                    {[c.mail, c.telefono].filter(Boolean).join(' · ') || '—'}
                  </div>
                </td>
                {/* Solo lo pendiente, y solo si hay: una fila con dos ceros es
                    ruido en una tabla que se recorre buscando quien debe. */}
                <td style={{ whiteSpace: 'nowrap' }}>
                  {PENDIENTES.some((k) => Number(c.cuenta?.[k])) ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {PENDIENTES.map((k) => {
                        const monto = fmtPlata(c.cuenta?.[k])
                        if (!monto) return null
                        const info = CUADRANTE_INFO[k]
                        return (
                          <span key={k} className={`badge ${info.badge}`} title={info.ayuda}>
                            {info.label}: {monto}
                          </span>
                        )
                      })}
                    </div>
                  ) : <span className="td-muted">—</span>}
                </td>
                <td>
                  <span className={`badge ${c.activo ? 'badge-green' : 'badge-muted'}`}>
                    {c.activo ? 'Activo' : 'Dado de baja'}
                  </span>
                </td>
                <td>
                  <div className="td-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-sm btn-secondary btn-icon"
                      onClick={() => navigate(`/clientes/${c.id}/cuenta-corriente`)}
                      title="Estado de cuenta"
                    ><IcoCuenta /></button>
                    <button
                      className="btn btn-sm btn-secondary btn-icon"
                      onClick={() => navigate(`/clientes/${c.id}/editar`)}
                      title="Editar"
                    ><IcoEdit /></button>
                    {c.activo && (
                      <button
                        className="btn btn-sm btn-danger btn-icon"
                        onClick={() => darDeBaja(c)}
                        title="Dar de baja"
                      ><IcoTrash /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > LIMIT && (
        <div className="pagination">
          <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
          <span className="pagination-info">Página {page} de {totalPages} — {total} clientes</span>
          <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
  )
}
