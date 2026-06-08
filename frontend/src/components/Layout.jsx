import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import { useUiStore } from '../store/uiStore.js'

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

export default function Layout() {
  const notifications = useUiStore((s) => s.notifications)
  const removeNotification = useUiStore((s) => s.removeNotification)

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-body">
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
    </div>
  )
}
