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
    // El cliente fuerza Content-Type: application/json por defecto (ver
    // client.js) y no lo pisa solo por mandar un FormData -- sin este
    // override el backend rechaza con 406 "the request is not multipart"
    // (FST_INVALID_MULTIPART_CONTENT_TYPE). Mismo fix que pagosApi.upload.
    return client.post(`/locales/${id}/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  removeLogo: (id) => client.delete(`/locales/${id}/logo`),

  // El bucket es privado y el proxy pide el JWT, que un <img src> no manda:
  // se baja como blob y se muestra con createObjectURL, igual que las fotos
  // de cajas y pagos (ver CajaFotoViewer).
  getLogo: (id) => client.get(`/locales/${id}/logo`, { responseType: 'blob' })
}
