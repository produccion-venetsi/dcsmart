import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function IcoClose() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

export default function DrawerPanel({ open, onClose, title, children, width = 540 }) {
  const closeRef   = useRef(onClose)
  closeRef.current = onClose

  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      document.body.style.overflow = 'hidden'
      const main = document.querySelector('.app-main')
      if (main) main.style.overflow = 'hidden'
    } else {
      const t = setTimeout(() => setMounted(false), 320)
      document.body.style.overflow = ''
      const main = document.querySelector('.app-main')
      if (main) main.style.overflow = ''
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  return createPortal(
    <>
      <div
        className={'drawer-backdrop' + (open ? ' open' : '')}
        onClick={onClose}
      />
      <div
        className={'drawer-panel' + (open ? ' open' : '')}
        style={{ width }}
      >
        <div className="drawer-header">
          <span className="drawer-title">{title}</span>
          <button className="drawer-close" onClick={onClose} type="button">
            <IcoClose />
          </button>
        </div>
        <div className="drawer-body">
          {mounted && children}
        </div>
      </div>
    </>,
    document.body
  )
}
