import client from './client.js'

// Clientes: a nombre de quién se generó un gasto, lo contrario de un proveedor.
//
// A diferencia de proveedores, que son un catálogo global, un cliente pertenece al
// grupo activo: el backend lo acota con el X-App-Id que ya manda el interceptor, así
// que acá no hay que pasar nada extra.
export const clientesApi = {
  list:   (params, signal) => client.get('/clientes',       { params, signal }),
  get:    (id,    signal)  => client.get(`/clientes/${id}`, { signal }),
  create: (data)           => client.post('/clientes',       data),
  update: (id, data)       => client.put(`/clientes/${id}`,  data),
  // Baja lógica: el cliente queda inactivo, nunca se borra. Los pagos que lo
  // referencian son historia.
  remove: (id)             => client.delete(`/clientes/${id}`),

  // Los movimientos del cliente y su saldo. Endpoint propio y no GET /pagos porque
  // ese está acotado por local y un cliente puede tener ops de todo el grupo.
  cuentaCorriente: (id, signal) => client.get(`/clientes/${id}/cuenta-corriente`, { signal }),
}
