// Orden por afinidad del buscador de proveedores.
//
// Un proveedor es "afin" a un local si su tipo esta entre los tipos_afines del
// proveedor, o si el proveedor es general (Aysa, Metrogas, AFIP, bancos: sirven
// a cualquier rubro). Los afines se muestran primero y el resto despues.
//
// Nunca se filtra: con el dato de hoy hay 4014 proveedores marcados como
// gastronomicos en el campo viejo y ninguno como general, asi que filtrar
// dejaria a un local de indumentaria o arquitectura sin ningun proveedor para
// elegir. Ordenar no puede dejar a nadie sin opciones.

export const TIPOS_LOCAL_VALIDOS = new Set([
  'GASTRONOMIA', 'INDUMENTARIA', 'ARQUITECTURA', 'INMOBILIARIO', 'MULTIMEDIA'
])

// Devuelve { afin, resto }: dos where de Prisma que juntos cubren exactamente
// lo mismo que el where original, partido en dos grupos. null si no hay un tipo
// de local usable, y en ese caso el llamador sigue con una sola consulta.
export function partirPorAfinidad(where, tipoLocal) {
  const tipo = String(tipoLocal ?? '').trim()
  if (!TIPOS_LOCAL_VALIDOS.has(tipo)) return null

  const condicion = { OR: [{ tipos_afines: { has: tipo } }, { es_general: true }] }

  // Si el where ya trae un OR (la busqueda por texto lo usa), no se puede
  // sobreescribir ni mezclar: dos OR hermanos en el mismo objeto se pisan y el
  // resultado ensancharia la busqueda. Se combinan bajo AND.
  const combinar = (extra) => {
    if (!where.OR) return { ...where, ...extra }
    const { OR, ...resto } = where
    return { ...resto, AND: [{ OR }, extra] }
  }

  return {
    afin:  combinar(condicion),
    resto: combinar({ NOT: condicion })
  }
}
