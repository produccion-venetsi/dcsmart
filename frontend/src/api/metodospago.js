import client from './client.js'

export const metodosApi = {
  list:   ()         => client.get('/metodos-pago'),
  create: (data)     => client.post('/metodos-pago', data),
  update: (id, data) => client.put(`/metodos-pago/${id}`, data),
  remove: (id)       => client.delete(`/metodos-pago/${id}`)
}
