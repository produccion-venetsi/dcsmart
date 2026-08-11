// Los archivos de un documento: elegir, subir, ver y borrar.
//
// Sirve para los dos momentos, y esa es la razón de que exista:
//
//   - documento ya guardado (`documento`): cada archivo se sube y se adjunta al toque.
//   - documento todavía sin guardar (`pendientes` + `onPendientes`): los archivos se suben
//     al bucket igual (para eso no hace falta el documento) y quedan en la lista hasta que
//     el POST los adjunta. Antes había que guardar primero y volver a entrar para
//     adjuntar, que es lo que hacía que el panel quedara abierto en el medio.
//
// Se puede arrastrar los archivos encima o hacer clic en cualquier parte de la zona: un
// botón chico con un input escondido detrás es lo menos descubrible que hay.

import { useId, useRef, useState } from 'react'
import { documentosApi } from '../../api/documentos.js'
import { useUiStore } from '../../store/uiStore.js'
import {
  ACEPTA, MAX_BYTES, pesoLegible, revisarElegidos, motivoRechazo,
  nombreDeArchivo, seVeEnPantalla, nuevoPendiente, esPendiente,
} from '../../lib/documentos.js'

function IcoSubir() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function IcoOjo() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
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

export default function ArchivosDocumento({
  documento,            // el documento guardado, o null si todavía no existe
  pendientes = [],      // archivos subidos que esperan el POST
  onPendientes,         // (nuevaLista) => void
  idLocal,              // para la carpeta del bucket cuando no hay documento
  onCambio,             // (documentoActualizado) => void
  onVer,                // (archivo) => void, para abrir la vista previa del detalle
}) {
  const notify = useUiStore(s => s.notify)
  const showConfirm = useUiStore(s => s.showConfirm)
  const inputRef = useRef(null)
  const idInput = useId()

  const [subiendo, setSubiendo] = useState(false)
  // Cuántos van de cuántos: subir cinco fotos sin saber en cuál va es angustiante.
  const [progreso, setProgreso] = useState(null)
  const [arrastrando, setArrastrando] = useState(false)

  const guardado = Boolean(documento?.id)
  const archivos = guardado ? (documento.archivos ?? []) : pendientes

  const refrescar = async () => {
    try {
      const { data } = await documentosApi.get(documento.id)
      onCambio?.(data)
    } catch {
      // Si falla el refresco no se pierde nada: el archivo ya se subió.
    }
  }

  const subir = async (files) => {
    const revisado = revisarElegidos(files)
    const motivo = motivoRechazo(revisado)
    if (motivo) notify(motivo, 'error')
    if (!revisado.ok.length) return

    setSubiendo(true)
    const subidos = []
    const fallados = []
    for (let i = 0; i < revisado.ok.length; i++) {
      const file = revisado.ok[i]
      setProgreso({ actual: i + 1, total: revisado.ok.length, nombre: file.name })
      try {
        const { data } = await documentosApi.subir(file, { id_local: documento?.id_local ?? idLocal })
        subidos.push({ gs_path: data.gs_path, tipo: data.tipo, nombre_original: data.nombre_original })
      } catch (err) {
        fallados.push(`${file.name}: ${err.response?.data?.error ?? 'error al subir'}`)
      }
    }

    // Se conservan los que sí subieron aunque alguno haya fallado: perder cuatro archivos
    // porque el quinto falló obliga a empezar todo de nuevo.
    if (subidos.length) {
      if (guardado) {
        try {
          await documentosApi.agregarArchivos(documento.id, subidos)
          notify(`${subidos.length} archivo${subidos.length > 1 ? 's' : ''} agregado${subidos.length > 1 ? 's' : ''}`, 'success')
          await refrescar()
        } catch (err) {
          notify(err.response?.data?.error || 'Se subieron pero no se pudieron guardar', 'error')
        }
      } else {
        // Todavía no hay documento: quedan en la lista y se adjuntan al guardarlo.
        onPendientes?.([
          ...pendientes,
          ...subidos.map((s, i) => nuevoPendiente(s, pendientes.length + i)),
        ])
      }
    }
    if (fallados.length) notify(fallados.join(' · '), 'error')

    setProgreso(null)
    setSubiendo(false)
  }

  const elegir = (e) => {
    const files = [...(e.target.files ?? [])]
    // El input se limpia siempre: sin esto, elegir el MISMO archivo dos veces seguidas no
    // dispara el evento y parece que la app se colgó.
    e.target.value = ''
    if (files.length) subir(files)
  }

  const soltar = (e) => {
    e.preventDefault()
    setArrastrando(false)
    const files = [...(e.dataTransfer?.files ?? [])]
    if (files.length) subir(files)
  }

  const abrir = async (archivo, { descargar } = {}) => {
    // Un pendiente todavía no tiene fila en la base, así que no se puede pedir por id. Se
    // dice en vez de tirar un 404 sin explicación.
    if (esPendiente(archivo)) {
      notify('Guardá el documento para poder abrir este archivo', 'error')
      return
    }
    // En el detalle, "ver" abre la vista previa de al lado en vez de una pestaña nueva.
    if (!descargar && onVer && seVeEnPantalla(archivo.tipo)) {
      onVer(archivo)
      return
    }
    try {
      const { data } = await documentosApi.verArchivo(documento.id, archivo.id, { descargar })
      const url = URL.createObjectURL(data)
      if (descargar) {
        const a = document.createElement('a')
        a.href = url
        a.download = nombreDeArchivo(archivo)
        a.click()
      } else {
        window.open(url, '_blank', 'noopener')
      }
      // Se suelta después de que el navegador lo usó: revocarlo al toque deja la pestaña
      // nueva en blanco.
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo abrir el archivo', 'error')
    }
  }

  const borrar = async (archivo) => {
    // Sacar uno que todavía no se guardó no necesita confirmación: no se pierde nada que
    // no esté a un clic de volver a elegirse.
    if (esPendiente(archivo)) {
      onPendientes?.(pendientes.filter(p => p.id !== archivo.id))
      return
    }
    if (!(await showConfirm(`¿Borrar "${nombreDeArchivo(archivo)}"? No se puede deshacer.`))) return
    try {
      await documentosApi.borrarArchivo(documento.id, archivo.id)
      notify('Archivo borrado', 'success')
      await refrescar()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al borrar el archivo', 'error')
    }
  }

  return (
    <div>
      {archivos.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {archivos.map((a, i) => (
            <li key={a.id} className="doc-archivo">
              <span className="doc-archivo-nombre">{nombreDeArchivo(a, i)}</span>
              {esPendiente(a) && (
                <span className="badge badge-muted" title="Se adjunta al guardar el documento">
                  sin guardar
                </span>
              )}
              {/* Un .docx no se puede mostrar en el navegador: ofrecer "Ver" y que se baje
                  igual confunde, así que el botón dice lo que va a pasar. */}
              {seVeEnPantalla(a.tipo) ? (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => abrir(a)}>
                  <IcoOjo /> Ver
                </button>
              ) : (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => abrir(a, { descargar: true })}>
                  <IcoBajar /> Descargar
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => borrar(a)}
                aria-label={`Quitar ${nombreDeArchivo(a, i)}`}
                title={esPendiente(a) ? 'Quitar' : 'Borrar'}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* La zona entera es el control: se puede arrastrar encima o hacer clic en cualquier
          parte. Es un <label> del input, así que el clic y el teclado funcionan sin
          JavaScript de más. */}
      <label
        htmlFor={idInput}
        className={`doc-dropzone${arrastrando ? ' arrastrando' : ''}${subiendo ? ' ocupada' : ''}`}
        onDragOver={e => { e.preventDefault(); if (!subiendo) setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
      >
        <input
          ref={inputRef}
          id={idInput}
          type="file"
          multiple
          accept={ACEPTA}
          onChange={elegir}
          className="sr-only"
          disabled={subiendo}
        />
        <span className="doc-dropzone-ico"><IcoSubir /></span>
        {subiendo ? (
          <>
            <strong>Subiendo…</strong>
            {progreso && (
              <span className="doc-dropzone-sub" aria-live="polite">
                {progreso.actual} de {progreso.total}: {progreso.nombre}
              </span>
            )}
          </>
        ) : (
          <>
            <strong>
              {arrastrando
                ? 'Soltá los archivos acá'
                : archivos.length ? 'Agregar más archivos' : 'Arrastrá los archivos o hacé clic acá'}
            </strong>
            <span className="doc-dropzone-sub">
              PDF, fotos, Word, Excel o CSV · hasta {pesoLegible(MAX_BYTES)} cada uno · varios a la vez
            </span>
          </>
        )}
      </label>

      {!guardado && pendientes.length > 0 && (
        <p className="form-hint" style={{ marginTop: 6 }}>
          Se adjuntan al guardar el documento.
        </p>
      )}
    </div>
  )
}
