// Los valores son los del enum TipoLocal de Prisma; las etiquetas, lo que ve
// el usuario. En la base quedan guardados con acento (ver el @map del schema),
// pero la API viaja siempre con la clave en mayusculas.
export const TIPOS_LOCAL = [
  { value: 'GASTRONOMIA',  label: 'Gastronomía'  },
  { value: 'INDUMENTARIA', label: 'Indumentaria' },
  { value: 'ARQUITECTURA', label: 'Arquitectura' },
  { value: 'INMOBILIARIO', label: 'Inmobiliario' },
  { value: 'MULTIMEDIA',   label: 'Multimedia'   }
]

export const labelTipoLocal = (value) =>
  TIPOS_LOCAL.find((t) => t.value === value)?.label || '—'
