import { Children, useEffect, useRef, useState } from 'react'

function IcoChevronDown() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

export default function ActionsMenu({ label = 'Acciones', children }) {
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

  // El panel se renderiza en el flujo normal (no position:absolute) para que
  // el wrapper con los handlers de hover abarque tanto el botón como el panel
  // abierto -- si el panel flotara fuera del flujo, el área "hovereable" del
  // wrapper solo cubriría al botón, y bajar el mouse hacia el panel dispararía
  // mouseleave antes de llegar, cerrándolo de golpe.
  const hoverProps = hoverCapable
    ? { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) }
    : {}

  // Los llamadores arman children con `{cond && <button>...}` -- si ningun
  // permiso habilita ninguna accion, children queda lleno de `false`/`null`.
  // Sin este filtro, el boton se mostraba igual y abria un panel vacio.
  const visibleChildren = Children.toArray(children).filter(Boolean)
  if (visibleChildren.length === 0) return null

  return (
    <div ref={wrapRef} {...hoverProps}>
      <button
        type="button"
        className={`btn btn-secondary${open ? ' active' : ''}`}
        onClick={() => { if (!hoverCapable) setOpen(o => !o) }}
      >
        {label} <IcoChevronDown />
      </button>
      {open && (
        <div className="actions-menu-panel">
          {visibleChildren}
        </div>
      )}
    </div>
  )
}
