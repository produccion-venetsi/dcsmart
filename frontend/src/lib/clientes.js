// Cómo se nombra un cliente en pantalla.
//
// El alta pide nombre O razón social, no las dos: al comercio del barrio se lo
// conoce por el nombre de fantasía y a la sociedad por la razón social. Mostrar
// `cliente.nombre` pelado dejaba en blanco a los que solo tienen razón social, así
// que la caída va siempre en este orden y en un solo lugar.
export function nombreCliente(cliente) {
  if (!cliente) return ''
  return cliente.nombre || cliente.razon_social || ''
}

// Igual que arriba pero para cuando el vacío no sirve (una celda de tabla, un
// título): un cliente sin ninguno de los dos campos igual tiene que verse.
export function nombreClienteODefault(cliente, fallback = 'Cliente sin nombre') {
  return nombreCliente(cliente) || fallback
}
