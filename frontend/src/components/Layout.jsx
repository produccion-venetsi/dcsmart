import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import { useUiStore } from '../store/uiStore.js'

function IcoMenu() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  )
}

function MobileTopbar() {
  const toggleMobileNav = useUiStore((s) => s.toggleMobileNav)
  return (
    <div className="mobile-topbar">
      <button className="mobile-topbar-menu" onClick={toggleMobileNav} aria-label="Abrir menú">
        <IcoMenu />
      </button>
      <span className="mobile-topbar-title">DCSmart</span>
    </div>
  )
}

function NotifIcon({ type }) {
  if (type === 'success') return (
    <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8"/><path d="m7 10 2 2 4-4"/>
    </svg>
  )
  if (type === 'error') return (
    <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8"/><path d="M10 7v4M10 13h.01"/>
    </svg>
  )
  return (
    <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8"/><path d="M10 10v4M10 7h.01"/>
    </svg>
  )
}

function ConfirmModal() {
  const confirmModal   = useUiStore((s) => s.confirmModal)
  const dismissConfirm = useUiStore((s) => s.dismissConfirm)

  if (!confirmModal) return null

  return (
    <div className="confirm-backdrop" onMouseDown={() => dismissConfirm(false)}>
      <div className="confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <p className="confirm-message">{confirmModal.message}</p>
        <div className="confirm-foot">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => dismissConfirm(false)}
            autoFocus
          >
            Cancelar
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => dismissConfirm(true)}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function PromptModal() {
  const promptModal   = useUiStore((s) => s.promptModal)
  const resolvePrompt = useUiStore((s) => s.resolvePrompt)
  const [value, setValue] = useState('')

  useEffect(() => { setValue('') }, [promptModal])

  if (!promptModal) return null

  return (
    <div className="confirm-backdrop" onMouseDown={() => resolvePrompt(null)}>
      <div className="confirm-modal confirm-modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <p className="confirm-message">{promptModal.message}</p>
        <div className="form-input-wrap form-textarea-wrap" style={{ margin: '0.75rem 0' }}>
          <textarea
            rows={3}
            autoFocus
            placeholder={promptModal.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="confirm-foot">
          <button className="btn btn-secondary btn-sm" onClick={() => resolvePrompt(null)}>
            Cancelar
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => resolvePrompt(value)}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const notifications    = useUiStore((s) => s.notifications)
  const removeNotification = useUiStore((s) => s.removeNotification)
  const closeMobileNav   = useUiStore((s) => s.closeMobileNav)
  const location = useLocation()

  // Cierra el menú mobile cada vez que cambia la ruta (red de seguridad
  // además del onClick de cada NavLink, ej. si se navega por otro medio).
  useEffect(() => { closeMobileNav() }, [location.pathname])

  // Los inputs de fecha/select dentro de .form-input-wrap se abren clickeando
  // en cualquier parte del campo, no solo en el icono/flecha nativa.
  useEffect(() => {
    const handler = (e) => {
      if (e.target.closest('input, select, textarea, button, a')) return
      const wrap = e.target.closest('.form-input-wrap')
      if (!wrap) return
      const field = wrap.querySelector('input[type="date"], input[type="datetime-local"], select')
      if (!field) return
      if (typeof field.showPicker === 'function') {
        try { field.showPicker(); return } catch { /* algunos navegadores lo rechazan sin gesto directo */ }
      }
      field.focus()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-body">
        <MobileTopbar />
        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <div className="notifications-container">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`notification notification-${n.type || 'info'}`}
            onClick={() => removeNotification(n.id)}
            title="Click para cerrar"
          >
            <NotifIcon type={n.type} />
            {n.message}
          </div>
        ))}
      </div>

      <ConfirmModal />
      <PromptModal />
    </div>
  )
}
