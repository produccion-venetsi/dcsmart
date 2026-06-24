import client from './client.js'

export const reportesApi = {
  get: (params, signal) => client.get('/reportes', { params, signal })
}
