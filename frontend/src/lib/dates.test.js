import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diasDesdeFinDePeriodo, periodoDemasiadoViejo, DIAS_PERIODO_VIEJO } from './dates.js'

// El "hoy" va explicito en cada caso: si dependiera del reloj, estos tests
// pasarian hoy y fallarian el mes que viene.

test('el mes corriente no es viejo, ni cargandolo el ultimo dia', () => {
  // Es el caso que mas importa: con periodo dia 1, medir desde la fecha
  // ingresada daria 30 dias y avisaria siempre a fin de mes.
  assert.equal(periodoDemasiadoViejo('2026-07-01', '2026-07-31'), false)
  assert.equal(periodoDemasiadoViejo('2026-07-01', '2026-07-20'), false)
})

test('un periodo futuro no es viejo', () => {
  assert.equal(periodoDemasiadoViejo('2026-09-01', '2026-07-30'), false)
  assert.equal(diasDesdeFinDePeriodo('2026-09-01', '2026-07-30') < 0, true)
})

test('el mes anterior avisa recien pasados los 20 dias del cierre', () => {
  // Junio cierra el 30/06.
  assert.equal(diasDesdeFinDePeriodo('2026-06-01', '2026-07-19'), 19)
  assert.equal(periodoDemasiadoViejo('2026-06-01', '2026-07-19'), false)

  assert.equal(diasDesdeFinDePeriodo('2026-06-01', '2026-07-20'), 20)
  assert.equal(periodoDemasiadoViejo('2026-06-01', '2026-07-20'), true)
})

test('el umbral es inclusivo: exactamente 20 dias avisa', () => {
  const dias = diasDesdeFinDePeriodo('2026-06-01', '2026-07-20')
  assert.equal(dias, DIAS_PERIODO_VIEJO)
  assert.equal(periodoDemasiadoViejo('2026-06-01', '2026-07-20'), true)
})

test('un periodo viejo de verdad avisa', () => {
  assert.equal(periodoDemasiadoViejo('2026-01-01', '2026-07-30'), true)
  assert.equal(periodoDemasiadoViejo('2025-11-01', '2026-07-30'), true)
})

test('da igual el dia que se haya ingresado dentro del mes', () => {
  // El 2,2% de los pagos tiene un dia distinto de 1: se toma el mes igual.
  for (const dia of ['01', '10', '17', '28']) {
    assert.equal(diasDesdeFinDePeriodo(`2026-06-${dia}`, '2026-07-20'), 20, `dia ${dia}`)
  }
})

test('cruza bien el fin de año', () => {
  // Diciembre 2025 cierra el 31/12; al 20/01/2026 son 20 dias.
  assert.equal(diasDesdeFinDePeriodo('2025-12-01', '2026-01-20'), 20)
  assert.equal(periodoDemasiadoViejo('2025-12-01', '2026-01-19'), false)
})

test('febrero de año bisiesto cierra el 29', () => {
  // 2028 es bisiesto: si tomara 28 dias, el resultado se correria uno.
  assert.equal(diasDesdeFinDePeriodo('2028-02-01', '2028-03-20'), 20)
  assert.equal(diasDesdeFinDePeriodo('2026-02-01', '2026-03-20'), 20) // 2026 no es bisiesto
})

test('acepta un ISO guardado y un Date, no solo el string del input', () => {
  assert.equal(diasDesdeFinDePeriodo('2026-06-01T00:00:00.000Z', '2026-07-20'), 20)
  assert.equal(diasDesdeFinDePeriodo(new Date('2026-06-01T00:00:00.000Z'), '2026-07-20'), 20)
})

test('sin periodo no hay advertencia', () => {
  for (const vacio of [null, undefined, '', '   ']) {
    assert.equal(diasDesdeFinDePeriodo(vacio, '2026-07-30'), null)
    assert.equal(periodoDemasiadoViejo(vacio, '2026-07-30'), false)
  }
})

test('un valor que no es fecha no rompe ni avisa', () => {
  assert.equal(diasDesdeFinDePeriodo('cualquier cosa', '2026-07-30'), null)
  assert.equal(periodoDemasiadoViejo('2026-13', '2026-07-30'), false)
  assert.equal(periodoDemasiadoViejo(new Date('invalido'), '2026-07-30'), false)
})
