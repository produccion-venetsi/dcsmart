import client from './client.js'

export const disponibilidadesApi = {
  // El catálogo del grupo. `todas` incluye las desactivadas (para administrar).
  // Con `id_local` se pide el del grupo de ESE local, no el de la barra: un
  // super_admin edita fichas de locales de cualquier cliente.
  catalogo: (todas, signal, id_local) =>
    client.get('/disponibilidades', { params: { ...(todas ? { all: 1 } : {}), ...(id_local ? { id_local } : {}) }, signal }),
  crear:    (data)          => client.post('/disponibilidades', data),
  editar:   (id, data)      => client.patch(`/disponibilidades/${id}`, data),

  // Las que un local tiene activas: la lista que el arqueo le va a pedir.
  delLocal:    (id_local, signal) => client.get(`/disponibilidades/local/${id_local}`, { signal }),
  fijarLocal:  (id_local, ids)    => client.put(`/disponibilidades/local/${id_local}`, { ids }),
}
