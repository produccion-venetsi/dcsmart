// Cómo se muestra un proveedor en pantalla. Un solo lugar para la regla:
// se muestran nombre Y razón social cuando son cosas distintas ("Fura" /
// "Distribuidora DTC SA"), y una sola vez cuando coinciden o falta una.
//
// Nació de la tarjeta "En pagos mostrar Razón Social y Nombre proveedor":
// mostrar solo el nombre escondía la razón social que figura en la factura,
// y el buscador del backend matchea por las dos (routes/proveedores.js) --
// buscabas por razón social y el resultado parecía no tener nada que ver.

const limpio = (s) => String(s ?? '').trim()

// Nombre principal, con fallback: un proveedor cargado solo con razón social
// no puede verse vacío.
export function nombreProveedor(p) {
  if (!p) return ''
  return limpio(p.nombre) || limpio(p.razon_social)
}

// La razón social SOLO si aporta algo (existe y no repite el nombre).
export function razonSocialExtra(p) {
  if (!p) return ''
  const nombre = limpio(p.nombre)
  const razon = limpio(p.razon_social)
  if (!razon || !nombre) return ''
  return razon.toLowerCase() === nombre.toLowerCase() ? '' : razon
}

// Etiqueta de una línea: "Fura · Distribuidora DTC SA".
export function etiquetaProveedor(p) {
  const extra = razonSocialExtra(p)
  const base = nombreProveedor(p)
  return extra ? `${base} · ${extra}` : base
}
