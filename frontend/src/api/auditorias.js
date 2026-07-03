import client from './client.js'

export const auditoriasApi = {
  list:     (params, signal) => client.get('/auditorias', { params, signal }),
  usuarios: (signal)         => client.get('/auditorias/usuarios', { signal }),
}
