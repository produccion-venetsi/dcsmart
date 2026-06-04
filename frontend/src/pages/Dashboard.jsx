import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'
import { appsApi } from '../api/apps.js'
import { cajasApi } from '../api/cajas.js'

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '1.25rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)', minWidth: 180
    }}>
      <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const { activeApp, activeLocal, setActiveApp, setActiveLocal } = useAppStore()
  const navigate = useNavigate()

  const [apps, setApps] = useState([])
  const [localesApp, setLocalesApp] = useState([])
  const [cajaStats, setCajaStats] = useState({ total: 0, hoy: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    appsApi.list()
      .then(({ data }) => setApps(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (activeApp) {
      const app = apps.find((a) => a.id === activeApp.id)
      setLocalesApp(app?.locales || [])
    }
  }, [activeApp, apps])

  useEffect(() => {
    if (activeLocal) {
      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      cajasApi.list({ id_local: activeLocal.id, limit: 1000 })
        .then(({ data }) => {
          const total = data.total || 0
          const hoyCount = (data.data || []).filter(
            (c) => new Date(c.fecha_inicio) >= hoy
          ).length
          setCajaStats({ total, hoy: hoyCount })
        })
        .catch(console.error)
    }
  }, [activeLocal])

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Cargando...</div>

  return (
    <div>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
        Bienvenido, {user?.nombre}
      </h1>
      <p style={{ margin: '0 0 2rem', color: '#64748b' }}>Panel de control DCSmart</p>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
          Seleccionar App
        </h2>
        {apps.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No hay apps disponibles. Creá una en Admin &gt; Apps.</p>
        ) : (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {apps.map((app) => (
              <button
                key={app.id}
                onClick={() => setActiveApp(app)}
                style={{
                  padding: '0.6rem 1.25rem', borderRadius: 8, cursor: 'pointer',
                  border: activeApp?.id === app.id ? '2px solid #1e40af' : '2px solid #e2e8f0',
                  background: activeApp?.id === app.id ? '#eff6ff' : '#fff',
                  fontWeight: 600, color: activeApp?.id === app.id ? '#1e40af' : '#374151'
                }}
              >
                {app.nombre}
              </button>
            ))}
          </div>
        )}
      </section>

      {activeApp && localesApp.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
            Seleccionar Local — {activeApp.nombre}
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {localesApp.map((local) => (
              <button
                key={local.id}
                onClick={() => setActiveLocal(local)}
                style={{
                  padding: '0.6rem 1.25rem', borderRadius: 8, cursor: 'pointer',
                  border: activeLocal?.id === local.id ? '2px solid #16a34a' : '2px solid #e2e8f0',
                  background: activeLocal?.id === local.id ? '#f0fdf4' : '#fff',
                  fontWeight: 600, color: activeLocal?.id === local.id ? '#16a34a' : '#374151'
                }}
              >
                {local.nombre}
              </button>
            ))}
          </div>
        </section>
      )}

      {activeLocal && (
        <section>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
            Resumen — {activeLocal.nombre}
          </h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <StatCard label="Cajas totales" value={cajaStats.total} />
            <StatCard label="Cajas hoy" value={cajaStats.hoy} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/cajas')}
              style={{
                padding: '0.6rem 1.25rem', background: '#1e40af', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600
              }}
            >
              Ver Cajas
            </button>
            <button
              onClick={() => navigate('/pagos')}
              style={{
                padding: '0.6rem 1.25rem', background: '#0f766e', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600
              }}
            >
              Ver Pagos
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
