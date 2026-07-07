import client from './client.js'

export const detallesApi = {
  list:   (id_caja)  => client.get('/caja-detalles',       { params: { id_caja } }),
  tipos:  (id_local) => client.get('/caja-detalles/tipos', { params: id_local ? { id_local } : {} }),
  create: (data)     => client.post('/caja-detalles',       data),
  update: (id, data) => client.put(`/caja-detalles/${id}`,  data),
  remove: (id)       => client.delete(`/caja-detalles/${id}`)
}
