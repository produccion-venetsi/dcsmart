import { useEffect, useRef, useState } from 'react'

function IcoUpload() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}
function IcoPdfFile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
function IcoX() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IcoCamera() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
function IcoImages() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

function fmtSize(bytes) {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Dropzone reutilizable para un adjunto (imagen o PDF). Sin lógica de negocio:
// el caller decide cuándo subir el archivo (normalmente al enviar el form) y
// qué guardar como url final.
//
// - label: texto del campo ("Foto", "PDF")
// - accept: mismo valor que el atributo `accept` de <input type="file">
// - value: url ya guardada (edición) | null/undefined
// - file: File recién elegido, aún sin subir (creación/reemplazo) | null
// - onFileSelected(file): se llama al elegir o soltar un archivo nuevo
// - onRemove(): se llama al quitar el archivo actual (value o file)
// - uploading: true mientras se está subiendo (deshabilita quitar/reemplazar)
export default function AdjuntoUpload({ label, accept, value, file, onFileSelected, onRemove, uploading }) {
  const inputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const hasContent = Boolean(file || value)
  const isImage = file ? file.type.startsWith('image/') : Boolean(accept?.includes('image'))

  const [fileBlobUrl, setFileBlobUrl] = useState(null)

  useEffect(() => {
    if (!file) { setFileBlobUrl(null); return }
    const url = URL.createObjectURL(file)
    setFileBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const previewSrc = file
    ? fileBlobUrl
    : (isImage && value && !value.startsWith('gs://') ? value : null)
  const displayName = file ? file.name : value?.split('/').pop()

  const openGallery = () => inputRef.current?.click()
  const openCamera  = () => cameraInputRef.current?.click()

  const handleFiles = (files) => {
    const f = files?.[0]
    if (f) onFileSelected(f)
    setMenuOpen(false)
  }

  const openPicker = () => {
    if (isImage) setMenuOpen(true)
    else openGallery()
  }

  return (
    <div className="form-group" style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {isImage && (
        <input
          ref={cameraInputRef}
          type="file"
          accept={accept}
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      )}
      {!hasContent ? (
        <div
          className={`adjunto-dropzone${dragOver ? ' drag-over' : ''}`}
          onClick={openPicker}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        >
          <IcoUpload />
          <div className="adjunto-dropzone-main">Arrastrá un archivo o hacé click</div>
          <div className="adjunto-dropzone-sub">{accept?.includes('pdf') ? 'JPG, PNG o PDF' : 'JPG, PNG'}</div>
        </div>
      ) : (
        <div className="adjunto-filled">
          <div className="adjunto-thumb">
            {isImage && previewSrc ? <img src={previewSrc} alt={label} /> : <IcoPdfFile />}
          </div>
          <div className="adjunto-info">
            <div className="adjunto-name">{displayName}</div>
            {file && <div className="adjunto-sub">{fmtSize(file.size)}</div>}
          </div>
          {uploading ? (
            <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
          ) : (
            <button type="button" className="adjunto-remove" onClick={onRemove} title="Quitar archivo">
              <IcoX />
            </button>
          )}
        </div>
      )}
      {hasContent && !uploading && (
        <span className="adjunto-replace" onClick={openPicker}>Reemplazar archivo</span>
      )}
      {menuOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="adjunto-picker-menu"
            style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 11,
              background: 'var(--bg2, #1e1e24)', border: '1px solid var(--border, #333)',
              borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              minWidth: 200,
            }}
          >
            <button
              type="button"
              onClick={openCamera}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
            >
              <IcoCamera /> Tomar foto
            </button>
            <button
              type="button"
              onClick={openGallery}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit', borderTop: '1px solid var(--border, #333)' }}
            >
              <IcoImages /> Elegir de galería
            </button>
          </div>
        </>
      )}
    </div>
  )
}
