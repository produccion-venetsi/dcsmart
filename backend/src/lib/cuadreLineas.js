// El cuadre sobre la estructura unificada.
//
// Compará este archivo con lib/cuadreVenta.js: ahí hay que decidir de qué tabla
// sale cada cosa, reconstruir el efectivo cuando el origen no lo informa y
// adivinar la venta fiada por el texto del nombre. Acá no hay nada de eso
// porque la categoría ya lo dice: sumar por categoría ES el cuadre.
//
// Eso es lo que se está evaluando: no si el número mejora, sino si la regla
// se puede explicar sin condicionales.

import { TOLERANCIA, esEfectivo } from './cuadreCaja.js'

export { TOLERANCIA }

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const sumaCat = (lineas, ...categorias) =>
  (lineas ?? [])
    .filter((l) => categorias.includes(l.categoria))
    .reduce((a, l) => a + num(l.monto), 0)

// Todo lo que se vendió tiene que estar explicado por algo: o se cobró, o quedó
// a deber. Una sola línea de código, sin ramas por origen.
export function cuadreDeVenta(caja) {
  const lineas = caja?.lineas ?? []
  const cobrado = sumaCat(lineas, 'COBRO')
  const fiado = sumaCat(lineas, 'FIADO')
  const esperado = cobrado + fiado

  if (caja?.total == null) {
    return { cobrado, fiado, esperado, total: null, diferencia: null, cuadra: null }
  }
  const total = num(caja.total)
  const diferencia = total - esperado
  return { cobrado, fiado, esperado, total, diferencia, cuadra: Math.abs(diferencia) <= TOLERANCIA }
}

// La plata del cajón: entra con el fondo inicial y los cobros en efectivo, sale
// con gastos, retiros y vaciados.
export function circuitoDeEfectivo(caja) {
  const todas = caja?.lineas ?? []
  // Una línea sin método se asume en efectivo: es lo que pasa con las que
  // vienen de un detalle, donde el medio de pago no se registra.
  const enEfectivo = (l) => l.id_metodo == null || esEfectivo(l.metodo_pago?.nombre)
  const efectivo = todas.filter(enEfectivo)
  const por = (cat) => efectivo.filter((l) => l.categoria === cat).reduce((a, l) => a + num(l.monto), 0)

  const inicial = por('INICIAL')
  const cobrado = por('COBRO')
  const gastos = por('GASTO')
  const retiros = por('RETIRO')
  const vaciados = por('VACIADO')

  return {
    // Sin algo que saque plata del cajón no se puede decir cuánto queda.
    disponible: todas.some((l) => ['INICIAL', 'RETIRO', 'VACIADO'].includes(l.categoria)),
    inicial, cobrado, gastos, retiros, vaciados,
    queda: inicial + cobrado - gastos - retiros - vaciados,
  }
}

export function calcularCuadre(caja) {
  if (!caja) return null
  const venta = cuadreDeVenta(caja)
  const efectivo_fisico = circuitoDeEfectivo(caja)
  return {
    estructura: 'lineas',
    venta,
    efectivo_fisico,
    informativos: sumaCat(caja.lineas, 'INFORMATIVO', 'DIFERENCIA'),
    // los mismos nombres que lee la pantalla, para que no le importe de qué
    // estructura salió el número
    efectivo: efectivo_fisico.cobrado,
    cobros: venta.cobrado - efectivo_fisico.cobrado,
    no_cobrado: venta.fiado,
    gastos: efectivo_fisico.gastos,
    esperado: venta.esperado,
    total: venta.total,
    diferencia: venta.diferencia,
    cuadra: venta.cuadra,
  }
}
