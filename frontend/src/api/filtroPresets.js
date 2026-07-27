import client from './client.js'

export const filtroPresetsApi = {
  list:   (modulo = 'pagos', signal) => client.get('/filtro-presets', { params: { modulo }, signal }),
  create: (data)                     => client.post('/filtro-presets', data),
  update: (id, data)                 => client.put(`/filtro-presets/${id}`, data),
  remove: (id)                       => client.delete(`/filtro-presets/${id}`),
}
