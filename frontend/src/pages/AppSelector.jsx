import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'
import { authApi } from '../api/auth.js'
import './auth.css'
import AppLogo from '../components/AppLogo.jsx'

/* ---- gradient palette — derivo por ID de app ---- */
const GRADS = [
  ['#E1CBA0', '#A98F63'],
  ['#84C1F0', '#4B82D4'],
  ['#B5A7EA', '#7E6FC9'],
  ['#74CCA0', '#3F9970'],
  ['#F09B84', '#C96A50'],
  ['#F0D484', '#C9A340'],
]
function appGrad(id) {
  const h = [...(id || 'x')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 0)
  const [a, b] = GRADS[h % GRADS.length]
  return `linear-gradient(150deg, ${a}, ${b})`
}

/* ---- SVG icons ---- */
function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  )
}
function IconArrow() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  )
}
function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}
function IconInbox() {
  return (
    <svg viewBox="0 0 24 24" width={40} height={40} fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>
    </svg>
  )
}

/* ---- initials avatar ---- */
function initials(nombre) {
  if (!nombre) return '?'
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

export default function AppSelector() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { setActiveApp, setActiveLocal } = useAppStore()

  const [apps, setApps] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [selecting, setSelecting] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    authApi.myApps()
      .then(({ data }) => {
        setApps(data)
        // si tiene un solo app, auto-seleccionar
        if (data.length === 1) {
          handleSelect(data[0])
        }
      })
      .catch(() => setFetchError('No se pudieron cargar tus grupos. Intentá nuevamente.'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelect = (item) => {
    if (selecting) return
    setSelecting(true)
    setActiveApp(item)
    if (item.locales.length === 1) {
      setActiveLocal(item.locales[0])
    }
    navigate('/dashboard', { replace: true })
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="auth-root">
      <div className="auth-grid-veil" />

      {/* Header */}
      <header className="sel-header">
        <div className="sel-brand">
          <AppLogo variant="horizontal" />
        </div>
        {user && (
          <div className="sel-user">
            <div className="sel-user-name">
              {user.nombre}
            </div>
            <div className="sel-avatar">
              {user.avatar_url
                ? <img src={user.avatar_url} alt={user.nombre} />
                : initials(user.nombre)}
            </div>
            <button className="sel-logout sel-logout-header" onClick={handleLogout}>
              <IconLogout />
              <span className="sel-logout-label">Cerrar sesión</span>
            </button>
          </div>
        )}
      </header>

      {/* Main */}
      <main className="sel-main">
        <div className="sel-heading">
          <h1>Seleccioná tu grupo de trabajo</h1>
          <p>Elegí el grupo con el que querés operar hoy</p>
        </div>

        {/* Estado: cargando */}
        {apps === null && !fetchError && (
          <div className="sel-auto">
            <span className="auth-spinner" style={{ borderTopColor: 'var(--gold)', borderColor: 'rgba(201,176,134,0.2)', width: 28, height: 28 }} />
            Cargando tus grupos…
          </div>
        )}

        {/* Estado: error */}
        {fetchError && (
          <div className="sel-empty">
            <IconInbox />
            <p>{fetchError}</p>
          </div>
        )}

        {/* Estado: sin apps */}
        {apps && apps.length === 0 && (
          <div className="sel-empty">
            <IconInbox />
            <p>Tu cuenta no tiene grupos asignados.<br />Contactá al administrador.</p>
          </div>
        )}

        {/* Buscador */}
        {apps && apps.length >= 5 && (
          <div className="sel-search">
            <svg className="sel-search-icon" viewBox="0 0 24 24" width={16} height={16} fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar grupo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        {/* Grid de apps */}
        {apps && apps.length > 1 && (() => {
          const visible = apps.filter(item =>
            item.app.nombre.toLowerCase().includes(search.toLowerCase())
          )
          return visible.length === 0
            ? <p className="sel-no-results">No encontramos grupos con ese nombre.</p>
            : (
          <div className="app-grid">
            {visible.map((item, i) => (
              <button
                key={item.app.id}
                className="app-card"
                style={{ '--i': i }}
                onClick={() => handleSelect(item)}
                disabled={selecting}
              >
        

                {/* Body */}
                <div className="app-card-body">
                  <h2>{item.app.nombre}</h2>
                 
                </div>

                {/* Footer */}
                <div className="app-card-foot">
                  <div className="app-card-locales-wrap">
                    {item.locales.length === 0 ? (
                      <span className="app-card-locales-summary">Sin apps</span>
                    ) : (
                      <div className={`app-card-locales-marquee${item.locales.length >= 3 ? ' scrolling' : ''}`}>
                        <div
                          className="app-card-locales-track"
                          style={item.locales.length >= 3 ? {
                            // Duración proporcional al largo total del texto, para que la
                            // velocidad (px/seg) sea la misma en todas las cards, sin
                            // importar cuántos locales o qué tan largos sean los nombres.
                            animationDuration: `${Math.max(6, item.locales.reduce((sum, l) => sum + l.nombre.length, 0) * 0.28)}s`
                          } : undefined}
                        >
                          {item.locales.map(l => (
                            <span key={l.id} className="app-card-locale-tag">{l.nombre}</span>
                          ))}
                          {item.locales.length >= 3 && item.locales.map(l => (
                            <span key={`dup-${l.id}`} className="app-card-locale-tag" aria-hidden="true">{l.nombre}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="app-card-arrow">
                    <IconArrow />
                  </div>
                </div>
              </button>
            ))}
          </div>
            )
        })()}
      </main>
    </div>
  )
}
