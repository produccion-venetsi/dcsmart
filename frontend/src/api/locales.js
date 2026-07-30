import client from './client.js'

export const localesApi = {
  list:   (params)   => client.get('/locales', { params }),
  get:    (id)       => client.get(`/locales/${id}`),
  create: (data)     => client.post('/locales', data),
  update: (id, data) => client.put(`/locales/${id}`, data),
  remove: (id)       => client.delete(`/locales/${id}`),

  uploadLogo: (id, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post(`/locales/${id}/logo`, fd)
  },
  removeLogo: (id) => client.delete(`/locales/${id}/logo`),

  // El bucket es privado y el proxy pide el JWT, que un <img src> no manda:
  // se baja como blob y se muestra con createObjectURL, igual que las fotos
  // de cajas y pagos (ver CajaFotoViewer).
  getLogo: (id) => client.get(`/locales/${id}/logo`, { responseType: 'blob' })
}
