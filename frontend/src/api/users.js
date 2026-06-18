import client from './client.js'

export const usersApi = {
  list: () => client.get('/users'),
  get: (id) => client.get(`/users/${id}`),
  create: (data) => client.post('/users', data),
  update: (id, data) => client.put(`/users/${id}`, data),
  remove: (id) => client.delete(`/users/${id}`),
  assignRole: (id, data) => client.post(`/users/${id}/roles`, data),
  removeRole: (id, id_app) => client.delete(`/users/${id}/roles/${id_app ?? 'global'}`),
  addLocalAccess: (id, data) => client.post(`/users/${id}/local-access`, data),
  removeLocalAccess: (id, data) => client.delete(`/users/${id}/local-access`, { data })
}
