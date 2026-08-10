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
//
// ── INVARIANTE: `tipos_afines` nunca puede ser NULL ─────────────────────────
// Los dos where que devuelve esta funcion tienen que cubrir juntos exactamente
// lo mismo que el where original. Eso se rompe si la columna tiene NULL, porque
// en Postgres cualquier operacion de array contra NULL da NULL y no false:
//
//   NULL @> ARRAY['Gastronomía']   ->  NULL
//   NOT (NULL OR false)            ->  NULL   <- la fila no entra en NINGUN grupo
//
// Pasó de verdad: la columna se agrego nullable y sin default, asi que las 4984
// filas que ya existian quedaron en NULL. El buscador de proveedores del detalle
// del local devolvia 2 resultados de 260 al buscar "car" -- el afin daba 0 y el
// resto daba 2, y los otros 258 desaparecian. Se arreglo poniendo '{}' en esas
// filas y dejando la columna NOT NULL DEFAULT '{}'.
//
// Ojo: `prisma migrate diff` NO detecta esto. Para Prisma un array nullable y
// `TipoLocal[]` son lo mismo (lee NULL como []), asi que el schema se ve limpio
// mientras las consultas fallan. Si el buscador vuelve a devolver de menos, lo
// primero a mirar es `SELECT COUNT(*) FROM proveedores WHERE tipos_afines IS NULL`.

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
