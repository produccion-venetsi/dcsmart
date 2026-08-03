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

// Los filtros de fecha pasaron de ser uno solo ({ campo_fecha, desde, hasta })
// a ser varios rangos combinados con Y. Los presets guardados con el formato
// viejo se leen igual, para no migrar datos: el viejo solo se lee, siempre se
// escribe el nuevo.
export function normalizarRangos(guardado) {
  const g = guardado || {}

  if (Array.isArray(g.rangos_fecha)) {
    return g.rangos_fecha
      .filter(r => r && (r.desde || r.hasta))
      .map(r => ({ campo: r.campo || 'fecha', desde: r.desde || '', hasta: r.hasta || '' }))
  }

  if (g.desde || g.hasta) {
    return [{ campo: g.campo_fecha || 'fecha', desde: g.desde || '', hasta: g.hasta || '' }]
  }

  return []
}

// Texto del control cerrado.
export function resumenSeleccion(value, placeholder, max = MAX_LABELS_RESUMEN) {
  const arr = value || []
  if (arr.length === 0) return placeholder
  if (arr.length <= max) return arr.map(v => v.label).join(', ')
  return `${arr.slice(0, max).map(v => v.label).join(', ')} +${arr.length - max}`
}
