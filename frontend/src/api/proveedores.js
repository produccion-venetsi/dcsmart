import client from './client.js'

export const proveedoresApi = {
  list:   (params, signal) => client.get('/proveedores',       { params, signal }),
  get:    (id,    signal)  => client.get(`/proveedores/${id}`, { signal }),
  create: (data)           => client.post('/proveedores',       data),
  update: (id, data)       => client.put(`/proveedores/${id}`,  data),
  remove: (id)             => client.delete(`/proveedores/${id}`)
}
