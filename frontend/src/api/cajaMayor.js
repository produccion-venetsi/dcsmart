import client from './client.js'

// Caja Mayor es global (todos los grupos), no scoped a la app activa: por eso
// ninguna de estas llamadas depende del X-App-Id que manda el interceptor.
export const cajaMayorApi = {
  list:    (params, signal) => client.get('/caja-mayor', { params, signal }),
  saldos:  (params, signal) => client.get('/caja-mayor/saldos', { params, signal }),
  locales: (signal)         => client.get('/caja-mayor/locales', { signal }),

  crear:   (body)      => client.post('/caja-mayor', body),
  editar:  (id, body)  => client.patch(`/caja-mayor/${id}`, body),
  borrar:  (id)        => client.delete(`/caja-mayor/${id}`),
  // Sirve para las dos procedencias: por `id` si el movimiento ya tiene fila,
  // por `id_pago` la primera vez que se gestiona una op de gestión.
  estado:  (body)      => client.put('/caja-mayor/estado', body),
  // Alterna la auditoría (mismo circuito append-only que Pagos).
  audit:   (id, body)  => client.patch(`/caja-mayor/${id}/audit`, body),
}
