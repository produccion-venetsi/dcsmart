import client from './client.js'

export const impuestosApi = {
  list:   (params)   => client.get('/impuestos', { params }),
  create: (data)     => client.post('/impuestos', data),
  remove: (id)       => client.delete(`/impuestos/${id}`)
}
