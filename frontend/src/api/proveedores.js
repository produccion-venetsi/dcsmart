import client from './client.js'

export const proveedoresApi = {
  list:   (params, signal) => client.get('/proveedores',       { params, signal }),
  get:    (id,    signal)  => client.get(`/proveedores/${id}`, { signal }),
  create: (data)           => client.post('/proveedores',       data),
  update: (id, data)       => client.put(`/proveedores/${id}`,  data),
  remove: (id)             => client.delete(`/proveedores/${id}`),

  // Actividad del proveedor (pagos, totales, locales). Recortada por los
  // locales del usuario, asi que necesita el header X-App-Id como el resto.
  resumen: (id, signal) => client.get(`/proveedores/${id}/resumen`, { signal }),
}
