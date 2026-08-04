// Porcentaje "avión" de una caja: la parte de la venta que no pasó por fiscal.
//
//   % avión = (total − fiscal) / total
//
// Reemplaza a la columna Fiscal en la tabla de cajas. El monto fiscal en pesos
// no dice nada sin compararlo contra el total, y esa comparación se hacía a ojo
// fila por fila.
//
// Sobre los datos reales (6482 cajas al 2026-08-04): 1275 tienen fiscal en 0, o
// sea 100% avión, y eso es un dato válido, no un faltante. Los faltantes de
// verdad son pocos: 15 cajas sin fiscal cargado y 63 sin total.

// Devuelve el porcentaje (0-100) o null si no se puede calcular. null significa
// "no se sabe" y en pantalla se muestra como guión: mostrar 0% cuando falta el
// dato haría pasar por "todo fiscal" a una caja sin cargar.
export function porcentajeAvion(total, fiscal) {
  const t = Number(total)
  const f = Number(fiscal)

  // Sin total no hay contra qué comparar. Un total en 0 tampoco sirve: la
  // división daría Infinity o NaN.
  if (!Number.isFinite(t) || t <= 0) return null
  // fiscal en 0 sí es un dato (nada declarado); fiscal ausente no.
  if (total == null || fiscal == null || !Number.isFinite(f)) return null

  const pct = ((t - f) / t) * 100
  // Se acota a 0-100: un fiscal mayor que el total es un error de carga, y
  // mostrar -12% invita a pensar que la cuenta está mal en vez del dato.
  return Math.min(100, Math.max(0, pct))
}

// Para la tabla: entero con el signo de porcentaje, o guión si no se sabe.
export function fmtPorcentajeAvion(total, fiscal) {
  const pct = porcentajeAvion(total, fiscal)
  return pct == null ? '—' : `${Math.round(pct)}%`
}

// Cuanto más alto el avión, más se despega de lo declarado. Se pinta sólo el
// extremo: con 100% no hubo nada fiscal y conviene que salte a la vista.
export function claseAvion(total, fiscal) {
  const pct = porcentajeAvion(total, fiscal)
  if (pct == null) return 'td-muted'
  if (pct >= 100) return 'td-avion-alto'
  return 'td-muted'
}
