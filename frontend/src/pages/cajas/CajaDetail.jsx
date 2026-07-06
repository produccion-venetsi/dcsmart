import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { movimientosApi } from '../../api/movimientos.js'
import { useUiStore } from '../../store/uiStore.js'

function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
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
function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
function IcoMovs() {
  return (
    <svg viewBox="0 0 24 24" width={34} height={34} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  )
}

function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }
function fmtDT(d) { return d ? new Date(d).toLocaleString('es-AR', { hour12: false }) : '—' }

const SIGN_BY_TIPO = { INICIAL: 1, INGRESO: 1, COBRO: 1, GASTO: -1, RETIRO: -1, VACIADO: -1 }
const TOLERANCE = 0.01

export default function CajaDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)

  const [caja,    setCaja]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [newMov,  setNewMov]  = useState({ tipo: 'INGRESO', monto: '', id_metodo: '' })
  const [saving,  setSaving]  = useState(false)
  const [auditando, setAuditando] = useState(false)
  const [auditHistory, setAuditHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const load = () => {
    setLoading(true)
    cajasApi.get(id)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar la caja', 'error'))
      .finally(() => setLoading(false))
  }

  const loadAuditHistory = () => {
    setLoadingHistory(true)
    cajasApi.auditHistory(id)
      .then(({ data }) => setAuditHistory(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => { load(); loadAuditHistory() }, [id])

  const handleAddMovimiento = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await movimientosApi.create({ ...newMov, monto: parseFloat(newMov.monto), id_caja: id })
      notify('Movimiento agregado', 'success')
      setNewMov({ tipo: 'INGRESO', monto: '', id_metodo: '' })
      load()
    } catch { notify('Error al agregar movimiento', 'error') }
    finally { setSaving(false) }
  }

  const handleDeleteMov = async (movId) => {
    if (!(await showConfirm('¿Eliminar movimiento?'))) return
    try {
      await movimientosApi.remove(movId)
      notify('Movimiento eliminado', 'success')
      load()
    } catch { notify('Error al eliminar', 'error') }
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
      const { data } = await cajasApi.audit(id, caja.audit ? { observaciones } : undefined)
      notify(data.audit ? 'Caja auditada' : 'Auditoría revertida', 'success')
      setCaja(prev => ({ ...prev, audit: data.audit }))
      loadAuditHistory()
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>
  if (!caja)   return <div className="page-loading" style={{ color: 'var(--red)' }}>Caja no encontrada</div>

  const totalMov = caja.movimientos?.reduce((acc, m) => acc + Number(m.monto), 0) || 0
  const totalEsperado = caja.movimientos?.reduce((acc, m) => acc + Number(m.monto) * (SIGN_BY_TIPO[m.tipo] ?? 0), 0) || 0
  const descuadre = caja.total != null ? Number(caja.total) - totalEsperado : null
  const hayDescuadre = descuadre != null && Math.abs(descuadre) > TOLERANCE

  const infoRows = [
    ['Local',        caja.local?.nombre ?? '—'],
    ['Inicio',       fmtDT(caja.fecha_inicio)],
    ['Cierre',       fmtDT(caja.fecha_cierre)],
    ['Cajero',       caja.cajero ?? '—'],
    ['Total',        fmt$(caja.total),   true],
    ['Efectivo',     fmt$(caja.efectivo)],
    ['Fiscal',       fmt$(caja.fiscal)],
    ['Comensales',   caja.comensales ?? '—'],
    ['Tickets',      caja.tickets ?? '—'],
    ['Origen',       caja.origin ?? '—'],
    ['Auditado',     caja.audit ? 'Sí' : 'No'],
  ]

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/cajas')}>
        <IcoBack /> Volver a Cajas
      </button>

      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">
            {caja.nro_turno ? `Turno ${caja.nro_turno}` : `Caja #${caja.id.slice(0, 8)}`}
          </h1>
          <p className="page-sub">{caja.local?.nombre} · {new Date(caja.fecha_inicio).toLocaleDateString('es-AR')}</p>
        </div>
        <div className="page-actions">
          <button
            className={`btn ${caja.audit ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleAudit}
            disabled={auditando}
          >
            {auditando
              ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              : caja.audit ? '✓ Auditado' : 'Auditar'
            }
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Info column */}
        <div className="card" style={{ flex: '0 0 280px', minWidth: 240 }}>
          <div className="card-body">
            <div className="card-title">Datos del turno</div>
            <div className="detail-rows">
              {infoRows.map(([k, v, gold]) => (
                <div className="detail-row" key={k}>
                  <span className="detail-key">{k}</span>
                  <span className={`detail-val${gold ? ' gold' : ''}`}>{v}</span>
                </div>
              ))}
            </div>
            {hayDescuadre && (
              <div className="badge badge-red" style={{ marginTop: '0.75rem', display: 'inline-block' }} title="Total de caja vs. inicial + ingresos − egresos de los movimientos">
                ⚠ Descuadre: {fmt$(Math.abs(descuadre))} {descuadre > 0 ? '(sobra)' : '(falta)'}
              </div>
            )}
          </div>
        </div>

        {/* Movements column */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {/* Movimientos table */}
          <div className="table-wrap" style={{ marginBottom: '1.25rem' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title" style={{ margin: 0 }}>
                Movimientos ({caja.movimientos?.length || 0})
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold-bright)' }}>
                Total: {fmt$(totalMov)}
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Método</th>
                  <th>Monto</th>
                  <th>Cantidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(caja.movimientos || []).map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className={`badge ${m.tipo === 'INGRESO' || m.tipo === 'APERTURA' ? 'badge-green' : 'badge-red'}`}>
                        {m.tipo}
                      </span>
                    </td>
                    <td className="td-muted">{m.metodo_pago?.nombre || '—'}</td>
                    <td className="td-number">{fmt$(m.monto)}</td>
                    <td className="td-muted">{m.cantidad ?? '—'}</td>
                    <td>
                      <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDeleteMov(m.id)}>
                        <IcoTrash />
                      </button>
                    </td>
                  </tr>
                ))}
                {(!caja.movimientos || caja.movimientos.length === 0) && (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">
                        <IcoMovs />
                        <p>Sin movimientos registrados.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add movement form */}
          <form className="form-panel" onSubmit={handleAddMovimiento}>
            <div className="form-panel-title"><IcoPlus /> Agregar Movimiento</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <div className="form-input-wrap">
                  <select value={newMov.tipo} onChange={e => setNewMov({ ...newMov, tipo: e.target.value })}>
                    <option>INGRESO</option>
                    <option>EGRESO</option>
                    <option>APERTURA</option>
                    <option>CIERRE</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Monto *</label>
                <div className="form-input-wrap">
                  <input type="number" step="0.01" required placeholder="0.00" value={newMov.monto} onChange={e => setNewMov({ ...newMov, monto: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving || !newMov.monto}>
                {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : <><IcoPlus /> Agregar</>}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: '1.25rem' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <span className="card-title" style={{ margin: 0 }}>Historial de auditoría</span>
        </div>
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
