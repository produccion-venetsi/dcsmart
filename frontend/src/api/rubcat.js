import client from './client.js'

export const rubrosApi = {
  list: () => client.get('/rubcat/rubros'),
  create: (data) => client.post('/rubcat/rubros', data),
  update: (id, data) => client.put(`/rubcat/rubros/${id}`, data),
  remove: (id) => client.delete(`/rubcat/rubros/${id}`)
}

export const categoriasApi = {
  list: () => client.get('/rubcat/categorias'),
  create: (data) => client.post('/rubcat/categorias', data),
  update: (id, data) => client.put(`/rubcat/categorias/${id}`, data),
  remove: (id) => client.delete(`/rubcat/categorias/${id}`)
}

export const rubcatApi = {
  list: (params) => client.get('/rubcat', { params }),
  get: (id) => client.get(`/rubcat/${id}`),
  create: (data) => client.post('/rubcat', data),
  update: (id, data) => client.put(`/rubcat/${id}`, data),
  remove: (id) => client.delete(`/rubcat/${id}`)
}
