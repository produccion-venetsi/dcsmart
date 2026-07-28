// El enum TipoTurno usa @map en el schema (ver prisma/schema.prisma), por lo
// que Prisma Client espera la clave (MANANA) y no la etiqueta visible
// ("Mañana") que envía el frontend. En SQL crudo pasa al revés: la columna
// guarda el label por el @map, así que ahí se compara contra la etiqueta.
export const TIPO_TURNO_MAP = {
  'Mañana': 'MANANA',
  'Tarde': 'TARDE',
  'Noche': 'NOCHE',
  'Trasnoche': 'TRASNOCHE',
  'Evento': 'EVENTO',
  'Otros': 'OTROS'
}

const TIPO_TURNO_REVERSE_MAP = Object.fromEntries(
  Object.entries(TIPO_TURNO_MAP).map(([label, key]) => [key, label])
)

export function toTipoTurnoEnum(value) {
  if (!value) return null
  return TIPO_TURNO_MAP[value] || value
}

export function fromTipoTurnoEnum(value) {
  if (!value) return value
  return TIPO_TURNO_REVERSE_MAP[value] || value
}

export function toTipoTurnoEnumList(values) {
  return (values || []).map(toTipoTurnoEnum).filter(Boolean)
}
