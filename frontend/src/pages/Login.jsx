import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'

export default function Login() {
  const navigate = useNavigate()
  const { login, loginGoogle, token, loading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (token) navigate('/dashboard', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!window.google && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = initGoogle
      document.body.appendChild(script)
    } else if (window.google) {
      initGoogle()
    }
  }, [])

  const initGoogle = () => {
    if (!window.google || !import.meta.env.VITE_GOOGLE_CLIENT_ID) return
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        try {
          await loginGoogle(credential)
          navigate('/dashboard')
        } catch {}
      }
    })
    window.google.accounts.id.renderButton(
      document.getElementById('google-btn'),
      { theme: 'outline', size: 'large', width: 320 }
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch {}
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f1f5f9', fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        background: '#fff', padding: '2.5rem', borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', width: '100%', maxWidth: 380
      }}>
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.75rem', fontWeight: 700, color: '#1e293b' }}>
          DCSmart
        </h1>
        <p style={{ margin: '0 0 2rem', color: '#64748b', fontSize: '0.9rem' }}>
          Iniciá sesión para continuar
        </p>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6,
            padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%', padding: '0.6rem 0.75rem', borderRadius: 6,
                border: '1px solid #d1d5db', fontSize: '0.95rem', boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '0.6rem 0.75rem', borderRadius: 6,
                border: '1px solid #d1d5db', fontSize: '0.95rem', boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.7rem', background: '#1e40af', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: '1rem', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
          <>
            <div style={{ textAlign: 'center', margin: '1rem 0', color: '#9ca3af', fontSize: '0.875rem' }}>
              o
            </div>
            <div id="google-btn" style={{ display: 'flex', justifyContent: 'center' }} />
          </>
        )}
      </div>
    </div>
  )
}
