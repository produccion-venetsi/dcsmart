import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api/auth.js'
import { useAppStore } from './appStore.js'

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
        useAppStore.getState().clearContext()
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
