import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wherePagosEfectivo, separarPagosEfectivo } from './pagosEfectivoArqueo.js'
import { calcularComprobacion } from './cuadreArqueo.js'

test('separa por dirección, no por el signo del importe', () => {
  // Los importes se guardan positivos en las dos direcciones: quien manda es
  // la bandera. Un ingreso cargado con importe negativo (dato viejo) tampoco
  // tiene que restar dos veces.
  const r = separarPagosEfectivo([
    { importe: 1000, ingresa_egreso: false },
    { importe: 250, ingresa_egreso: true },
    { importe: -300, ingresa_egreso: true },
  ])
  assert.equal(r.egresos, 1000)
  assert.equal(r.ingresos, 550)
})

test('lista vacía o nula da cero, no NaN', () => {
  assert.deepEqual(separarPagosEfectivo([]), { ingresos: 0, egresos: 0 })
  assert.deepEqual(separarPagosEfectivo(null), { ingresos: 0, egresos: 0 })
  assert.deepEqual(separarPagosEfectivo([{ importe: null, ingresa_egreso: true }]), { ingresos: 0, egresos: 0 })
})

test('el ingreso en efectivo deja de aparecer como sobrante', () => {
  // Caso real: el cofre arranca en 0, entran $10.000 de cajas y una op de
  // ingreso en efectivo de $2.000. El conteo encuentra $12.000.
  const contado = 12000
  const cajas = 10000
  const pagos = separarPagosEfectivo([{ importe: 2000, ingresa_egreso: true }])

  // Antes: el ingreso no se contaba y el arqueo marcaba sobra $2.000.
  const viejo = calcularComprobacion({ ingresos: cajas, gastos: 0, contado, contadoAnterior: 0 })
  assert.equal(viejo, -2000)

  // Ahora: suma a los ingresos y cuadra.
  const nuevo = calcularComprobacion({
    ingresos: cajas + pagos.ingresos, gastos: pagos.egresos, contado, contadoAnterior: 0,
  })
  assert.equal(nuevo, 0)
})

test('el where pide pagado + efectivo y el período es (desde, hasta]', () => {
  const desde = new Date('2026-08-01T10:00:00Z')
  const hasta = new Date('2026-08-20T10:00:00Z')
  const w = wherePagosEfectivo({ id_local: 'L1', id_metodo: 'M1', desde, hasta })
  assert.equal(w.id_local, 'L1')
  assert.equal(w.pagado, true)
  assert.equal(w.id_metodo, 'M1')
  assert.deepEqual(w.fecha_pago, { gt: desde, lte: hasta })
  // Sin filtro de dirección: las dos entran y se separan después.
  assert.equal('ingresa_egreso' in w, false)
})

test('el primer arqueo del local no acota por abajo', () => {
  const hasta = new Date('2026-08-20T10:00:00Z')
  const w = wherePagosEfectivo({ id_local: 'L1', id_metodo: 'M1', desde: null, hasta })
  assert.deepEqual(w.fecha_pago, { lte: hasta })
})
