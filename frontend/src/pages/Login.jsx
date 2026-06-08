import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import './auth.css'

/* ---- SVG icon helpers ---- */
function IconMail() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-9.4 5.8a2 2 0 0 1-2.2 0L2 7"/>
    </svg>
  )
}
function IconLock() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}
function IconEye({ off }) {
  return off ? (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
      <line x1="2" y1="2" x2="22" y2="22"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}
function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  )
}
function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={19} height={19}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/>
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const { login, loginGoogle, token, loading, error, clearError } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const googleBtnRef = useRef(null)
  const hasGoogle = !!import.meta.env.VITE_GOOGLE_CLIENT_ID

  // Redirect if already authenticated
  useEffect(() => {
    if (token) navigate('/select-app', { replace: true })
  }, [token, navigate])

  // Initialize Google Identity Services
  useEffect(() => {
    if (!hasGoogle) return
    const setup = () => {
      if (!window.google) return
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            await loginGoogle(credential)
            navigate('/select-app')
          } catch {}
        }
      })
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline', size: 'large', width: 388
        })
      }
    }
    if (window.google) {
      setup()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = setup
      document.body.appendChild(script)
    }
  }, [hasGoogle, loginGoogle, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    try {
      await login(email, password)
      navigate('/select-app')
    } catch {}
  }

  const handleGoogleClick = () => {
    // Trigger the hidden Google-rendered button
    const btn = googleBtnRef.current?.querySelector('div[role="button"], button')
    if (btn) btn.click()
    else if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt()
    }
  }

  const invalid = !!error

  return (
    <div className="auth-root">
      <div className="auth-grid-veil" />

      <div className="auth-center">
        <form className="login-card" onSubmit={handleSubmit} noValidate>

          {/* Brand */}
          <div className="auth-brand">
            <div className="mark"><IconLayers /></div>
            <div className="wm">
              <b>DCSmart</b>
              <span>Backoffice</span>
            </div>
          </div>

          {/* Headings */}
          <div className="auth-h">
            <h1>Bienvenido de nuevo</h1>
            <p>Ingresá para administrar tus locales</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="err-banner" role="alert">
              <IconAlert />
              <div>
                <strong>Email o contraseña incorrectos.</strong>{' '}
                Revisá tus datos e intentá nuevamente.
              </div>
            </div>
          )}

          {/* Email field */}
          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <div className={'auth-input' + (invalid ? ' invalid' : '')}>
              <span className="input-lead"><IconMail /></span>
              <input
                id="auth-email"
                type="email"
                autoComplete="username"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) clearError() }}
              />
            </div>
          </div>

          {/* Password field */}
          <div className="auth-field">
            <label htmlFor="auth-pw">Contraseña</label>
            <div className={'auth-input' + (invalid ? ' invalid' : '')}>
              <span className="input-lead"><IconLock /></span>
              <input
                id="auth-pw"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) clearError() }}
              />
              <button
                type="button"
                className="pw-toggle"
                aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPw(s => !s)}
              >
                <IconEye off={showPw} />
              </button>
            </div>
          </div>

          {/* Forgot password */}
          <div className="auth-forgot">
            <a>¿Olvidaste tu contraseña?</a>
          </div>

          {/* Submit */}
          <button type="submit" className="btn-auth-primary" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : null}
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>

          {/* Google login */}
          {hasGoogle && (
            <>
              <div className="auth-divider">o continuá con</div>
              <div className="btn-google-wrap">
                <button
                  type="button"
                  className="btn-google-custom"
                  onClick={handleGoogleClick}
                >
                  <GoogleG /> Google
                </button>
                <div ref={googleBtnRef} className="google-btn-hidden" />
              </div>
            </>
          )}

          {/* Footer */}
          <div className="auth-foot">DCSmart · acceso seguro a tu operación</div>
        </form>
      </div>
    </div>
  )
}
