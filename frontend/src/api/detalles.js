import client from './client.js'

export const detallesApi = {
  list:   (id_caja) => client.get('/caja-detalles',       { params: { id_caja } }),
  tipos:  ()        => client.get('/caja-detalles/tipos'),
  create: (data)    => client.post('/caja-detalles',       data),
  remove: (id)      => client.delete(`/caja-detalles/${id}`)
}
