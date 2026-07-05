import client from './client.js'

export const reportesApi = {
  cajas: (params, signal) => client.get('/reportes/cajas', { params, signal }),
  pagos: (params, signal) => client.get('/reportes/pagos', { params, signal }),
  cmv:   (params, signal) => client.get('/reportes/cmv', { params, signal })
}
