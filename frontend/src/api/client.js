import axios from 'axios'
import { useAppStore } from '../store/appStore'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
  // Timeout generoso (cubre el cold start de Cloud Run pero evita que una
  // request quede colgada para siempre y deje la app en una pantalla de carga
  // infinita). 45s para no cortar subidas de archivos en conexiones lentas.
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' }
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const { activeApp } = useAppStore.getState()
  if (activeApp?.app?.id) config.headers['X-App-Id'] = activeApp.app.id

  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    if (err.response?.status === 403) {
      const msg = err.response.data?.error || 'Sin acceso a este recurso'
      console.warn('[appContext]', msg)
      // Si el local activo ya no es válido, limpiarlo
      if (msg.includes('local')) {
        useAppStore.getState().setActiveLocal(null)
      }
    }
    return Promise.reject(err)
  }
)

export default client
