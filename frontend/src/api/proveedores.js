import client from './client.js'

export const proveedoresApi = {
  list: (params) => client.get('/proveedores', { params }),
  get: (id) => client.get(`/proveedores/${id}`),
  create: (data) => client.post('/proveedores', data),
  update: (id, data) => client.put(`/proveedores/${id}`, data),
  remove: (id) => client.delete(`/proveedores/${id}`)
}
