// El detalle de caja, versión B+C: gráfico, de una sola lectura, con el panel
// de cuadre en su columna.
//
// Deliberadamente SOLO LECTURA: la edición tiene su propia pantalla
// (/cajas/:id/editar), así que acá no hay formularios inline ni botones de
// borrar línea por línea — la versión anterior mezclaba ver con editar y era
// densa de leer. Acciones de la caja completa (editar, auditar, eliminar) sí.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import PanelCuadre from '../../components/PanelCuadre.jsx'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { puedeEditar, puedeBorrarCajas, esRolDc } from '../../lib/roles.js'
import { rolDeDetalle } from '../../lib/cuadreCaja.js'
import { fmtDateArg } from '../../lib/dates.js'

const fmt$ = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

const RE_FIADO = /cta\s*cte|cuenta\s*corriente|mesas?\s*abiert|a\s*cobrar/i
const RE_POS = /\(POS\)$/

const nombreDe = (d) => d?.nombre ?? d?.detalle_tipo?.nombre ?? 'Sin nombre'

// Una línea como tarjeta, con el estilo del grupo al que pertenece.
function Linea({ nombre, monto, cantidad, tinte, badge }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, minHeight: 42, padding: '6px 13px',
      borderRadius: 10, background: tinte.bg, border: `1px solid ${tinte.border}`,
    }}>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: tinte.texto ?? 'var(--t1)' }}>
        {nombre}
        {/* Cuantas operaciones componen la linea (los groupCount de TapTap):
            23 cobros con Credito. Sutil, al lado del nombre. */}
        {cantidad != null && cantidad > 0 && (
          <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 700, color: 'var(--t3)' }}>x {cantidad}</span>
        )}
      </span>
      {badge && (
        <span className={`badge ${badge.clase}`}>{badge.texto}</span>
      )}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: tinte.texto ?? 'var(--t1)' }}>{fmt$(monto)}</span>
    </div>
  )
}

const TINTE_COBRO = { bg: 'rgba(76,175,125,0.08)', border: 'rgba(76,175,125,0.16)' }
const TINTE_FIADO = { bg: 'rgba(107,166,224,0.08)', border: 'rgba(107,166,224,0.18)' }
const TINTE_GASTO = { bg: 'rgba(224,92,92,0.07)', border: 'rgba(224,92,92,0.14)' }

export default function CajaVer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const showPrompt = useUiStore((s) => s.showPrompt)
  const role = useAppStore((s) => s.activeApp)?.role
  const canEdit = puedeEditar(role)
  const canDelete = puedeBorrarCajas(role)
  const canAuditDc = esRolDc(role)

  const [caja, setCaja] = useState(null)
  const [loading, setLoading] = useState(true)
  const [auditando, setAuditando] = useState(false)

  const load = () => {
    setLoading(true)
    cajasApi.get(id)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar la caja', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [id])

  const handleAudit = async () => {
    let observaciones
    if (caja.audit) {
      observaciones = await showPrompt('Esta caja ya está auditada. ¿Querés desauditarla? Podés dejar un motivo.', { placeholder: 'Motivo (opcional)' })
      if (observaciones === null) return
    }
    setAuditando(true)
    try {
      const { data } = await cajasApi.audit(id, caja.audit ? { observaciones } : undefined)
      notify(data.audit ? 'Caja auditada' : 'Auditoría revertida', 'success')
      setCaja((prev) => ({ ...prev, audit: data.audit }))
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }

  const handleDelete = async () => {
    const motivo = await showPrompt(
      'Se va a eliminar esta caja con todos sus detalles. No se puede deshacer.',
      { title: 'Eliminar caja', placeholder: 'Por qué se elimina (opcional)' }
    )
    if (motivo === null) return
    try {
      await cajasApi.remove(id, motivo)
      notify('Caja eliminada', 'success')
      navigate('/cajas')
    } catch (err) { notify(err.response?.data?.error || 'Error al eliminar la caja', 'error') }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>
  if (!caja) return <div className="page-loading" style={{ color: 'var(--red)' }}>Caja no encontrada</div>

  const detalles = caja.detalles ?? []
  const cobros = detalles.filter((d) => rolDeDetalle(d) === 'cobro')
  const gastos = detalles.filter((d) => rolDeDetalle(d) === 'gasto')
  const informativos = detalles.filter((d) => rolDeDetalle(d) === 'informativo')
  const suma = (arr) => arr.reduce((a, d) => a + Number(d.monto ?? 0), 0)

  const estado = caja.cuadre?.estado
  const badgeEstado = {
    correcto: { clase: 'badge-green', texto: 'Correcto' },
    menor: { clase: 'badge-amber', texto: `Descuadre menor` },
    incorrecto: { clase: 'badge-red', texto: 'Incorrecto' },
  }[estado]

  const stats = [
    ['Total vendido', fmt$(caja.total), true],
    ['Efectivo', fmt$(caja.efectivo)],
    ['Fiscal', fmt$(caja.fiscal)],
    ['Comensales', caja.comensales ?? '—'],
    ['Tickets', caja.tickets ?? '—'],
  ]

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/cajas')}><IcoBack /> Volver a Cajas</button>

      {/* Header: identidad + estado + acciones */}
      <div className="page-head" style={{ marginTop: '0.5rem' }}>
        <div className="page-head-left">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {caja.nro_turno ? `Turno ${caja.nro_turno}` : 'Caja'}{caja.tipo_turno ? ` · ${caja.tipo_turno}` : ''}
            {badgeEstado && <span className={`badge ${badgeEstado.clase}`}>{badgeEstado.texto}</span>}
            <span className={`badge ${caja.audit ? 'badge-green' : 'badge-muted'}`}>{caja.audit ? '✓ Auditada' : 'Sin auditar'}</span>
          </h1>
          <p className="page-sub">
            {caja.local?.nombre} · {fmtDateArg(caja.fecha_inicio)}
            {caja.cajero ? ` · cargó ${caja.cajero}` : ''} · {caja.origin}
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && <button className="btn btn-secondary" onClick={() => navigate(`/cajas/${id}/editar`)}>Editar</button>}
          <button className={`btn ${caja.audit ? 'btn-secondary' : 'btn-primary'}`} onClick={handleAudit} disabled={auditando}>
            {auditando ? '…' : caja.audit ? '✓ Auditada' : 'Auditar'}
          </button>
          {canDelete && <button className="btn btn-danger" onClick={handleDelete}>Eliminar</button>}
        </div>
      </div>

      {/* Los números grandes del turno */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.1rem' }}>
        {stats.map(([k, v, gold]) => (
          <div key={k} className="card"><div className="card-body" style={{ padding: '12px 15px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--t3)' }}>{k}</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 3, color: gold ? 'var(--gold-bright)' : 'var(--t1)' }}>{v}</div>
          </div></div>
        ))}
      </div>

      <div className="bc-grid">
        {/* IZQUIERDA: las líneas, agrupadas y con color */}
        <div className="bc-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <div className="card"><div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div className="card-title" style={{ margin: 0 }}>Cómo te lo pagaron</div>
              <strong style={{ fontSize: 13.5 }}>{fmt$(suma(cobros))}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cobros.map((d) => {
                const fiado = RE_FIADO.test(nombreDe(d))
                return (
                  <Linea key={d.id} nombre={nombreDe(d)} monto={d.monto} cantidad={d.cantidad}
                    tinte={fiado ? TINTE_FIADO : TINTE_COBRO}
                    badge={fiado ? { clase: 'badge-blue', texto: 'A cobrar' } : null} />
                )
              })}
              {!cobros.length && <p className="form-hint" style={{ margin: 0 }}>No hay cobros cargados: por eso la caja no puede cuadrar.</p>}
            </div>
          </div></div>

          {gastos.length > 0 && (
            <div className="card"><div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div className="card-title" style={{ margin: 0 }}>Gastos del cajón</div>
                <strong style={{ fontSize: 13.5, color: 'var(--red)' }}>{fmt$(suma(gastos))}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {gastos.map((d) => <Linea key={d.id} nombre={nombreDe(d)} monto={d.monto} cantidad={d.cantidad} tinte={TINTE_GASTO} />)}
              </div>
              <p className="form-hint" style={{ margin: '8px 0 0' }}>No cambian lo que vendiste: es plata que salió del cajón.</p>
            </div></div>
          )}

          {informativos.length > 0 && (
            <div className="card"><div className="card-body">
              <div className="card-title" style={{ marginBottom: 10 }}>Informativo · no suma en ninguna cuenta</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '4px 20px' }}>
                {informativos.map((d) => {
                  const esPos = RE_POS.test(nombreDe(d))
                  return (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: esPos ? 'var(--amber)' : undefined }}>
                      <span style={{ color: esPos ? 'var(--amber)' : 'var(--t2)' }}>{nombreDe(d)}{d.cantidad != null && d.cantidad > 0 ? ` x ${d.cantidad}` : ''}</span>
                      <span style={{ fontWeight: esPos ? 700 : 600 }}>{fmt$(d.monto)}</span>
                    </div>
                  )
                })}
              </div>
            </div></div>
          )}

          {(caja.movimientos?.length ?? 0) > 0 && (
            <details className="card"><summary style={{ cursor: 'pointer', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--t3)' }}>
              Movimientos viejos sin convertir ({caja.movimientos.length}) ▾
            </summary>
              <div className="card-body" style={{ paddingTop: 0 }}>
                {caja.movimientos.map((m) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--t2)' }}>
                    <span>{m.tipo} · {m.metodo_pago?.nombre ?? 'sin método'}</span><span>{fmt$(m.monto)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {caja.observaciones && (
            <div className="card"><div className="card-body">
              <div className="card-title" style={{ marginBottom: 6 }}>Observaciones</div>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--t2)', margin: 0, whiteSpace: 'pre-line' }}>{caja.observaciones}</p>
            </div></div>
          )}
        </div>

        {/* DERECHA: el cuadre, siempre visible */}
        <div className="bc-lado">
          <PanelCuadre cuadre={caja.cuadre} />
        </div>
      </div>
    </div>
  )
}
