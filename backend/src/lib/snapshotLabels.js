// El snapshot del ActivityLog guarda las columnas crudas del pago, con ids.
// Esto los traduce a texto legible. Un id que no resuelve significa que el
// registro se borro despues del evento: se dice explicitamente, en vez de
// mostrar un UUID.
const TIPO_LABEL = { DC_1: 'DC (1)', DC_2: 'DC (2)' }

function resolver(id, catalogo) {
  if (id == null || id === '') return '—'
  return catalogo.get(id) ?? '— (no existe)'
}

export function etiquetarSnapshot(snapshot, catalogos) {
  const s = snapshot ?? {}
  return {
    proveedor: resolver(s.id_proveedor, catalogos.proveedores),
    rubcat:    resolver(s.id_rubcat,    catalogos.rubcats),
    metodo:    resolver(s.id_metodo,    catalogos.metodos),
    local:     resolver(s.id_local,     catalogos.locales),
    tipo:      s.id_tipo == null || s.id_tipo === ''
      ? '—'
      : (TIPO_LABEL[s.id_tipo] ?? s.id_tipo),
  }
}
