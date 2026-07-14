// Resuelve el "monedaname" que trae TapTap (Efectivo, MP Point, PedidosYa, Tarjeta,
// Transfer, etc.) contra el catálogo MetodoPago de DCSMART. Si no matchea ninguno
// existente (normalizado), se crea nuevo -- no se descarta el dato nunca.

// Alias explícitos para nombres que NO son una simple variación de mayúsculas/
// acentos/separadores (esos ya los cubre normalizar() solo).
const ALIAS = {
  'Transfer': 'Transferencia',
}

export function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// existentes: [{ id, nombre }] ya cargados de MetodoPago.
// Devuelve { nombre, existenteId } -- nombre es el nombre final a usar
// (el del alias si aplica, si no el mismo que vino de TapTap); existenteId
// es el id ya existente en la base, o null si hay que crear uno nuevo.
export function resolverMetodo(nombreTapTap, existentes) {
  const nombre = ALIAS[nombreTapTap] || nombreTapTap
  const norm = normalizar(nombre)
  const match = existentes.find((m) => normalizar(m.nombre) === norm)
  return { nombre: match ? match.nombre : nombre, existenteId: match ? match.id : null }
}
