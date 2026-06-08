import client from './client.js'

export const pagosApi = {
  list:   (params, signal) => client.get('/pagos',              { params, signal }),
  get:    (id,    signal)  => client.get(`/pagos/${id}`,        { signal }),
  stats:  (params, signal) => client.get('/pagos/stats',        { params, signal }),
  chart:  (params, signal) => client.get('/pagos/chart',        { params, signal }),
  create: (data)           => client.post('/pagos',              data),
  update: (id, data)       => client.put(`/pagos/${id}`,         data),
  remove: (id)             => client.delete(`/pagos/${id}`),
  audit:  (id)             => client.patch(`/pagos/${id}/audit`)
}
