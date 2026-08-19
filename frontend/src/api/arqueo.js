import client from './client.js'

export const arqueoApi = {
  list:    (id_local, signal) => client.get('/arqueo', { params: { id_local }, signal }),
  get:     (id)                => client.get(`/arqueo/${id}`),
  create:  (data)              => client.post('/arqueo', data),
  update:  (id, data)          => client.put(`/arqueo/${id}`, data),
  remove:  (id)                => client.delete(`/arqueo/${id}`),
  preview: (id_local, fecha)   => client.get('/arqueo/preview', { params: { id_local, fecha } }),
  audit:   (id, data)          => client.patch(`/arqueo/${id}/audit`, data),
  // Aplica el número que le corresponde hoy al arqueo (cuando llegaron cajas
  // del período después de cerrarlo). No toca lo que se contó a mano.
  recalcular: (id)             => client.post(`/arqueo/${id}/recalcular`),

  // Disponibilidades del ultimo arqueo de cada local del grupo activo
  disponibilidades: (signal)   => client.get('/arqueo/disponibilidades', { signal }),
  // Cajas y pagos en efectivo de un periodo: sin id_arqueo, desde el ultimo
  // arqueo hasta ahora; con id_arqueo, el periodo de ese arqueo.
  movimientos: (params, signal) => client.get('/arqueo/movimientos', { params, signal }),
}
