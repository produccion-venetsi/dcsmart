// Tipos de movimiento de caja: fuente única para el front.
//
// Existían tres listas distintas y ninguna coincidía:
//   - el enum `TipoMovimiento` de prisma/schema.prisma (7 valores)
//   - `TIPOS_MOVIMIENTO` en backend/src/routes/caja_movimientos.js (6, sin EGRESO)
//   - los <option> hardcodeados en las pantallas de caja: INGRESO, EGRESO,
//     APERTURA y CIERRE
//
// APERTURA y CIERRE no existen en ningún lado: elegirlos daba 400 "tipo
// inválido" del backend, y como el catch del alta descartaba el mensaje, en
// pantalla se leía "Error al agregar movimiento" sin decir por qué. EGRESO está
// en el enum pero el backend lo rechaza igual. De las cuatro opciones que
// ofrecía el select, sólo INGRESO funcionaba.

// Todos los valores que puede haber guardados, para MOSTRAR. Incluye EGRESO
// porque el enum lo permite y `cuadreCaja.js` lo contempla, aunque hoy no haya
// ninguno cargado.
export const TIPOS_MOVIMIENTO = ['INICIAL', 'INGRESO', 'GASTO', 'COBRO', 'RETIRO', 'VACIADO', 'EGRESO']

// Los que se pueden ELEGIR al cargar o editar. Es exactamente la lista que
// valida `TIPOS_MOVIMIENTO` en backend/src/routes/caja_movimientos.js: ofrecer
// algo que el backend rechaza es el bug que se está arreglando acá.
// desgloses.test.js compara las dos listas contra el archivo del backend, así que
// si allá se agrega o saca un tipo, el test avisa.
export const TIPOS_MOVIMIENTO_ALTA = ['INICIAL', 'INGRESO', 'GASTO', 'COBRO', 'RETIRO', 'VACIADO']

// Orden del flujo de la caja, no alfabético: primero lo que entra, después lo
// que sale, y el vaciado al final porque es el cierre del circuito.
export const ORDEN_MOVIMIENTOS = ['INICIAL', 'COBRO', 'INGRESO', 'GASTO', 'EGRESO', 'RETIRO', 'VACIADO']

export const LABEL_MOVIMIENTO = {
  INICIAL: 'Inicial',
  COBRO:   'Cobro',
  INGRESO: 'Ingreso',
  GASTO:   'Gasto',
  EGRESO:  'Egreso',
  RETIRO:  'Retiro',
  VACIADO: 'Vaciado',
}

// Lo que suma plata a la caja. El resto la saca o la mueve afuera (RETIRO,
// VACIADO), y va en rojo. Antes el verde era para INGRESO y APERTURA: como
// APERTURA no existe, el saldo inicial real (INICIAL) se pintaba de rojo como si
// fuera una salida.
const DE_INGRESO = ['INICIAL', 'INGRESO', 'COBRO']

export function esMovimientoDeIngreso(tipo) {
  return DE_INGRESO.includes(tipo)
}

export function claseBadgeMovimiento(tipo) {
  return esMovimientoDeIngreso(tipo) ? 'badge-green' : 'badge-red'
}

export function labelMovimiento(tipo) {
  if (!tipo) return 'Sin tipo'
  return LABEL_MOVIMIENTO[tipo] ?? tipo
}
