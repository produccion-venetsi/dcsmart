import client from './client.js'

export const detalleTiposApi = {
  list:   ()         => client.get('/detalle-tipos'),
  create: (data)     => client.post('/detalle-tipos', data),
  update: (id, data) => client.put(`/detalle-tipos/${id}`, data),
  remove: (id)       => client.delete(`/detalle-tipos/${id}`)
}
