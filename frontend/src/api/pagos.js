import client from './client.js'

export const pagosApi = {
  list: (params) => client.get('/pagos', { params }),
  get: (id) => client.get(`/pagos/${id}`),
  create: (data) => client.post('/pagos', data),
  update: (id, data) => client.put(`/pagos/${id}`, data),
  remove: (id) => client.delete(`/pagos/${id}`),
  audit: (id) => client.patch(`/pagos/${id}/audit`)
}
