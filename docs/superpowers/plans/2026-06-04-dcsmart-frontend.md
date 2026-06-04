# DCSmart Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la PWA React con Vite que consuma la API backend, con auth completa (Google + email/password), estado global con Zustand, y todas las páginas del negocio.

**Architecture:** SPA React con React Router v6 para navegación. Zustand para estado global (auth, app activa, UI). Axios para llamadas a la API. Vite PWA plugin para capacidades offline.

**Tech Stack:** Vite 5, React 18, React Router v6, Zustand, Axios, vite-plugin-pwa

**Prerequisito:** El backend debe estar corriendo en `http://localhost:3000` con seed aplicado.

---

## Estructura de archivos

```
frontend/
├── package.json
├── vite.config.js
├── index.html
├── public/
│   ├── manifest.json
│   ├── icon-192.png          ← placeholder PNG
│   └── icon-512.png          ← placeholder PNG
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── api/
    │   ├── client.js          ← axios instance con interceptors
    │   ├── auth.js
    │   ├── apps.js
    │   ├── locales.js
    │   ├── users.js
    │   ├── cajas.js
    │   ├── movimientos.js
    │   ├── pagos.js
    │   ├── proveedores.js
    │   └── rubcat.js
    ├── store/
    │   ├── authStore.js
    │   ├── appStore.js
    │   └── uiStore.js
    ├── components/
    │   ├── ProtectedRoute.jsx
    │   ├── Layout.jsx
    │   └── Sidebar.jsx
    └── pages/
        ├── Login.jsx
        ├── Dashboard.jsx
        ├── cajas/
        │   ├── CajaList.jsx
        │   └── CajaDetail.jsx
        ├── pagos/
        │   ├── PagoList.jsx
        │   └── PagoForm.jsx
        ├── proveedores/
        │   ├── ProveedorList.jsx
        │   └── ProveedorForm.jsx
        └── admin/
            ├── Users.jsx
            ├── Apps.jsx
            └── Locales.jsx
```

---

### Task 1: Inicializar proyecto frontend

**Files:**
- Create: `frontend/` (toda la estructura)

- [ ] **Step 1: Crear proyecto Vite**

```bash
cd C:\Users\agusl\Documents\dcsmart-apps\dcsmart
npm create vite@latest frontend -- --template react
cd frontend
```

- [ ] **Step 2: Instalar dependencias**

```bash
npm install axios zustand react-router-dom
npm install -D vite-plugin-pwa
```

- [ ] **Step 3: Crear iconos placeholder**

```bash
# PowerShell — crear PNGs mínimos válidos (1x1 pixel PNG)
$png192 = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
[System.IO.File]::WriteAllBytes("public\icon-192.png", $png192)
$png512 = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
[System.IO.File]::WriteAllBytes("public\icon-512.png", $png512)
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/
git commit -m "chore: initialize vite react frontend"
```

---

### Task 2: Configurar Vite + PWA

**Files:**
- Modify: `frontend/vite.config.js`

- [ ] **Step 1: Reemplazar vite.config.js**

Archivo `frontend/vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'DCSmart',
        short_name: 'DCSmart',
        description: 'Sistema de gestión DCSmart',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 300 }
            }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
```

- [ ] **Step 2: Verificar que arranca**

```bash
cd frontend && npm run dev
```

Resultado esperado: servidor en http://localhost:5173 sin errores.

Ctrl+C para detener.

- [ ] **Step 3: Commit**

```bash
git add frontend/vite.config.js
git commit -m "feat: configure vite pwa plugin with api proxy"
```

---

### Task 3: Cliente API (Axios)

**Files:**
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/api/auth.js`
- Create: `frontend/src/api/apps.js`
- Create: `frontend/src/api/locales.js`
- Create: `frontend/src/api/users.js`
- Create: `frontend/src/api/cajas.js`
- Create: `frontend/src/api/movimientos.js`
- Create: `frontend/src/api/pagos.js`
- Create: `frontend/src/api/proveedores.js`
- Create: `frontend/src/api/rubcat.js`

- [ ] **Step 1: Crear cliente base con interceptors**

Archivo `frontend/src/api/client.js`:

```javascript
import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

// Inyectar token JWT en cada request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirigir al login si el token expiró (401)
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
```

- [ ] **Step 2: Crear api/auth.js**

Archivo `frontend/src/api/auth.js`:

```javascript
import client from './client.js'

export const authApi = {
  register: (data) => client.post('/auth/register', data),
  login: (email, password) => client.post('/auth/login', { email, password }),
  loginGoogle: (credential) => client.post('/auth/google', { credential }),
  me: () => client.get('/auth/me'),
  logout: () => client.post('/auth/logout')
}
```

- [ ] **Step 3: Crear api/apps.js**

Archivo `frontend/src/api/apps.js`:

```javascript
import client from './client.js'

export const appsApi = {
  list: () => client.get('/apps'),
  get: (id) => client.get(`/apps/${id}`),
  create: (data) => client.post('/apps', data),
  update: (id, data) => client.put(`/apps/${id}`, data),
  remove: (id) => client.delete(`/apps/${id}`)
}
```

- [ ] **Step 4: Crear api/locales.js**

Archivo `frontend/src/api/locales.js`:

```javascript
import client from './client.js'

export const localesApi = {
  list: (params) => client.get('/locales', { params }),
  get: (id) => client.get(`/locales/${id}`),
  create: (data) => client.post('/locales', data),
  update: (id, data) => client.put(`/locales/${id}`, data),
  remove: (id) => client.delete(`/locales/${id}`)
}
```

- [ ] **Step 5: Crear api/users.js**

Archivo `frontend/src/api/users.js`:

```javascript
import client from './client.js'

export const usersApi = {
  list: () => client.get('/users'),
  get: (id) => client.get(`/users/${id}`),
  create: (data) => client.post('/users', data),
  update: (id, data) => client.put(`/users/${id}`, data),
  remove: (id) => client.delete(`/users/${id}`),
  assignRole: (id, data) => client.post(`/users/${id}/roles`, data)
}
```

- [ ] **Step 6: Crear api/cajas.js**

Archivo `frontend/src/api/cajas.js`:

```javascript
import client from './client.js'

export const cajasApi = {
  list: (params) => client.get('/cajas', { params }),
  get: (id) => client.get(`/cajas/${id}`),
  create: (data) => client.post('/cajas', data),
  update: (id, data) => client.put(`/cajas/${id}`, data),
  remove: (id) => client.delete(`/cajas/${id}`)
}
```

- [ ] **Step 7: Crear api/movimientos.js**

Archivo `frontend/src/api/movimientos.js`:

```javascript
import client from './client.js'

export const movimientosApi = {
  list: (id_caja) => client.get('/caja-movimientos', { params: { id_caja } }),
  get: (id) => client.get(`/caja-movimientos/${id}`),
  create: (data) => client.post('/caja-movimientos', data),
  update: (id, data) => client.put(`/caja-movimientos/${id}`, data),
  remove: (id) => client.delete(`/caja-movimientos/${id}`)
}
```

- [ ] **Step 8: Crear api/pagos.js**

Archivo `frontend/src/api/pagos.js`:

```javascript
import client from './client.js'

export const pagosApi = {
  list: (params) => client.get('/pagos', { params }),
  get: (id) => client.get(`/pagos/${id}`),
  create: (data) => client.post('/pagos', data),
  update: (id, data) => client.put(`/pagos/${id}`, data),
  remove: (id) => client.delete(`/pagos/${id}`),
  audit: (id) => client.patch(`/pagos/${id}/audit`)
}
```

- [ ] **Step 9: Crear api/proveedores.js**

Archivo `frontend/src/api/proveedores.js`:

```javascript
import client from './client.js'

export const proveedoresApi = {
  list: (params) => client.get('/proveedores', { params }),
  get: (id) => client.get(`/proveedores/${id}`),
  create: (data) => client.post('/proveedores', data),
  update: (id, data) => client.put(`/proveedores/${id}`, data),
  remove: (id) => client.delete(`/proveedores/${id}`)
}
```

- [ ] **Step 10: Crear api/rubcat.js**

Archivo `frontend/src/api/rubcat.js`:

```javascript
import client from './client.js'

export const rubrosApi = {
  list: () => client.get('/rubcat/rubros'),
  create: (data) => client.post('/rubcat/rubros', data),
  update: (id, data) => client.put(`/rubcat/rubros/${id}`, data),
  remove: (id) => client.delete(`/rubcat/rubros/${id}`)
}

export const categoriasApi = {
  list: () => client.get('/rubcat/categorias'),
  create: (data) => client.post('/rubcat/categorias', data),
  update: (id, data) => client.put(`/rubcat/categorias/${id}`, data),
  remove: (id) => client.delete(`/rubcat/categorias/${id}`)
}

export const rubcatApi = {
  list: () => client.get('/rubcat'),
  get: (id) => client.get(`/rubcat/${id}`),
  create: (data) => client.post('/rubcat', data),
  update: (id, data) => client.put(`/rubcat/${id}`, data),
  remove: (id) => client.delete(`/rubcat/${id}`)
}
```

- [ ] **Step 11: Commit**

```bash
git add frontend/src/api/
git commit -m "feat: add api client with axios and all resource endpoints"
```

---

### Task 4: Stores Zustand

**Files:**
- Create: `frontend/src/store/authStore.js`
- Create: `frontend/src/store/appStore.js`
- Create: `frontend/src/store/uiStore.js`

- [ ] **Step 1: Crear authStore.js**

Archivo `frontend/src/store/authStore.js`:

```javascript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api/auth.js'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      error: null,

      login: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const { data } = await authApi.login(email, password)
          localStorage.setItem('token', data.token)
          set({ user: data.user, token: data.token, loading: false })
          return data
        } catch (err) {
          const msg = err.response?.data?.error || 'Error al iniciar sesión'
          set({ error: msg, loading: false })
          throw err
        }
      },

      loginGoogle: async (credential) => {
        set({ loading: true, error: null })
        try {
          const { data } = await authApi.loginGoogle(credential)
          localStorage.setItem('token', data.token)
          set({ user: data.user, token: data.token, loading: false })
          return data
        } catch (err) {
          const msg = err.response?.data?.error || 'Error con Google'
          set({ error: msg, loading: false })
          throw err
        }
      },

      logout: async () => {
        try { await authApi.logout() } catch {}
        localStorage.removeItem('token')
        set({ user: null, token: null })
      },

      refreshUser: async () => {
        try {
          const { data } = await authApi.me()
          set({ user: data })
        } catch {
          get().logout()
        }
      },

      clearError: () => set({ error: null })
    }),
    {
      name: 'dcsmart-auth',
      partialize: (state) => ({ user: state.user, token: state.token })
    }
  )
)
```

- [ ] **Step 2: Crear appStore.js**

Archivo `frontend/src/store/appStore.js`:

```javascript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAppStore = create(
  persist(
    (set) => ({
      activeApp: null,      // { id, nombre, slug }
      activeLocal: null,    // { id, nombre }

      setActiveApp: (app) => set({ activeApp: app, activeLocal: null }),
      setActiveLocal: (local) => set({ activeLocal: local }),
      clearContext: () => set({ activeApp: null, activeLocal: null })
    }),
    {
      name: 'dcsmart-app-context'
    }
  )
)
```

- [ ] **Step 3: Crear uiStore.js**

Archivo `frontend/src/store/uiStore.js`:

```javascript
import { create } from 'zustand'

export const useUiStore = create((set) => ({
  sidebarOpen: true,
  notifications: [],

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  addNotification: (notification) =>
    set((s) => ({
      notifications: [
        ...s.notifications,
        { id: Date.now(), ...notification }
      ]
    })),

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id)
    })),

  notify: (message, type = 'info') => {
    const id = Date.now()
    set((s) => ({
      notifications: [...s.notifications, { id, message, type }]
    }))
    setTimeout(() => {
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id)
      }))
    }, 4000)
  }
}))
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/
git commit -m "feat: add zustand stores for auth, app context and ui"
```

---

### Task 5: Layout, Sidebar y ProtectedRoute

**Files:**
- Create: `frontend/src/components/ProtectedRoute.jsx`
- Create: `frontend/src/components/Layout.jsx`
- Create: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Crear ProtectedRoute.jsx**

Archivo `frontend/src/components/ProtectedRoute.jsx`:

```jsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'

export default function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return children
}
```

- [ ] **Step 2: Crear Sidebar.jsx**

Archivo `frontend/src/components/Sidebar.jsx`:

```jsx
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useUiStore } from '../store/uiStore.js'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/cajas', label: 'Cajas', icon: '💰' },
  { to: '/pagos', label: 'Pagos', icon: '📄' },
  { to: '/proveedores', label: 'Proveedores', icon: '🏪' },
  { to: '/admin/apps', label: 'Apps', icon: '⚙️' },
  { to: '/admin/locales', label: 'Locales', icon: '📍' },
  { to: '/admin/users', label: 'Usuarios', icon: '👥' }
]

export default function Sidebar() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  if (!sidebarOpen) return null

  return (
    <aside style={{
      width: 220, minHeight: '100vh', background: '#1e40af',
      color: '#fff', display: 'flex', flexDirection: 'column',
      padding: '1rem 0'
    }}>
      <div style={{ padding: '0 1rem 1.5rem', fontWeight: 700, fontSize: '1.25rem' }}>
        DCSmart
      </div>

      <nav style={{ flex: 1 }}>
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 1rem', color: '#fff', textDecoration: 'none',
              background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderRadius: 4, margin: '0 0.5rem 0.25rem'
            })}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
        <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}>
          {user?.nombre}
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '0.4rem', background: 'rgba(255,255,255,0.15)',
            color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer'
          }}
        >
          Salir
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Crear Layout.jsx**

Archivo `frontend/src/components/Layout.jsx`:

```jsx
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

      {/* Notificaciones */}
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
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: add layout, sidebar and protected route components"
```

---

### Task 6: Router principal (App.jsx y main.jsx)

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Reemplazar main.jsx**

Archivo `frontend/src/main.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

- [ ] **Step 2: Reemplazar App.jsx**

Archivo `frontend/src/App.jsx`:

```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CajaList from './pages/cajas/CajaList.jsx'
import CajaDetail from './pages/cajas/CajaDetail.jsx'
import PagoList from './pages/pagos/PagoList.jsx'
import PagoForm from './pages/pagos/PagoForm.jsx'
import ProveedorList from './pages/proveedores/ProveedorList.jsx'
import ProveedorForm from './pages/proveedores/ProveedorForm.jsx'
import Users from './pages/admin/Users.jsx'
import Apps from './pages/admin/Apps.jsx'
import Locales from './pages/admin/Locales.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="cajas" element={<CajaList />} />
        <Route path="cajas/:id" element={<CajaDetail />} />
        <Route path="pagos" element={<PagoList />} />
        <Route path="pagos/nuevo" element={<PagoForm />} />
        <Route path="pagos/:id/editar" element={<PagoForm />} />
        <Route path="proveedores" element={<ProveedorList />} />
        <Route path="proveedores/nuevo" element={<ProveedorForm />} />
        <Route path="proveedores/:id/editar" element={<ProveedorForm />} />
        <Route path="admin/users" element={<Users />} />
        <Route path="admin/apps" element={<Apps />} />
        <Route path="admin/locales" element={<Locales />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 3: Crear archivos de páginas stub para que no falle la importación**

```bash
# PowerShell
New-Item -ItemType Directory -Force frontend/src/pages/cajas
New-Item -ItemType Directory -Force frontend/src/pages/pagos
New-Item -ItemType Directory -Force frontend/src/pages/proveedores
New-Item -ItemType Directory -Force frontend/src/pages/admin

$stub = "export default function Stub() { return <div>Próximamente</div> }"
@{
  "frontend/src/pages/Login.jsx" = $stub
  "frontend/src/pages/Dashboard.jsx" = $stub
  "frontend/src/pages/cajas/CajaList.jsx" = $stub
  "frontend/src/pages/cajas/CajaDetail.jsx" = $stub
  "frontend/src/pages/pagos/PagoList.jsx" = $stub
  "frontend/src/pages/pagos/PagoForm.jsx" = $stub
  "frontend/src/pages/proveedores/ProveedorList.jsx" = $stub
  "frontend/src/pages/proveedores/ProveedorForm.jsx" = $stub
  "frontend/src/pages/admin/Users.jsx" = $stub
  "frontend/src/pages/admin/Apps.jsx" = $stub
  "frontend/src/pages/admin/Locales.jsx" = $stub
}.GetEnumerator() | ForEach-Object { Set-Content $_.Key $_.Value -Encoding utf8 }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/main.jsx frontend/src/pages/
git commit -m "feat: add react router with all routes wired up"
```

---

### Task 7: Página de Login

**Files:**
- Create: `frontend/src/pages/Login.jsx`

- [ ] **Step 1: Implementar Login.jsx**

Archivo `frontend/src/pages/Login.jsx`:

```jsx
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

  // Cargar SDK de Google cuando el componente monta
  useEffect(() => {
    if (!window.google && process.env.VITE_GOOGLE_CLIENT_ID) {
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
```

- [ ] **Step 2: Agregar VITE_GOOGLE_CLIENT_ID al .env frontend**

En `frontend/.env` (crear si no existe):

```env
VITE_GOOGLE_CLIENT_ID=
```

(Dejar vacío para deshabilitar el botón de Google en development)

- [ ] **Step 3: Verificar que la página de login renderiza**

```bash
cd frontend && npm run dev
```

Abrir http://localhost:5173/login — debe mostrar el formulario de login sin errores de consola.

- [ ] **Step 4: Probar login**

Ingresar con `admin@dcsmart.com` / `Admin2024!` — debe redirigir a `/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Login.jsx frontend/.env
git commit -m "feat: add login page with email/password and optional google oauth"
```

---

### Task 8: Dashboard

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

- [ ] **Step 1: Implementar Dashboard.jsx**

Archivo `frontend/src/pages/Dashboard.jsx`:

```jsx
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

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
        Bienvenido, {user?.nombre}
      </h1>
      <p style={{ margin: '0 0 2rem', color: '#64748b' }}>Panel de control DCSmart</p>

      {/* Selector de App */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
          Seleccionar App
        </h2>
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
      </section>

      {/* Selector de Local */}
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

      {/* Stats */}
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: add dashboard with app/local selector and stats"
```

---

### Task 9: Páginas de Cajas

**Files:**
- Modify: `frontend/src/pages/cajas/CajaList.jsx`
- Modify: `frontend/src/pages/cajas/CajaDetail.jsx`

- [ ] **Step 1: Implementar CajaList.jsx**

Archivo `frontend/src/pages/cajas/CajaList.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'

const EMPTY_CAJA = { nro_turno: '', fecha_inicio: '', cajero: '', total: '', efectivo: '', fiscal: '', comensales: '', tickets: '', observaciones: '' }

export default function CajaList() {
  const navigate = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify = useUiStore((s) => s.notify)
  const [cajas, setCajas] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_CAJA)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, page, limit: 20 })
      .then(({ data }) => { setCajas(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar cajas', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [page, activeLocal?.id])

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta caja?')) return
    try {
      await cajasApi.remove(id)
      notify('Caja eliminada', 'success')
      load()
    } catch { notify('Error al eliminar', 'error') }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!activeLocal) { notify('Seleccioná un local primero', 'error'); return }
    setSaving(true)
    try {
      await cajasApi.create({ ...form, id_local: activeLocal.id })
      notify('Caja creada', 'success')
      setForm(EMPTY_CAJA)
      setShowForm(false)
      load()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
    } finally { setSaving(false) }
  }

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Cajas</h1>
          {activeLocal && <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>Local: {activeLocal.nombre}</p>}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            padding: '0.6rem 1.25rem', background: '#1e40af', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600
          }}
        >
          {showForm ? 'Cancelar' : '+ Nueva Caja'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Nueva Caja</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {[
              ['fecha_inicio', 'Fecha Inicio *', 'datetime-local', true],
              ['nro_turno', 'Nro Turno', 'text', false],
              ['cajero', 'Cajero', 'text', false],
              ['total', 'Total', 'number', false],
              ['efectivo', 'Efectivo', 'number', false],
              ['fiscal', 'Fiscal', 'number', false],
              ['comensales', 'Comensales', 'number', false],
              ['tickets', 'Tickets', 'number', false]
            ].map(([f, l, t, req]) => (
              <div key={f}>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>{l}</label>
                <input
                  type={t}
                  required={req}
                  step={t === 'number' ? '0.01' : undefined}
                  value={form[f]}
                  onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Observaciones</label>
            <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} rows={2} style={{ width: '100%', padding: '0.45rem', borderRadius: 6, border: '1px solid #d1d5db', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={saving} style={{ padding: '0.55rem 1.25rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : 'Crear Caja'}
          </button>
        </form>
      )}


      {!activeLocal && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          Seleccioná un local desde el Dashboard para ver sus cajas.
        </div>
      )}

      {activeLocal && (
        <>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Nro Turno', 'Inicio', 'Cierre', 'Total', 'Efectivo', 'Cajero', 'Acciones'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cajas.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.nro_turno || '-'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{new Date(c.fecha_inicio).toLocaleDateString('es-AR')}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleDateString('es-AR') : '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{c.total ? `$${Number(c.total).toLocaleString('es-AR')}` : '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.efectivo ? `$${Number(c.efectivo).toLocaleString('es-AR')}` : '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.cajero || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => navigate(`/cajas/${c.id}`)}
                        style={{ padding: '0.3rem 0.75rem', background: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      >
                        Ver
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {cajas.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      No hay cajas registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {total > 20 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                style={{ padding: '0.4rem 0.75rem', borderRadius: 4, border: '1px solid #e2e8f0', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
              >
                ← Anterior
              </button>
              <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Página {page} de {Math.ceil(total / 20)}</span>
              <button
                disabled={page >= Math.ceil(total / 20)}
                onClick={() => setPage((p) => p + 1)}
                style={{ padding: '0.4rem 0.75rem', borderRadius: 4, border: '1px solid #e2e8f0', cursor: page >= Math.ceil(total / 20) ? 'not-allowed' : 'pointer' }}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implementar CajaDetail.jsx**

Archivo `frontend/src/pages/cajas/CajaDetail.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { movimientosApi } from '../../api/movimientos.js'
import { useUiStore } from '../../store/uiStore.js'

export default function CajaDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const [caja, setCaja] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newMov, setNewMov] = useState({ tipo: 'INGRESO', monto: '', id_metodo: '' })

  const load = () => {
    setLoading(true)
    cajasApi.get(id)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar la caja', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  const handleAddMovimiento = async (e) => {
    e.preventDefault()
    try {
      await movimientosApi.create({ ...newMov, monto: parseFloat(newMov.monto), id_caja: id })
      notify('Movimiento agregado', 'success')
      setNewMov({ tipo: 'INGRESO', monto: '', id_metodo: '' })
      load()
    } catch { notify('Error al agregar movimiento', 'error') }
  }

  const handleDeleteMov = async (movId) => {
    if (!confirm('¿Eliminar movimiento?')) return
    try {
      await movimientosApi.remove(movId)
      notify('Movimiento eliminado', 'success')
      load()
    } catch { notify('Error al eliminar', 'error') }
  }

  if (loading) return <div>Cargando...</div>
  if (!caja) return <div>Caja no encontrada</div>

  const totalMovimientos = caja.movimientos?.reduce((acc, m) => acc + Number(m.monto), 0) || 0

  return (
    <div>
      <button
        onClick={() => navigate('/cajas')}
        style={{ marginBottom: '1rem', background: 'none', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: '0.9rem' }}
      >
        ← Volver a Cajas
      </button>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {/* Detalle caja */}
        <div style={{ flex: 1, minWidth: 280, background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 700 }}>
            Caja {caja.nro_turno || `#${caja.id.slice(0, 8)}`}
          </h2>
          {[
            ['Local', caja.local?.nombre],
            ['Inicio', new Date(caja.fecha_inicio).toLocaleString('es-AR')],
            ['Cierre', caja.fecha_cierre ? new Date(caja.fecha_cierre).toLocaleString('es-AR') : '—'],
            ['Cajero', caja.cajero || '—'],
            ['Total', caja.total ? `$${Number(caja.total).toLocaleString('es-AR')}` : '—'],
            ['Efectivo', caja.efectivo ? `$${Number(caja.efectivo).toLocaleString('es-AR')}` : '—'],
            ['Fiscal', caja.fiscal ? `$${Number(caja.fiscal).toLocaleString('es-AR')}` : '—'],
            ['Comensales', caja.comensales ?? '—'],
            ['Tickets', caja.tickets ?? '—'],
            ['Origen', caja.origin]
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: '#64748b', fontSize: '0.875rem' }}>{k}</span>
              <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Movimientos */}
        <div style={{ flex: 2, minWidth: 320 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>
              Movimientos ({caja.movimientos?.length || 0}) — Total: ${totalMovimientos.toLocaleString('es-AR')}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Tipo', 'Método', 'Monto', 'Cantidad', ''].map((h) => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(caja.movimientos || []).map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{m.tipo}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{m.metodo_pago?.nombre || '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>${Number(m.monto).toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{m.cantidad ?? '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <button
                        onClick={() => handleDeleteMov(m.id)}
                        style={{ padding: '0.2rem 0.5rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {(!caja.movimientos || caja.movimientos.length === 0) && (
                  <tr>
                    <td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>Sin movimientos</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Agregar movimiento */}
          <form onSubmit={handleAddMovimiento} style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Agregar Movimiento</h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Tipo</label>
                <select
                  value={newMov.tipo}
                  onChange={(e) => setNewMov({ ...newMov, tipo: e.target.value })}
                  style={{ padding: '0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}
                >
                  <option>INGRESO</option>
                  <option>EGRESO</option>
                  <option>APERTURA</option>
                  <option>CIERRE</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Monto</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newMov.monto}
                  onChange={(e) => setNewMov({ ...newMov, monto: e.target.value })}
                  style={{ padding: '0.5rem', borderRadius: 4, border: '1px solid #d1d5db', width: 120 }}
                />
              </div>
              <button
                type="submit"
                style={{ padding: '0.5rem 1rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
              >
                Agregar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/cajas/
git commit -m "feat: add caja list and detail pages"
```

---

### Task 10: Páginas de Pagos

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx`
- Modify: `frontend/src/pages/pagos/PagoForm.jsx`

- [ ] **Step 1: Implementar PagoList.jsx**

Archivo `frontend/src/pages/pagos/PagoList.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'

const ESTADO_COLORS = {
  PENDIENTE: '#f59e0b',
  APROBADO: '#3b82f6',
  RECHAZADO: '#ef4444',
  PAGADO: '#22c55e'
}

export default function PagoList() {
  const navigate = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify = useUiStore((s) => s.notify)
  const [pagos, setPagos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ pagado: '', estado_op: '' })

  const load = () => {
    setLoading(true)
    const params = {
      id_local: activeLocal?.id,
      page,
      limit: 20,
      ...(filters.pagado !== '' ? { pagado: filters.pagado } : {}),
      ...(filters.estado_op ? { estado_op: filters.estado_op } : {})
    }
    pagosApi.list(params)
      .then(({ data }) => { setPagos(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar pagos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [page, activeLocal?.id, filters.pagado, filters.estado_op])

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este pago?')) return
    try {
      await pagosApi.remove(id)
      notify('Pago eliminado', 'success')
      load()
    } catch { notify('Error al eliminar', 'error') }
  }

  const handleAudit = async (id) => {
    try {
      await pagosApi.audit(id)
      notify('Pago auditado', 'success')
      load()
    } catch { notify('Error al auditar', 'error') }
  }

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Pagos</h1>
        <button
          onClick={() => navigate('/pagos/nuevo')}
          style={{ padding: '0.6rem 1.25rem', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
        >
          + Nuevo Pago
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={filters.pagado}
          onChange={(e) => { setFilters({ ...filters, pagado: e.target.value }); setPage(1) }}
          style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}
        >
          <option value="">Todos</option>
          <option value="false">No pagados</option>
          <option value="true">Pagados</option>
        </select>
        <select
          value={filters.estado_op}
          onChange={(e) => { setFilters({ ...filters, estado_op: e.target.value }); setPage(1) }}
          style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}
        >
          <option value="">Todos los estados</option>
          {['PENDIENTE', 'APROBADO', 'RECHAZADO', 'PAGADO'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Fecha', 'Proveedor', 'Importe', 'Estado', 'Pagado', 'Audit', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR') : '—'}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>{p.proveedor?.nombre || '—'}</td>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                  {p.importe ? `$${Number(p.importe).toLocaleString('es-AR')}` : '—'}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {p.estado_op ? (
                    <span style={{
                      background: ESTADO_COLORS[p.estado_op] + '20',
                      color: ESTADO_COLORS[p.estado_op],
                      padding: '0.2rem 0.5rem', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600
                    }}>
                      {p.estado_op}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span style={{ color: p.pagado ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {p.pagado ? '✓' : '✗'}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {p.audit ? (
                    <span style={{ color: '#16a34a', fontSize: '0.75rem' }}>✓ Auditado</span>
                  ) : (
                    <button
                      onClick={() => handleAudit(p.id)}
                      style={{ padding: '0.2rem 0.5rem', background: '#f0fdf4', color: '#16a34a', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      Auditar
                    </button>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => navigate(`/pagos/${p.id}/editar`)}
                    style={{ padding: '0.3rem 0.6rem', background: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {pagos.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  No hay pagos registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} style={{ padding: '0.4rem 0.75rem', borderRadius: 4, border: '1px solid #e2e8f0', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
            ← Anterior
          </button>
          <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Página {page} de {Math.ceil(total / 20)}</span>
          <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)} style={{ padding: '0.4rem 0.75rem', borderRadius: 4, border: '1px solid #e2e8f0', cursor: page >= Math.ceil(total / 20) ? 'not-allowed' : 'pointer' }}>
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implementar PagoForm.jsx**

Archivo `frontend/src/pages/pagos/PagoForm.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { pagosApi } from '../../api/pagos.js'
import { proveedoresApi } from '../../api/proveedores.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'

const inputStyle = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
  border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box'
}

const labelStyle = { display: 'block', marginBottom: 4, fontSize: '0.8rem', fontWeight: 500, color: '#374151' }

export default function PagoForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify = useUiStore((s) => s.notify)
  const isEditing = Boolean(id)

  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    fecha: '', id_proveedor: '', id_tipo: '',
    importe_neto: '', descuento: '', importe: '',
    id_metodo: '', observaciones: '', pagado: false,
    estado_op: 'PENDIENTE', ingresa_egreso: true,
    id_local: activeLocal?.id || ''
  })

  useEffect(() => {
    proveedoresApi.list({ activo: 'true' }).then(({ data }) => setProveedores(data)).catch(console.error)
    if (isEditing) {
      pagosApi.get(id).then(({ data }) => {
        setForm({
          fecha: data.fecha ? data.fecha.slice(0, 10) : '',
          id_proveedor: data.id_proveedor || '',
          id_tipo: data.id_tipo || '',
          importe_neto: data.importe_neto || '',
          descuento: data.descuento || '',
          importe: data.importe || '',
          id_metodo: data.id_metodo || '',
          observaciones: data.observaciones || '',
          pagado: data.pagado,
          estado_op: data.estado_op || 'PENDIENTE',
          ingresa_egreso: data.ingresa_egreso,
          id_local: data.id_local || ''
        })
      }).catch(() => notify('Error al cargar el pago', 'error'))
    }
  }, [id])

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEditing) {
        await pagosApi.update(id, form)
        notify('Pago actualizado', 'success')
      } else {
        await pagosApi.create(form)
        notify('Pago creado', 'success')
      }
      navigate('/pagos')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={() => navigate('/pagos')}
        style={{ marginBottom: '1rem', background: 'none', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: '0.9rem' }}
      >
        ← Volver a Pagos
      </button>

      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
        {isEditing ? 'Editar Pago' : 'Nuevo Pago'}
      </h1>

      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 10, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Proveedor</label>
            <select value={form.id_proveedor} onChange={(e) => set('id_proveedor', e.target.value)} style={inputStyle}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select value={form.id_tipo} onChange={(e) => set('id_tipo', e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {['A','B','C','CM','INTERCOMPANY'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Importe Neto</label>
            <input type="number" step="0.01" value={form.importe_neto} onChange={(e) => set('importe_neto', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Descuento</label>
            <input type="number" step="0.01" value={form.descuento} onChange={(e) => set('descuento', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Importe Total</label>
            <input type="number" step="0.01" value={form.importe} onChange={(e) => set('importe', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Estado</label>
            <select value={form.estado_op} onChange={(e) => set('estado_op', e.target.value)} style={inputStyle}>
              {['PENDIENTE','APROBADO','RECHAZADO','PAGADO'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
            <input type="checkbox" checked={form.pagado} onChange={(e) => set('pagado', e.target.checked)} id="pagado" />
            <label htmlFor="pagado" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>Pagado</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
            <input type="checkbox" checked={form.ingresa_egreso} onChange={(e) => set('ingresa_egreso', e.target.checked)} id="ingresa" />
            <label htmlFor="ingresa" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>Ingreso (desch. = egreso)</label>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Observaciones</label>
          <textarea
            value={form.observaciones}
            onChange={(e) => set('observaciones', e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '0.65rem 1.5rem', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear Pago'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/pagos')}
            style={{ padding: '0.65rem 1.5rem', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/pagos/
git commit -m "feat: add pagos list and form pages"
```

---

### Task 11: Páginas de Proveedores

**Files:**
- Modify: `frontend/src/pages/proveedores/ProveedorList.jsx`
- Modify: `frontend/src/pages/proveedores/ProveedorForm.jsx`

- [ ] **Step 1: Implementar ProveedorList.jsx**

Archivo `frontend/src/pages/proveedores/ProveedorList.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'

export default function ProveedorList() {
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const [proveedores, setProveedores] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    proveedoresApi.list({ activo: 'true', search: search || undefined })
      .then(({ data }) => setProveedores(data))
      .catch(() => notify('Error al cargar proveedores', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [search])

  const handleDelete = async (id) => {
    if (!confirm('¿Desactivar este proveedor?')) return
    try {
      await proveedoresApi.remove(id)
      notify('Proveedor desactivado', 'success')
      load()
    } catch { notify('Error al desactivar', 'error') }
  }

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Proveedores</h1>
        <button
          onClick={() => navigate('/proveedores/nuevo')}
          style={{ padding: '0.6rem 1.25rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
        >
          + Nuevo Proveedor
        </button>
      </div>

      <input
        type="search"
        placeholder="Buscar por nombre, razón social o CUIT..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', maxWidth: 400, padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: '1rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
      />

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Nombre', 'Razón Social', 'CUIT', 'Teléfono', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{p.nombre}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{p.razon_social || '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{p.cuit || '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{p.telefono || '—'}</td>
                <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => navigate(`/proveedores/${p.id}/editar`)}
                    style={{ padding: '0.3rem 0.6rem', background: '#f5f3ff', color: '#7c3aed', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {proveedores.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  No hay proveedores
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implementar ProveedorForm.jsx**

Archivo `frontend/src/pages/proveedores/ProveedorForm.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'

const inputStyle = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
  border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box'
}
const labelStyle = { display: 'block', marginBottom: 4, fontSize: '0.8rem', fontWeight: 500, color: '#374151' }

const EMPTY = {
  nombre: '', razon_social: '', cuit: '', banco: '', cbu: '', alias: '',
  direccion_url: '', detalle_direc: '', telefono: '', mail_contacto: '',
  mail_envio: '', tag: '', activo: true
}

export default function ProveedorForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const isEditing = Boolean(id)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isEditing) {
      proveedoresApi.get(id)
        .then(({ data }) => setForm({ ...EMPTY, ...data }))
        .catch(() => notify('Error al cargar proveedor', 'error'))
    }
  }, [id])

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { notify('El nombre es requerido', 'error'); return }
    setLoading(true)
    try {
      if (isEditing) {
        await proveedoresApi.update(id, form)
        notify('Proveedor actualizado', 'success')
      } else {
        await proveedoresApi.create(form)
        notify('Proveedor creado', 'success')
      }
      navigate('/proveedores')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    ['nombre', 'Nombre *', 'text'],
    ['razon_social', 'Razón Social', 'text'],
    ['cuit', 'CUIT', 'text'],
    ['banco', 'Banco', 'text'],
    ['cbu', 'CBU', 'text'],
    ['alias', 'Alias', 'text'],
    ['telefono', 'Teléfono', 'text'],
    ['mail_contacto', 'Email Contacto', 'email'],
    ['mail_envio', 'Email Envío', 'email'],
    ['direccion_url', 'URL Dirección', 'url'],
    ['detalle_direc', 'Detalle Dirección', 'text'],
    ['tag', 'Tag', 'text']
  ]

  return (
    <div>
      <button
        onClick={() => navigate('/proveedores')}
        style={{ marginBottom: '1rem', background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: '0.9rem' }}
      >
        ← Volver a Proveedores
      </button>

      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
        {isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
      </h1>

      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 10, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {fields.map(([field, label, type]) => (
            <div key={field}>
              <label style={labelStyle}>{label}</label>
              <input
                type={type}
                value={form[field]}
                onChange={(e) => set(field, e.target.value)}
                required={field === 'nombre'}
                style={inputStyle}
              />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
            <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} id="activo" />
            <label htmlFor="activo" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>Activo</label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '0.65rem 1.5rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear Proveedor'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/proveedores')}
            style={{ padding: '0.65rem 1.5rem', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/proveedores/
git commit -m "feat: add proveedores list and form pages"
```

---

### Task 12: Páginas de Administración

**Files:**
- Modify: `frontend/src/pages/admin/Apps.jsx`
- Modify: `frontend/src/pages/admin/Locales.jsx`
- Modify: `frontend/src/pages/admin/Users.jsx`

- [ ] **Step 1: Implementar admin/Apps.jsx**

Archivo `frontend/src/pages/admin/Apps.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { appsApi } from '../../api/apps.js'
import { useUiStore } from '../../store/uiStore.js'

export default function Apps() {
  const notify = useUiStore((s) => s.notify)
  const [apps, setApps] = useState([])
  const [form, setForm] = useState({ nombre: '', slug: '', activo: true })
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    appsApi.list().then(({ data }) => setApps(data)).catch(() => notify('Error al cargar', 'error')).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editing) {
        await appsApi.update(editing, form)
        notify('App actualizada', 'success')
      } else {
        await appsApi.create(form)
        notify('App creada', 'success')
      }
      setForm({ nombre: '', slug: '', activo: true })
      setEditing(null)
      load()
    } catch (err) {
      notify(err.response?.data?.error || 'Error', 'error')
    }
  }

  const startEdit = (app) => {
    setEditing(app.id)
    setForm({ nombre: app.nombre, slug: app.slug, activo: app.activo })
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar app?')) return
    try { await appsApi.remove(id); notify('App eliminada', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Apps</h1>

      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Nombre</label>
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db', width: 180 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>Slug</label>
          <input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db', width: 140 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: 2 }}>
          <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} id="app-activo" />
          <label htmlFor="app-activo" style={{ fontSize: '0.875rem' }}>Activo</label>
        </div>
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
          {editing ? 'Actualizar' : 'Crear'}
        </button>
        {editing && (
          <button type="button" onClick={() => { setEditing(null); setForm({ nombre: '', slug: '', activo: true }) }} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Cancelar
          </button>
        )}
      </form>

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Nombre', 'Slug', 'Activo', 'Locales', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{a.nombre}</td>
                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#64748b' }}>{a.slug}</td>
                <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: a.activo ? '#16a34a' : '#dc2626' }}>{a.activo ? '✓' : '✗'}</span></td>
                <td style={{ padding: '0.75rem 1rem' }}>{a.locales?.length ?? 0}</td>
                <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => startEdit(a)} style={{ padding: '0.3rem 0.6rem', background: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Editar</button>
                  <button onClick={() => handleDelete(a.id)} style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No hay apps</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implementar admin/Locales.jsx**

Archivo `frontend/src/pages/admin/Locales.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { localesApi } from '../../api/locales.js'
import { appsApi } from '../../api/apps.js'
import { useUiStore } from '../../store/uiStore.js'

export default function Locales() {
  const notify = useUiStore((s) => s.notify)
  const [locales, setLocales] = useState([])
  const [apps, setApps] = useState([])
  const [form, setForm] = useState({ nombre: '', id_app: '', direccion: '', telefono: '', activo: true })
  const [editing, setEditing] = useState(null)
  const [filterApp, setFilterApp] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      localesApi.list(filterApp ? { id_app: filterApp } : {}),
      appsApi.list()
    ])
      .then(([l, a]) => { setLocales(l.data); setApps(a.data) })
      .catch(() => notify('Error al cargar', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [filterApp])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.id_app) { notify('Seleccioná una app', 'error'); return }
    try {
      if (editing) {
        await localesApi.update(editing, form)
        notify('Local actualizado', 'success')
      } else {
        await localesApi.create(form)
        notify('Local creado', 'success')
      }
      setForm({ nombre: '', id_app: '', direccion: '', telefono: '', activo: true })
      setEditing(null)
      load()
    } catch (err) {
      notify(err.response?.data?.error || 'Error', 'error')
    }
  }

  const startEdit = (l) => {
    setEditing(l.id)
    setForm({ nombre: l.nombre, id_app: l.id_app, direccion: l.direccion || '', telefono: l.telefono || '', activo: l.activo })
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar local?')) return
    try { await localesApi.remove(id); notify('Local eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Locales</h1>

      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {[
          ['nombre', 'Nombre', 'text', true, 180],
          ['direccion', 'Dirección', 'text', false, 200],
          ['telefono', 'Teléfono', 'text', false, 120]
        ].map(([f, l, t, req, w]) => (
          <div key={f}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>{l}</label>
            <input type={t} required={req} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db', width: w }} />
          </div>
        ))}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 3, color: '#374151' }}>App</label>
          <select required value={form.id_app} onChange={(e) => setForm({ ...form, id_app: e.target.value })} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}>
            <option value="">Seleccionar...</option>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: 2 }}>
          <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} id="local-activo" />
          <label htmlFor="local-activo" style={{ fontSize: '0.875rem' }}>Activo</label>
        </div>
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
          {editing ? 'Actualizar' : 'Crear'}
        </button>
        {editing && (
          <button type="button" onClick={() => { setEditing(null); setForm({ nombre: '', id_app: '', direccion: '', telefono: '', activo: true }) }} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
        )}
      </form>

      <div style={{ marginBottom: '1rem' }}>
        <select value={filterApp} onChange={(e) => setFilterApp(e.target.value)} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}>
          <option value="">Todas las apps</option>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Nombre', 'App', 'Dirección', 'Teléfono', 'Activo', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locales.map((l) => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{l.nombre}</td>
                <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{l.app?.nombre}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{l.direccion || '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{l.telefono || '—'}</td>
                <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: l.activo ? '#16a34a' : '#dc2626' }}>{l.activo ? '✓' : '✗'}</span></td>
                <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => startEdit(l)} style={{ padding: '0.3rem 0.6rem', background: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Editar</button>
                  <button onClick={() => handleDelete(l.id)} style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                </td>
              </tr>
            ))}
            {locales.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No hay locales</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implementar admin/Users.jsx**

Archivo `frontend/src/pages/admin/Users.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { usersApi } from '../../api/users.js'
import { useUiStore } from '../../store/uiStore.js'

export default function Users() {
  const notify = useUiStore((s) => s.notify)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    usersApi.list().then(({ data }) => setUsers(data)).catch(() => notify('Error al cargar usuarios', 'error')).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleDeactivate = async (id) => {
    if (!confirm('¿Desactivar usuario?')) return
    try {
      await usersApi.remove(id)
      notify('Usuario desactivado', 'success')
      load()
    } catch { notify('Error al desactivar', 'error') }
  }

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>Usuarios</h1>

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Usuario', 'Email', 'Rol', 'App', 'Activo', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const primaryRole = u.user_app_roles?.[0]
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {u.avatar_url && <img src={u.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
                      <span style={{ fontWeight: 500 }}>{u.nombre}</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{u.email}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {primaryRole?.role?.nombre ? (
                      <span style={{ background: '#eff6ff', color: '#1e40af', padding: '0.2rem 0.5rem', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>
                        {primaryRole.role.nombre}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{primaryRole?.app?.nombre || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ color: u.activo ? '#16a34a' : '#dc2626' }}>{u.activo ? '✓' : '✗'}</span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {u.activo && (
                      <button
                        onClick={() => handleDeactivate(u.id)}
                        style={{ padding: '0.3rem 0.6rem', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        Desactivar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No hay usuarios</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/
git commit -m "feat: add admin pages for apps, locales and users"
```

---

### Task 13: Smoke test final del frontend

- [ ] **Step 1: Iniciar backend y frontend**

Terminal 1:
```bash
cd backend && npm run dev
```

Terminal 2:
```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Probar flujo completo**

1. Abrir http://localhost:5173
2. Debería redirigir a `/login`
3. Ingresar con `admin@dcsmart.com` / `Admin2024!`
4. Debe redirigir al Dashboard
5. Seleccionar la app "DCSmart Demo"
6. Seleccionar el local "Local Central"
7. Navegar a Cajas — debe listar (vacío inicialmente)
8. Navegar a Pagos — debe listar (vacío inicialmente)
9. Navegar a Proveedores — debe listar (vacío inicialmente)
10. Navegar a Admin > Apps — debe mostrar la app demo
11. Navegar a Admin > Locales — debe mostrar el local
12. Navegar a Admin > Usuarios — debe mostrar admin@dcsmart.com
13. Cerrar sesión desde el sidebar — debe volver al login

- [ ] **Step 3: Verificar PWA**

```bash
cd frontend && npm run build
npm run preview
```

Abrir Chrome DevTools → Application → Service Workers — debe aparecer el SW registrado.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat: complete frontend PWA implementation"
```

---

**Frontend completo.** El proyecto DCSmart está funcional con backend API + frontend PWA.
