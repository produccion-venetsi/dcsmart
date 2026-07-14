import { Children, useEffect, useRef, useState } from 'react'

function IcoChevronDown() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

// `openOnClick`: variante que abre/cierra por click (no hover) y flota el
// panel en position:absolute en vez de empujar el contenido de abajo. Pensado
// para menús dentro de una fila de botones (page-actions) donde el modo hover
// original -- que empuja el layout para que el mouse pueda "bajar" hasta el
// panel sin perderlo -- rompe el responsive (el panel en flujo normal hace
// saltar todo lo de abajo al abrirse/cerrarse).
export default function ActionsMenu({ label = 'Acciones', children, openOnClick = false }) {
  const [open, setOpen] = useState(false)
  const [hoverCapable, setHoverCapable] = useState(true)
  const wrapRef = useRef(null)

  useEffect(() => {
    setHoverCapable(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  const useClick = openOnClick || !hoverCapable

  useEffect(() => {
    if (!useClick || !open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [useClick, open])

  // El panel se renderiza en el flujo normal (no position:absolute) para que
  // el wrapper con los handlers de hover abarque tanto el botón como el panel
  // abierto -- si el panel flotara fuera del flujo, el área "hovereable" del
  // wrapper solo cubriría al botón, y bajar el mouse hacia el panel dispararía
  // mouseleave antes de llegar, cerrándolo de golpe. Con openOnClick no aplica
  // (no hay hover que sostener), así que ahí sí flota en absolute.
  const hoverProps = (!openOnClick && hoverCapable)
    ? { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) }
    : {}

  // Los llamadores arman children con `{cond && <button>...}` -- si ningun
  // permiso habilita ninguna accion, children queda lleno de `false`/`null`.
  // Sin este filtro, el boton se mostraba igual y abria un panel vacio.
  const visibleChildren = Children.toArray(children).filter(Boolean)
  if (visibleChildren.length === 0) return null

  return (
    <div ref={wrapRef} {...hoverProps} style={openOnClick ? { position: 'relative', display: 'inline-block' } : undefined}>
      <button
        type="button"
        className={`btn btn-secondary${open ? ' active' : ''}`}
        onClick={() => { if (useClick) setOpen((o) => !o) }}
      >
        {label} <IcoChevronDown />
      </button>
      {open && (
        <div className={openOnClick ? 'actions-menu-panel actions-menu-panel-float' : 'actions-menu-panel'}>
          {visibleChildren}
        </div>
      )}
    </div>
  )
}
