// Saldo de cuenta corriente de un cliente.
//
// Un "cliente" es a nombre de quién se generó un gasto, lo contrario de un proveedor.
// Sus movimientos NO son una entidad nueva: son los `Pago` que tienen `id_cliente`.
//
// La dirección la da `ingresa_egreso`, el mismo campo y la misma convención que usan
// deuda.js y direccionPagos.js -- no se inventa nada acá:
//
//   ingresa_egreso = false  ->  gasto a nombre del cliente: el cliente DEBE más
//   ingresa_egreso = true   ->  cobranza: entró plata, la deuda del cliente baja
//
// Por eso una cobranza se carga como un Pago más del cliente, con dirección ingreso.
// Ese pago cuenta como ingreso también en el reporte de Pagos, mezclado con las
// ventas -- decidido a propósito: es plata que entró de verdad.
//
// No se extiende deuda.js: `wheresDeuda` hardcodea `pagado: false` porque responde
// "cuánto le debemos a proveedores todavía sin pagar", que es el filtro opuesto. Sí se
// reusa `deudaNeta`, que es una resta genérica.

import { deudaNeta } from './deuda.js'

const esIngreso = (p) => p?.ingresa_egreso === true

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Saldo a partir de los pagos del cliente. Positivo = el cliente debe; negativo =
// tiene saldo a favor.
export function saldoCuentaCorriente(pagos) {
  let egresos = 0, ingresos = 0
  for (const p of pagos ?? []) {
    const monto = Math.abs(num(p?.importe))
    if (esIngreso(p)) ingresos += monto
    else egresos += monto
  }
  return {
    saldo: deudaNeta(egresos, ingresos),
    total_egresos: egresos,
    total_ingresos: ingresos,
  }
}

// Cómo se lee el saldo, para que la pantalla no tenga que interpretar el signo. Un
// número pelado no dice si es a favor o en contra.
export function describirSaldo(saldo) {
  const n = num(saldo)
  if (n > 0) return { estado: 'deudor', etiqueta: 'Debe', monto: n }
  if (n < 0) return { estado: 'a_favor', etiqueta: 'A favor', monto: Math.abs(n) }
  return { estado: 'saldado', etiqueta: 'Saldado', monto: 0 }
}

// El filtro con el que se traen los movimientos de un cliente.
//
// Solo cuentan los pagos ya pagados y con fecha de pago: `pagado` describe que la
// empresa cerró la operación con el proveedor, y hasta que eso pasa el gasto todavía
// puede cambiar o anularse. `estado_op` va como filtro defensivo -- el backend ya
// exige CTA_CTE_CLI para poder guardar un id_cliente, así que no debería haber otros,
// pero si aparece uno no se cuela al saldo.
export function whereMovimientosCliente(idCliente) {
  return {
    id_cliente: idCliente,
    pagado: true,
    fecha_pago: { not: null },
    estado_op: 'CTA_CTE_CLI',
  }
}

// Cliente y estado_op van juntos en las dos direcciones. Vive acá y no en la ruta
// porque es lo que sostiene el saldo, y el saldo se calcula con
// `whereMovimientosCliente` de más arriba: las dos reglas tienen que contar lo mismo.
//
//   - Cliente con otro estado: el pago no entra en `whereMovimientosCliente`, así que
//     la deuda queda contada en ningún lado.
//   - CTA_CTE_CLI sin cliente: es una deuda a nombre de nadie. Tampoco entra en
//     ninguna cuenta corriente y no hay forma de encontrarla después salvo mirando
//     los pagos uno por uno.
//
// Devuelve el mensaje de error, o null si está bien.
export function validarClienteYEstado(id_cliente, estado_op) {
  if (id_cliente && estado_op !== 'CTA_CTE_CLI') {
    return 'Para asignar un cliente, el estado de la op tiene que ser CTA CTE CLI'
  }
  if (!id_cliente && estado_op === 'CTA_CTE_CLI') {
    return 'Con estado CTA CTE CLI hay que elegir el cliente de la cuenta corriente'
  }
  return null
}
