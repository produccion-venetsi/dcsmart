import client from './client.js'

export const documentosApi = {
  list: (params) => client.get('/documentos', { params }),
  get: (id) => client.get(`/documentos/${id}`),
  create: (data) => client.post('/documentos', data),
  update: (id, data) => client.put(`/documentos/${id}`, data),
  remove: (id) => client.delete(`/documentos/${id}`),

  // Tipos: globales y editables desde la app.
  tipos: (params) => client.get('/documentos/tipos', { params }),
  crearTipo: (data) => client.post('/documentos/tipos', data),
  editarTipo: (id, data) => client.put(`/documentos/tipos/${id}`, data),
  borrarTipo: (id) => client.delete(`/documentos/tipos/${id}`),
  iconos: () => client.get('/documentos/iconos'),

  // Archivos. Primero se sube (devuelve un gs://) y después se guarda con el documento,
  // igual que los adjuntos de pagos.
  subir: (file, { id_local } = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post('/documentos/upload', fd, {
      params: id_local ? { id_local } : undefined,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  agregarArchivos: (id, archivos) => client.post(`/documentos/${id}/archivos`, { archivos }),
  borrarArchivo: (id, idArchivo) => client.delete(`/documentos/${id}/archivos/${idArchivo}`),

  // El archivo se trae como blob y se abre con un object URL: un <a href> no puede
  // mandar el header de autorización, así que el navegador recibiría un 401.
  verArchivo: (id, idArchivo, { descargar } = {}) =>
    client.get(`/documentos/${id}/archivos/${idArchivo}/ver`, {
      params: descargar ? { descargar: 1 } : undefined,
      responseType: 'blob',
    }),

  // Link para compartir sin login. Es POST porque crear el link cambia algo: a partir de
  // ahí el documento es alcanzable desde afuera.
  generarLink: (id) => client.post(`/documentos/${id}/link`),
  revocarLink: (id) => client.delete(`/documentos/${id}/link`),

  revisarVencimientos: () => client.post('/documentos/revisar-vencimientos'),
}

// La URL que se le manda a alguien de afuera. Se arma con el origen del backend porque
// la ruta pública la sirve el backend, no el frontend.
export function urlPublica(token) {
  const base = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
  return `${base.replace(/\/$/, '')}/documentos/publico/${token}`
}
