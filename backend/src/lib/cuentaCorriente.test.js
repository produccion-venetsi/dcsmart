import test from 'node:test'
import assert from 'node:assert/strict'
import {
  saldoCuentaCorriente, describirSaldo, whereMovimientosCliente, validarClienteYEstado,
} from './cuentaCorriente.js'

// ingresa_egreso = false -> gasto a nombre del cliente (debe más)
// ingresa_egreso = true  -> cobranza (la deuda baja)
const gasto    = (importe) => ({ importe, ingresa_egreso: false })
const cobranza = (importe) => ({ importe, ingresa_egreso: true })

// ── saldo ───────────────────────────────────────────────────────────────────

test('los gastos a nombre del cliente suman a lo que debe', () => {
  const r = saldoCuentaCorriente([gasto(100000), gasto(50000)])
  assert.equal(r.saldo, 150000)
  assert.equal(r.total_egresos, 150000)
  assert.equal(r.total_ingresos, 0)
})

test('una cobranza baja la deuda', () => {
  const r = saldoCuentaCorriente([gasto(100000), cobranza(100000)])
  assert.equal(r.saldo, 0)
  assert.equal(r.total_egresos, 100000)
  assert.equal(r.total_ingresos, 100000)
})

test('si cobro de mas, el saldo queda a favor del cliente (negativo)', () => {
  assert.equal(saldoCuentaCorriente([gasto(100000), cobranza(150000)]).saldo, -50000)
})

test('el caso mixto acumula las dos direcciones', () => {
  const r = saldoCuentaCorriente([gasto(80000), cobranza(30000), gasto(20000), cobranza(10000)])
  assert.equal(r.total_egresos, 100000)
  assert.equal(r.total_ingresos, 40000)
  assert.equal(r.saldo, 60000)
})

test('sin movimientos el saldo es cero, no NaN', () => {
  assert.deepEqual(saldoCuentaCorriente([]), { saldo: 0, total_egresos: 0, total_ingresos: 0 })
  assert.deepEqual(saldoCuentaCorriente(null), { saldo: 0, total_egresos: 0, total_ingresos: 0 })
  assert.deepEqual(saldoCuentaCorriente(undefined), { saldo: 0, total_egresos: 0, total_ingresos: 0 })
})

test('un importe null o basura cuenta como cero y no rompe el saldo', () => {
  const r = saldoCuentaCorriente([gasto(100000), gasto(null), gasto(undefined), gasto('x')])
  assert.equal(r.saldo, 100000)
})

test('los importes se toman en valor absoluto: la direccion la da ingresa_egreso', () => {
  // Si alguien cargó un negativo, el signo no puede contarse dos veces.
  assert.equal(saldoCuentaCorriente([gasto(-100000)]).saldo, 100000)
  assert.equal(saldoCuentaCorriente([cobranza(-50000)]).saldo, -50000)
})

test('ingresa_egreso null o ausente cuenta como gasto, que es el default de la columna', () => {
  assert.equal(saldoCuentaCorriente([{ importe: 1000, ingresa_egreso: null }]).saldo, 1000)
  assert.equal(saldoCuentaCorriente([{ importe: 1000 }]).saldo, 1000)
})

test('los importes con decimales no se redondean por el camino', () => {
  const r = saldoCuentaCorriente([gasto('1000.55'), cobranza('0.55')])
  assert.equal(r.saldo, 1000)
})

// ── cómo se lee ─────────────────────────────────────────────────────────────

test('describirSaldo distingue deudor, a favor y saldado', () => {
  assert.deepEqual(describirSaldo(150000), { estado: 'deudor', etiqueta: 'Debe', monto: 150000 })
  assert.deepEqual(describirSaldo(-50000), { estado: 'a_favor', etiqueta: 'A favor', monto: 50000 })
  assert.deepEqual(describirSaldo(0), { estado: 'saldado', etiqueta: 'Saldado', monto: 0 })
})

test('describirSaldo no explota con basura', () => {
  assert.equal(describirSaldo(null).estado, 'saldado')
  assert.equal(describirSaldo(undefined).estado, 'saldado')
})

// ── el filtro ───────────────────────────────────────────────────────────────

test('el saldo solo cuenta lo pagado y con fecha de pago', () => {
  // Hasta que la empresa no cierra la operación con el proveedor, el gasto todavía
  // puede cambiar o anularse.
  const w = whereMovimientosCliente('c1')
  assert.equal(w.id_cliente, 'c1')
  assert.equal(w.pagado, true)
  assert.deepEqual(w.fecha_pago, { not: null })
})

test('el filtro exige el estado del modulo, como defensa', () => {
  // El backend ya no deja guardar un id_cliente sin CTA_CTE_CLI, pero si apareciera
  // uno de otro estado no tiene que colarse al saldo.
  assert.equal(whereMovimientosCliente('c1').estado_op, 'CTA_CTE_CLI')
})

// ── cliente + estado_op ─────────────────────────────────────────────────────

test('cliente con CTA_CTE_CLI es la combinación válida', () => {
  assert.equal(validarClienteYEstado('cli-1', 'CTA_CTE_CLI'), null)
})

test('un pago común sin cliente no se ve afectado', () => {
  assert.equal(validarClienteYEstado(null, 'CAJA'), null)
  assert.equal(validarClienteYEstado('', 'CUENTA_CTE'), null)
  assert.equal(validarClienteYEstado(undefined, undefined), null)
})

test('cliente con otro estado se rechaza: no entraría en el saldo', () => {
  for (const estado of ['CAJA', 'CUENTA_CTE', 'MP_PDP', 'PDP']) {
    assert.match(validarClienteYEstado('cli-1', estado), /CTA CTE CLI/)
  }
})

test('CTA_CTE_CLI sin cliente se rechaza: deuda a nombre de nadie', () => {
  assert.match(validarClienteYEstado(null, 'CTA_CTE_CLI'), /elegir el cliente/)
  assert.match(validarClienteYEstado('', 'CTA_CTE_CLI'), /elegir el cliente/)
})

// El filtro del saldo y la validación tienen que exigir lo mismo: si alguien cambia
// el estado en uno y no en el otro, aparecen pagos guardados que el saldo no cuenta.
test('la validación exige el mismo estado_op que usa el filtro del saldo', () => {
  const estadoDelFiltro = whereMovimientosCliente('cli-1').estado_op
  assert.equal(validarClienteYEstado('cli-1', estadoDelFiltro), null)
})
