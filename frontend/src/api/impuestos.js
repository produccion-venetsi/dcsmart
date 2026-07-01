import client from './client.js'

export const impuestosApi = {
  list:   (params)   => client.get('/impuestos', { params }),
  create: (data)     => client.post('/impuestos', data),
  update: (id, data) => client.put(`/impuestos/${id}`, data),
  remove: (id)       => client.delete(`/impuestos/${id}`)
}
