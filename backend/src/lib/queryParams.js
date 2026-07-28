// Los filtros multi-valor viajan como CSV en un solo query param
// (?tipo_turno=Mañana,Noche), mismo formato que ya usaban id_rubcats e
// id_proveedores en pagos.js. Un solo valor viaja igual que siempre, así que
// los links viejos y los presets guardados siguen funcionando.
export function parseCsvParam(value) {
  if (value == null) return []
  return String(value).split(',').map(s => s.trim()).filter(Boolean)
}
