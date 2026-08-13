// El lado caja de una cuenta corriente, para las pantallas.
//
// Espejo de backend/src/lib/cuentaCorrienteCaja.js: el criterio de qué carga una cuenta es
// el mismo, y hay un test de contrato que falla si divergen. Acá viven además las etiquetas
// y los textos de ayuda, que el backend no tiene por qué conocer.
//
// LA REGLA, en una línea: un detalle de caja con cliente y clasificación cobro o gasto es
// plata que ese cliente pasa a deber. Un informativo no mueve la cuenta.
//
// Lo que BAJA la deuda no vive acá: la cobranza se carga como op ingreso con estado CTA CTE
// CLI y cae del lado de pagos (lib/cuentaCorriente.js). Por eso este lado es de cargos.

import { normalizarClasificacion, clasificacionDeDetalle } from './clasificaciones.js'

// Clasificaciones que mueven una cuenta corriente. Igual que en el backend.
export const CLASIFICACIONES_QUE_CARGAN = ['cobro', 'gasto']

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const monto = (d) => Math.abs(num(d?.monto))

// OJO con el segundo argumento. `normalizarClasificacion` del frontend cae en 'cobro'
// cuando no reconoce el valor -- eso sirve para precargar un <select>, pero acá haría que
// un detalle SIN clasificar habilite la cuenta corriente y después el backend lo rechace al
// guardar. Con `null` el criterio queda idéntico al del backend, que devuelve null.
const clasif = (v) => normalizarClasificacion(v, null)

// ¿Una clasificación puede llevar cuenta corriente? Se usa para habilitar el campo del
// formulario ANTES de guardar, en vez de dejar que el backend lo rechace.
export function cargaLaCuenta(clasificacion) {
  const c = clasif(clasificacion)
  return Boolean(c) && CLASIFICACIONES_QUE_CARGAN.includes(c)
}

// La clasificación efectiva y ya normalizada. `clasificacionDeDetalle` de clasificaciones.js
// devuelve el valor crudo (puede ser un histórico como 'canal'); esto lo traduce.
export function clasificacionEfectiva(detalle) {
  return clasif(clasificacionDeDetalle(detalle))
}

// ¿Este detalle carga una cuenta? El backend ya lo manda resuelto en `carga_cuenta`; esto es
// el respaldo para una respuesta cacheada de antes del cambio.
export function cargaCuenta(detalle) {
  if (!detalle?.id_cliente && !detalle?.cliente) return false
  return cargaLaCuenta(clasificacionEfectiva(detalle))
}

// Los totales del lado caja, para cuando hay que recalcularlos en la pantalla (un filtro
// aplicado, por ejemplo).
export function totalesCajaCliente(detalles) {
  let cargado = 0
  let cantidad = 0
  let informativos = 0
  let cantidad_informativos = 0
  for (const d of detalles ?? []) {
    const carga = d?.carga_cuenta ?? cargaCuenta(d)
    if (carga) { cargado += monto(d); cantidad += 1 }
    else { informativos += monto(d); cantidad_informativos += 1 }
  }
  return { cargado, cantidad, informativos, cantidad_informativos }
}

// ── Textos ──────────────────────────────────────────────────────────────────

// Qué significa elegir un cliente, según la clasificación que tenga el detalle. "Cliente" a
// secas no le dice a nadie que eso genera una deuda.
export function ayudaCuentaDetalle(clasificacion) {
  // `clasif` y no el normalizador con su fallback: sin clasificación el campo está
  // deshabilitado, así que la ayuda tiene que decir eso y no "elegí un cliente acá".
  const c = clasif(clasificacion)
  if (c === 'cobro') {
    return 'Opcional. Si esta venta no se cobró y quedó anotada en la cuenta de alguien, elegilo acá: el monto pasa a lo que ese cliente debe. No cambia el cuadre de la caja.'
  }
  if (c === 'gasto') {
    return 'Opcional. Si la caja pagó esto a nombre de un cliente, elegilo acá: el monto pasa a lo que ese cliente debe.'
  }
  return 'Un detalle informativo no mueve ninguna cuenta corriente: es desglose de algo ya contado. Clasificalo como cobro o gasto para poder cargarlo a una cuenta.'
}

// ── Las dos ventanas de la ficha ────────────────────────────────────────────

export const VENTANAS = ['pagos', 'cajas']

export const VENTANA_INFO = {
  pagos: {
    label: 'Pagos',
    ayuda: 'Ops a nombre del cliente con estado CTA CTE CLI, pagadas y sin pagar.',
  },
  cajas: {
    label: 'Cajas',
    ayuda: 'Consumo cargado a su cuenta desde una caja: se vendió y no se cobró.',
  },
}

export const esVentanaValida = (v) => VENTANAS.includes(v)

// Con qué ventana abre la ficha. Se abre en la que tiene movimientos: entrar a "Pagos"
// vacío cuando toda la deuda está en cajas hace parecer que el cliente no debe nada.
export function ventanaInicial({ pagos = 0, cajas = 0 } = {}) {
  if (pagos === 0 && cajas > 0) return 'cajas'
  return 'pagos'
}
