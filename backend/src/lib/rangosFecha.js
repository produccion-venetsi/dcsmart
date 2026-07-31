// Ojo: acá NO se usa parseCsvParam. Ese helper descarta los segmentos vacíos
// (`filter(Boolean)`), que es lo correcto para listas de ids pero rompe estos
// params, que son POSICIONALES: `desde=2026-07-01,` y `hasta=,2026-06-30`
// describen dos rangos, el primero con solo desde y el segundo con solo hasta.
// Si se filtran los vacíos los dos arrays quedan de largo 1 y las fechas se
// cruzan entre rangos.
function splitPosicional(valor) {
  if (valor == null || valor === '') return []
  return String(valor).split(',').map(s => s.trim())
}

// Campos de fecha filtrables desde el frontend. Whitelist estricta: cualquier
// valor fuera de esta lista cae al default 'fecha', para no interpolar un valor
// arbitrario como key de Prisma.
export const CAMPOS_FECHA_VALIDOS = ['fecha', 'fecha_pago', 'cashflow', 'periodo', 'created_at']

// De los campos filtrables, estos guardan un instante real (con hora), no un
// día calendario a medianoche UTC. Su rango se interpreta en hora de Argentina
// para que lo cargado de noche no caiga en el día UTC siguiente.
export const CAMPOS_FECHA_INSTANTE = ['fecha_pago', 'created_at']

// Los rangos viajan como tres params CSV paralelos y posicionales:
//   ?campo_fecha=fecha,periodo&desde=2026-07-01,2026-06-01&hasta=2026-07-31,2026-06-30
//
// Se eligió esta forma porque es retrocompatible bit a bit: un solo valor en
// cada param es exactamente el formato de siempre, así que los links viejos y
// los presets guardados siguen funcionando sin migrar nada. Es la misma
// convención CSV que ya usan id_tipo, id_metodo, estado_op y tipo_turno.
export function parseRangosFecha(campoFecha, desde, hasta) {
  const campos = splitPosicional(campoFecha)
  const desdes = splitPosicional(desde)
  const hastas = splitPosicional(hasta)

  const n = Math.max(campos.length, desdes.length, hastas.length)
  const rangos = []

  for (let i = 0; i < n; i++) {
    const d = desdes[i] || null
    const h = hastas[i] || null
    if (!d && !h) continue // un rango sin ninguna fecha no filtra nada

    const campo = CAMPOS_FECHA_VALIDOS.includes(campos[i]) ? campos[i] : 'fecha'
    rangos.push({ campo, desde: d, hasta: h })
  }

  return rangos
}

// Devuelve el `where` de Prisma para esos rangos, combinados con AND.
//
// Con un solo rango va como clave suelta (`{ fecha: {...} }`) para no cambiar
// el SQL que se generaba antes. Con dos o más va bajo AND, que es obligatorio:
// si el usuario elige dos rangos sobre el mismo campo, dos claves iguales en el
// mismo objeto se pisarían y el filtro quedaría mal.
//
// El `qFilter` de la búsqueda por texto ya inyecta un OR top-level en
// buildPagosWhere; un AND hermano no choca con él.
export function whereRangosFecha(rangos) {
  const condiciones = rangos.map(({ campo, desde, hasta }) => {
    const suf = CAMPOS_FECHA_INSTANTE.includes(campo) ? '-03:00' : 'Z'
    return {
      [campo]: {
        ...(desde ? { gte: new Date(`${desde}T00:00:00.000${suf}`) } : {}),
        ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999${suf}`) } : {})
      }
    }
  })

  if (condiciones.length === 0) return {}
  if (condiciones.length === 1) return condiciones[0]
  return { AND: condiciones }
}
