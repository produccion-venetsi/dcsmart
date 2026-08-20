import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SIN_TURNO, etiquetaTurno, promedioPorCubierto, pctFiscal,
  ordenarPorTurno, desglosarPorTurno, totalizarPorNombre
} from './turnos.js'

// ── etiquetaTurno ───────────────────────────────────────────────────────────

test('etiquetaTurno: traduce la clave del enum que devuelve Prisma', () => {
  assert.equal(etiquetaTurno('MANANA'), 'Mañana')
  assert.equal(etiquetaTurno('TRASNOCHE'), 'Trasnoche')
})

test('etiquetaTurno: la etiqueta del SQL crudo pasa igual', () => {
  // La columna guarda el label por el @map, asi que el SQL crudo ya trae esto.
  assert.equal(etiquetaTurno('Noche'), 'Noche')
})

test('etiquetaTurno: una caja sin turno cae en Sin turno', () => {
  assert.equal(etiquetaTurno(null), SIN_TURNO)
  assert.equal(etiquetaTurno(undefined), SIN_TURNO)
  assert.equal(etiquetaTurno(''), SIN_TURNO)
})

// ── promedioPorCubierto ─────────────────────────────────────────────────────

test('promedioPorCubierto: total dividido cubiertos, redondeado', () => {
  assert.equal(promedioPorCubierto(100000, 8), 12500)
  assert.equal(promedioPorCubierto(10000, 3), 3333)
})

test('promedioPorCubierto: sin cubiertos cargados es null, no cero', () => {
  // Muchas cajas no cargan comensales. Un 0 se leeria como "gastaron cero".
  assert.equal(promedioPorCubierto(100000, 0), null)
  assert.equal(promedioPorCubierto(100000, null), null)
  assert.equal(promedioPorCubierto(100000, undefined), null)
})

test('promedioPorCubierto: sin ventas pero con cubiertos da cero', () => {
  assert.equal(promedioPorCubierto(0, 5), 0)
  assert.equal(promedioPorCubierto(null, 5), 0)
})

// ── pctFiscal ───────────────────────────────────────────────────────────────

test('pctFiscal: porcentaje del total declarado', () => {
  assert.equal(pctFiscal(50, 100), 50)
  assert.equal(pctFiscal(100, 100), 100)
  assert.equal(pctFiscal(0, 100), 0)
})

test('pctFiscal: redondea al entero', () => {
  assert.equal(pctFiscal(333, 1000), 33)
  assert.equal(pctFiscal(336, 1000), 34)
})

test('pctFiscal: sin ventas no se puede calcular', () => {
  assert.equal(pctFiscal(0, 0), null)
  assert.equal(pctFiscal(100, null), null)
})

// ── ordenarPorTurno ─────────────────────────────────────────────────────────

test('ordenarPorTurno: ordena por el orden del dia, no por monto', () => {
  const ordenado = ordenarPorTurno([
    { turno: 'Noche', total: 900 },
    { turno: 'Mañana', total: 100 },
    { turno: 'Tarde', total: 500 },
  ])
  assert.deepEqual(ordenado.map(t => t.turno), ['Mañana', 'Tarde', 'Noche'])
})

test('ordenarPorTurno: Sin turno va al final', () => {
  const ordenado = ordenarPorTurno([
    { turno: SIN_TURNO }, { turno: 'Mañana' }, { turno: 'Evento' },
  ])
  assert.deepEqual(ordenado.map(t => t.turno), ['Mañana', 'Evento', SIN_TURNO])
})

test('ordenarPorTurno: un turno desconocido va al final y no desaparece', () => {
  // Si se agrega un valor al enum y no se actualiza ORDEN_TURNOS.
  const ordenado = ordenarPorTurno([{ turno: 'Brunch' }, { turno: 'Tarde' }])
  assert.deepEqual(ordenado.map(t => t.turno), ['Tarde', 'Brunch'])
})

test('ordenarPorTurno: no muta la lista original', () => {
  const original = [{ turno: 'Noche' }, { turno: 'Mañana' }]
  ordenarPorTurno(original)
  assert.equal(original[0].turno, 'Noche')
})

// ── desglosarPorTurno ───────────────────────────────────────────────────────

test('desglosarPorTurno: separa por turno y ordena cada uno por monto', () => {
  const m = desglosarPorTurno([
    { turno: 'Noche', nombre: 'Efectivo', total: 100 },
    { turno: 'Noche', nombre: 'Transferencia', total: 300 },
    { turno: 'MANANA', nombre: 'Efectivo', total: 50 },
  ])

  assert.deepEqual(m.get('Noche').map(x => x.name), ['Transferencia', 'Efectivo'])
  assert.deepEqual(m.get('Mañana').map(x => x.name), ['Efectivo'])
})

test('desglosarPorTurno: el porcentaje es sobre el total DEL TURNO', () => {
  // Dentro de la fila de un turno interesa su propia composicion, no cuanto
  // pesa contra el periodo entero.
  const m = desglosarPorTurno([
    { turno: 'Noche', nombre: 'Efectivo', total: 250 },
    { turno: 'Noche', nombre: 'Transferencia', total: 750 },
    { turno: 'Tarde', nombre: 'Efectivo', total: 10 },
  ])

  assert.equal(m.get('Noche').find(x => x.name === 'Efectivo').pct, '25.0')
  assert.equal(m.get('Noche').find(x => x.name === 'Transferencia').pct, '75.0')
  assert.equal(m.get('Tarde')[0].pct, '100.0')
})

test('desglosarPorTurno: un turno que suma cero no divide por cero', () => {
  const m = desglosarPorTurno([{ turno: 'Tarde', nombre: 'Efectivo', total: 0 }])
  assert.equal(m.get('Tarde')[0].pct, '0.0')
})

test('desglosarPorTurno: las filas sin turno quedan juntas', () => {
  const m = desglosarPorTurno([
    { turno: null, nombre: 'Efectivo', total: 100 },
    { turno: null, nombre: 'MP QR', total: 50 },
  ])
  assert.equal(m.get(SIN_TURNO).length, 2)
})

test('desglosarPorTurno: extra() agrega campos propios de cada fila', () => {
  const m = desglosarPorTurno(
    [{ turno: 'Tarde', nombre: 'Compras', total: 80, egreso: true }],
    (r) => ({ egreso: Boolean(r.egreso) })
  )
  assert.equal(m.get('Tarde')[0].egreso, true)
})

// ── totalizarPorNombre ──────────────────────────────────────────────────────

test('totalizarPorNombre: suma el mismo nombre a traves de los turnos', () => {
  const total = totalizarPorNombre([
    { turno: 'Noche', nombre: 'Efectivo', total: 100 },
    { turno: 'Tarde', nombre: 'Efectivo', total: 50 },
    { turno: 'Noche', nombre: 'MP QR', total: 30 },
  ])

  assert.deepEqual(total, [
    // `cant: null` -- estas filas no traen cantidad, y "no sabemos" no es "cero".
    { name: 'Efectivo', val: 150, cant: null },
    { name: 'MP QR', val: 30, cant: null },
  ])
})

// La cantidad de operaciones de cada linea (los groupCount de TapTap): el
// reporte muestra "23 ops" al lado del monto del medio de pago.
test('totalizarPorNombre: suma las cantidades junto con los montos', () => {
  const total = totalizarPorNombre([
    { turno: 'Noche', nombre: 'Credito', total: 100, cantidad: 4 },
    { turno: 'Tarde', nombre: 'Credito', total: 50, cantidad: 3 },
  ])
  assert.equal(total[0].cant, 7)
})

test('desglosarPorTurno: cada turno lleva la cantidad de sus lineas', () => {
  const porTurno = desglosarPorTurno([
    { turno: 'Noche', nombre: 'Credito', total: 100, cantidad: 4 },
  ])
  assert.equal(porTurno.get('Noche')[0].cant, 4)
})

test('totalizarPorNombre: ordena por monto descendente', () => {
  const total = totalizarPorNombre([
    { turno: 'Noche', nombre: 'Chico', total: 1 },
    { turno: 'Noche', nombre: 'Grande', total: 999 },
  ])
  assert.deepEqual(total.map(x => x.name), ['Grande', 'Chico'])
})

test('totalizarPorNombre: si es egreso en un turno lo es en el total', () => {
  // La clasificacion viene del tipo de detalle, no de la fila: no puede ser
  // egreso a la noche y no a la tarde.
  const total = totalizarPorNombre(
    [
      { turno: 'Tarde', nombre: 'Compras', total: 10, egreso: false },
      { turno: 'Noche', nombre: 'Compras', total: 20, egreso: true },
    ],
    (r) => ({ egreso: Boolean(r.egreso) })
  )
  assert.equal(total[0].egreso, true)
  assert.equal(total[0].val, 30)
})

test('totalizarPorNombre: sin filas devuelve lista vacia', () => {
  assert.deepEqual(totalizarPorNombre([]), [])
})
