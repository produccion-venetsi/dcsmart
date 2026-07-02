import { create } from 'zustand'

export const useUiStore = create((set, get) => ({
  sidebarOpen: true,
  notifications: [],
  confirmModal: null,
  promptModal: null,

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
  },

  // Modal de confirmación — devuelve Promise<boolean>
  showConfirm: (message, title) => {
    return new Promise((resolve) => {
      set({ confirmModal: { message, title: title || 'Confirmar', resolve } })
    })
  },

  dismissConfirm: (value) => {
    const { confirmModal } = get()
    if (confirmModal?.resolve) confirmModal.resolve(value)
    set({ confirmModal: null })
  },

  // Modal de confirmación + texto libre opcional — devuelve Promise<string|null>
  // (null = cancelado, string = confirmado, puede ser vacío)
  showPrompt: (message, opts = {}) => {
    return new Promise((resolve) => {
      set({
        promptModal: {
          message,
          title: opts.title || 'Confirmar',
          placeholder: opts.placeholder || '',
          resolve
        }
      })
    })
  },

  resolvePrompt: (value) => {
    const { promptModal } = get()
    if (promptModal?.resolve) promptModal.resolve(value)
    set({ promptModal: null })
  }
}))
