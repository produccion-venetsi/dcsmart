import client from './client.js'

// Carpeta de inspecciones. La carpeta es el local: todo pide `id_local`.
//
// La SUBIDA de archivos reusa `/documentos/upload`, que ya sube al bucket y devuelve el
// gs://. Acá solo se adjunta lo ya subido.
export const inspeccionesApi = {
  estados: () => client.get('/inspecciones/estados'),
  carpeta: (id_local, signal) => client.get('/inspecciones', { params: { id_local }, signal }),

  crear: (data) => client.post('/inspecciones', data),
  actualizar: (id, data) => client.put(`/inspecciones/${id}`, data),
  borrar: (id, motivo) => client.delete(`/inspecciones/${id}`, { data: motivo ? { motivo } : undefined }),

  // Manda la lista de ids en el orden nuevo; el backend renumera 1..N.
  reordenar: (id_local, ids) => client.put('/inspecciones/orden', { id_local, ids }),

  historial: (id, signal) => client.get(`/inspecciones/${id}/historial`, { signal }),

  adjuntar: (id, archivos) => client.post(`/inspecciones/${id}/archivos`, { archivos }),
  borrarArchivo: (id, idArchivo) => client.delete(`/inspecciones/${id}/archivos/${idArchivo}`),
  // Devuelve el blob: el archivo lo sirve el backend, la ruta gs:// no se expone.
  verArchivo: (id, idArchivo, { descargar } = {}) =>
    client.get(`/inspecciones/${id}/archivos/${idArchivo}/ver`, {
      params: descargar ? { descargar: '1' } : undefined,
      responseType: 'blob',
    }),
}
