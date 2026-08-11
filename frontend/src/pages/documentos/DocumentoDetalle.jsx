// El detalle de un documento: los datos, los links y la vista previa del archivo.
//
// Existe porque antes hacer clic en una fila abría el formulario de edición: para LEER un
// documento había que entrar a editarlo, con todos los campos habilitados y el riesgo de
// tocar algo sin querer. Ahora se ve primero y se edita con un botón.
//
// La vista previa muestra las fotos y los PDF acá mismo. El archivo se trae como blob
// porque el endpoint pide el header de autorización, y un `<img src>` no lo manda.

import { useEffect, useRef, useState } from 'react'
import { documentosApi, urlPublica } from '../../api/documentos.js'
import { useUiStore } from '../../store/uiStore.js'
import IconoDocumento from '../../components/IconoDocumento.jsx'
import {
  fechaTexto, textoVencimiento, colorVencimiento,
  nombreDeArchivo, modoPreview, archivoInicial, seVeEnPantalla, linkParaMostrar,
} from '../../lib/documentos.js'

function IcoLink() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
    </svg>
  )
}

function IcoBajar() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// Una fila de dato. Solo se dibuja si hay algo que mostrar: una fila vacía ocupa lugar y
// no dice nada.
const Dato = ({ label, children }) =>
  children === null || children === undefined || children === '' ? null : (
    <div className="drawer-detail-row">
      <span className="drawer-detail-key">{label}</span>
      <span className="drawer-detail-val">{children}</span>
    </div>
  )

// ── Vista previa ─────────────────────────────────────────────────────────────

function Preview({ documento, archivo }) {
  const [url, setUrl] = useState(null)
  const [estado, setEstado] = useState('cargando')
  // El object URL se revoca al cambiar de archivo o al cerrar: sin esto cada archivo mirado
  // se queda en memoria hasta recargar la página.
  const anterior = useRef(null)

  // Desarmado antes del effect para poder listarlos como dependencias sueltas: con
  // `archivo` entero, cualquier objeto nuevo con los mismos datos vuelve a pedir el
  // archivo.
  const idDoc = documento?.id
  const idArchivo = archivo?.id
  const modo = modoPreview(archivo?.tipo)

  useEffect(() => {
    // Los que no se pueden previsualizar no piden nada, y tampoco tocan el estado: el
    // render decide por el tipo antes de mirarlo.
    if (!idArchivo || modo === 'ninguno') return
    let vivo = true
    documentosApi.verArchivo(idDoc, idArchivo)
      .then(({ data }) => {
        if (!vivo) return
        const nueva = URL.createObjectURL(data)
        if (anterior.current) URL.revokeObjectURL(anterior.current)
        anterior.current = nueva
        setUrl(nueva)
        setEstado('listo')
      })
      .catch(() => { if (vivo) setEstado('error') })
    // Al cambiar de archivo se vuelve a "cargando", pero desde la limpieza del effect
    // anterior, no desde su cuerpo.
    return () => { vivo = false; setEstado('cargando') }
  }, [idDoc, idArchivo, modo])

  // Al desmontar se suelta el último.
  useEffect(() => () => {
    if (anterior.current) URL.revokeObjectURL(anterior.current)
  }, [])

  if (!archivo) return null

  if (modo === 'ninguno') {
    return (
      <div className="doc-preview doc-preview-vacio">
        <p className="form-hint" style={{ margin: 0 }}>
          {/* Se dice el motivo: "no se puede previsualizar" sin más deja pensando que algo
              falló. */}
          Este tipo de archivo no se puede mostrar en el navegador. Descargalo para verlo.
        </p>
      </div>
    )
  }

  if (estado === 'cargando') {
    return <div className="doc-preview doc-preview-vacio"><span className="skel" style={{ width: '60%' }} /></div>
  }
  if (estado === 'error') {
    return (
      <div className="doc-preview doc-preview-vacio">
        <p className="form-hint" style={{ margin: 0, color: 'var(--red)' }}>
          No se pudo cargar el archivo.
        </p>
      </div>
    )
  }

  return (
    <div className="doc-preview">
      {modo === 'imagen' ? (
        <img src={url} alt={nombreDeArchivo(archivo)} />
      ) : (
        // <iframe> y no <embed>: es el que respeta el alto que se le da y no se come los
        // gestos de scroll de la página.
        <iframe src={url} title={nombreDeArchivo(archivo)} />
      )}
    </div>
  )
}

// ── Detalle ──────────────────────────────────────────────────────────────────

export default function DocumentoDetalle({ documento, onEditar, onBorrar, onCambio }) {
  const notify = useUiStore(s => s.notify)
  const showConfirm = useUiStore(s => s.showConfirm)

  const archivos = documento?.archivos ?? []
  const [verId, setVerId] = useState(null)
  const [link, setLink] = useState(null)
  const linkVisible = linkParaMostrar(link, documento)

  // Cuál se está viendo. Se calcula en vez de guardarse en un effect: así cambiar de
  // documento no necesita limpiar nada, y nunca se muestra el archivo de otro.
  const viendo = archivos.find(a => a.id === verId) ?? archivoInicial(archivos)

  const bajar = async (archivo) => {
    try {
      const { data } = await documentosApi.verArchivo(documento.id, archivo.id, { descargar: true })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = nombreDeArchivo(archivo)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo descargar', 'error')
    }
  }

  const generarLink = async () => {
    try {
      const { data } = await documentosApi.generarLink(documento.id)
      const url = urlPublica(data.token)
      setLink({ id: documento.id, url })
      try {
        await navigator.clipboard.writeText(url)
        notify('Link copiado. Abre el documento sin pedir usuario.', 'success')
      } catch {
        notify('Link generado. Copialo de abajo.', 'success')
      }
      onCambio?.()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al generar el link', 'error')
    }
  }

  const revocarLink = async () => {
    if (!(await showConfirm('¿Anular el link? Quien lo tenga deja de poder abrir el documento.'))) return
    try {
      await documentosApi.revocarLink(documento.id)
      setLink(null)
      onCambio?.()
      notify('Link anulado', 'success')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al anular el link', 'error')
    }
  }

  return (
    <div>
      {/* Encabezado: el tipo con su ícono y el vencimiento, que es lo que se viene a mirar. */}
      <div className="doc-detalle-head">
        <span className="doc-detalle-ico"><IconoDocumento clave={documento.icono} size={22} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="doc-detalle-tipo">{documento.tipo?.nombre ?? 'Sin tipo'}</div>
          {documento.vence && (
            <div style={{ fontSize: 12.5, color: colorVencimiento(documento.estado_vencimiento), fontWeight: 600 }}>
              {textoVencimiento(documento.vence)} · {fechaTexto(documento.vence)}
            </div>
          )}
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={onEditar}>Editar</button>
      </div>

      <div className="drawer-detail" style={{ marginBottom: '1.25rem' }}>
        <Dato label="Local">
          {documento.local?.nombre ?? <em style={{ color: 'var(--t3)' }}>Todo el grupo</em>}
        </Dato>
        <Dato label="Proveedor">
          {documento.proveedor?.nombre || documento.proveedor?.razon_social || null}
        </Dato>
        <Dato label="Visible">
          {documento.visible_todos
            ? 'Todos los que entran al local'
            : 'Solo roles internos (admin y arriba)'}
        </Dato>
        <Dato label="Cargado por">{documento.created_by?.nombre ?? null}</Dato>
        <Dato label="Actualizado">{fechaTexto(documento.updated_at)}</Dato>
      </div>

      {documento.detalle && (
        <>
          <div className="drawer-section-title">Detalle</div>
          {/* `pre-wrap`: el texto se cargó con saltos de línea y sin esto sale todo pegado. */}
          <p style={{ fontSize: 13, color: 'var(--t2)', whiteSpace: 'pre-wrap', margin: '0 0 1.25rem' }}>
            {documento.detalle}
          </p>
        </>
      )}

      {/* El link externo del documento (Drive, otro sistema). Se abre en pestaña nueva. */}
      {documento.url && (
        <>
          <div className="drawer-section-title">Link</div>
          <div style={{ marginBottom: '1.25rem' }}>
            <a
              className="btn btn-sm btn-secondary"
              href={documento.url}
              target="_blank"
              // `noreferrer` además de `noopener`: el destino es una URL que cargó otra
              // persona y no tiene por qué recibir de dónde viene.
              rel="noopener noreferrer"
            >
              <IcoLink /> Abrir el link
            </a>
            <p className="form-hint" style={{ marginTop: 5, wordBreak: 'break-all' }}>{documento.url}</p>
          </div>
        </>
      )}

      {/* ── Archivos y vista previa ── */}
      <div className="drawer-section-title">
        Archivos {archivos.length > 0 && <span style={{ fontWeight: 400, color: 'var(--t3)' }}>· {archivos.length}</span>}
      </div>

      {archivos.length === 0 ? (
        <p className="form-hint" style={{ marginBottom: '1.25rem' }}>
          No tiene archivos. Se agregan desde Editar.
        </p>
      ) : (
        <div style={{ marginBottom: '1.25rem' }}>
          {/* Los archivos como pestañas cuando hay más de uno: es lo que permite pasar de
              uno a otro sin perder de vista que son del mismo documento. */}
          {archivos.length > 1 && (
            <div className="doc-tabs" role="tablist" aria-label="Archivos del documento">
              {archivos.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={viendo?.id === a.id}
                  className={`doc-tab${viendo?.id === a.id ? ' activa' : ''}`}
                  onClick={() => setVerId(a.id)}
                  title={nombreDeArchivo(a, i)}
                >
                  {nombreDeArchivo(a, i)}
                </button>
              ))}
            </div>
          )}

          <Preview documento={documento} archivo={viendo} />

          {viendo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nombreDeArchivo(viendo)}
              </span>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => bajar(viendo)}>
                <IcoBajar /> Descargar
              </button>
              {seVeEnPantalla(viendo.tipo) && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={async () => {
                    // Pestaña nueva para verlo grande: el panel es angosto y un plano o un
                    // PDF de varias páginas ahí adentro no se lee.
                    try {
                      const { data } = await documentosApi.verArchivo(documento.id, viendo.id)
                      const url = URL.createObjectURL(data)
                      window.open(url, '_blank', 'noopener')
                      setTimeout(() => URL.revokeObjectURL(url), 60000)
                    } catch {
                      notify('No se pudo abrir el archivo', 'error')
                    }
                  }}
                >
                  Ver grande
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Compartir sin login ── */}
      <div className="drawer-section-title">Compartir sin login</div>
      <p className="form-hint" style={{ marginBottom: 8 }}>
        Un link que abre este documento sin pedir usuario, para mandárselo a alguien de
        afuera. Cualquiera con el link entra.
      </p>
      {linkVisible && (
        <div className="form-input-wrap" style={{ marginBottom: 8 }}>
          <input readOnly value={linkVisible} onFocus={e => e.target.select()} style={{ fontSize: 11.5 }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-secondary" onClick={generarLink}>
          {documento.tiene_link ? 'Ver / copiar el link' : 'Generar link'}
        </button>
        {documento.tiene_link && (
          <button type="button" className="btn btn-sm btn-danger" onClick={revocarLink}>
            Anular el link
          </button>
        )}
      </div>

      <div className="form-actions" style={{ marginTop: '1.75rem' }}>
        <button type="button" className="btn btn-primary" onClick={onEditar}>Editar</button>
        <button type="button" className="btn btn-danger" onClick={onBorrar} style={{ marginLeft: 'auto' }}>
          Borrar
        </button>
      </div>
    </div>
  )
}
