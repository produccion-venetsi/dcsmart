import client from './client.js'

export const arqueoApi = {
  list:    (id_local, signal) => client.get('/arqueo', { params: { id_local }, signal }),
  get:     (id)                => client.get(`/arqueo/${id}`),
  create:  (data)              => client.post('/arqueo', data),
  preview: (id_local, fecha)   => client.get('/arqueo/preview', { params: { id_local, fecha } }),
}
