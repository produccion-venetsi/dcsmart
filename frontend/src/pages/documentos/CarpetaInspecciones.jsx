// Carpeta de inspecciones de un local.
//
// La carpeta es la agrupación por local: se elige el local arriba y abajo está su planilla
// de folios. Cada folio es una línea de control con concepto, estado, vencimiento y
// archivos.
//
// ── El orden ─────────────────────────────────────────────────────────────────
//
// Se arrastra la fila del asa (⠿) y además hay flechas para subir y bajar. Las flechas no
// son un extra: arrastrar con el mouse es lo único que ofrece el drag and drop nativo, y
// eso dejaría afuera a cualquiera que navegue con teclado. Las dos vías terminan en el
// mismo endpoint.
//
// El reordenamiento se pinta ANTES de que conteste el servidor. Si se esperara la
// respuesta, la fila volvería a su lugar por medio segundo y se siente roto. Si el
// servidor rechaza (alguien agregó un folio desde otra pantalla), se vuelve al orden
// anterior y se avisa.
//
// ── Quién edita ──────────────────────────────────────────────────────────────
//
// Solo DC. Los locales ven la planilla y se bajan los archivos, nada más (pedido del
// usuario). El backend valida lo mismo; esto solo evita mostrar botones que van a dar 403.

import { useCallback, useEffect, useRef, useState } from 'react'
import { inspeccionesApi } from '../../api/inspecciones.js'
import { documentosApi } from '../../api/documentos.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { esRolDc } from '../../lib/roles.js'
import {
  ORDEN_TABLERO, ESTADO_INFO, ESTADOS,
  etiquetaEstado, badgeEstado, ayudaEstado,
  reordenarFolios, subirBajarFolio, resumenCarpeta, textoEvento,
  fmtFecha, fmtPeriodo, fmtActualizacion,
} from '../../lib/inspecciones.js'

function IcoAsa() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}
function IcoArriba() {
  return <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
}
function IcoAbajo() {
  return <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
}
function IcoAdjunto() {
  return <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
}

const FOLIO_VACIO = { concepto: '', estado: 'FALTA', fecha_emision: '', periodo: '', vence: '', observaciones: '' }

export default function CarpetaInspecciones() {
  const activeApp = useAppStore((s) => s.activeApp)
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const puedeEditar = esRolDc(activeApp?.role)

  const locales = activeApp?.locales ?? []
  const [idLocal, setIdLocal] = useState(activeLocal?.id || locales[0]?.id || '')
  const [carpeta, setCarpeta] = useState(null)
  const [loading, setLoading] = useState(true)

  const [nuevo, setNuevo] = useState(null)          // el formulario de alta, o null
  const [editando, setEditando] = useState(null)    // { id, ...campos }
  const [guardando, setGuardando] = useState(false)
  const [historial, setHistorial] = useState(null)  // { id, eventos }
  const [subiendo, setSubiendo] = useState(null)

  // Para volver atrás si el servidor rechaza el reordenamiento.
  const ordenAnterior = useRef(null)
  const arrastrando = useRef(null)
  const [sobre, setSobre] = useState(null)

  const cargar = useCallback((signal) => {
    if (!idLocal) { setCarpeta(null); setLoading(false); return }
    setLoading(true)
    inspeccionesApi.carpeta(idLocal, signal)
      .then(({ data }) => setCarpeta(data))
      .catch((err) => {
        if (signal?.aborted) return
        notify(err.response?.data?.error || 'No se pudo cargar la carpeta', 'error')
        setCarpeta(null)
      })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [idLocal])

  useEffect(() => {
    const ctrl = new AbortController()
    cargar(ctrl.signal)
    return () => ctrl.abort()
  }, [cargar])

  const folios = carpeta?.folios ?? []

  // ── Reordenar ──────────────────────────────────────────────────────────────
  const aplicarOrden = async (nuevos) => {
    ordenAnterior.current = folios
    setCarpeta((c) => ({ ...c, folios: nuevos }))
    try {
      await inspeccionesApi.reordenar(idLocal, nuevos.map((f) => f.id))
    } catch (err) {
      // 409 = la planilla cambió mientras se ordenaba. Se vuelve y se recarga.
      setCarpeta((c) => ({ ...c, folios: ordenAnterior.current }))
      notify(err.response?.data?.error || 'No se pudo guardar el orden', 'error')
      cargar()
    }
  }

  const onDrop = (hasta) => {
    const desde = arrastrando.current
    arrastrando.current = null
    setSobre(null)
    if (desde == null || desde === hasta) return
    aplicarOrden(reordenarFolios(folios, desde, hasta))
  }

  const mover = (id, direccion) => aplicarOrden(subirBajarFolio(folios, id, direccion))

  // ── Alta y edición ─────────────────────────────────────────────────────────
  const guardarNuevo = async (e) => {
    e.preventDefault()
    if (!nuevo.concepto.trim()) return
    setGuardando(true)
    try {
      await inspeccionesApi.crear({ id_local: idLocal, ...nuevo, vence: nuevo.vence || null })
      notify('Folio agregado', 'success')
      setNuevo(null)
      cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo agregar', 'error')
    } finally { setGuardando(false) }
  }

  const guardarEdicion = async () => {
    setGuardando(true)
    try {
      await inspeccionesApi.actualizar(editando.id, {
        concepto: editando.concepto,
        estado: editando.estado,
        fecha_emision: editando.fecha_emision || null,
        periodo: editando.periodo || null,
        vence: editando.vence || null,
        observaciones: editando.observaciones,
      })
      setEditando(null)
      cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo guardar', 'error')
    } finally { setGuardando(false) }
  }

  // Cambiar el estado desde la tabla, sin abrir la edición: es lo que más se hace.
  const cambiarEstado = async (folio, estado) => {
    setCarpeta((c) => ({ ...c, folios: c.folios.map((f) => (f.id === folio.id ? { ...f, estado } : f)) }))
    try {
      await inspeccionesApi.actualizar(folio.id, { estado })
      cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo cambiar el estado', 'error')
      cargar()
    }
  }

  const borrar = (folio) => {
    showConfirm({
      title: `Eliminar el folio ${folio.folio}?`,
      message: `"${folio.concepto}". Se borran también sus archivos. Queda registrado en el historial.`,
      confirmText: 'Eliminar',
      danger: true,
      onConfirm: async () => {
        try {
          await inspeccionesApi.borrar(folio.id)
          notify('Folio eliminado', 'success')
          cargar()
        } catch (err) {
          notify(err.response?.data?.error || 'No se pudo eliminar', 'error')
        }
      },
    })
  }

  // ── Archivos ───────────────────────────────────────────────────────────────
  const adjuntar = async (folio, files) => {
    if (!files?.length) return
    setSubiendo(folio.id)
    try {
      const subidos = []
      for (const file of files) {
        const { data } = await documentosApi.subir(file, { id_local: idLocal })
        subidos.push({ gs_path: data.gs_path, tipo: data.tipo, nombre_original: data.nombre_original })
      }
      await inspeccionesApi.adjuntar(folio.id, subidos)
      notify(`${subidos.length} archivo(s) adjuntado(s)`, 'success')
      cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo adjuntar', 'error')
    } finally { setSubiendo(null) }
  }

  const descargar = async (folio, archivo) => {
    try {
      const { data } = await inspeccionesApi.verArchivo(folio.id, archivo.id, { descargar: true })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = archivo.nombre_original || 'archivo'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo descargar', 'error')
    }
  }

  const verHistorial = async (folio) => {
    setHistorial({ id: folio.id, concepto: folio.concepto, eventos: null })
    try {
      const { data } = await inspeccionesApi.historial(folio.id)
      setHistorial({ id: folio.id, concepto: folio.concepto, eventos: data.eventos })
    } catch {
      setHistorial({ id: folio.id, concepto: folio.concepto, eventos: [] })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Elegir la carpeta. La carpeta ES el local. */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div className="form-group" style={{ margin: 0, minWidth: 220 }}>
          <label className="form-label" htmlFor="insp-local">Carpeta del local</label>
          <div className="form-input-wrap">
            <select id="insp-local" value={idLocal} onChange={(e) => setIdLocal(e.target.value)}>
              {locales.length === 0 && <option value="">Sin locales</option>}
              {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <p className="form-hint" style={{ marginTop: 4, marginBottom: 0 }}>
            Cada local tiene su propia carpeta de inspecciones.
          </p>
        </div>
        {puedeEditar && !nuevo && (
          <button type="button" className="btn btn-primary" onClick={() => setNuevo({ ...FOLIO_VACIO })} disabled={!idLocal}>
            Agregar folio
          </button>
        )}
      </div>

      {loading ? (
        <div className="page-loading"><span className="spinner" /></div>
      ) : !carpeta ? null : (
        <>
          {/* Tablero: cuántos hay en cada estado. Sin esto hay que recorrer la planilla
              entera para saber si algo pide atención. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.9rem' }}>
            <span style={{ fontSize: 12.5, color: 'var(--t2)', marginRight: 4 }}>
              {resumenCarpeta({ total: carpeta.total, abiertos: carpeta.abiertos })}
            </span>
            {ORDEN_TABLERO.map((e) => {
              const n = carpeta.por_estado?.[e] ?? 0
              if (!n) return null
              return (
                <span key={e} className={`badge ${badgeEstado(e)}`} title={ayudaEstado(e)}>
                  {etiquetaEstado(e)}: {n}
                </span>
              )
            })}
          </div>

          {/* Alta */}
          {nuevo && (
            <form onSubmit={guardarNuevo} style={{
              background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
              borderRadius: 12, padding: '1rem', marginBottom: '1rem',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="nf-concepto">Concepto *</label>
                  <div className="form-input-wrap">
                    <input id="nf-concepto" type="text" required autoFocus maxLength={200}
                      placeholder="Habilitación municipal"
                      value={nuevo.concepto}
                      onChange={(e) => setNuevo({ ...nuevo, concepto: e.target.value })} />
                  </div>
                  <p className="form-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                    Qué se controla. {nuevo.concepto.length}/200
                  </p>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="nf-estado">Estado</label>
                  <div className="form-input-wrap">
                    <select id="nf-estado" value={nuevo.estado} onChange={(e) => setNuevo({ ...nuevo, estado: e.target.value })}>
                      {ESTADOS.map((e) => <option key={e} value={e}>{etiquetaEstado(e)}</option>)}
                    </select>
                  </div>
                  <p className="form-hint" style={{ marginTop: 4, marginBottom: 0 }}>{ayudaEstado(nuevo.estado)}</p>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="nf-emision">Fecha de emisión</label>
                  <div className="form-input-wrap">
                    <input id="nf-emision" type="date" value={nuevo.fecha_emision}
                      onChange={(e) => setNuevo({ ...nuevo, fecha_emision: e.target.value })} />
                  </div>
                  <p className="form-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                    Cuándo se emitió el papel.
                  </p>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="nf-periodo">Período</label>
                  <div className="form-input-wrap">
                    {/* type=month: el período es un mes, no un día. Se guarda el día 1. */}
                    <input id="nf-periodo" type="month" value={nuevo.periodo}
                      onChange={(e) => setNuevo({ ...nuevo, periodo: e.target.value })} />
                  </div>
                  <p className="form-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                    A qué mes corresponde.
                  </p>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="nf-vence">Fecha de vencimiento</label>
                  <div className="form-input-wrap">
                    <input id="nf-vence" type="date" value={nuevo.vence}
                      onChange={(e) => setNuevo({ ...nuevo, vence: e.target.value })} />
                  </div>
                  <p className="form-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                    Informativo: no cambia el estado solo.
                  </p>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="nf-obs">Observaciones</label>
                  <div className="form-input-wrap">
                    <input id="nf-obs" type="text" maxLength={300} placeholder="Opcional"
                      value={nuevo.observaciones}
                      onChange={(e) => setNuevo({ ...nuevo, observaciones: e.target.value })} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
                <button type="submit" className="btn btn-primary" disabled={guardando || !nuevo.concepto.trim()}>
                  {guardando ? 'Guardando…' : 'Agregar'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setNuevo(null)}>Cancelar</button>
              </div>
            </form>
          )}

          {folios.length === 0 ? (
            <div className="table-wrap">
              <div className="table-empty">
                <p>La carpeta de este local está vacía.</p>
                <p style={{ fontSize: 12, color: 'var(--t3)' }}>
                  {puedeEditar
                    ? 'Agregá el primer folio con el botón de arriba: un folio es una línea de control (habilitación, matafuegos, desinfección…).'
                    : 'Todavía no hay folios cargados. Los carga el equipo de DC.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {puedeEditar && <th style={{ width: 34 }} title="Arrastrar para reordenar"><span className="sr-only">Orden</span></th>}
                    {/* Orden pedido por el usuario: folio, concepto, estado, emisión,
                        período, vencimiento, observaciones, última actualización. Los
                        archivos van al final, junto a las acciones: son un control, no un
                        dato de la planilla. */}
                    <th style={{ width: 48 }} title="Número de folio">Folio</th>
                    <th style={{ minWidth: 160 }}>Concepto</th>
                    <th style={{ width: 150 }}>Estado</th>
                    <th style={{ width: 100 }} title="Fecha de emisión">Emisión</th>
                    <th style={{ width: 86 }}>Período</th>
                    <th style={{ width: 100 }} title="Fecha de vencimiento">Vence</th>
                    <th style={{ minWidth: 140 }}>Observaciones</th>
                    <th style={{ width: 150 }} title="Cuándo y quién lo tocó por última vez">Últ. actualización</th>
                    <th>Archivos</th>
                    <th style={{ width: 120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {folios.map((f, i) => {
                    const enEdicion = editando?.id === f.id
                    return (
                      <tr
                        key={f.id}
                        draggable={puedeEditar && !enEdicion}
                        onDragStart={() => { arrastrando.current = i }}
                        onDragOver={(e) => { if (puedeEditar) { e.preventDefault(); setSobre(i) } }}
                        onDragLeave={() => setSobre((s) => (s === i ? null : s))}
                        onDrop={(e) => { e.preventDefault(); onDrop(i) }}
                        // Soltar afuera de la tabla cancela: sin esto el resaltado queda
                        // pegado hasta el proximo arrastre.
                        onDragEnd={() => { arrastrando.current = null; setSobre(null) }}
                        // `sobre` es estado y no el ref: leer un ref durante el render no
                        // garantiza que React vuelva a pintar cuando cambia, y el resaltado
                        // de "aca va a caer" quedaba desactualizado.
                        style={sobre === i ? { outline: '2px solid var(--gold)', outlineOffset: -2 } : undefined}
                      >
                        {puedeEditar && (
                          <td style={{ cursor: 'grab', color: 'var(--t3)', verticalAlign: 'middle' }}
                            title="Arrastrar para reordenar">
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <IcoAsa />
                              {/* Las flechas son la via por teclado: el drag and drop nativo
                                  solo funciona con el mouse. */}
                              <div style={{ display: 'flex', gap: 1 }}>
                                <button type="button" className="btn-icon-mini" title="Subir"
                                  aria-label={`Subir el folio ${f.folio}`}
                                  disabled={i === 0} onClick={() => mover(f.id, 'arriba')}><IcoArriba /></button>
                                <button type="button" className="btn-icon-mini" title="Bajar"
                                  aria-label={`Bajar el folio ${f.folio}`}
                                  disabled={i === folios.length - 1} onClick={() => mover(f.id, 'abajo')}><IcoAbajo /></button>
                              </div>
                            </div>
                          </td>
                        )}
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{f.folio}</td>

                        {enEdicion ? (
                          <>
                            <td>
                              <div className="form-input-wrap">
                                <input type="text" value={editando.concepto} maxLength={200}
                                  onChange={(e) => setEditando({ ...editando, concepto: e.target.value })} />
                              </div>
                            </td>
                            <td>
                              <div className="form-input-wrap">
                                <select value={editando.estado} onChange={(e) => setEditando({ ...editando, estado: e.target.value })}>
                                  {ESTADOS.map((e) => <option key={e} value={e}>{etiquetaEstado(e)}</option>)}
                                </select>
                              </div>
                            </td>
                            <td>
                              <div className="form-input-wrap">
                                <input type="date" value={editando.fecha_emision ?? ''}
                                  onChange={(e) => setEditando({ ...editando, fecha_emision: e.target.value })} />
                              </div>
                            </td>
                            <td>
                              <div className="form-input-wrap">
                                <input type="month" value={editando.periodo ?? ''}
                                  onChange={(e) => setEditando({ ...editando, periodo: e.target.value })} />
                              </div>
                            </td>
                            <td>
                              <div className="form-input-wrap">
                                <input type="date" value={editando.vence ?? ''}
                                  onChange={(e) => setEditando({ ...editando, vence: e.target.value })} />
                              </div>
                            </td>
                            <td>
                              <div className="form-input-wrap">
                                <input type="text" value={editando.observaciones ?? ''} maxLength={300}
                                  onChange={(e) => setEditando({ ...editando, observaciones: e.target.value })} />
                              </div>
                            </td>
                            {/* La ultima actualizacion no se edita: la escribe el servidor. */}
                            <td className="td-muted" style={{ fontSize: 11.5 }}>{fmtActualizacion(f)}</td>
                            <td className="td-muted">{f.archivos?.length || 0}</td>
                            <td style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm btn-primary" disabled={guardando} onClick={guardarEdicion}>Guardar</button>
                              <button className="btn btn-sm btn-secondary" onClick={() => setEditando(null)}>✕</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{f.concepto}</td>
                            <td>
                              {/* Cambiar el estado es lo que más se hace: va acá y no dentro
                                  de la edición. */}
                              {puedeEditar ? (
                                <div className="form-input-wrap" title={ayudaEstado(f.estado)}>
                                  <select value={f.estado} onChange={(e) => cambiarEstado(f, e.target.value)}
                                    style={{ color: ESTADO_INFO[f.estado]?.color }}>
                                    {ESTADOS.map((e) => <option key={e} value={e}>{etiquetaEstado(e)}</option>)}
                                  </select>
                                </div>
                              ) : (
                                <span className={`badge ${badgeEstado(f.estado)}`} title={ayudaEstado(f.estado)}>
                                  {etiquetaEstado(f.estado)}
                                </span>
                              )}
                            </td>
                            <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha_emision)}</td>
                            <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>{fmtPeriodo(f.periodo)}</td>
                            <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>{fmtFecha(f.vence)}</td>
                            <td className="td-muted" style={{ maxWidth: 200 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={f.observaciones || undefined}>
                                {f.observaciones || '—'}
                              </div>
                            </td>
                            {/* Cuando y quien: `updated_at` solo dice cuando, y sin el quien
                                la columna no sirve para preguntarle a nadie. */}
                            <td className="td-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}
                              title={f.updated_at ? new Date(f.updated_at).toLocaleString('es-AR') : undefined}>
                              {fmtActualizacion(f)}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                {(f.archivos ?? []).map((a) => (
                                  <button key={a.id} type="button" className="btn btn-sm btn-secondary"
                                    onClick={() => descargar(f, a)}
                                    title={`Descargar ${a.nombre_original || 'archivo'}`}>
                                    <IcoAdjunto /> {(a.nombre_original || 'archivo').slice(0, 14)}
                                  </button>
                                ))}
                                {puedeEditar && (
                                  <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}
                                    title="Adjuntar archivos a este folio">
                                    {subiendo === f.id ? '…' : '+'}
                                    <input type="file" multiple hidden
                                      onChange={(e) => { adjuntar(f, [...e.target.files]); e.target.value = '' }} />
                                  </label>
                                )}
                                {!f.archivos?.length && !puedeEditar && <span className="td-muted">—</span>}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => verHistorial(f)}
                                  title="Ver el historial de cambios de este folio">Historial</button>
                                {puedeEditar && (
                                  <>
                                    <button type="button" className="btn btn-sm btn-secondary"
                                      onClick={() => setEditando({
                                        id: f.id, concepto: f.concepto, estado: f.estado,
                                        fecha_emision: f.fecha_emision ?? '', periodo: f.periodo ?? '',
                                        vence: f.vence ?? '', observaciones: f.observaciones ?? '',
                                      })}>
                                      Editar
                                    </button>
                                    <button type="button" className="btn btn-sm btn-danger" onClick={() => borrar(f)}>✕</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {puedeEditar && folios.length > 1 && (
            <p style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 10 }}>
              El orden se cambia arrastrando la fila o con las flechas. Se guarda solo.
            </p>
          )}
          {!puedeEditar && (
            <p style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 10 }}>
              La carpeta es de solo lectura para tu perfil: podés ver los folios y descargar
              los archivos. Los cambios los hace el equipo de DC.
            </p>
          )}
        </>
      )}

      {/* Historial */}
      {historial && (
        <div className="drawer-backdrop open" onClick={() => setHistorial(null)}>
          <div className="drawer-panel open" style={{ width: 'min(440px, 100vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <span className="drawer-title">Historial · {historial.concepto}</span>
              <button className="drawer-close" onClick={() => setHistorial(null)}>✕</button>
            </div>
            <div style={{ padding: '1rem 1.5rem', overflowY: 'auto' }}>
              {historial.eventos === null ? (
                <span className="spinner" />
              ) : historial.eventos.length === 0 ? (
                <p style={{ color: 'var(--t3)', fontSize: 13 }}>Sin cambios registrados todavía.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  {historial.eventos.map((ev) => (
                    <div key={ev.id} style={{ borderLeft: '2px solid var(--glass-border)', paddingLeft: 10 }}>
                      <div style={{ fontSize: 13, color: 'var(--t1)' }}>{textoEvento(ev)}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                        {new Date(ev.fecha).toLocaleString('es-AR')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
