import client from './client.js'

export const cajasApi = {
  list: (params) => client.get('/cajas', { params }),
  get: (id) => client.get(`/cajas/${id}`),
  create: (data) => client.post('/cajas', data),
  update: (id, data) => client.put(`/cajas/${id}`, data),
  remove: (id) => client.delete(`/cajas/${id}`)
}
