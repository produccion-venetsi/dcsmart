import client from './client.js'

// Intercompany: pasar plata de un local a otro del mismo grupo. Las ops son
// pagos, así que todo va scopeado a la app activa (el interceptor manda el
// X-App-Id) — es justamente lo que garantiza que no se cruce de grupo.
export const intercompanyApi = {
  list:     (params, signal) => client.get('/intercompany', { params, signal }),
  locales:  (signal)         => client.get('/intercompany/locales', { signal }),
  enviar:   (body)           => client.post('/intercompany/enviar', body),
  revertir: (idPago)         => client.delete(`/intercompany/enviar/${idPago}`),
}
