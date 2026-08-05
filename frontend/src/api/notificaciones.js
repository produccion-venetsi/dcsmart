import client from './client.js'

// Se llaman "avisos" en el frontend y no "notificaciones" porque uiStore ya tiene
// `notifications`, que son los toasts que aparecen y se van. Estos persisten.
export const avisosApi = {
  list:        (params, signal) => client.get('/notificaciones', { params, signal }),
  marcarLeida: (id)             => client.patch(`/notificaciones/${id}/leida`),
  leerTodas:   ()               => client.patch('/notificaciones/leer-todas'),
}
