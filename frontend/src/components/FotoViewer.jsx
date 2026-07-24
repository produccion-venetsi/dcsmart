import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import client from '../api/client'

// ── Icons ──────────────────────────────────────────────────────────────────

function IcoExpand() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function IcoPdf() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" /><line x1="9" y1="11" x2="15" y2="11" />
    </svg>
  )
}

function IcoClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ── Image lightbox with zoom + pan ─────────────────────────────────────────

const MIN_SCALE = 0.25
const MAX_SCALE = 10
const ZOOM_STEP = 1.25

function clampScale(s) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)) }

function ImageLightbox({ src, onClose }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef(null)
  const dragOrigin   = useRef(null)   // { startX, startY, originX, originY }
  const pinchRef     = useRef(null)   // last pinch distance + midpoint

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), [])

  // ── Non-passive wheel → zoom toward cursor ───────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      setView((prev) => {
        const ns = clampScale(prev.scale * factor)
        // Keep the point under the cursor fixed
        const cx = e.clientX - window.innerWidth  / 2
        const cy = e.clientY - window.innerHeight / 2
        const ratio = ns / prev.scale
        return { scale: ns, x: cx * (1 - ratio) + prev.x * ratio, y: cy * (1 - ratio) + prev.y * ratio }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === '0')          reset()
      if (e.key === '+' || e.key === '=') setView(v => ({ ...v, scale: clampScale(v.scale * ZOOM_STEP) }))
      if (e.key === '-')          setView(v => ({ ...v, scale: clampScale(v.scale / ZOOM_STEP) }))
      // Arrow keys pan when zoomed
      const PAN = 40 / (view.scale || 1)
      if (e.key === 'ArrowLeft')  setView(v => ({ ...v, x: v.x + PAN }))
      if (e.key === 'ArrowRight') setView(v => ({ ...v, x: v.x - PAN }))
      if (e.key === 'ArrowUp')    setView(v => ({ ...v, y: v.y + PAN }))
      if (e.key === 'ArrowDown')  setView(v => ({ ...v, y: v.y - PAN }))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, reset, view.scale])

  // ── Mouse drag ────────────────────────────────────────────────────────────
  const onMouseDown = (e) => {
    e.preventDefault()
    setDragging(true)
    dragOrigin.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
  }
  const onMouseMove = useCallback((e) => {
    if (!dragOrigin.current) return
    const { sx, sy, ox, oy } = dragOrigin.current
    setView(v => ({ ...v, x: ox + (e.clientX - sx), y: oy + (e.clientY - sy) }))
  }, [])
  const onMouseUp = useCallback(() => { setDragging(false); dragOrigin.current = null }, [])

  // ── Double-click: zoom-in on point / reset ────────────────────────────────
  const onDblClick = (e) => {
    if (view.scale > 1.1) {
      reset()
    } else {
      const ns = 2.5
      const cx = e.clientX - window.innerWidth  / 2
      const cy = e.clientY - window.innerHeight / 2
      setView({ scale: ns, x: cx * (1 - ns), y: cy * (1 - ns) })
    }
  }

  // ── Touch: single-finger drag + two-finger pinch ──────────────────────────
  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      dragOrigin.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, ox: view.x, oy: view.y }
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2
      pinchRef.current = { dist, mx, my }
    }
  }

  const onTouchMove = (e) => {
    e.preventDefault()
    if (e.touches.length === 1 && dragOrigin.current) {
      const { sx, sy, ox, oy } = dragOrigin.current
      setView(v => ({ ...v, x: ox + (e.touches[0].clientX - sx), y: oy + (e.touches[0].clientY - sy) }))
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      const factor = dist / pinchRef.current.dist
      const { mx, my } = pinchRef.current
      pinchRef.current = { dist, mx, my }
      setView((prev) => {
        const ns = clampScale(prev.scale * factor)
        const cx = mx - window.innerWidth  / 2
        const cy = my - window.innerHeight / 2
        const ratio = ns / prev.scale
        return { scale: ns, x: cx * (1 - ratio) + prev.x * ratio, y: cy * (1 - ratio) + prev.y * ratio }
      })
    }
  }

  const onTouchEnd = () => { dragOrigin.current = null; pinchRef.current = null; setDragging(false) }

  // ── Zoom button helpers ───────────────────────────────────────────────────
  const zoomIn  = (e) => { e.stopPropagation(); setView(v => ({ ...v, scale: clampScale(v.scale * ZOOM_STEP) })) }
  const zoomOut = (e) => { e.stopPropagation(); setView(v => ({ ...v, scale: clampScale(v.scale / ZOOM_STEP) })) }
  const doReset = (e) => { e.stopPropagation(); reset() }

  const btnStyle = {
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff', borderRadius: 8, cursor: 'pointer', userSelect: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, fontSize: 18, padding: 0,
    transition: 'background 0.15s',
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        overflow: 'hidden',
        cursor: dragging ? 'grabbing' : view.scale > 1 ? 'grab' : 'zoom-in',
        userSelect: 'none', touchAction: 'none',
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Close ── */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        style={{ ...btnStyle, position: 'absolute', top: 16, right: 20, zIndex: 10 }}
      >
        <IcoClose />
      </button>

      {/* ── Image ── */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <img
          src={src}
          alt="Foto factura"
          draggable={false}
          onDoubleClick={onDblClick}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: 'center center',
            maxWidth: '90vw', maxHeight: '90vh',
            borderRadius: view.scale <= 1 ? 12 : 4,
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            pointerEvents: 'auto',
            willChange: 'transform',
          }}
        />
      </div>

      {/* ── Zoom controls ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8, zIndex: 10,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          borderRadius: 12, padding: '6px 10px',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <button style={btnStyle} onClick={zoomOut} title="Alejar (-)">−</button>

        <button
          style={{ ...btnStyle, width: 56, fontSize: 12, fontWeight: 600, letterSpacing: '0.03em' }}
          onClick={doReset}
          title="Restablecer (0)"
        >
          {Math.round(view.scale * 100)}%
        </button>

        <button style={btnStyle} onClick={zoomIn} title="Acercar (+)">+</button>
      </div>

      {/* ── Hint (only at 1×) ── */}
      {view.scale === 1 && (
        <div style={{
          position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          Rueda para hacer zoom · Doble clic para ampliar · Arrastrá para mover
        </div>
      )}
    </div>
  )
}

// ── Simple overlay for PDF ─────────────────────────────────────────────────

function PdfLightbox({ children, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 20,
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, padding: 0,
        }}
      >
        <IcoClose />
      </button>
      <div onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

// ── Panel lateral (portal a la izquierda del drawer) ──────────────────────

function MediaPanel({ type, photoBlob, pdfBlob, loadingPdf, errorPhoto, drawerWidth, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Contenedor invisible que ocupa el espacio a la izquierda del drawer,
  // sin backdrop — el drawer sigue visible e interactuable detrás.
  return createPortal(
    <div className="media-panel-frame" style={{
      position: 'fixed', top: 0, left: 0, bottom: 0,
      right: drawerWidth,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 1012,
    }}>
      <div style={{
        pointerEvents: 'auto',
        width: type === 'pdf' ? 'min(680px, 90%)' : 'min(520px, 90%)',
        height: type === 'pdf' ? '85vh' : 'auto',
        maxHeight: '90vh',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>
            {type === 'pdf' ? 'PDF' : 'Foto'}
          </span>
          <button className="drawer-close" onClick={onClose} type="button">
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Centrado con margin:auto en el hijo, NO con align/justify center en
            el contenedor: centrar un contenedor con overflow recorta la parte
            superior de una imagen más alta que el panel y la deja inaccesible
            incluso con scroll (bug clásico de flexbox). */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', padding: '1rem' }}>
          {type === 'photo' && (
            <>
              {photoBlob
                ? <img src={photoBlob} alt="Foto factura" style={{ maxWidth: '100%', margin: 'auto', display: 'block', borderRadius: 8 }} />
                : errorPhoto
                  ? <span style={{ color: 'var(--t2)', fontSize: 13, margin: 'auto' }}>No disponible</span>
                  : <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: 'auto' }} />
              }
            </>
          )}
          {type === 'pdf' && (
            <>
              {loadingPdf
                ? <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: 'auto' }} />
                : pdfBlob
                  ? <iframe src={pdfBlob} title="PDF" style={{ width: '100%', height: '100%', border: 'none' }} />
                  : <span style={{ color: 'var(--t2)', fontSize: 13, margin: 'auto' }}>No se pudo cargar el PDF.</span>
              }
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function FotoViewer({ pagoId, fotoUrl, pdfUrl, drawerWidth = 560, entity = 'pagos', compact = false }) {
  const [photoBlob,    setPhotoBlob]    = useState(null)
  const [pdfBlob,      setPdfBlob]      = useState(null)
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [loadingPdf,   setLoadingPdf]   = useState(false)
  const [errorPhoto,   setErrorPhoto]   = useState(false)
  const [panel,        setPanel]        = useState(null) // null | 'photo' | 'pdf'

  useEffect(() => () => { photoBlob && URL.revokeObjectURL(photoBlob) }, [photoBlob])
  useEffect(() => () => { pdfBlob   && URL.revokeObjectURL(pdfBlob)   }, [pdfBlob])

  // Cerrar panel al desmontar
  useEffect(() => () => setPanel(null), [])

  // Fotos y PDFs se traen bajo demanda (al abrir el panel), no al montar --
  // este componente puede vivir en cada fila de una tabla, y traer todos los
  // adjuntos de golpe sería costosísimo.
  const openPhoto = useCallback(async () => {
    setPanel('photo')
    if (photoBlob || loadingPhoto) return
    setLoadingPhoto(true)
    setErrorPhoto(false)
    try {
      const res = await client.get(`/${entity}/${pagoId}/attachment?type=foto`, { responseType: 'blob' })
      setPhotoBlob(URL.createObjectURL(res.data))
    } catch { setErrorPhoto(true) }
    finally { setLoadingPhoto(false) }
  }, [pagoId, photoBlob, loadingPhoto, entity])

  const openPdf = useCallback(async () => {
    setPanel('pdf')
    if (pdfBlob || loadingPdf) return
    setLoadingPdf(true)
    try {
      const res = await client.get(`/${entity}/${pagoId}/attachment?type=pdf`, { responseType: 'blob' })
      setPdfBlob(URL.createObjectURL(res.data))
    } catch {}
    finally { setLoadingPdf(false) }
  }, [pagoId, pdfBlob, loadingPdf, entity])

  if (!fotoUrl && !pdfUrl) return null

  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {fotoUrl && (
          <button
            className={`btn btn-sm ${panel === 'photo' ? 'btn-primary' : 'btn-secondary'}${compact ? ' btn-icon' : ''}`}
            onClick={() => panel === 'photo' ? setPanel(null) : openPhoto()}
            disabled={!photoBlob && loadingPhoto}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            title="Foto"
          >
            {loadingPhoto
              ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
              : <IcoExpand />}
            {!compact && 'Foto'}
          </button>
        )}
        {pdfUrl && (
          <button
            className={`btn btn-sm ${panel === 'pdf' ? 'btn-primary' : 'btn-secondary'}${compact ? ' btn-icon' : ''}`}
            onClick={() => panel === 'pdf' ? setPanel(null) : openPdf()}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            title="PDF"
          >
            {loadingPdf
              ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
              : <IcoPdf />}
            {!compact && 'PDF'}
          </button>
        )}
      </div>

      {panel && (
        <MediaPanel
          type={panel}
          photoBlob={photoBlob}
          pdfBlob={pdfBlob}
          loadingPdf={loadingPdf}
          errorPhoto={errorPhoto}
          drawerWidth={drawerWidth}
          onClose={() => setPanel(null)}
        />
      )}
    </>
  )
}
