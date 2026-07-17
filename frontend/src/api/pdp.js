import client from './client.js'

export const pdpApi = {
  list:   (id_local, signal) => client.get('/pdp', { params: { id_local }, signal }),
  create: (data)              => client.post('/pdp', data),
  attachment: (id)             => client.get(`/pdp/${id}/attachment`, { responseType: 'blob' }),
}
