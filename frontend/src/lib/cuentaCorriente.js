// Los cuatro cuadrantes de una cuenta corriente, para las pantallas.
//
// Espejo de backend/src/lib/cuentaCorriente.js: las claves y el criterio son los
// mismos, y hay un test de contrato que lo verifica. Acá viven las etiquetas y los
// colores, que el backend no tiene por qué conocer.
//
//                       sin pagar              pagado
//   egreso        Gastos pendientes    ->    Gastos
//   ingreso       A cobrar             ->    Ingresos
//
// Marcar un pago como pagado no agrega ni saca plata de la cuenta: la mueve de un
// cuadrante al de al lado.

export const CUADRANTES = {
  GASTOS_PENDIENTES: 'gastos_pendientes',
  GASTOS: 'gastos',
  A_COBRAR: 'a_cobrar',
  INGRESOS: 'ingresos',
}

// El orden es el de lectura de la ficha: primero lo que está abierto (lo que hay que
// hacer algo con) y después lo cerrado (lo que ya pasó).
export const ORDEN_CUADRANTES = [
  CUADRANTES.A_COBRAR,
  CUADRANTES.GASTOS_PENDIENTES,
  CUADRANTES.INGRESOS,
  CUADRANTES.GASTOS,
]

export const CUADRANTE_INFO = {
  [CUADRANTES.A_COBRAR]: {
    label: 'A cobrar',
    ayuda: 'Ingresos que el cliente todavía no pagó: es lo que te debe hoy.',
    color: 'var(--amber)',
    badge: 'badge-amber',
    abierto: true,
  },
  [CUADRANTES.GASTOS_PENDIENTES]: {
    label: 'Gastos pendientes',
    ayuda: 'Egresos a su nombre que el local todavía no pagó.',
    color: 'var(--blue)',
    badge: 'badge-blue',
    abierto: true,
  },
  [CUADRANTES.INGRESOS]: {
    label: 'Ingresos',
    ayuda: 'Lo que el cliente ya pagó.',
    color: 'var(--green)',
    badge: 'badge-green',
    abierto: false,
  },
  [CUADRANTES.GASTOS]: {
    label: 'Gastos',
    ayuda: 'Egresos a su nombre ya pagados por el local.',
    color: 'var(--red)',
    badge: 'badge-red',
    abierto: false,
  },
}

export const etiquetaCuadrante = (c) => CUADRANTE_INFO[c]?.label ?? '—'
export const colorCuadrante    = (c) => CUADRANTE_INFO[c]?.color ?? 'var(--t2)'
export const badgeCuadrante    = (c) => CUADRANTE_INFO[c]?.badge ?? 'badge-muted'

// Fallback para cuando un movimiento llega sin `cuadrante` (una respuesta cacheada de
// antes del cambio, por ejemplo). Mismo criterio que el backend: solo `true` cuenta.
export function cuadranteDe(pago) {
  const ingreso = pago?.ingresa_egreso === true
  const pagado = pago?.pagado === true
  if (ingreso) return pagado ? CUADRANTES.INGRESOS : CUADRANTES.A_COBRAR
  return pagado ? CUADRANTES.GASTOS : CUADRANTES.GASTOS_PENDIENTES
}

// Los egresos suman a lo que el cliente debe y los ingresos lo bajan. Se usa para el
// signo que se muestra al lado del importe.
export const sumaALaDeuda = (c) => c === CUADRANTES.GASTOS || c === CUADRANTES.GASTOS_PENDIENTES

// Filtros de la ficha: todos, solo lo abierto, o un cuadrante puntual.
export const FILTRO_TODOS = 'todos'
export const FILTRO_ABIERTOS = 'abiertos'

export function filtrarPorCuadrante(pagos, filtro) {
  const lista = pagos ?? []
  if (filtro === FILTRO_TODOS) return lista
  if (filtro === FILTRO_ABIERTOS) {
    return lista.filter((p) => CUADRANTE_INFO[p.cuadrante ?? cuadranteDe(p)]?.abierto)
  }
  return lista.filter((p) => (p.cuadrante ?? cuadranteDe(p)) === filtro)
}
