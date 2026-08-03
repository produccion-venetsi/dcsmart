import { useRef, useState } from 'react'

// Botón "Carga con IA": se elige una factura (foto o PDF), se leen sus datos y
// se precarga el formulario. El archivo NO se descarta — queda adjunto al pago
// en el slot que le corresponde (una foto en Foto, un PDF en PDF), así que con
// una sola acción se carga el pago y se guarda el comprobante.
//
// Es un componente aparte de AdjuntoUpload a propósito: aquel es un dropzone
// neutro para guardar un archivo, este dispara un proceso y por eso se ve y se
// comporta distinto (destacado, con su estado de "leyendo" y su aclaración de
// que sirve solo para facturas).

function IcoSparkles() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
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
function IcoFile() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

// Lo que el <input> acepta. El PDF se nombra por extensión y por mime porque
// hay Android que manda el archivo sin mimetype y con solo uno de los dos el
// selector lo mostraba en gris.
const ACEPTA = 'image/*,.pdf,application/pdf'

export default function CargaIA({ onArchivo, leyendo, disabled }) {
  const fileRef = useRef(null)
  const camRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const bloqueado = leyendo || disabled

  const elegir = (files) => {
    const f = files?.[0]
    setMenuOpen(false)
    if (f) onArchivo(f)
  }

  return (
    <div className="carga-ia" style={{ position: 'relative' }}>
      <input
        ref={fileRef}
        type="file"
        accept={ACEPTA}
        style={{ display: 'none' }}
        onChange={(e) => { elegir(e.target.files); e.target.value = '' }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => { elegir(e.target.files); e.target.value = '' }}
      />

      <button
        type="button"
        className={`btn-ia${dragOver ? ' drag-over' : ''}`}
        disabled={bloqueado}
        onClick={() => setMenuOpen((v) => !v)}
        onDragOver={(e) => { if (!bloqueado) { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { if (bloqueado) return; e.preventDefault(); setDragOver(false); elegir(e.dataTransfer.files) }}
      >
        {leyendo
          ? <><span className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Leyendo la factura...</>
          : <><IcoSparkles /> Carga con IA</>}
      </button>

      <div className="carga-ia-sub">
        Solo para <strong>facturas</strong>: subí la foto o el PDF y se completan los campos solos.
        El archivo queda adjunto al pago.
      </div>

      {menuOpen && !bloqueado && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setMenuOpen(false)} />
          <div className="adjunto-picker-menu carga-ia-menu">
            <button type="button" onClick={() => camRef.current?.click()}>
              <IcoCamera /> Tomar foto de la factura
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              <IcoFile /> Elegir foto o PDF
            </button>
          </div>
        </>
      )}
    </div>
  )
}
