// Ordena los detalles informativos para que se puedan LEER.
//
// Después de unificar movimientos y detalles, lo informativo quedó como una
// lista plana de veinte líneas sueltas: "Salón", "Vaciado · Crédito",
// "Vaciado · MP QR", "diffs · Efectivo · cajón"… Todo junto y sin jerarquía.
//
// Acá se agrupa en dos niveles:
//   1. FAMILIA: qué clase de dato es (canal de venta, movimiento del cajón,
//      ajuste del POS, resumen). Cada una tiene su significado y su color.
//   2. NOMBRE BASE: lo que va antes del "·". Los ocho "Vaciado · X" pasan a ser
//      UNA línea "Vaciado" con su total, y el desglose por método adentro.

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// El orden es el de lectura: primero de dónde vino la venta, después qué pasó
// con la plata, después los ajustes que explican diferencias, y al final los
// resúmenes (que no son plata nueva).
export const FAMILIAS = [
  {
    id: 'canales',
    titulo: 'De dónde vino la venta',
    ayuda: 'Cómo se repartió lo vendido. Ya está contado en el total.',
    color: 'var(--blue)',
    test: /^(sal[oó]n|delivery|takeaway|web|mostrador|online|barra|sal[oó]n\b)/i,
  },
  {
    id: 'cajon',
    titulo: 'Movimientos del cajón',
    ayuda: 'Plata que entró o salió sin ser una venta.',
    color: 'var(--amber)',
    test: /^(fondo inicial|retiro|vaciado|ingreso)/i,
  },
  {
    id: 'pos',
    titulo: 'Ajustes que informó el sistema del local',
    ayuda: 'Descuentos, anulaciones y diferencias que reporta el POS. Suelen explicar por qué los cobros no dan igual que la venta.',
    color: 'var(--amber)',
    destacado: true,
    test: /^(descuentos|contra[oó]rdenes|diffs?|ajustes?|alivios|transfers)/i,
  },
  {
    id: 'resumen',
    titulo: 'Resúmenes',
    ayuda: 'Totales de algo que ya está contado línea por línea. No suman.',
    color: 'var(--t3)',
    test: /^(tarjetas?|efectivo)/i,
  },
  {
    id: 'otros',
    titulo: 'Otros',
    ayuda: 'Datos informativos sin una familia conocida.',
    color: 'var(--t3)',
    test: /.^/, // no matchea nada: es el cajón de sastre
  },
]

const familiaDe = (nombre) =>
  FAMILIAS.find((f) => f.id !== 'otros' && f.test.test(nombre)) ?? FAMILIAS[FAMILIAS.length - 1]

// "Vaciado · Crédito" -> base "Vaciado", resto "Crédito".
// "diffs · MP Point · brenda" -> base "diffs", resto "MP Point · brenda".
function partirNombre(nombre) {
  const partes = String(nombre ?? '').split('·').map((s) => s.trim()).filter(Boolean)
  if (partes.length <= 1) return { base: nombre || 'Sin nombre', resto: null }
  return { base: partes[0], resto: partes.slice(1).join(' · ') }
}

export function agruparInformativos(detalles) {
  const porFamilia = new Map()

  for (const d of detalles ?? []) {
    const nombre = d?.nombre ?? d?.detalle_tipo?.nombre ?? 'Sin nombre'
    const familia = familiaDe(nombre)
    const { base, resto } = partirNombre(nombre)

    if (!porFamilia.has(familia.id)) porFamilia.set(familia.id, new Map())
    const lineas = porFamilia.get(familia.id)
    if (!lineas.has(base)) lineas.set(base, { nombre: base, total: 0, cantidad: null, items: [] })

    const linea = lineas.get(base)
    linea.total += num(d.monto)
    if (d.cantidad != null) linea.cantidad = (linea.cantidad ?? 0) + num(d.cantidad)
    // El desglose solo tiene sentido cuando el nombre tenía partes: si son
    // líneas sueltas del mismo nombre, alcanza con el total.
    if (resto) linea.items.push({ id: d.id, nombre: resto, monto: num(d.monto), cantidad: d.cantidad ?? null })
  }

  return FAMILIAS
    .filter((f) => porFamilia.has(f.id))
    .map((f) => {
      const lineas = [...porFamilia.get(f.id).values()].sort((a, b) => b.total - a.total)
      return {
        id: f.id,
        titulo: f.titulo,
        ayuda: f.ayuda,
        color: f.color,
        destacado: Boolean(f.destacado),
        total: lineas.reduce((a, l) => a + l.total, 0),
        lineas,
      }
    })
}
