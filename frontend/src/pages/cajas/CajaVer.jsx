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
import { fmtDateArg, fmtDateTimeArg } from '../../lib/dates.js'
import { agruparInformativos } from '../../lib/gruposInformativos.js'
import { duracionTurno, soloHora, cruzaDia, ticketPromedio } from '../../lib/turnoInfo.js'
import FotoViewer from '../../components/FotoViewer.jsx'

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
  const [auditandoDc, setAuditandoDc] = useState(false)
  const [auditHistory, setAuditHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const load = () => {
    setLoading(true)
    cajasApi.get(id)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar la caja', 'error'))
      .finally(() => setLoading(false))
  }

  const loadHistorial = () => {
    setLoadingHistory(true)
    cajasApi.auditHistory(id)
      .then(({ data }) => setAuditHistory(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => { load(); loadHistorial() }, [id])

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
      loadHistorial()
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }

  // La auditoría DC es la segunda firma, la del equipo interno. Vivía en el
  // detalle del drawer y se perdió al reescribir esta pantalla: sin ella los
  // roles DC no tenían desde dónde firmar una caja.
  const handleAuditDc = async () => {
    let observaciones
    if (caja.audit_dc) {
      observaciones = await showPrompt(
        'Esta caja ya tiene audit DC. ¿Querés revertirlo? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditandoDc(true)
    try {
      const { data } = await cajasApi.auditDc(id, caja.audit_dc ? { observaciones } : undefined)
      notify(data.audit_dc ? 'Audit DC aplicado' : 'Audit DC revertido', 'success')
      setCaja((prev) => ({ ...prev, audit_dc: data.audit_dc, audit: data.audit }))
      loadHistorial()
    } catch { notify('Error al auditar (DC)', 'error') }
    finally { setAuditandoDc(false) }
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

  // Arriba SOLO la plata: los datos que no son dinero (gente, tickets, horario)
  // competian visualmente con los montos y se leen aparte, abajo.
  const stats = [
    ['Total vendido', fmt$(caja.total), true],
    ['Efectivo', fmt$(caja.efectivo)],
    ['Fiscal', fmt$(caja.fiscal)],
  ]

  const gruposInfo = agruparInformativos(informativos)
  const duracion = duracionTurno(caja.fecha_inicio, caja.fecha_cierre)
  const promedio = ticketPromedio(caja.total, caja.comensales)
  const nocturno = cruzaDia(caja.fecha_inicio, caja.fecha_cierre)

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
            {canAuditDc && (
              <span className={`badge ${caja.audit_dc ? 'badge-purple' : 'badge-muted'}`}>{caja.audit_dc ? '✓ Audit DC' : 'Sin Audit DC'}</span>
            )}
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
          {canAuditDc && (
            <button className={`btn ${caja.audit_dc ? 'btn-secondary' : 'btn-primary'}`} onClick={handleAuditDc} disabled={auditandoDc}>
              {auditandoDc ? '…' : caja.audit_dc ? '✓ Audit DC' : 'Audit DC'}
            </button>
          )}
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

      {/* El turno: cuando fue y quien lo hizo. Separado de la plata porque son
          preguntas distintas, y con la duracion calculada -- nadie resta dos
          timestamps de memoria. */}
      <div className="card" style={{ marginBottom: '1.1rem' }}><div className="card-body" style={{ padding: '13px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 26px', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 4 }}>Horario del turno</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{soloHora(caja.fecha_inicio) ?? '—'}</span>
              <span style={{ color: 'var(--t4)' }}>→</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                {soloHora(caja.fecha_cierre) ?? 'sin cierre'}
                {nocturno && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', marginLeft: 4 }}>del día siguiente</span>}
              </span>
              {duracion && <span className="badge badge-muted">{duracion}</span>}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 3 }}>
              {fmtDateTimeArg(caja.fecha_inicio)}{caja.fecha_cierre ? ` — ${fmtDateTimeArg(caja.fecha_cierre)}` : ''}
            </div>
          </div>

          {[
            ['Comensales', caja.comensales ?? '—'],
            ['Tickets', caja.tickets ?? '—'],
            ['Promedio por persona', promedio != null ? fmt$(promedio) : '—'],
            ['Cajero', caja.cajero || '—'],
            ['Origen', caja.origin ?? '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 4 }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
      </div></div>

      <div className="bc-grid">
        {/* IZQUIERDA: las líneas, agrupadas y con color */}
        <div className="bc-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <div className="card"><div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div className="card-title" style={{ margin: 0 }}>Cómo te lo pagaron (cobros)</div>
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

          {gruposInfo.length > 0 && (
            <div className="card"><div className="card-body">
              <div className="card-title" style={{ marginBottom: 3 }}>Informativo</div>
              <p className="form-hint" style={{ margin: '0 0 12px' }}>No suma en ninguna cuenta: es el desglose de lo que ya está contado.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {gruposInfo.map((g) => (
                  <div key={g.id}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingBottom: 5, borderBottom: `1px solid ${g.destacado ? 'var(--amber-border)' : 'var(--border)'}` }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: g.color }}>{g.titulo}</span>
                      <strong style={{ fontSize: 12.5, color: g.destacado ? 'var(--amber)' : 'var(--t1)' }}>{fmt$(g.total)}</strong>
                    </div>
                    <p style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--t3)', margin: '4px 0 6px' }}>{g.ayuda}</p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2px 22px' }}>
                      {g.lineas.map((l) => (
                        <div key={l.nombre}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                            <span style={{ color: 'var(--t2)', fontWeight: 600 }}>
                              {l.nombre}
                              {l.cantidad != null && l.cantidad > 0 && (
                                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--t4)' }}>x {l.cantidad}</span>
                              )}
                            </span>
                            <strong>{fmt$(l.total)}</strong>
                          </div>
                          {/* El desglose de una línea agrupada ("Vaciado" -> por
                              método). Sangrado y en gris: es el detalle fino. */}
                          {l.items.length > 1 && l.items.map((it) => (
                            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0 1px 12px', color: 'var(--t3)' }}>
                              <span>{it.nombre}</span><span>{fmt$(it.monto)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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

          {/* La foto del cierre. Se perdió al reescribir esta pantalla: el
              drawer la mostraba y acá no estaba.

              drawerWidth={0} a propósito: el panel al costado existe para no
              tapar el drawer, y acá no hay drawer que cuidar. Con el default
              (560) el panel se dibujaba corrido a la izquierda, transparente y
              sin capturar clicks — el botón parecía no hacer nada. En pantalla
              completa la foto abre directo en el visor grande, con zoom y giro. */}
          {caja.foto_url && (
            <div className="card"><div className="card-body">
              <div className="card-title" style={{ marginBottom: 8 }}>Foto del cierre</div>
              <FotoViewer pagoId={caja.id} fotoUrl={caja.foto_url} entity="cajas" drawerWidth={0} />
            </div></div>
          )}

          {caja.observaciones && (
            <div className="card"><div className="card-body">
              <div className="card-title" style={{ marginBottom: 6 }}>Observaciones</div>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--t2)', margin: 0, whiteSpace: 'pre-line' }}>{caja.observaciones}</p>
            </div></div>
          )}

          {/* Quién firmó la caja y cuándo. También se perdió al reescribir la
              pantalla: es lo que se mira cuando alguien pregunta por qué una
              caja quedó auditada o se desauditó. Colapsado porque casi siempre
              tiene una línea y no compite con el cuadre. */}
          <details className="card bc-desglose">
            {/* display:flex y no el card-body a secas: el marcador del <details>
                es un ::marker en su propia línea si el contenido es un bloque, y
                el título quedaba debajo del triangulito. */}
            <summary style={{ cursor: 'pointer', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="card-title" style={{ margin: 0 }}>Historial de auditoría</span>
              {!loadingHistory && <span style={{ fontSize: 11, color: 'var(--t3)' }}>({auditHistory.length})</span>}
            </summary>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {loadingHistory ? (
                <span className="skel" style={{ width: '60%' }} />
              ) : auditHistory.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>Todavía nadie firmó esta caja.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Observación</th></tr></thead>
                    <tbody>
                      {auditHistory.map((ev) => (
                        <tr key={ev.id}>
                          <td className="td-muted">{fmtDateTimeArg(ev.fecha)}</td>
                          <td>{ev.user?.nombre ?? '—'}</td>
                          <td>
                            <span className={`badge ${ev.accion === 'auditado' ? 'badge-green' : 'badge-amber'}`}>
                              {ev.accion === 'auditado' ? 'Auditado' : 'Desauditado'}
                            </span>
                          </td>
                          <td className="td-muted">{ev.observaciones || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* DERECHA: el cuadre, siempre visible */}
        <div className="bc-lado">
          <PanelCuadre cuadre={caja.cuadre} />
        </div>
      </div>
    </div>
  )
}
