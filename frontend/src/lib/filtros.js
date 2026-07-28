// Los filtros multiselect guardan siempre { value, label }: el label viaja
// junto al value porque con búsqueda remota (proveedores) la lista completa no
// está cargada y, sin él, no se podría mostrar el nombre de lo ya elegido.

// Cuántos labels se listan antes de pasar a "+N".
const MAX_LABELS_RESUMEN = 2

// CSV para el query param: ?id_tipo=A,B
export function multiParam(value) {
  return (value || []).map(v => v.value).join(',')
}

// Los presets guardados ("Mis filtros") tienen formatos históricos: string
// suelto ("A"), array de ids (["uuid"]) o el formato viejo de proveedores
// ({ id, nombre }). Se aceptan todos para no migrar datos.
export function normalizarMulti(raw, options = []) {
  if (raw == null || raw === '') return []
  const labelDe = (value) => options.find(o => o.value === value)?.label ?? value
  const items = Array.isArray(raw) ? raw : [raw]
  return items
    .map(item => {
      if (item && typeof item === 'object') {
        const value = item.value ?? item.id
        return { value, label: item.label ?? item.nombre ?? labelDe(value) }
      }
      return { value: item, label: labelDe(item) }
    })
    .filter(x => x.value != null && x.value !== '')
}

// Texto del control cerrado.
export function resumenSeleccion(value, placeholder, max = MAX_LABELS_RESUMEN) {
  const arr = value || []
  if (arr.length === 0) return placeholder
  if (arr.length <= max) return arr.map(v => v.label).join(', ')
  return `${arr.slice(0, max).map(v => v.label).join(', ')} +${arr.length - max}`
}
