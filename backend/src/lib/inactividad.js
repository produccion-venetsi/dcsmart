// Cuentas inactivas: a los 15 días sin entrar, la contraseña deja de servir y
// hay que pedir que la reseteen.
//
// La idea es que una cuenta olvidada (alguien que dejó de trabajar, un acceso
// que se dio para algo puntual) no quede abierta para siempre con una
// contraseña que nadie cambió nunca.

export const DIAS_INACTIVIDAD = 15

const MS_POR_DIA = 86400000

// Días completos desde el último ingreso. null si nunca ingresó.
export function diasDesdeUltimoLogin(lastLogin, ahora = new Date()) {
  if (!lastLogin) return null
  const t = lastLogin instanceof Date ? lastLogin : new Date(lastLogin)
  if (Number.isNaN(t.getTime())) return null
  return Math.floor((ahora.getTime() - t.getTime()) / MS_POR_DIA)
}

// ¿Hay que frenar el login y pedir que le reseteen la contraseña?
//
// Sin `last_login` NO se bloquea, y esto es lo más importante de la función: la
// columna arranca vacía para todos los usuarios que ya existen, así que tratar
// el null como "hace muchísimo que no entra" dejaría afuera a toda la empresa
// el día que esto se despliegue. Vacío significa "todavía no lo sabemos": se
// deja pasar y ese mismo login lo completa.
//
// El reseteo de la contraseña también vuelve a dejarlo en null, así el usuario
// puede entrar de nuevo sin que nadie toque la fecha a mano.
export function requiereResetPorInactividad(lastLogin, ahora = new Date(), dias = DIAS_INACTIVIDAD) {
  const transcurridos = diasDesdeUltimoLogin(lastLogin, ahora)
  if (transcurridos === null) return false
  return transcurridos >= dias
}
