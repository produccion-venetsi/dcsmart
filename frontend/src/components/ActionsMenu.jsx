import { useEffect, useRef, useState } from 'react'

function IcoChevronDown() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

export default function ActionsMenu({ label = 'Acciones', align = 'left', children }) {
  const [open, setOpen] = useState(false)
  const [hoverCapable, setHoverCapable] = useState(true)
  const wrapRef = useRef(null)

  useEffect(() => {
    setHoverCapable(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  useEffect(() => {
    if (hoverCapable || !open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [hoverCapable, open])

  const hoverProps = hoverCapable
    ? { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) }
    : {}

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }} {...hoverProps}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => { if (!hoverCapable) setOpen(o => !o) }}
      >
        {label} <IcoChevronDown />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, zIndex: 200,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '0.6rem', minWidth: 200,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: '0.4rem',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}
