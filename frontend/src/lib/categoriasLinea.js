// Las categorías de una línea de caja, como se le muestran a quien carga.
//
// El nombre técnico (COBRO, FIADO…) no se ve nunca: la persona elige "Me lo
// pagaron" o "Quedó a deber". La descripción está al lado porque la diferencia
// entre un retiro y un vaciado, o entre un gasto y un retiro, es exactamente lo
// que hoy se carga mal.

export const CATEGORIAS = [
  {
    id: 'COBRO',
    label: 'Me lo pagaron',
    ayuda: 'Plata que entró por una venta: efectivo, tarjeta, QR, app.',
    grupo: 'venta',
    suma: 'venta',
  },
  {
    id: 'FIADO',
    label: 'Quedó a deber',
    ayuda: 'Se llevaron la mercadería sin pagar: cuenta corriente, mesa abierta, a cobrar.',
    grupo: 'venta',
    suma: 'venta',
  },
  {
    id: 'GASTO',
    label: 'Pagué algo de la caja',
    ayuda: 'Salió plata del cajón para pagar algo. No reduce lo que vendiste.',
    grupo: 'caja',
    suma: 'caja',
  },
  {
    id: 'INICIAL',
    label: 'Fondo de apertura',
    ayuda: 'Con cuánta plata arrancó el turno.',
    grupo: 'caja',
    suma: 'caja',
  },
  {
    id: 'RETIRO',
    label: 'Retiré plata',
    ayuda: 'Se sacó plata del cajón y se la llevó alguien.',
    grupo: 'caja',
    suma: 'caja',
  },
  {
    id: 'VACIADO',
    label: 'Rendí a caja fuerte',
    ayuda: 'Se rindió la plata o se acreditó la terminal.',
    grupo: 'caja',
    suma: 'caja',
  },
  {
    id: 'INGRESO',
    label: 'Entró plata (no es venta)',
    ayuda: 'Un aporte, una devolución, algo que entró y no fue una venta.',
    grupo: 'caja',
    suma: 'caja',
  },
  {
    id: 'DIFERENCIA',
    label: 'Diferencia / ajuste',
    ayuda: 'Un ajuste informado por el sistema del local.',
    grupo: 'info',
    suma: 'ninguna',
  },
  {
    id: 'INFORMATIVO',
    label: 'Solo informativo',
    ayuda: 'Desglose de algo que ya está contado: canales de venta, totales por familia. No suma.',
    grupo: 'info',
    suma: 'ninguna',
  },
]

const PORID = new Map(CATEGORIAS.map((c) => [c.id, c]))

export function categoria(id) {
  return PORID.get(id) ?? null
}

export function labelCategoria(id) {
  return PORID.get(id)?.label ?? id ?? '—'
}

// Color del badge, por lo que la categoría le hace a la cuenta: verde suma a la
// venta, rojo saca plata del cajón, gris no mueve nada.
export function claseCategoria(id) {
  const c = PORID.get(id)
  if (!c) return 'badge-muted'
  if (c.suma === 'venta') return id === 'FIADO' ? 'badge-blue' : 'badge-green'
  if (c.suma === 'caja') return ['GASTO', 'RETIRO', 'VACIADO'].includes(id) ? 'badge-red' : 'badge-amber'
  return 'badge-muted'
}

// Los tres grupos en los que se listan las líneas, en el orden en que se leen.
export const GRUPOS = [
  { id: 'venta', titulo: 'Cómo te lo pagaron', ayuda: 'Tiene que sumar el total del turno.' },
  { id: 'caja', titulo: 'Qué pasó con la plata del cajón', ayuda: 'No cambia lo que vendiste.' },
  { id: 'info', titulo: 'Informativo', ayuda: 'Desglose de algo ya contado. No suma en ninguna cuenta.' },
]

export function grupoDe(id) {
  return PORID.get(id)?.grupo ?? 'info'
}
