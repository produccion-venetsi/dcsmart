import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAppStore = create(
  persist(
    (set) => ({
      activeApp: null,
      activeLocal: null,

      // Modo de trabajo del super_admin: 'admin' u 'operar' (ver lib/modoTrabajo.js).
      // Separa las pantallas que cambian cosas de todos los grupos de las del día a
      // día, para no tocar usuarios o rubros creyendo estar dentro de un local.
      // null hasta que se resuelve al montar, según si ya había un grupo elegido.
      modo: null,
      setModo: (modo) => set({ modo }),

      setActiveApp: (app) => set({ activeApp: app, activeLocal: null }),
      setActiveLocal: (local) => set({ activeLocal: local }),
      // El modo NO se limpia al cambiar de grupo: cambiar de grupo es una acción de
      // operación, y volver a caer en admin sería sacar al usuario de donde estaba.
      clearContext: () => set({ activeApp: null, activeLocal: null })
    }),
    {
      name: 'dcsmart-app-context'
    }
  )
)
