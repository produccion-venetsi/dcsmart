import test from 'node:test'
import assert from 'node:assert/strict'
import {
  direccionCajaMayor, normalizarMovimiento, calcularSaldo, saldosPorLocal,
  importeMovimiento, datosCopiaDePago, datosSincroDePago, vaACajaMayor,
  validarLargos, LARGOS,
} from './cajaMayor.js'

const pago = (over = {}) => ({
  id: 'p1', id_local: 'L1', importe: 1000, ingresa_egreso: false,
  fecha: new Date('2026-06-30T00:00:00Z'), nro_ord: 13335,
  local: { nombre: 'DOGG', app: { nombre: 'GRUPO PERROS' } },
  rubcat: { rubro: { nombre: 'Caja Mayor' }, categoria: { nombre: 'Retiro $ (Pesos)' } },
  ...over,
})

// ── dirección ───────────────────────────────────────────────────────────────

test('un retiro del local (ingresa_egreso=false) es INGRESO a la caja mayor', () => {
  assert.equal(direccionCajaMayor(pago(), null), true)
})

test('ingresa_egreso=true es EGRESO de la caja mayor: la plata volvio al local', () => {
  assert.equal(direccionCajaMayor(pago({ ingresa_egreso: true }), null), false)
})

test('ingresa_egreso null cuenta como egreso del local, o sea ingreso a la caja mayor', () => {
  assert.equal(direccionCajaMayor(pago({ ingresa_egreso: null }), null), true)
})

test('los Sueldos salen de la caja mayor aunque ingresa_egreso diga false', () => {
  const sueldo = pago({ rubcat: { rubro: { nombre: 'Sueldos' }, categoria: { nombre: 'Sueldos' } } })
  assert.equal(direccionCajaMayor(sueldo, null), false)
})

test('la correccion manual gana sobre la regla, en los dos sentidos', () => {
  assert.equal(direccionCajaMayor(pago(), { ingreso: false, direccion_manual: true }), false)
  const sueldo = pago({ rubcat: { rubro: { nombre: 'Sueldos' } } })
  assert.equal(direccionCajaMayor(sueldo, { ingreso: true, direccion_manual: true }), true)
})

test('sin direccion_manual la regla manda, aunque la fila traiga otro ingreso', () => {
  // Es lo que permite que sincronizar con el pago recalcule la direccion.
  assert.equal(direccionCajaMayor(pago(), { ingreso: false, direccion_manual: false }), true)
})

test('un movimiento propio sin pago usa su propia direccion', () => {
  assert.equal(direccionCajaMayor(null, { ingreso: true }), true)
  assert.equal(direccionCajaMayor(null, { ingreso: false }), false)
})

// ── importe ─────────────────────────────────────────────────────────────────

test('el importe sale de la fila: es la copia, no se relee del pago', () => {
  const fila = { origen: 'PAGO', importe: 999, pago: pago({ importe: 1000 }) }
  assert.equal(importeMovimiento(fila), 999)
})

test('un importe negativo cargado a mano se toma en valor absoluto', () => {
  assert.equal(importeMovimiento({ origen: 'PROPIO', importe: -500 }), 500)
})

// ── normalización ───────────────────────────────────────────────────────────

test('normalizar una copia de gestion: datos propios, trazabilidad del pago, no editable', () => {
  const copia = {
    id: 'm1', id_pago: 'p1', origen: 'PAGO', moneda: 'ARS', importe: 1000,
    ingreso: true, estado: 'ENVIADA', fecha: new Date('2026-06-30'),
    local: { nombre: 'DOGG', app: { nombre: 'GRUPO PERROS' } }, pago: pago(),
  }
  const m = normalizarMovimiento(copia)
  assert.equal(m.local, 'DOGG')
  assert.equal(m.grupo, 'GRUPO PERROS')
  assert.equal(m.nro_ord, 13335)          // del pago, para rastrearla
  assert.equal(m.categoria, 'Retiro $ (Pesos)')
  assert.equal(m.importe, 1000)
  assert.equal(m.ingreso, true)
  assert.equal(m.efecto, 1000)
  assert.equal(m.estado, 'ENVIADA')
  assert.equal(m.editable, false)
  assert.equal(m.tiene_ciclo, true)
  assert.equal(m.desfasado, false)
})

test('avisa cuando la copia quedo desfasada del pago', () => {
  const m = normalizarMovimiento({
    origen: 'PAGO', importe: 1000, ingreso: true, pago: pago({ importe: 7777 }),
  })
  assert.equal(m.desfasado, true)
})

test('un movimiento propio no tiene ciclo enviada/recibida', () => {
  const m = normalizarMovimiento({ origen: 'PROPIO', importe: 10, ingreso: true })
  assert.equal(m.tiene_ciclo, false)
  assert.equal(m.desfasado, false)   // sin pago no hay con que comparar
})

test('el efecto es negativo cuando el movimiento sale de la caja mayor', () => {
  const m = normalizarMovimiento({ origen: 'PROPIO', importe: 300, ingreso: false, id_local: 'L1' })
  assert.equal(m.efecto, -300)
})

test('una fila sin estado explicito se lee como ENVIADA', () => {
  const m = normalizarMovimiento({ origen: 'PAGO', importe: 1, ingreso: true, pago: pago() })
  assert.equal(m.estado, 'ENVIADA')
})

test('marca cuando la direccion fue corregida a mano', () => {
  const base = { origen: 'PAGO', importe: 1, ingreso: true, pago: pago() }
  assert.equal(normalizarMovimiento(base).direccion_corregida, false)
  assert.equal(normalizarMovimiento({ ...base, direccion_manual: true }).direccion_corregida, true)
})

test('un movimiento propio es editable', () => {
  assert.equal(normalizarMovimiento({ origen: 'PROPIO', importe: 1, ingreso: true }).editable, true)
  assert.equal(normalizarMovimiento({ origen: 'APERTURA', importe: 1, ingreso: true }).editable, true)
})

// ── saldo ───────────────────────────────────────────────────────────────────

const mov = (importe, ingreso, estado = 'RECIBIDA') =>
  normalizarMovimiento({ origen: 'PROPIO', id_local: 'L1', importe, ingreso, estado, moneda: 'ARS' })

test('el saldo es ingresos menos egresos', () => {
  const r = calcularSaldo([mov(1000, true), mov(400, false)])
  assert.equal(r.ingresos, 1000)
  assert.equal(r.egresos, 400)
  assert.equal(r.saldo, 600)
})

test('el saldo puede quedar negativo, como en AppSheet', () => {
  assert.equal(calcularSaldo([mov(100, true), mov(500, false)]).saldo, -400)
})

test('soloRecibidas excluye lo que sigue ENVIADA y lo informa como pendiente', () => {
  const movs = [mov(1000, true), mov(300, true, 'ENVIADA')]
  const conTodo = calcularSaldo(movs)
  const soloReales = calcularSaldo(movs, { soloRecibidas: true })
  assert.equal(conTodo.saldo, 1300)
  assert.equal(soloReales.saldo, 1000)
  assert.equal(soloReales.pendiente, 300)
})

test('una lista vacia da saldo cero, no NaN', () => {
  assert.deepEqual(calcularSaldo([]), { ingresos: 0, egresos: 0, saldo: 0, pendiente: 0 })
  assert.deepEqual(calcularSaldo(undefined), { ingresos: 0, egresos: 0, saldo: 0, pendiente: 0 })
})

// ── saldos por local ────────────────────────────────────────────────────────

test('agrupa por local Y moneda: la caja en pesos no se mezcla con la de dolares', () => {
  const filas = [
    normalizarMovimiento({ origen: 'PROPIO', id_local: 'L1', importe: 1000, ingreso: true, moneda: 'ARS', estado: 'RECIBIDA', local: { nombre: 'DOGG', app: { nombre: 'PERROS' } } }),
    normalizarMovimiento({ origen: 'PROPIO', id_local: 'L1', importe: 50, ingreso: true, moneda: 'USD', estado: 'RECIBIDA', local: { nombre: 'DOGG', app: { nombre: 'PERROS' } } }),
  ]
  const r = saldosPorLocal(filas)
  assert.equal(r.length, 2)
  assert.equal(r.find(x => x.moneda === 'ARS').saldo, 1000)
  assert.equal(r.find(x => x.moneda === 'USD').saldo, 50)
})

test('cuenta cuantas quedan en estudio por local', () => {
  const base = { origen: 'PROPIO', id_local: 'L1', ingreso: true, moneda: 'ARS', local: { nombre: 'DOGG', app: { nombre: 'PERROS' } } }
  const r = saldosPorLocal([
    normalizarMovimiento({ ...base, importe: 100, estado: 'RECIBIDA' }),
    normalizarMovimiento({ ...base, importe: 200, estado: 'ENVIADA' }),
  ])
  assert.equal(r[0].ops, 2)
  assert.equal(r[0].en_estudio, 1)
})

// ── copia desde gestion ─────────────────────────────────────────────────────

test('vaACajaMayor: solo las ops de tipo CM con local', () => {
  assert.equal(vaACajaMayor({ id_tipo: 'CM', id_local: 'L1' }), true)
  assert.equal(vaACajaMayor({ id_tipo: 'B', id_local: 'L1' }), false)
  assert.equal(vaACajaMayor({ id_tipo: 'CM', id_local: null }), false)
  assert.equal(vaACajaMayor(null), false)
})

test('la copia nace ENVIADA, con origen PAGO y ligada a la op', () => {
  const d = datosCopiaDePago(pago())
  assert.equal(d.estado, 'ENVIADA')
  assert.equal(d.origen, 'PAGO')
  assert.equal(d.id_pago, 'p1')
  assert.equal(d.id_local, 'L1')
  assert.equal(d.moneda, 'ARS')
})

test('la copia toma el importe en positivo y la direccion de la regla', () => {
  assert.equal(datosCopiaDePago(pago({ importe: -500 })).importe, 500)
  assert.equal(datosCopiaDePago(pago()).ingreso, true)  // retiro: entra a la CM
  const sueldo = pago({ rubcat: { rubro: { nombre: 'Sueldos' } } })
  assert.equal(datosCopiaDePago(sueldo).ingreso, false)
})

test('sincronizar no toca el estado ni lo que se cargo en el modulo', () => {
  const d = datosSincroDePago(pago({ importe: 2000 }), { estado: 'RECIBIDA', recibe: 'Ana' })
  assert.equal(d.importe, 2000)
  assert.equal('estado' in d, false)
  assert.equal('recibe' in d, false)
  assert.equal('recibida_at' in d, false)
})

test('sincronizar recalcula la direccion salvo que este corregida a mano', () => {
  const conRegla = datosSincroDePago(pago(), { direccion_manual: false })
  assert.equal(conRegla.ingreso, true)
  const corregida = datosSincroDePago(pago(), { direccion_manual: true })
  assert.equal('ingreso' in corregida, false)
})

// ── largos de los campos de texto ───────────────────────────────────────────
// El contador del formulario es UX; el límite real vive acá, porque `maxLength`
// del navegador solo frena el tipeo y no un pedido armado contra la API.

test('acepta textos dentro del limite', () => {
  assert.equal(validarLargos({ observaciones: 'x'.repeat(500), recibe: 'Ana', extrae: 'Ana' }), null)
  assert.equal(validarLargos({}), null)
  assert.equal(validarLargos({ observaciones: null, recibe: undefined }), null)
})

test('rechaza una observacion de mas de 500 y dice cuanto tiene', () => {
  const err = validarLargos({ observaciones: 'x'.repeat(501) })
  assert.match(err, /observaciones/)
  assert.match(err, /500/)
  assert.match(err, /501/)
})

test('rechaza recibe y extrae de mas de 60', () => {
  assert.match(validarLargos({ recibe: 'x'.repeat(61) }), /recibe/)
  assert.match(validarLargos({ extrae: 'x'.repeat(61) }), /extrae/)
})

test('los limites que valida el backend son los que muestra el formulario', () => {
  // Si cambia uno, tiene que cambiar el otro: el usuario no puede ver 500 en el
  // contador y comerse un 400 del backend.
  assert.equal(LARGOS.observaciones, 500)
  assert.equal(LARGOS.recibe, 60)
  assert.equal(LARGOS.extrae, 60)
})
