import client from './client.js'

export const movimientosApi = {
  list: (id_caja) => client.get('/caja-movimientos', { params: { id_caja } }),
  get: (id) => client.get(`/caja-movimientos/${id}`),
  create: (data) => client.post('/caja-movimientos', data),
  update: (id, data) => client.put(`/caja-movimientos/${id}`, data),
  remove: (id) => client.delete(`/caja-movimientos/${id}`)
}
