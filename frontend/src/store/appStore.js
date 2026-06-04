import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAppStore = create(
  persist(
    (set) => ({
      activeApp: null,
      activeLocal: null,

      setActiveApp: (app) => set({ activeApp: app, activeLocal: null }),
      setActiveLocal: (local) => set({ activeLocal: local }),
      clearContext: () => set({ activeApp: null, activeLocal: null })
    }),
    {
      name: 'dcsmart-app-context'
    }
  )
)
