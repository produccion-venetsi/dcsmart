import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  soloFecha, calcCashflow, cashflowAutomatico, esCashflowManual, siguienteCashflow,
  ayudaCashflow,
} from './cashflowPago.js'

// ── soloFecha ───────────────────────────────────────────────────────────────

test('recorta la hora de fecha_pago', () => {
  // fecha_pago es datetime-local; el cashflow es solo dia.
  assert.equal(soloFecha('2026-08-12T14:35'), '2026-08-12')
  assert.equal(soloFecha('2026-08-12T14:35:00'), '2026-08-12')
  assert.equal(soloFecha('2026-08-12'), '2026-08-12')
})

test('lo que no es fecha da vacio en vez de basura', () => {
  for (const v of [null, undefined, '', 'hoy', '12/08/2026', {}]) {
    assert.equal(soloFecha(v), '', `${JSON.stringify(v)} no dio vacio`)
  }
})

// ── calcCashflow (op con factura) ───────────────────────────────────────────

test('fecha + plazo del proveedor', () => {
  assert.equal(calcCashflow('2026-08-12', 30), '2026-09-11')
  assert.equal(calcCashflow('2026-08-12', '15'), '2026-08-27')
})

test('cruza fin de mes y fin de anio', () => {
  assert.equal(calcCashflow('2026-01-31', 1), '2026-02-01')
  assert.equal(calcCashflow('2026-12-20', 30), '2027-01-19')
})

test('sin plazo no calcula nada', () => {
  // 0 dias tampoco: un proveedor sin plazo cargado viene como null o 0 y no significa "hoy".
  assert.equal(calcCashflow('2026-08-12', null), '')
  assert.equal(calcCashflow('2026-08-12', 0), '')
  assert.equal(calcCashflow('', 30), '')
})

test('un plazo que no es numero no rompe', () => {
  assert.equal(calcCashflow('2026-08-12', 'treinta'), '')
})

// ── el default de los modos rapidos: el pedido ──────────────────────────────

test('MODO RAPIDO: el cashflow es la fecha de pago, no el dia que se aprieta', () => {
  // El pedido textual: "cuando apretas carga avion, por default la fecha cashflow es igual
  // a la fecha de pago que pone". Si alguien carga hoy una op que se pago el viernes, el
  // cashflow es el viernes.
  assert.equal(
    cashflowAutomatico({ modoRapido: true, fecha: '2026-08-12', fechaPago: '2026-08-07T18:00' }),
    '2026-08-07'
  )
})

test('MODO RAPIDO: el plazo del proveedor se ignora', () => {
  // La plata ya salio de la caja: un plazo de 30 dias no describe nada real.
  assert.equal(
    cashflowAutomatico({ modoRapido: true, fecha: '2026-08-12', fechaPago: '2026-08-12T10:00', plazo: 30 }),
    '2026-08-12'
  )
})

test('MODO RAPIDO sin fecha de pago cae en la fecha de la op', () => {
  // Pasa si se destilda "pagado": el campo fecha_pago se vacia.
  assert.equal(
    cashflowAutomatico({ modoRapido: true, fecha: '2026-08-12', fechaPago: '' }),
    '2026-08-12'
  )
})

test('OP CON FACTURA: sigue siendo fecha + plazo', () => {
  // Lo de siempre. El cambio no toca el modo normal.
  assert.equal(
    cashflowAutomatico({ modoRapido: false, fecha: '2026-08-12', fechaPago: '2026-08-12T10:00', plazo: 30 }),
    '2026-09-11'
  )
})

test('OP CON FACTURA sin proveedor todavia: vacio, no la fecha', () => {
  // Ponerle la fecha de la factura seria inventar un vencimiento.
  assert.equal(cashflowAutomatico({ modoRapido: false, fecha: '2026-08-12' }), '')
})

// ── manual vs automatico ────────────────────────────────────────────────────

test('un cashflow distinto al automatico es manual', () => {
  assert.equal(esCashflowManual('2026-09-30', '2026-09-11'), true)
})

test('el automatico no cuenta como manual', () => {
  assert.equal(esCashflowManual('2026-09-11', '2026-09-11'), false)
})

test('vacio no es manual', () => {
  // Un campo que nunca se toco se puede completar solo.
  assert.equal(esCashflowManual('', '2026-09-11'), false)
  assert.equal(esCashflowManual(null, ''), false)
})

test('compara por dia: la hora no lo vuelve manual', () => {
  assert.equal(esCashflowManual('2026-08-07', '2026-08-07T18:00'), false)
})

// ── siguienteCashflow ───────────────────────────────────────────────────────

test('mover la fecha de pago arrastra el cashflow automatico', () => {
  assert.equal(siguienteCashflow({
    actual: '2026-08-12', autoAnterior: '2026-08-12', autoNuevo: '2026-08-07',
  }), '2026-08-07')
})

test('lo escrito a mano NO se pisa', () => {
  // El cliente carga vencimientos pactados que no coinciden con ningun calculo. Verlos
  // cambiar solos al mover otro campo es peor que tener que tipearlos.
  assert.equal(siguienteCashflow({
    actual: '2026-10-15', autoAnterior: '2026-08-12', autoNuevo: '2026-08-07',
  }), '2026-10-15')
})

test('un campo vacio se completa con el automatico', () => {
  assert.equal(siguienteCashflow({
    actual: '', autoAnterior: '', autoNuevo: '2026-08-07',
  }), '2026-08-07')
})

test('si el automatico nuevo es vacio, se conserva lo que habia', () => {
  // Pasa al quitar el proveedor de una op con factura: vaciarle el campo a alguien que ya
  // lo tenia lleno es peor que dejar el valor viejo.
  assert.equal(siguienteCashflow({
    actual: '2026-09-11', autoAnterior: '2026-09-11', autoNuevo: '',
  }), '2026-09-11')
})

test('sin argumentos no rompe', () => {
  assert.equal(siguienteCashflow(), '')
  assert.equal(cashflowAutomatico(), '')
})

// ── la ayuda del campo ──────────────────────────────────────────────────────

test('en modo rapido explica que sigue a la fecha de pago', () => {
  const a = ayudaCashflow({ modoRapido: true, fecha: '2026-08-12', fechaPago: '2026-08-07T18:00', actual: '2026-08-07' })
  assert.match(a.texto, /fecha de pago/)
  assert.equal(a.puedeVolver, false, 'no hay a que volver: el valor ES el automatico')
})

test('en modo rapido NO habla del plazo del proveedor', () => {
  // Mencionar un plazo que no se aplica manda a corregir un valor que esta bien.
  const a = ayudaCashflow({ modoRapido: true, fecha: '2026-08-12', fechaPago: '2026-08-12T10:00', plazo: 30, actual: '2026-08-12' })
  assert.ok(!/plazo/i.test(a.texto), `menciona el plazo: "${a.texto}"`)
})

test('con un valor a mano avisa y ofrece volver', () => {
  const a = ayudaCashflow({ modoRapido: true, fecha: '2026-08-12', fechaPago: '2026-08-12T10:00', actual: '2026-10-01' })
  assert.match(a.texto, /a mano/)
  assert.equal(a.puedeVolver, true)
  assert.equal(a.automatico, '2026-08-12')
  assert.match(a.accion, /fecha de pago/)
})

test('op con factura: habla del plazo y ofrece recalcular', () => {
  const a = ayudaCashflow({ modoRapido: false, fecha: '2026-08-12', plazo: 30, actual: '2026-10-01' })
  assert.match(a.texto, /30 días/)
  assert.equal(a.accion, 'recalcular por plazo')
  assert.equal(a.puedeVolver, true)
})

test('op con factura sin proveedor: dice que falta elegirlo y no ofrece volver a nada', () => {
  const a = ayudaCashflow({ modoRapido: false, fecha: '2026-08-12', actual: '2026-10-01' })
  assert.match(a.texto, /proveedor/)
  assert.equal(a.puedeVolver, false, 'sin automatico no hay adonde volver')
})

test('la ayuda nunca queda vacia', () => {
  // El campo es obligatorio: un texto vacio deja un hueco debajo del input.
  for (const modoRapido of [true, false]) {
    for (const plazo of [null, 30]) {
      const a = ayudaCashflow({ modoRapido, fecha: '2026-08-12', fechaPago: '', plazo, actual: '' })
      assert.ok(a.texto.length > 0)
      assert.ok(a.titulo.length > 0)
    }
  }
})

// ── contrato con el formulario ──────────────────────────────────────────────

test('CONTRATO: PagoForm usa este lib y no su propio calculo', () => {
  // El calculo del cashflow vivia dentro de PagoForm.jsx. Si vuelve a aparecer una copia
  // local, los tests de aca dejan de decir algo sobre lo que corre en la pantalla.
  const jsx = readFileSync(new URL('../pages/pagos/PagoForm.jsx', import.meta.url), 'utf8')
  assert.match(jsx, /from '\.\.\/\.\.\/lib\/cashflowPago\.js'/)
  assert.ok(
    !/function calcCashflow\s*\(/.test(jsx),
    'PagoForm.jsx volvio a definir calcCashflow localmente'
  )
})
