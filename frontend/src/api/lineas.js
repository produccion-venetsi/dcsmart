import client from './client.js'

// Las líneas de una caja: la estructura que unifica detalles y movimientos.
export const lineasApi = {
  list:   (id_caja)     => client.get('/caja-lineas', { params: { id_caja } }),
  create: (data)        => client.post('/caja-lineas', data),
  update: (id, data)    => client.put(`/caja-lineas/${id}`, data),
  remove: (id)          => client.delete(`/caja-lineas/${id}`),
}
