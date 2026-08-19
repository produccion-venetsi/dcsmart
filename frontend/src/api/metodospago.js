import client from './client.js'

export const metodosApi = {
  // list(): solo activos, para los combos. listAll(): también inactivos,
  // para la pantalla de administración.
  list:    ()        => client.get('/metodos-pago'),
  listAll: ()        => client.get('/metodos-pago', { params: { all: 1 } }),
  create: (data)     => client.post('/metodos-pago', data),
  update: (id, data) => client.put(`/metodos-pago/${id}`, data),
  remove: (id)       => client.delete(`/metodos-pago/${id}`)
}
