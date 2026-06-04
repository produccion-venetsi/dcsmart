import client from './client.js'

export const appsApi = {
  list: () => client.get('/apps'),
  get: (id) => client.get(`/apps/${id}`),
  create: (data) => client.post('/apps', data),
  update: (id, data) => client.put(`/apps/${id}`, data),
  remove: (id) => client.delete(`/apps/${id}`)
}
