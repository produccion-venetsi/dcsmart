import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import { useUiStore } from '../store/uiStore.js'

export default function Layout() {
  const notifications = useUiStore((s) => s.notifications)
  const removeNotification = useUiStore((s) => s.removeNotification)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '1.5rem', background: '#f8fafc', overflowY: 'auto' }}>
        <Outlet />
      </main>

      <div style={{ position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => removeNotification(n.id)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 6,
              background: n.type === 'error' ? '#ef4444' : n.type === 'success' ? '#22c55e' : '#3b82f6',
              color: '#fff',
              cursor: 'pointer',
              maxWidth: 320,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
          >
            {n.message}
          </div>
        ))}
      </div>
    </div>
  )
}
