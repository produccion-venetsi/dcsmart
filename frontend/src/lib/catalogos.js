// Mensajes para fallas al cargar catálogos (métodos de pago, tipos de
// detalle, etc.).
//
// La regla: un combo vacío por error NUNCA puede parecer un catálogo sin
// datos. Antes estas cargas hacían `.catch(() => {})` y un 403 o un timeout
// dejaba el select vacío en silencio -- el usuario reportaba "no me aparecen
// los métodos de pago" sin ninguna pista de por qué.
export function mensajeCatalogo(err, nombre) {
  const status = err?.response?.status
  if (status === 403) {
    return `Tu usuario no tiene permiso para ver ${nombre}. Pedile a un administrador que revise tu rol.`
  }
  if (status === 401) {
    return `Tu sesión expiró: volvé a iniciar sesión para cargar ${nombre}.`
  }
  if (!err?.response) {
    return `No se pudieron cargar ${nombre}: problema de conexión. Recargá la página para reintentar.`
  }
  return `No se pudieron cargar ${nombre} (error ${status}). Recargá la página para reintentar.`
}
