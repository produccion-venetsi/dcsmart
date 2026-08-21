import { useEffect, useState } from 'react'
import { arqueoApi } from '../../api/arqueo.js'
import DisponibilidadesInput, { detallesDesdeValores, valoresDesdeDetalles } from '../../components/DisponibilidadesInput.jsx'
import { nombreDisponibilidad } from '../../lib/disponibilidades.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import { toDateTimeLocalInput, toUtcIsoFromDateTimeLocal, fmtDateTimeArg } from '../../lib/dates.js'
import { totalContado, calcularComprobacion, describirComprobacion } from '../../lib/cuadreArqueo.js'

/* ── helpers ── */
function fmt$(n) {
  return n != null
    ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : '—'
}
const fmtDateTime = fmtDateTimeArg

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

/* ── panel de creación (con preview) ── */
function ArqueoCreatePanel({ activeLocal, onCreated }) {
  const notify = useUiStore((s) => s.notify)
  const [saving, setSaving] = useState(false)

  const [cajaFuerte, setCajaFuerte] = useState('')
  const [cofre,      setCofre]      = useState('')
  const [adicion,    setAdicion]    = useState('')
  const [observaciones, setObservaciones] = useState('')

  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(true)

  const [dispValores, setDispValores] = useState({})

  const fechaArqueo = new Date()

  useEffect(() => {
    setLoadingPreview(true)
    arqueoApi.preview(activeLocal.id, fechaArqueo.toISOString())
      .then(({ data }) => setPreview(data))
      .catch(() => notify('Error al calcular el preview', 'error'))
      .finally(() => setLoadingPreview(false))
  }, [activeLocal.id])

  const total = totalContado({ caja_fuerte: cajaFuerte, cofre, adicion })
  const comprobacion = preview
    ? calcularComprobacion({ ingresos: preview.ingresos, gastos: preview.gastos, contado: total, contadoAnterior: preview.total_ultimo_arqueo })
    : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await arqueoApi.create({
        id_local: activeLocal.id,
        fecha: fechaArqueo.toISOString(),
        caja_fuerte: parseFloat(cajaFuerte) || 0,
        cofre: parseFloat(cofre) || 0,
        adicion: parseFloat(adicion) || 0,
        observaciones: observaciones.trim() || null,
        detalles: detallesDesdeValores(dispValores)
      })
      notify('Arqueo creado', 'success')
      onCreated()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear el arqueo', 'error')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Caja fuerte</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cajaFuerte} onChange={e => setCajaFuerte(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Cofre</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cofre} onChange={e => setCofre(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Adición</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={adicion} onChange={e => setAdicion(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Observaciones</label>
        <div className="form-input-wrap form-textarea-wrap">
          <textarea
            rows={3}
            placeholder="Notas opcionales..."
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
          />
        </div>
      </div>

      <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Disponibilidades</div>
      <DisponibilidadesInput idLocal={activeLocal.id} valores={dispValores} onChange={setDispValores} disabled={saving} />

      <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Comprobación</div>
      {loadingPreview ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><span className="spinner" /></div>
      ) : (
        <div className="drawer-detail">
          <div className="drawer-detail-row"><span className="drawer-detail-key">Total contado</span><span className="drawer-detail-val">{fmt$(total)}</span></div>
          {/* La fecha del anterior va pegada a su total: el arqueo mide el
              período entre los dos, y sin saber desde cuándo no se puede leer
              ni el total anterior ni los ingresos y gastos de abajo. */}
          <div className="drawer-detail-row">
            <span className="drawer-detail-key">Total arqueo anterior</span>
            <span className="drawer-detail-val">
              {fmt$(preview?.total_ultimo_arqueo)}
              {/* "Primer arqueo" solo cuando el total anterior también es cero.
                  Si hay un total pero no vino la fecha, el dato falta -- decir
                  que es el primero sería mentir sobre lo que se está midiendo. */}
              <span style={{ display: 'block', fontSize: 11, color: 'var(--t3)', fontWeight: 400 }}>
                {preview?.fecha_ultimo_arqueo
                  ? `del ${fmtDateTime(preview.fecha_ultimo_arqueo)}`
                  : Number(preview?.total_ultimo_arqueo) ? '' : 'primer arqueo del local'}
              </span>
            </span>
          </div>
          <div className="drawer-detail-row">
            <span className="drawer-detail-key">
              Ingresos
              {/* "Ingresos" no es sinónimo de "el efectivo de las cajas": una op
                  de ingreso cobrada en efectivo entra al mismo cofre y también
                  suma. Sin el desglose el número no se puede atar a nada. */}
              {Number(preview?.ingresos_pagos) > 0 && (
                <span style={{ display: 'block', fontSize: 11, color: 'var(--t3)', fontWeight: 400 }}>
                  cajas {fmt$(preview.ingresos_cajas)} + ops de ingreso en efectivo {fmt$(preview.ingresos_pagos)}
                </span>
              )}
            </span>
            <span className="drawer-detail-val">{fmt$(preview?.ingresos)}</span>
          </div>
          <div className="drawer-detail-row"><span className="drawer-detail-key">Gastos</span><span className="drawer-detail-val">{fmt$(preview?.gastos)}</span></div>
          <div className="drawer-detail-row">
            <span className="drawer-detail-key">Comprobación</span>
            {/* Con el monto pelado no se sabe si falta o sobra: el signo del
                arqueo es el opuesto al de cajas. Va siempre con su etiqueta. */}
            {(() => {
              const d = describirComprobacion(comprobacion)
              return (
                <span className={`badge ${d.estado === 'cuadra' ? 'badge-green' : 'badge-red'}`}>
                  {d.estado === 'cuadra' ? 'Cuadra' : `${d.texto} ${fmt$(d.monto)}`}
                </span>
              )
            })()}
          </div>
        </div>
      )}

      {/* El período que cubre, al pie y en una frase: los ingresos, los gastos
          y la comprobación de arriba salen de lo que pasó entre el arqueo
          anterior y este, y sin decirlo el número no se puede discutir con
          nadie. */}
      {!loadingPreview && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: '1rem', lineHeight: 1.5 }}>
          {preview?.fecha_ultimo_arqueo ? (
            <>Mide desde el <strong>{fmtDateTime(preview.fecha_ultimo_arqueo)}</strong> (arqueo anterior) hasta ahora, <strong>{fmtDateTime(fechaArqueo)}</strong>.</>
          ) : Number(preview?.total_ultimo_arqueo) ? (
            // Hay arqueo anterior (su total llegó) pero no su fecha: no se
            // afirma nada sobre el período en vez de inventar que es el primero.
            <>Mide desde el arqueo anterior hasta ahora, <strong>{fmtDateTime(fechaArqueo)}</strong>.</>
          ) : (
            <>Primer arqueo de este local: no hay una medición anterior contra la que comparar.</>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving || loadingPreview}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Confirmar arqueo'}
        </button>
      </div>
    </form>
  )
}

/* ── panel de edición ── */
function ArqueoEditPanel({ arqueo, onSaved, onCancel }) {
  const notify = useUiStore((s) => s.notify)
  const [saving, setSaving] = useState(false)

  const [fecha,      setFecha]      = useState(toDateTimeLocalInput(arqueo.fecha))
  const [cajaFuerte, setCajaFuerte] = useState(String(arqueo.caja_fuerte))
  const [cofre,      setCofre]      = useState(String(arqueo.cofre))
  const [adicion,    setAdicion]    = useState(String(arqueo.adicion))
  const [observaciones, setObservaciones] = useState(arqueo.observaciones ?? '')
  // Las líneas del catálogo viejo se separan una sola vez y viajan intactas
  // hasta el submit: editar la fecha de un arqueo de 2025 no puede borrarle lo
  // que se contó ese día.
  const [{ valores: dispIniciales, heredadas }] = useState(() => valoresDesdeDetalles(arqueo.detalles))
  const [dispValores, setDispValores] = useState(dispIniciales)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await arqueoApi.update(arqueo.id, {
        fecha: toUtcIsoFromDateTimeLocal(fecha),
        caja_fuerte: parseFloat(cajaFuerte) || 0,
        cofre: parseFloat(cofre) || 0,
        adicion: parseFloat(adicion) || 0,
        observaciones: observaciones.trim() || null,
        detalles: detallesDesdeValores(dispValores, heredadas)
      })
      notify('Arqueo actualizado', 'success')
      onSaved()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al actualizar el arqueo', 'error')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Fecha</label>
        <div className="form-input-wrap">
          <input type="datetime-local" required value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Caja fuerte</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cajaFuerte} onChange={e => setCajaFuerte(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Cofre</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cofre} onChange={e => setCofre(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: '0 0 0.9rem' }}>
        <label className="form-label">Adición</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={adicion} onChange={e => setAdicion(e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Observaciones</label>
        <div className="form-input-wrap form-textarea-wrap">
          <textarea
            rows={3}
            placeholder="Notas opcionales..."
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
          />
        </div>
      </div>

      <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Disponibilidades</div>
      <DisponibilidadesInput
        idLocal={arqueo.id_local}
        valores={dispValores}
        onChange={setDispValores}
        disabled={saving}
        heredadas={heredadas}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Guardar cambios'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </form>
  )
}

/* ── panel de detalle ── */
function ArqueoDetailPanel({ arqueoId, canEdit, canDelete, onChanged }) {
  const notify = useUiStore((s) => s.notify)
  const [arqueo, setArqueo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [auditando, setAuditando] = useState(false)

  const load = () => {
    setLoading(true)
    arqueoApi.get(arqueoId)
      .then(({ data }) => setArqueo(data))
      .catch(() => notify('Error al cargar el arqueo', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [arqueoId])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><span className="spinner" /></div>
  if (!arqueo) return null

  if (editing) {
    return (
      <ArqueoEditPanel
        arqueo={arqueo}
        onCancel={() => setEditing(false)}
        onSaved={() => { setEditing(false); load(); onChanged() }}
      />
    )
  }

  const handleDelete = async () => {
    if (!confirm('¿Borrar este arqueo? Esta acción no se puede deshacer.')) return
    setDeleting(true)
    try {
      await arqueoApi.remove(arqueo.id)
      notify('Arqueo borrado', 'success')
      onChanged(true)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al borrar el arqueo', 'error')
      setDeleting(false)
    }
  }

  const comprobacionDet = describirComprobacion(arqueo.comprobacion, { esPrimero: arqueo.es_primero })
  const cuadra = comprobacionDet.estado === 'cuadra'

  const handleAudit = async () => {
    setAuditando(true)
    try {
      const { data } = await arqueoApi.audit(arqueo.id)
      setArqueo(a => ({ ...a, audit: data.audit }))
      notify(data.audit ? 'Arqueo auditado' : 'Arqueo desauditado', 'success')
      onChanged()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al auditar', 'error')
    } finally { setAuditando(false) }
  }

  return (
    <div>
      <div className="drawer-detail">
        <div className="drawer-detail-row">
          <span className="drawer-detail-key">Auditado</span>
          <span className={`badge ${arqueo.audit ? 'badge-green' : 'badge-muted'}`}>
            {arqueo.audit ? '✓ Auditado' : 'No auditado'}
          </span>
        </div>
        {arqueo.audit_by && (
          <div className="drawer-detail-row"><span className="drawer-detail-key">Auditado por</span><span className="drawer-detail-val">{arqueo.audit_by} · {fmtDateTime(arqueo.audit_date)}</span></div>
        )}
        <div className="drawer-detail-row"><span className="drawer-detail-key">Fecha</span><span className="drawer-detail-val">{fmtDateTime(arqueo.fecha)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Caja fuerte</span><span className="drawer-detail-val">{fmt$(arqueo.caja_fuerte)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Cofre</span><span className="drawer-detail-val">{fmt$(arqueo.cofre)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Adición</span><span className="drawer-detail-val">{fmt$(arqueo.adicion)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Total</span><span className="drawer-detail-val">{fmt$(arqueo.total)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Ingresos</span><span className="drawer-detail-val">{fmt$(arqueo.ingresos)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Gastos</span><span className="drawer-detail-val">{fmt$(arqueo.gastos)}</span></div>
        <div className="drawer-detail-row">
          <span className="drawer-detail-key">Comprobación</span>
          <span
            className={`badge ${comprobacionDet.estado === 'base' ? 'badge-muted' : cuadra ? 'badge-green' : 'badge-red'}`}
            title={comprobacionDet.estado === 'base' ? 'Primer arqueo del local: no hay una medición anterior contra la que comparar.' : undefined}
          >
            {comprobacionDet.monto == null ? comprobacionDet.texto : cuadra ? 'Cuadra' : `${comprobacionDet.texto} ${fmt$(comprobacionDet.monto)}`}
          </span>
        </div>
      </div>

      {/* Las observaciones van en su propia seccion y no como fila clave/valor:
          .drawer-detail-row es flex con la clave fija en 110px, asi que un
          texto de varias lineas queda angosto y desalineado ahi adentro. */}
      {arqueo.observaciones && (
        <>
          <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Observaciones</div>
          <div style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--t2)',
            background: 'var(--bg-input)',
            border: '1px solid var(--glass-border)',
            borderRadius: 12,
            padding: '10px 13px',
          }}>
            {arqueo.observaciones}
          </div>
        </>
      )}

      {arqueo.detalles?.length > 0 && (
        <>
          <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Disponibilidades</div>
          {arqueo.detalles.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{nombreDisponibilidad(d)}</span>
              <span>{fmt$(d.monto)}</span>
            </div>
          ))}
        </>
      )}

      {/* Las cajas y pagos que respaldan los ingresos/gastos de ESTE arqueo:
          el período entre el anterior y este. Antes solo estaban los totales
          y no había forma de discutir el número sin ir a buscar las filas. */}
      <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Movimientos del período</div>
      <MovimientosPeriodo idLocal={arqueo.id_local} idArqueo={arqueo.id} compacto />

      {(canEdit || canDelete) && (
        <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
          {canEdit && (
            <button type="button" className={`btn ${arqueo.audit ? 'btn-secondary' : 'btn-primary'}`} onClick={handleAudit} disabled={auditando}>
              {auditando
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : (arqueo.audit ? 'Desauditar' : 'Auditar')}
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>Editar</button>
          )}
          {canDelete && (
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Borrar'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── disponibilidades por local ──
   El último arqueo de cada local del grupo, con sus líneas (MP Hoy, MP
   Disponible, BBVA, Amex...) pivotadas en columnas. Las columnas son la unión
   de los nombres que aparecen: cada grupo usa sus propios tipos y una lista
   fija dejaría celdas eternamente vacías. */
function TablaDisponibilidades({ activeApp, activeLocal }) {
  const notify = useUiStore((s) => s.notify)
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeApp?.app?.id) { setFilas([]); setLoading(false); return }
    const ctrl = new AbortController()
    setLoading(true)
    arqueoApi.disponibilidades(ctrl.signal)
      .then(({ data }) => setFilas(data.data))
      .catch(() => { if (!ctrl.signal.aborted) notify('Error al cargar las disponibilidades', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [activeApp?.app?.id])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}><span className="spinner" /></div>
  if (!filas.length) return null

  const columnas = [...new Set(
    filas.flatMap(f => (f.ultimo?.disponibilidades ?? []).map(d => d.nombre))
  )].sort((a, b) => a.localeCompare(b, 'es'))

  const montoDe = (f, col) =>
    (f.ultimo?.disponibilidades ?? []).filter(d => d.nombre === col).reduce((a, d) => a + d.monto, 0)

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div className="drawer-section-title">Disponibilidades por local (último arqueo)</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Local</th>
              {/* El efectivo contado del arqueo es una disponibilidad más: va
                  como primera columna, y el TOTAL de la fila lo incluye. Sin
                  esto, "Total" mostraba el total del arqueo y no cerraba con
                  la suma de las columnas visibles. */}
              <th style={{ textAlign: 'right' }}>Efectivo</th>
              {columnas.map(c => <th key={c} style={{ textAlign: 'right' }}>{c}</th>)}
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const sumaDisp = (f.ultimo?.disponibilidades ?? []).reduce((a, d) => a + d.monto, 0)
              return (
              <tr key={f.id_local} style={f.id_local === activeLocal?.id ? { background: 'var(--bg-input)' } : undefined}>
                <td>
                  {f.local}
                  <div style={{ fontSize: 10.5, color: f.ultimo ? 'var(--t4)' : 'var(--amber)' }}>
                    {f.ultimo ? fmtDateTime(f.ultimo.fecha) : 'sin arqueos'}
                  </div>
                </td>
                <td className="td-number" style={{ textAlign: 'right' }}>
                  {f.ultimo ? fmt$(f.ultimo.total) : <span className="td-muted">—</span>}
                </td>
                {columnas.map(c => {
                  const m = montoDe(f, c)
                  return (
                    <td key={c} className="td-number" style={{ textAlign: 'right' }}>
                      {m ? fmt$(m) : <span className="td-muted">—</span>}
                    </td>
                  )
                })}
                <td className="td-number" style={{ textAlign: 'right', fontWeight: 700 }}>
                  {f.ultimo ? fmt$(f.ultimo.total + sumaDisp) : <span className="td-muted">—</span>}
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
      {columnas.length === 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 6 }}>
          Ningún arqueo tiene disponibilidades cargadas todavía: se agregan al crear o editar un arqueo.
        </p>
      )}
    </div>
  )
}

/* ── cajas y pagos de un período de arqueo ──
   Las filas que componen los ingresos y gastos: sin id_arqueo es "desde el
   último arqueo hasta ahora" (lo que debería haber en la caja para el próximo
   conteo); con id_arqueo, el período de ese arqueo. La suma de estas filas ES
   el número de la comprobación: mismas condiciones que el backend. */
function MovimientosPeriodo({ idLocal, idArqueo = null, compacto = false }) {
  const notify = useUiStore((s) => s.notify)
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!idLocal) return
    const ctrl = new AbortController()
    setLoading(true)
    arqueoApi.movimientos({ id_local: idLocal, ...(idArqueo ? { id_arqueo: idArqueo } : {}) }, ctrl.signal)
      .then(({ data }) => setDatos(data))
      .catch(() => { if (!ctrl.signal.aborted) notify('Error al cargar los movimientos del período', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [idLocal, idArqueo])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><span className="spinner" /></div>
  if (!datos) return null

  const tablas = [
    // Se muestran las dos fechas porque el período se corta por el CIERRE: la
    // plata del turno entra al cofre cuando cierra, no cuando abre. Sin la
    // columna de cierre, un turno que arrancó el día anterior parece estar en
    // el período equivocado.
    { titulo: `Cajas (efectivo) — ${fmt$(datos.ingresos_cajas ?? datos.ingresos)}`, filas: datos.cajas, total: datos.total_cajas,
      cab: ['Apertura', 'Cierre', 'Turno', 'Efectivo'],
      fila: (c) => [
        fmtDateTime(c.fecha_inicio),
        c.fecha_cierre ? fmtDateTime(c.fecha_cierre) : 'sin cierre',
        c.tipo_turno || '—',
        fmt$(c.efectivo)
      ] },
    // Las dos direcciones en la misma tabla: son ops que movieron la plata del
    // cofre. El título dice cuánto salió y cuánto entró, y cada fila lleva su
    // signo -- una lista donde $2.000 puede ser suma o resta no se puede leer.
    { titulo: `Pagos en efectivo — sale ${fmt$(datos.gastos)}` +
        (Number(datos.ingresos_pagos) > 0 ? ` · entra ${fmt$(datos.ingresos_pagos)}` : ''),
      filas: datos.pagos, total: datos.total_pagos,
      cab: ['OP', 'Fecha de pago', 'Proveedor', 'Importe'],
      fila: (pg) => [
        pg.nro_ord != null ? `OP-${pg.nro_ord}` : '—',
        fmtDateTime(pg.fecha_pago),
        pg.proveedor || '—',
        `${pg.ingresa_egreso ? '+' : '−'} ${fmt$(pg.importe)}`,
      ] },
  ]

  return (
    <div style={compacto ? undefined : { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem' }}>
      {tablas.map(t => (
        <div key={t.titulo} style={compacto ? { marginBottom: '1rem' } : undefined}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', margin: '0 0 6px' }}>{t.titulo}</div>
          {t.filas.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>Sin movimientos en el período.</div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: compacto ? 220 : 320, overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr>{t.cab.map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {t.filas.map(f => (
                    <tr key={f.id}>
                      {t.fila(f).map((celda, i) => (
                        <td key={i} className={i === t.cab.length - 1 ? 'td-number' : undefined}>{celda}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {t.total > t.filas.length && (
            <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
              Se muestran {t.filas.length} de {t.total}; el total de arriba cuenta todos.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── página ── */
export default function ArqueoList() {
  const activeLocal = useAppStore((s) => s.activeLocal)
  const activeApp   = useAppStore((s) => s.activeApp)
  const notify      = useUiStore((s) => s.notify)

  const role       = activeApp?.role
  const canEdit    = ['super_admin', 'dcsmart'].includes(role)
  const canDelete  = ['super_admin', 'dcsmart'].includes(role)

  const [arqueos, setArqueos] = useState([])
  const [loading, setLoading] = useState(true)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const load = () => {
    if (!activeLocal?.id) { setArqueos([]); setLoading(false); return }
    setLoading(true)
    arqueoApi.list(activeLocal.id)
      .then(({ data }) => setArqueos(data.data))
      .catch(() => notify('Error al cargar el historial de arqueos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [activeLocal?.id])

  const openDetail = (id) => { setSelectedId(id); setDetailOpen(true) }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Arqueo</h1>
          <p className="page-sub">
            {activeLocal ? activeLocal.nombre : 'Seleccioná un local'}
          </p>
        </div>
        <div className="page-head-right">
          <button
            className="btn btn-primary"
            onClick={() => setPanelOpen(true)}
            disabled={!activeLocal}
          >
            <IcoPlus /> Nuevo arqueo
          </button>
        </div>
      </div>

      <TablaDisponibilidades activeApp={activeApp} activeLocal={activeLocal} />

      {!activeLocal ? (
        <div className="pdp-empty">Seleccioná un local para ver su historial de arqueos.</div>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><span className="spinner" /></div>
      ) : arqueos.length === 0 ? (
        <div className="pdp-empty">Todavía no se cargó ningún arqueo para este local.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Caja fuerte</th><th>Cofre</th><th>Adición</th>
                <th>Total</th><th>Comprobación</th><th>Observaciones</th><th>Auditado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {arqueos.map((a) => {
                const d = describirComprobacion(a.comprobacion, { esPrimero: a.es_primero })
                const cuadra = d.estado === 'cuadra'
                return (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.fecha)}</td>
                    <td className="td-number">{fmt$(a.caja_fuerte)}</td>
                    <td className="td-number">{fmt$(a.cofre)}</td>
                    <td className="td-number">{fmt$(a.adicion)}</td>
                    <td className="td-number">{fmt$(a.total)}</td>
                    <td>
                      <span
                        className={`badge ${d.estado === 'base' ? 'badge-muted' : cuadra ? 'badge-green' : 'badge-red'}`}
                        title={d.estado === 'base' ? 'Primer arqueo del local: no hay medición anterior contra la que comparar.' : undefined}
                      >
                        {d.monto == null ? d.texto : cuadra ? 'Cuadra' : `${d.texto} ${fmt$(d.monto)}`}
                      </span>
                    </td>
                    {/* El truncado va en un span inline-block y no en el td:
                        .data-table es width 100% sin table-layout fixed, y el
                        max-width de una celda de tabla no se respeta de forma
                        confiable en layout automatico. */}
                    <td style={{ fontSize: 12 }} title={a.observaciones || ''}>
                      {a.observaciones
                        ? <span style={{ display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                            {a.observaciones}
                          </span>
                        : <span className="td-muted">—</span>}
                    </td>
                    <td>
                      <span className={`badge ${a.audit ? 'badge-green' : 'badge-muted'}`}>
                        {a.audit ? '✓ Auditado' : 'No auditado'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => openDetail(a.id)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lo acumulado desde el último arqueo hasta ahora: es lo que debería
          haber en la caja cuando se haga el próximo conteo. La key fuerza el
          refetch cuando se crea/borra un arqueo (load() cambia arqueos). */}
      {activeLocal && !loading && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="drawer-section-title">Desde el último arqueo hasta ahora — {activeLocal.nombre}</div>
          <MovimientosPeriodo key={arqueos[0]?.id ?? 'sin'} idLocal={activeLocal.id} />
        </div>
      )}

      <DrawerPanel open={panelOpen} onClose={() => setPanelOpen(false)} title="Nuevo arqueo" width={560}>
        {panelOpen && activeLocal && (
          <ArqueoCreatePanel
            activeLocal={activeLocal}
            onCreated={() => { setPanelOpen(false); load() }}
          />
        )}
      </DrawerPanel>

      <DrawerPanel open={detailOpen} onClose={() => setDetailOpen(false)} title="Detalle de arqueo" width={560}>
        {detailOpen && selectedId && (
          <ArqueoDetailPanel
            arqueoId={selectedId}
            canEdit={canEdit}
            canDelete={canDelete}
            onChanged={(closed) => { load(); if (closed) setDetailOpen(false) }}
          />
        )}
      </DrawerPanel>
    </div>
  )
}
