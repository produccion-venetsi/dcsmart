import client from './client.js'

export const localesApi = {
  list: (params) => client.get('/locales', { params }),
  get: (id) => client.get(`/locales/${id}`),
  create: (data) => client.post('/locales', data),
  update: (id, data) => client.put(`/locales/${id}`, data),
  remove: (id) => client.delete(`/locales/${id}`)
}
