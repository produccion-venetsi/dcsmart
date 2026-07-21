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
//
// `float`: variante que SÍ mantiene hover (no click) pero flota el panel
// igual que openOnClick. El panel flotante tiene un gap (`top: calc(100% +
// 8px)`, ver app.css) entre el botón y el panel -- si el mouse cruza ese
// hueco vacío, técnicamente sale del wrapper y dispara mouseleave antes de
// llegar al panel. Por eso el cierre por hover se demora unos ms (cancelado
// si el mouse vuelve a entrar), en vez de cerrar instantáneo -- así el cruce
// del gap no cierra el menú de golpe.
const HOVER_CLOSE_DELAY_MS = 200

export default function ActionsMenu({ label = 'Acciones', children, openOnClick = false, float = false }) {
  const [open, setOpen] = useState(false)
  const [hoverCapable, setHoverCapable] = useState(true)
  const wrapRef = useRef(null)
  const closeTimeoutRef = useRef(null)

  useEffect(() => {
    setHoverCapable(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  useEffect(() => () => clearTimeout(closeTimeoutRef.current), [])

  const useClick = openOnClick || !hoverCapable
  const floats = openOnClick || float

  useEffect(() => {
    if (!useClick || !open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [useClick, open])

  // El panel se renderiza en el flujo normal (no position:absolute) por
  // defecto, para que el wrapper con los handlers de hover abarque tanto el
  // botón como el panel abierto -- si el panel flotara fuera del flujo sin
  // más cambios, el área "hovereable" del wrapper solo cubriría al botón, y
  // bajar el mouse hacia el panel dispararía mouseleave antes de llegar,
  // cerrándolo de golpe. `float` resuelve esto con el delay de cierre de
  // arriba; `openOnClick` no lo necesita (no hay hover que sostener).
  const hoverProps = (!openOnClick && hoverCapable)
    ? {
        onMouseEnter: () => { clearTimeout(closeTimeoutRef.current); setOpen(true) },
        onMouseLeave: () => {
          if (!float) { setOpen(false); return }
          closeTimeoutRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS)
        },
      }
    : {}

  // Los llamadores arman children con `{cond && <button>...}` -- si ningun
  // permiso habilita ninguna accion, children queda lleno de `false`/`null`.
  // Sin este filtro, el boton se mostraba igual y abria un panel vacio.
  const visibleChildren = Children.toArray(children).filter(Boolean)
  if (visibleChildren.length === 0) return null

  return (
    <div ref={wrapRef} {...hoverProps} style={floats ? { position: 'relative', display: 'inline-block' } : undefined}>
      <button
        type="button"
        className={`btn btn-secondary${open ? ' active' : ''}`}
        onClick={() => { if (useClick) setOpen((o) => !o) }}
      >
        {label} <IcoChevronDown />
      </button>
      {open && (
        <div className={floats ? 'actions-menu-panel actions-menu-panel-float' : 'actions-menu-panel'}>
          {visibleChildren}
        </div>
      )}
    </div>
  )
}
