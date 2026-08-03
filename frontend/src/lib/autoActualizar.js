// Guarda del auto-update del service worker.
//
// `aplicar()` recarga la página incondicionalmente (a propósito: si se espera el
// evento de cambio de control del SW y ese evento no llega, el botón queda
// muerto). El precio es que, si la versión nueva se sigue anunciando después de
// recargar —un sw.js que no termina de activarse, un deploy a medias—, el camino
// automático recarga otra vez, y otra.
//
// La app ya vivió un bucle de recargas el 03/08/2026 (ver lib/sesionExpirada.js)
// y es lo peor que le puede pasar a alguien cargando facturas: no llega ni a
// tipear. Así que el disparo AUTOMÁTICO se limita a uno por ventana de tiempo.
//
// El botón que la persona aprieta NO pasa por acá: si lo toca, es porque quiere
// actualizar ahora, y una recarga pedida a mano nunca es un bucle.
//
// Mismo patrón que `lazyWithReload` en App.jsx, que usa sessionStorage con
// `chunk-reload-at` para no recargar en loop cuando falta un chunk.

export const CLAVE_ULTIMO_AUTO = 'sw-auto-reload-at'
export const VENTANA_AUTO_RECARGA_MS = 60_000

// ¿Se puede auto-recargar ahora? `ultimoIntento` es lo que quedó guardado de la
// vez anterior (string de sessionStorage, o null la primera vez).
export function puedeAutoRecargar(ahora, ultimoIntento, ventana = VENTANA_AUTO_RECARGA_MS) {
  const t = Number(ultimoIntento)
  // Nunca se intentó, o el valor guardado es basura: se deja pasar.
  if (!Number.isFinite(t) || t <= 0) return true
  // Reloj movido hacia atrás (cambio de hora, corrección de NTP): no se bloquea
  // para siempre por un timestamp futuro.
  if (ahora < t) return true
  return ahora - t >= ventana
}
