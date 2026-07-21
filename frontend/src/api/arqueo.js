import client from './client.js'

export const arqueoApi = {
  list:    (id_local, signal) => client.get('/arqueo', { params: { id_local }, signal }),
  get:     (id)                => client.get(`/arqueo/${id}`),
  create:  (data)              => client.post('/arqueo', data),
  update:  (id, data)          => client.put(`/arqueo/${id}`, data),
  remove:  (id)                => client.delete(`/arqueo/${id}`),
  preview: (id_local, fecha)   => client.get('/arqueo/preview', { params: { id_local, fecha } }),
  audit:   (id, data)          => client.patch(`/arqueo/${id}/audit`, data),
}
