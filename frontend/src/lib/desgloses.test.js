import test from 'node:test'
import assert from 'node:assert/strict'
import {
  montoDe, sumaMontos, agruparMovimientos, agruparDetalles,
  arrancaExpandido, LIMITE_AUTOEXPANDIR,
} from './desgloses.js'

const mov = (tipo, monto, metodo) => ({
  id: `${tipo}-${monto}-${metodo ?? 'x'}`, tipo, monto,
  ...(metodo ? { metodo_pago: { nombre: metodo } } : {}),
})
const det = (clasif, monto, nombre) => ({
  id: `${clasif}-${monto}-${nombre ?? 'x'}`, tipo: clasif, monto,
  ...(nombre ? { detalle_tipo: { nombre } } : {}),
})

test('montoDe: acepta el Decimal que viaja como string en el JSON', () => {
  assert.equal(montoDe({ monto: '1500.50' }), 1500.5)
  assert.equal(montoDe({ monto: 1500.5 }), 1500.5)
})

test('montoDe: lo que no es número no rompe la suma, cuenta 0', () => {
  assert.equal(montoDe({ monto: null }), 0)
  assert.equal(montoDe({ monto: 'ninguno' }), 0)
  assert.equal(montoDe({}), 0)
  assert.equal(montoDe(null), 0)
})

test('sumaMontos: suma y tolera lista vacía o ausente', () => {
  assert.equal(sumaMontos([{ monto: 10 }, { monto: '5.25' }]), 15.25)
  assert.equal(sumaMontos([]), 0)
  assert.equal(sumaMontos(null), 0)
})

test('agruparMovimientos: junta por tipo y suma el total del grupo', () => {
  const grupos = agruparMovimientos([
    mov('VACIADO', 100, 'MP Point'),
    mov('COBRO', 30, 'Efectivo'),
    mov('VACIADO', 200, 'Tarjeta'),
  ])
  assert.deepEqual(grupos.map(g => g.clave), ['COBRO', 'VACIADO'])
  const vaciado = grupos.find(g => g.clave === 'VACIADO')
  assert.equal(vaciado.total, 300)
  assert.equal(vaciado.cantidad, 2)
  assert.equal(vaciado.label, 'Vaciado')
})

test('agruparMovimientos: ordena por el flujo de la caja, no alfabético', () => {
  const grupos = agruparMovimientos([
    mov('VACIADO', 1), mov('RETIRO', 1), mov('COBRO', 1), mov('INICIAL', 1), mov('GASTO', 1),
  ])
  assert.deepEqual(grupos.map(g => g.clave), ['INICIAL', 'COBRO', 'GASTO', 'RETIRO', 'VACIADO'])
})

test('agruparMovimientos: un tipo desconocido queda al final, no se pierde', () => {
  const grupos = agruparMovimientos([mov('RAREZA', 5), mov('COBRO', 5)])
  assert.deepEqual(grupos.map(g => g.clave), ['COBRO', 'RAREZA'])
  assert.equal(grupos[1].label, 'Rareza')
})

test('agruparMovimientos: el segundo nivel agrupa por método con su subtotal', () => {
  const grupos = agruparMovimientos([
    mov('COBRO', 100, 'Efectivo'),
    mov('COBRO', 50, 'Efectivo'),
    mov('COBRO', 20, 'MP Point'),
  ])
  const [cobro] = grupos
  assert.equal(cobro.subdividir, true)
  assert.deepEqual(cobro.subgrupos.map(s => [s.label, s.total, s.cantidad]), [
    ['Efectivo', 150, 2],
    ['MP Point', 20, 1],
  ])
})

test('agruparMovimientos: no subdivide cuando cada método aparece una sola vez', () => {
  const grupos = agruparMovimientos([
    mov('VACIADO', 100, 'MP Point'),
    mov('VACIADO', 200, 'Tarjeta'),
  ])
  // Habría un subgrupo por fila: mismas filas con una cabecera de más.
  assert.equal(grupos[0].subdividir, false)
  assert.equal(grupos[0].subgrupos.length, 2)
})

test('agruparMovimientos: un movimiento sin método cae en "Sin método"', () => {
  const grupos = agruparMovimientos([mov('GASTO', 10), mov('GASTO', 20)])
  assert.equal(grupos[0].subgrupos[0].label, 'Sin método')
})

test('agruparMovimientos: un movimiento sin tipo cae en "Sin tipo" y suma igual', () => {
  const grupos = agruparMovimientos([{ id: 'x', monto: 40 }])
  assert.equal(grupos[0].label, 'Sin tipo')
  assert.equal(grupos[0].total, 40)
})

test('agruparMovimientos: preserva el orden de llegada dentro del grupo', () => {
  const grupos = agruparMovimientos([
    mov('COBRO', 3, 'Efectivo'), mov('COBRO', 1, 'Efectivo'), mov('COBRO', 2, 'Efectivo'),
  ])
  assert.deepEqual(grupos[0].items.map(m => m.monto), [3, 1, 2])
})

test('agruparDetalles: agrupa por clasificación con su total', () => {
  const grupos = agruparDetalles([
    det('informativo', 100, 'Delivery'),
    det('cobro', 50, 'MP QR'),
    det('informativo', 25, 'Takeaway'),
  ])
  assert.deepEqual(grupos.map(g => [g.label, g.total]), [
    ['Cobro', 50],
    ['Informativo', 125],
  ])
})

test('agruparDetalles: cobro, gasto e informativo en ese orden', () => {
  const grupos = agruparDetalles([
    det('informativo', 1), det('gasto', 1), det('cobro', 1),
  ])
  assert.deepEqual(grupos.map(g => g.clave), ['cobro', 'gasto', 'informativo'])
})

test('agruparDetalles: las clasificaciones históricas no abren un grupo aparte', () => {
  // 'ingreso' y 'medio_pago' son el 'cobro' de hoy; 'canal' es 'informativo'.
  const grupos = agruparDetalles([
    det('cobro', 10, 'MP QR'),
    det('ingreso', 20, 'MP QR'),
    det('medio_pago', 30, 'Transferencia'),
    det('canal', 40, 'Delivery'),
  ])
  assert.deepEqual(grupos.map(g => [g.clave, g.total]), [['cobro', 60], ['informativo', 40]])
})

test('agruparDetalles: si el detalle no trae clasificación usa la de su tipo', () => {
  const grupos = agruparDetalles([
    { id: 'a', tipo: null, monto: 10, detalle_tipo: { nombre: 'Gastos', clasificacion: 'gasto' } },
  ])
  assert.equal(grupos[0].clave, 'gasto')
})

test('agruparDetalles: la clasificación del detalle gana sobre la de su tipo', () => {
  const grupos = agruparDetalles([
    { id: 'a', tipo: 'informativo', monto: 10, detalle_tipo: { nombre: 'Gastos', clasificacion: 'gasto' } },
  ])
  assert.equal(grupos[0].clave, 'informativo')
})

test('agruparDetalles: sin clasificación en ningún lado no se le asume una', () => {
  const grupos = agruparDetalles([{ id: 'a', tipo: null, monto: 10, nombre: 'Suelto' }])
  assert.equal(grupos[0].label, 'Sin clasificar')
  assert.equal(grupos[0].total, 10)
})

test('agruparDetalles: el segundo nivel junta los repetidos por nombre', () => {
  const grupos = agruparDetalles([
    det('informativo', 100, 'diffs · Efectivo · belen'),
    det('informativo', 50, 'diffs · Efectivo · belen'),
    det('informativo', 25, 'Delivery'),
  ])
  assert.equal(grupos[0].subdividir, true)
  assert.deepEqual(grupos[0].subgrupos.map(s => [s.label, s.total, s.cantidad]), [
    ['diffs · Efectivo · belen', 150, 2],
    ['Delivery', 25, 1],
  ])
})

test('agruparDetalles: usa el nombre libre cuando no hay tipo asociado', () => {
  const grupos = agruparDetalles([
    { id: 'a', tipo: 'cobro', monto: 10, nombre: 'Cobro suelto' },
    { id: 'b', tipo: 'cobro', monto: 10, nombre: 'Cobro suelto' },
  ])
  assert.equal(grupos[0].subgrupos[0].label, 'Cobro suelto')
})

test('agrupar: lista vacía o ausente no devuelve grupos', () => {
  assert.deepEqual(agruparMovimientos([]), [])
  assert.deepEqual(agruparMovimientos(null), [])
  assert.deepEqual(agruparDetalles(undefined), [])
})

test('arrancaExpandido: una caja chica arranca abierta', () => {
  const grupos = agruparMovimientos([mov('COBRO', 1), mov('VACIADO', 2)])
  assert.equal(arrancaExpandido(grupos), true)
})

test('arrancaExpandido: pasado el límite arranca cerrada', () => {
  const muchos = Array.from({ length: LIMITE_AUTOEXPANDIR + 1 }, (_, i) => mov('COBRO', i, 'Efectivo'))
  assert.equal(arrancaExpandido(agruparMovimientos(muchos)), false)
})

test('arrancaExpandido: justo en el límite todavía abre', () => {
  const justos = Array.from({ length: LIMITE_AUTOEXPANDIR }, (_, i) => mov('COBRO', i, 'Efectivo'))
  assert.equal(arrancaExpandido(agruparMovimientos(justos)), true)
})

test('arrancaExpandido: sin grupos no explota', () => {
  assert.equal(arrancaExpandido([]), true)
  assert.equal(arrancaExpandido(null), true)
})

test('los totales de los grupos suman el total de la tabla', () => {
  const movimientos = [
    mov('COBRO', 145200, 'Efectivo'), mov('COBRO', 581100, 'MP Point'),
    mov('RETIRO', 51000, 'Efectivo'), mov('VACIADO', 598900, 'MP Point'),
  ]
  const grupos = agruparMovimientos(movimientos)
  assert.equal(grupos.reduce((a, g) => a + g.total, 0), sumaMontos(movimientos))
  // y cada grupo cuadra con sus propios subgrupos
  for (const g of grupos) {
    assert.equal(g.subgrupos.reduce((a, s) => a + s.total, 0), g.total)
  }
})
