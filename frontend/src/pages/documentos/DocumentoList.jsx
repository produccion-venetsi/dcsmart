// Documentos: archivos y links ordenados por tipo, agrupados por grupo y local.
//
// El grupo lo fija el selector de arriba (X-App-Id), así que dentro de la pantalla el
// primer nivel de agrupación es el local. Los que no tienen local son del grupo entero y
// van primero: aplican a todos los locales.
//
// Las reglas (agrupación, vencimientos, validación) están en lib/documentos.js con
// tests. Acá está la pantalla.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { documentosApi, urlPublica } from '../../api/documentos.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'
import { useAppStore } from '../../store/appStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import CampoTexto from '../../components/CampoTexto.jsx'
import CampoSelect from '../../components/CampoSelect.jsx'
import Combobox from '../../components/Combobox.jsx'
import IconoDocumento from '../../components/IconoDocumento.jsx'
import TiposDocumentoPanel from './TiposDocumentoPanel.jsx'
import ArchivosDocumento from './ArchivosDocumento.jsx'
import {
  AGRUPACIONES, agrupar, resumen, fechaTexto, textoVencimiento, colorVencimiento,
  EMPTY_DOC, erroresDoc, avisosDoc, fechaISO,
} from '../../lib/documentos.js'

// ─── Icons ────────────────────────────────────────────────────────────────────

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IcoDocs() {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}

// Cuántas columnas tiene la tabla, para los colSpan de los encabezados de bloque.
const COLUMNAS = 6

// Un proveedor puede tener nombre de fantasía, razón social o ninguno de los dos (hay
// filas viejas sin nombre). Se resuelve en un lugar para que la tabla y el combobox
// muestren lo mismo.
const nombreProveedor = (p) =>
  p ? (p.nombre || p.razon_social || '(sin nombre)') : ''

export default function DocumentoList() {
  const notify = useUiStore(s => s.notify)
  const showConfirm = useUiStore(s => s.showConfirm)
  const activeApp = useAppStore(s => s.activeApp)
  const activeLocal = useAppStore(s => s.activeLocal)
  const locales = activeApp?.locales ?? []

  const [params, setParams] = useSearchParams()

  const [docs, setDocs] = useState([])
  const [tipos, setTipos] = useState([])
  const [loading, setLoading] = useState(true)
  // El proveedor elegido, para que el combobox pueda mostrar su nombre. Sin esto, al
  // abrir un documento ya guardado el campo se ve vacio aunque tenga proveedor.
  const [provSel, setProvSel] = useState(null)

  // Filtros
  const [texto, setTexto] = useState('')
  const [fLocal, setFLocal] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fVenc, setFVenc] = useState('')
  const [agruparPor, setAgruparPor] = useState('local-tipo')
  const [abiertos, setAbiertos] = useState(new Set())

  // Panel de detalle / edición
  const [panelOpen, setPanelOpen] = useState(false)
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(EMPTY_DOC)
  const [saving, setSaving] = useState(false)
  const [errores, setErrores] = useState({})

  const [tiposOpen, setTiposOpen] = useState(false)

  // El barrido de vencimientos se dispara una sola vez por visita: no hay cron, así que
  // abrir la pantalla es lo que genera los avisos. Sin el ref, cada recarga de la lista
  // volvería a pegarle.
  const yaReviso = useRef(false)

  const traerDocs = () =>
    documentosApi.list()
      .then(({ data }) => setDocs(data ?? []))
      .catch(err => notify(err.response?.data?.error || 'Error al cargar documentos', 'error'))
      .finally(() => setLoading(false))

  // Recarga después de guardar o borrar. No muestra el esqueleto: la tabla ya está en
  // pantalla y vaciarla para volver a dibujarla parpadea.
  const cargar = () => traerDocs()

  const cargarTipos = () =>
    documentosApi.tipos().then(({ data }) => setTipos(data ?? [])).catch(() => {})

  useEffect(() => {
    // Las peticiones van directo y no a través de una función que setee estado en el
    // cuerpo del effect: eso dispara renders en cascada. Los setState de acá están en los
    // callbacks, que corren después del render.
    traerDocs()
    cargarTipos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeApp?.app?.id])

  useEffect(() => {
    if (yaReviso.current || loading || docs.length === 0) return
    yaReviso.current = true
    // Silencioso: los avisos aparecen en la campana. Un cartel acá sería redundante.
    documentosApi.revisarVencimientos().catch(() => {})
  }, [loading, docs.length])

  // Un aviso de vencimiento abre el documento directo (?doc=<id>), igual que un aviso de
  // caja abre su drawer.
  useEffect(() => {
    const id = params.get('doc')
    if (!id || loading) return
    const doc = docs.find(d => d.id === id)
    if (doc) abrir(doc)
    else if (docs.length) notify('Ese documento ya no está o no tenés acceso', 'error')
    // Se limpia el parámetro para que volver atrás no lo reabra.
    const p = new URLSearchParams(params)
    p.delete('doc')
    setParams(p, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, docs])

  // ── filtrado ──────────────────────────────────────────────────────────────
  //
  // Se filtra en memoria: son pocos y así los filtros no esperan al servidor. El
  // backend igual acepta los mismos parámetros para cuando la lista crezca.
  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return docs.filter(d => {
      if (q && !`${d.nombre} ${d.detalle ?? ''}`.toLowerCase().includes(q)) return false
      // Filtrar por local trae los del local Y los del grupo: el contrato marco también
      // rige para ese local.
      if (fLocal && d.id_local !== fLocal && d.id_local !== null) return false
      if (fTipo && d.id_tipo !== fTipo) return false
      if (fVenc === 'sin' && d.vence) return false
      if (fVenc && fVenc !== 'sin' && d.estado_vencimiento !== fVenc) return false
      return true
    })
  }, [docs, texto, fLocal, fTipo, fVenc])

  const bloques = useMemo(() => agrupar(filtrados, agruparPor), [filtrados, agruparPor])
  const res = useMemo(() => resumen(docs), [docs])

  const hayFiltro = Boolean(texto || fLocal || fTipo || fVenc)
  const limpiar = () => { setTexto(''); setFLocal(''); setFTipo(''); setFVenc('') }

  const alternar = (clave) => setAbiertos(prev => {
    const s = new Set(prev)
    if (s.has(clave)) s.delete(clave); else s.add(clave)
    return s
  })
  // Con filtro puesto se muestra todo abierto: quien busca quiere ver el resultado, no
  // un bloque cerrado que no dice si está adentro.
  const visible = (clave) => hayFiltro || !clave || abiertos.has(clave)

  // ── abrir / guardar ───────────────────────────────────────────────────────

  // `function` y no `const`: el effect de `?doc=` de arriba la usa, y una arrow en const
  // todavía no existe cuando ese effect se declara.
  function abrir(doc) {
    setSel(doc)
    setErrores({})
    setProvSel(doc?.proveedor ?? null)
    setForm(doc ? {
      id_tipo: doc.id_tipo ?? '',
      id_local: doc.id_local ?? '',
      id_proveedor: doc.id_proveedor ?? '',
      nombre: doc.nombre ?? '',
      detalle: doc.detalle ?? '',
      url: doc.url ?? '',
      vence: fechaISO(doc.vence) ?? '',
      visible_todos: Boolean(doc.visible_todos),
    } : EMPTY_DOC)
    setPanelOpen(true)
  }

  const nuevo = () => {
    setSel(null)
    setErrores({})
    setProvSel(null)
    // Se precarga el local activo: casi siempre se carga un documento del local en el
    // que uno está parado.
    setForm({ ...EMPTY_DOC, id_local: activeLocal?.id ?? '' })
    setPanelOpen(true)
  }

  const cerrar = () => { setPanelOpen(false); setSel(null) }

  const guardar = async (e) => {
    e.preventDefault()
    const errs = erroresDoc(form)
    if (Object.keys(errs).length) { setErrores(errs); return }

    setSaving(true)
    try {
      const body = {
        id_tipo: form.id_tipo,
        id_local: form.id_local || null,
        id_proveedor: form.id_proveedor || null,
        nombre: form.nombre.trim(),
        detalle: form.detalle,
        url: form.url,
        vence: form.vence,
        visible_todos: form.visible_todos,
      }
      if (sel) {
        const { data } = await documentosApi.update(sel.id, body)
        setSel(data)
        notify('Documento actualizado', 'success')
      } else {
        const { data } = await documentosApi.create(body)
        // Se queda abierto en el nuevo para poder cargarle los archivos ahí mismo: son
        // dos pasos (guardar y adjuntar) y cerrar el panel obliga a volver a buscarlo.
        setSel(data)
        notify('Documento creado. Ya podés adjuntar los archivos.', 'success')
      }
      cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const borrar = async () => {
    if (!sel) return
    const cuantos = sel.archivos?.length ?? 0
    const msg = cuantos
      ? `¿Borrar "${sel.nombre}" y sus ${cuantos} archivo(s)? No se puede deshacer.`
      : `¿Borrar "${sel.nombre}"?`
    if (!(await showConfirm(msg))) return
    try {
      await documentosApi.remove(sel.id)
      notify('Documento borrado', 'success')
      cerrar()
      cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al borrar', 'error')
    }
  }

  // ── link para compartir ───────────────────────────────────────────────────

  // Se guarda { id, url } y no la url sola: así, al pasar a otro documento, el link deja
  // de mostrarse sin necesidad de un effect que lo limpie (y sin el riesgo de mostrar el
  // link de un documento sobre otro si ese effect corre tarde).
  const [link, setLink] = useState(null)
  const linkVisible = link?.id === sel?.id ? link.url : null

  const generarLink = async () => {
    try {
      const { data } = await documentosApi.generarLink(sel.id)
      const url = urlPublica(data.token)
      setLink({ id: sel.id, url })
      // Se copia solo: el link no sirve de nada si hay que seleccionarlo a mano de un
      // cuadro chico. Si el navegador no lo permite, queda a la vista para copiarlo.
      try {
        await navigator.clipboard.writeText(url)
        notify('Link copiado. Abre el documento sin pedir usuario.', 'success')
      } catch {
        notify('Link generado. Copialo de abajo.', 'success')
      }
      cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al generar el link', 'error')
    }
  }

  const revocarLink = async () => {
    if (!(await showConfirm('¿Anular el link? Quien lo tenga deja de poder abrir el documento.'))) return
    try {
      await documentosApi.revocarLink(sel.id)
      setLink(null)
      setSel(s => ({ ...s, tiene_link: false, token_creado_at: null }))
      notify('Link anulado', 'success')
      cargar()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al anular el link', 'error')
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  const opcionesTipo = tipos.map(t => ({ value: t.id, label: t.nombre }))
  const opcionesLocal = locales.map(l => ({ value: l.id, label: l.nombre }))
  const avisos = avisosDoc({ ...form, _tieneArchivos: (sel?.archivos?.length ?? 0) > 0 })

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Documentos</h1>
          <p className="page-sub">Contratos, habilitaciones, reportes y todo lo que haya que guardar</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => setTiposOpen(true)}>Tipos</button>
          <button className="btn btn-primary" onClick={nuevo}>
            <IcoPlus /> Nuevo documento
          </button>
        </div>
      </div>

      {/* Lo urgente arriba y clickeable: con la lista larga, un vencido en la fila 40 no
          se ve. El cartel además filtra, así que sirve para algo más que informar. */}
      {(res.vencidos > 0 || res.porVencer > 0) && (
        <div
          className={`callout ${res.vencidos ? 'callout-red' : 'callout-amber'}`}
          style={{ marginBottom: '1rem' }}
        >
          {res.vencidos > 0 && (
            <>
              <strong>{res.vencidos}</strong> {res.vencidos === 1 ? 'documento vencido' : 'documentos vencidos'}
              {res.porVencer > 0 ? ' · ' : ' '}
            </>
          )}
          {res.porVencer > 0 && <><strong>{res.porVencer}</strong> por vencer en los próximos 30 días</>}
          <button
            className="btn btn-sm btn-secondary"
            style={{ marginLeft: 10 }}
            onClick={() => setFVenc(res.vencidos ? 'vencido' : 'por-vencer')}
          >
            Ver {res.vencidos ? 'los vencidos' : 'los que vencen'}
          </button>
        </div>
      )}

      <div className="filter-bar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="doc-buscar">Buscar</label>
          <div className="form-input-wrap" style={{ width: 240 }}>
            <input
              id="doc-buscar"
              type="text"
              placeholder="Nombre o detalle"
              value={texto}
              onChange={e => setTexto(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="doc-f-local">Local</label>
          <select id="doc-f-local" className="filter-select" value={fLocal} onChange={e => setFLocal(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Todos</option>
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="doc-f-tipo">Tipo</label>
          <select id="doc-f-tipo" className="filter-select" value={fTipo} onChange={e => setFTipo(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Todos</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="doc-f-venc">Vencimiento</label>
          <select id="doc-f-venc" className="filter-select" value={fVenc} onChange={e => setFVenc(e.target.value)} style={{ minWidth: 140 }}>
            <option value="">Todos</option>
            <option value="vencido">Vencidos</option>
            <option value="por-vencer">Por vencer</option>
            <option value="vigente">Vigentes</option>
            <option value="sin">Sin vencimiento</option>
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="doc-agrupar">Separar por</label>
          <select id="doc-agrupar" className="filter-select" value={agruparPor} onChange={e => setAgruparPor(e.target.value)}>
            {AGRUPACIONES.map(a => <option key={a.valor} value={a.valor}>{a.label}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: 12.5, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
            {loading ? '' : `${filtrados.length} de ${docs.length}`}
          </span>
          {hayFiltro && <button className="btn btn-sm btn-secondary" onClick={limpiar}>Limpiar</button>}
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Tipo</th>
              <th>Local</th>
              <th>Proveedor</th>
              <th>Vencimiento</th>
              <th>Archivos</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: COLUMNAS }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${45 + (j * 17 + i * 9) % 45}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS}>
                  <div className="table-empty">
                    <IcoDocs />
                    <p>
                      {docs.length === 0
                        ? 'Todavía no hay documentos cargados en este grupo.'
                        : 'Ningún documento coincide con los filtros.'}
                    </p>
                    {docs.length === 0
                      ? <button className="btn btn-sm btn-primary" onClick={nuevo}>Cargar el primero</button>
                      : <button className="btn btn-sm btn-secondary" onClick={limpiar}>Limpiar filtros</button>}
                  </div>
                </td>
              </tr>
            ) : bloques.map(bloque => (
              <Fragment key={bloque.titulo ?? '_'}>
                {bloque.titulo && (
                  <tr className="row-clickable" onClick={() => alternar(bloque.titulo)}>
                    <td colSpan={COLUMNAS} style={{
                      background: 'var(--bg-input)',
                      borderTop: '1px solid var(--glass-border)',
                      padding: '0.5rem 0.9rem',
                      fontSize: 11.5, letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: 'var(--t1)', fontWeight: 700, userSelect: 'none',
                    }}>
                      <span style={{
                        display: 'inline-block', width: 14, color: 'var(--t3)',
                        transform: visible(bloque.titulo) ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s var(--ease)',
                      }}>▸</span>
                      {bloque.titulo}
                      <span style={{ color: 'var(--t3)', fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>
                        {' · '}{bloque.total} {bloque.total === 1 ? 'documento' : 'documentos'}
                      </span>
                    </td>
                  </tr>
                )}
                {visible(bloque.titulo) && bloque.sub.map(sub => (
                  <Fragment key={`${bloque.titulo ?? ''}-${sub.titulo ?? '_'}`}>
                    {sub.titulo && (
                      <tr>
                        <td colSpan={COLUMNAS} style={{
                          padding: '0.35rem 0.9rem 0.35rem 1.9rem',
                          fontSize: 11, color: 'var(--t2)', fontWeight: 600,
                        }}>
                          {sub.titulo}
                          <span style={{ color: 'var(--t3)', fontWeight: 400 }}> · {sub.docs.length}</span>
                        </td>
                      </tr>
                    )}
                    {sub.docs.map(d => (
                      <tr key={d.id} className="row-clickable" onClick={() => abrir(d)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ color: 'var(--t3)', display: 'flex' }}>
                              <IconoDocumento clave={d.icono} size={17} />
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{d.nombre}</div>
                              {d.detalle && (
                                <div style={{
                                  fontSize: 11.5, color: 'var(--t3)', marginTop: 1,
                                  maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {d.detalle}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="td-muted">{d.tipo?.nombre ?? '—'}</td>
                        <td className="td-muted">
                          {/* Sin local es del grupo entero, y eso hay que decirlo: una
                              celda vacía se lee como un dato que falta. */}
                          {d.local?.nombre ?? <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>Todo el grupo</span>}
                        </td>
                        <td className="td-muted">
                          {d.proveedor ? nombreProveedor(d.proveedor) : <span style={{ color: 'var(--t4)' }}>—</span>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {d.vence ? (
                            <div>
                              <div style={{ fontSize: 12.5, color: colorVencimiento(d.estado_vencimiento) }}>
                                {fechaTexto(d.vence)}
                              </div>
                              <div style={{ fontSize: 11, color: colorVencimiento(d.estado_vencimiento) }}>
                                {textoVencimiento(d.vence)}
                              </div>
                            </div>
                          ) : <span style={{ color: 'var(--t4)' }}>—</span>}
                        </td>
                        <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {d.archivos?.length > 0 && <span>{d.archivos.length} archivo{d.archivos.length > 1 ? 's' : ''}</span>}
                            {d.url && <span title={d.url}>link</span>}
                            {!d.archivos?.length && !d.url && (
                              <span style={{ color: 'var(--amber)', fontSize: 11.5 }}>sin adjuntar</span>
                            )}
                            {d.tiene_link && (
                              <span
                                className="badge badge-blue"
                                title="Tiene un link para compartir sin login"
                              >
                                compartido
                              </span>
                            )}
                            {d.visible_todos && (
                              <span className="badge badge-muted" title="Lo ve cualquiera con acceso al local">
                                visible
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Panel de alta / detalle ── */}
      <DrawerPanel
        open={panelOpen}
        onClose={cerrar}
        title={sel ? sel.nombre : 'Nuevo documento'}
        width={520}
      >
        <form onSubmit={guardar}>
          <CampoTexto
            id="doc-nombre"
            label="Nombre"
            value={form.nombre}
            onChange={v => setForm(f => ({ ...f, nombre: v }))}
            max={120}
            requerido
            error={errores.nombre}
            ayuda="Cómo lo vas a buscar después."
            placeholder="Habilitación municipal 2026"
            disabled={saving}
          />

          <div className="datos-persona-grid" style={{ marginTop: '0.9rem' }}>
            <CampoSelect
              id="doc-tipo"
              label="Tipo"
              value={form.id_tipo}
              onChange={v => setForm(f => ({ ...f, id_tipo: v }))}
              opciones={opcionesTipo}
              vacio="Elegir tipo"
              requerido
              error={errores.id_tipo}
              ayuda={tipos.length ? undefined : 'No hay tipos: creá uno con el botón "Tipos".'}
              disabled={saving}
            />

            <CampoSelect
              id="doc-local"
              label="Local"
              value={form.id_local}
              onChange={v => setForm(f => ({ ...f, id_local: v }))}
              opciones={opcionesLocal}
              vacio="Todo el grupo"
              // Es la decisión menos obvia del formulario: dejarlo vacío no es un olvido.
              ayuda="Vacío = aplica a todos los locales del grupo."
              disabled={saving}
            />
          </div>

          <div className="datos-persona-grid" style={{ marginTop: '0.9rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Proveedor</label>
              <Combobox
                value={form.id_proveedor}
                displayValue={nombreProveedor(provSel)}
                getKey={p => p.id}
                getLabel={nombreProveedor}
                onSelect={p => { setProvSel(p); setForm(f => ({ ...f, id_proveedor: p.id })) }}
                onClear={() => { setProvSel(null); setForm(f => ({ ...f, id_proveedor: '' })) }}
                // Busca en el servidor, como el resto de los combobox del proyecto: son
                // más de 4500 proveedores, traerlos todos para filtrar en memoria es
                // medio megabyte por cada vez que se abre el panel.
                fetchItems={(search) =>
                  proveedoresApi.list({ search, limit: 30 }).then(r => r.data?.data ?? r.data ?? [])
                }
                placeholder="Buscar proveedor…"
              />
              <p className="form-hint" style={{ marginTop: 4 }}>
                Opcional. Con quién es el contrato o quién emitió el documento.
              </p>
            </div>

            <CampoTexto
              id="doc-vence"
              label="Vence"
              type="date"
              value={form.vence}
              onChange={v => setForm(f => ({ ...f, vence: v }))}
              error={errores.vence}
              ayuda="Opcional. Si lo cargás, avisamos 30 días antes."
              nota={form.vence ? textoVencimiento(form.vence) : undefined}
              disabled={saving}
            />
          </div>

          <div style={{ marginTop: '0.9rem' }}>
            <CampoTexto
              id="doc-url"
              label="Link"
              value={form.url}
              onChange={v => setForm(f => ({ ...f, url: v }))}
              error={errores.url}
              ayuda="Si el documento vive en otro lado (Drive, un sistema). Podés tener link y archivos."
              placeholder="https://drive.google.com/…"
              disabled={saving}
            />
          </div>

          <div style={{ marginTop: '0.9rem' }}>
            <CampoTexto
              id="doc-detalle"
              label="Detalle"
              value={form.detalle}
              onChange={v => setForm(f => ({ ...f, detalle: v }))}
              multilinea
              max={1000}
              ayuda="Lo que haga falta saber: número de expediente, con quién se tramita, qué falta."
              disabled={saving}
            />
          </div>

          <label
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
              marginTop: '1rem', fontSize: 13, color: 'var(--t2)',
            }}
          >
            <input
              type="checkbox"
              className="select-checkbox"
              checked={form.visible_todos}
              onChange={e => setForm(f => ({ ...f, visible_todos: e.target.checked }))}
              disabled={saving}
              style={{ marginTop: 2 }}
            />
            <span>
              Visible para todos
              <span className="form-hint" style={{ display: 'block' }}>
                Sin esto lo ven solo los roles internos (admin y arriba). Con esto, cualquiera
                que entre a ese local. No es lo mismo que el link para compartir.
              </span>
            </span>
          </label>

          {avisos.length > 0 && (
            <div className="callout callout-amber" style={{ marginTop: '0.9rem' }}>
              {avisos.map((a, i) => <div key={i}>{a}</div>)}
            </div>
          )}

          <div className="form-actions" style={{ marginTop: '1.25rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : sel ? 'Guardar cambios' : 'Crear documento'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={cerrar} disabled={saving}>
              Cerrar
            </button>
            {sel && (
              <button type="button" className="btn btn-danger" onClick={borrar} disabled={saving} style={{ marginLeft: 'auto' }}>
                <IcoTrash /> Borrar
              </button>
            )}
          </div>
        </form>

        {/* Los archivos y el link solo existen si el documento ya está guardado: hay que
            tener un id para colgarlos. Se dice en vez de mostrar controles muertos. */}
        {sel ? (
          <>
            <div className="drawer-section-title" style={{ marginTop: '1.75rem' }}>Archivos</div>
            <ArchivosDocumento
              documento={sel}
              onCambio={(actualizado) => { setSel(actualizado); cargar() }}
            />

            <div className="drawer-section-title" style={{ marginTop: '1.75rem' }}>Compartir sin login</div>
            <p className="form-hint" style={{ marginBottom: 8 }}>
              Genera un link que abre este documento sin pedir usuario, para mandárselo a
              alguien de afuera (un inspector, un contador). Cualquiera con el link entra.
            </p>
            {linkVisible && (
              <div className="form-input-wrap" style={{ marginBottom: 8 }}>
                <input readOnly value={linkVisible} onFocus={e => e.target.select()} style={{ fontSize: 11.5 }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-sm btn-secondary" onClick={generarLink}>
                {sel.tiene_link ? 'Ver / copiar el link' : 'Generar link'}
              </button>
              {sel.tiene_link && (
                <button type="button" className="btn btn-sm btn-danger" onClick={revocarLink}>
                  Anular el link
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="form-hint" style={{ marginTop: '1.5rem' }}>
            Guardá el documento y después le adjuntás los archivos y, si hace falta, el link
            para compartir.
          </p>
        )}
      </DrawerPanel>

      {/* ── Panel de tipos ── */}
      <DrawerPanel open={tiposOpen} onClose={() => setTiposOpen(false)} title="Tipos de documento" width={480}>
        <TiposDocumentoPanel
          onCambio={() => { cargarTipos(); cargar() }}
        />
      </DrawerPanel>
    </div>
  )
}
