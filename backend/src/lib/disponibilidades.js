// Las disponibilidades del arqueo: la plata que el local tiene y NO está en el
// cajón. Reglas puras, espejadas en el frontend.

// Las familias son para LEER, no para calcular: agrupan la lista al cargar y
// en la pantalla de administración. Mercado Pago tiene la suya porque un mismo
// local suele tener tres líneas distintas —lo disponible, lo del día y lo que
// falta liquidar— y verlas juntas evita cargar una en el renglón de la otra.
export const FAMILIAS_DISPONIBILIDAD = [
  { id: 'mp', nombre: 'Mercado Pago', orden: 1 },
  { id: 'banco', nombre: 'Bancos', orden: 2 },
  { id: 'moneda', nombre: 'Otras monedas', orden: 3 },
  { id: 'otro', nombre: 'Otras', orden: 9 },
]

const ordenFamilia = (id) => FAMILIAS_DISPONIBILIDAD.find((f) => f.id === id)?.orden ?? 9

// Primero por familia, después por el orden propio, y el nombre desempata: dos
// conceptos con el mismo número no pueden bailar de posición entre recargas.
export function ordenarDisponibilidades(tipos) {
  return [...(tipos ?? [])].sort((a, b) =>
    ordenFamilia(a.familia) - ordenFamilia(b.familia) ||
    (a.orden ?? 100) - (b.orden ?? 100) ||
    String(a.nombre).localeCompare(String(b.nombre), 'es')
  )
}

// Agrupadas para pintar: [{ familia, nombre, tipos: [...] }]. Solo las familias
// que tienen algo — una sección vacía es ruido.
export function agruparDisponibilidades(tipos) {
  const orden = ordenarDisponibilidades(tipos)
  return FAMILIAS_DISPONIBILIDAD
    .map((f) => ({ familia: f.id, nombre: f.nombre, tipos: orden.filter((t) => (t.familia ?? 'otro') === f.id) }))
    .filter((g) => g.tipos.length > 0)
}

// El catálogo con el que arranca un grupo nuevo. Sale de lo que ya se cargaba a
// mano en los arqueos (medido en producción el 2026-08-20) más las cuentas que
// el equipo pidió: así un local nuevo no empieza con la lista vacía.
export const CATALOGO_INICIAL = [
  { nombre: 'MP Disponible', familia: 'mp', orden: 10 },
  { nombre: 'MP Hoy', familia: 'mp', orden: 20 },
  { nombre: 'MP a Liquidar', familia: 'mp', orden: 30 },
  { nombre: 'MP QR', familia: 'mp', orden: 40 },
  { nombre: 'Dolares', familia: 'moneda', orden: 10 },
  { nombre: 'Transferencia', familia: 'banco', orden: 10 },
]

// Cómo se llama la línea de un arqueo. Hay tres orígenes posibles y este es el
// orden: el catálogo nuevo, el viejo de cajas (los 63 detalles ya cargados
// apuntan ahí) y el nombre suelto que se escribió a mano. Un arqueo de 2025
// tiene que seguir leyéndose igual que el día que se cargó.
export function nombreDisponibilidad(detalle) {
  return detalle?.disponibilidad?.nombre
    || detalle?.detalle_tipo?.nombre
    || detalle?.nombre
    || 'Sin concepto'
}

// El total de una carga de disponibilidades. Los montos se guardan positivos
// —es plata que hay, no un movimiento— y lo que no se cargó no suma como cero
// silencioso: se devuelve aparte cuántas quedaron sin completar, que es lo que
// permite avisar "faltan 2 de 5" en vez de dar un total que miente.
export function totalDisponibilidades(lineas) {
  let total = 0
  let sinCargar = 0
  for (const l of lineas ?? []) {
    const v = l?.monto
    if (v === '' || v === null || v === undefined) { sinCargar++; continue }
    const n = Number(v)
    if (!Number.isFinite(n)) { sinCargar++; continue }
    total += Math.abs(n)
  }
  return { total, sinCargar, cargadas: (lineas?.length ?? 0) - sinCargar }
}
