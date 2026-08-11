// Los archivos de un documento: subir, ver y borrar.
//
// Un documento puede tener varios (el PDF de la habilitación más tres fotos del
// certificado), así que esto es una lista y no un campo.
//
// Los archivos se traen como blob y se abren con un object URL: un `<a href>` no puede
// mandar el header de autorización, así que el navegador recibiría un 401.

import { useRef, useState } from 'react'
import { documentosApi } from '../../api/documentos.js'
import { useUiStore } from '../../store/uiStore.js'
import { ACEPTA, nombreDeArchivo, seVeEnPantalla } from '../../lib/documentos.js'

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

// 20 MB, el límite del backend. Se chequea acá para no hacerle esperar una subida que va
// a fallar.
const MAX_BYTES = 20 * 1024 * 1024

const pesoLegible = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ArchivosDocumento({ documento, onCambio }) {
  const notify = useUiStore(s => s.notify)
  const showConfirm = useUiStore(s => s.showConfirm)
  const inputRef = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  // Cuántos van de cuántos: subir cinco fotos sin saber en cuál va es angustiante.
  const [progreso, setProgreso] = useState(null)

  const archivos = documento?.archivos ?? []

  const refrescar = async () => {
    try {
      const { data } = await documentosApi.get(documento.id)
      onCambio?.(data)
    } catch {
      // Si falla el refresco no se pierde nada: el archivo ya se subió.
    }
  }

  const elegir = async (e) => {
    const files = [...(e.target.files ?? [])]
    // El input se limpia siempre: sin esto, elegir el MISMO archivo dos veces seguidas no
    // dispara el evento y parece que la app se colgó.
    e.target.value = ''
    if (!files.length) return

    const grandes = files.filter(f => f.size > MAX_BYTES)
    if (grandes.length) {
      notify(
        `${grandes.map(f => f.name).join(', ')}: pasa${grandes.length > 1 ? 'n' : ''} los 20 MB`,
        'error'
      )
      if (grandes.length === files.length) return
    }
    const aSubir = files.filter(f => f.size <= MAX_BYTES)

    setSubiendo(true)
    const subidos = []
    const fallados = []
    for (let i = 0; i < aSubir.length; i++) {
      setProgreso({ actual: i + 1, total: aSubir.length, nombre: aSubir[i].name })
      try {
        const { data } = await documentosApi.subir(aSubir[i], { id_local: documento.id_local })
        subidos.push({
          gs_path: data.gs_path, tipo: data.tipo, nombre_original: data.nombre_original,
        })
      } catch (err) {
        fallados.push(`${aSubir[i].name}: ${err.response?.data?.error ?? 'error al subir'}`)
      }
    }

    // Se guardan los que sí subieron aunque alguno haya fallado: perder cuatro archivos
    // porque el quinto falló obliga a empezar de nuevo.
    if (subidos.length) {
      try {
        await documentosApi.agregarArchivos(documento.id, subidos)
        notify(`${subidos.length} archivo${subidos.length > 1 ? 's' : ''} agregado${subidos.length > 1 ? 's' : ''}`, 'success')
        await refrescar()
      } catch (err) {
        notify(err.response?.data?.error || 'Se subieron pero no se pudieron guardar', 'error')
      }
    }
    if (fallados.length) notify(fallados.join(' · '), 'error')

    setProgreso(null)
    setSubiendo(false)
  }

  const abrir = async (archivo, { descargar } = {}) => {
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
      // El object URL se suelta después de que el navegador lo usó. Revocarlo al toque
      // deja la pestaña nueva en blanco.
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo abrir el archivo', 'error')
    }
  }

  const borrar = async (archivo) => {
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
      {archivos.length === 0 ? (
        <p className="form-hint" style={{ marginBottom: 10 }}>
          Todavía no hay archivos. Podés subir varios: PDF, fotos, Word o Excel.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {archivos.map((a, i) => (
            <li
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0.5rem 0.6rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--glass-border)',
                borderRadius: 8,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nombreDeArchivo(a, i)}
              </span>
              {/* Un .docx no se puede mostrar en el navegador: ofrecer "Ver" y que se
                  baje igual confunde, así que dice lo que va a pasar. */}
              {seVeEnPantalla(a.tipo) ? (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => abrir(a)}>
                  <IcoOjo /> Ver
                </button>
              ) : (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => abrir(a, { descargar: true })}>
                  <IcoBajar /> Descargar
                </button>
              )}
              {seVeEnPantalla(a.tipo) && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => abrir(a, { descargar: true })}
                  title="Descargar"
                  aria-label={`Descargar ${nombreDeArchivo(a, i)}`}
                >
                  <IcoBajar />
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => borrar(a)}
                aria-label={`Borrar ${nombreDeArchivo(a, i)}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACEPTA}
        onChange={elegir}
        className="sr-only"
        id={`archivos-${documento.id}`}
        disabled={subiendo}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
        >
          {subiendo ? 'Subiendo…' : archivos.length ? 'Agregar más archivos' : 'Subir archivos'}
        </button>
        {progreso && (
          <span style={{ fontSize: 11.5, color: 'var(--t3)' }} aria-live="polite">
            {progreso.actual} de {progreso.total}: {progreso.nombre}
          </span>
        )}
      </div>
      <p className="form-hint" style={{ marginTop: 6 }}>
        PDF, fotos, Word, Excel o CSV. Hasta {pesoLegible(MAX_BYTES)} cada uno.
      </p>
    </div>
  )
}
