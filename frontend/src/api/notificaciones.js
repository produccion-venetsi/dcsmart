import client from './client.js'

// Se llaman "avisos" en el frontend y no "notificaciones" porque uiStore ya tiene
// `notifications`, que son los toasts que aparecen y se van. Estos persisten.
export const avisosApi = {
  list:        (params, signal) => client.get('/notificaciones', { params, signal }),
  marcarLeida: (id)             => client.patch(`/notificaciones/${id}/leida`),
  // Marcar hecho o deshacerlo. `hecha` es distinto de leida: leida se marca sola al
  // abrir el aviso, hecha la pone la persona cuando resolvio lo que le pedian.
  marcarHecha: (id, hecha = true) => client.patch(`/notificaciones/${id}/hecha`, { hecha }),
  leerTodas:   ()               => client.patch('/notificaciones/leer-todas'),
}
