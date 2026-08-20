import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparInformativos, FAMILIAS } from './gruposInformativos.js'

const det = (nombre, monto, cantidad = null) => ({ id: nombre + monto, nombre, monto, cantidad })

test('sin detalles devuelve lista vacia', () => {
  assert.deepEqual(agruparInformativos([]), [])
  assert.deepEqual(agruparInformativos(null), [])
})

test('los canales de venta van juntos y en su familia', () => {
  const r = agruparInformativos([det('Salón', 100), det('Delivery', 50), det('Takeaway', 25), det('Web', 10)])
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 'canales')
  assert.equal(r[0].total, 185)
  assert.equal(r[0].lineas.length, 4)
})

test('Mostrador y Online (nombres de Fudo) caen en canales', () => {
  const r = agruparInformativos([det('Mostrador', 10), det('Online', 20)])
  assert.equal(r[0].id, 'canales')
})

test('el movimiento de plata del cajon va aparte de los canales', () => {
  const r = agruparInformativos([det('Salón', 100), det('Fondo inicial', 20), det('Retiro', 30)])
  const ids = r.map((g) => g.id)
  assert.ok(ids.includes('canales'))
  assert.ok(ids.includes('cajon'))
  assert.equal(r.find((g) => g.id === 'cajon').total, 50)
})

// Lo que el usuario ve como "tirado": ocho lineas "Vaciado · X" sueltas.
// Se juntan bajo un solo encabezado, sumadas.
test('los vaciados se agrupan por su nombre base', () => {
  const r = agruparInformativos([
    det('Vaciado · Crédito', 100), det('Vaciado · MP QR', 50), det('Vaciado · PedidosYa', 25),
  ])
  const cajon = r.find((g) => g.id === 'cajon')
  assert.equal(cajon.lineas.length, 1)
  assert.equal(cajon.lineas[0].nombre, 'Vaciado')
  assert.equal(cajon.lineas[0].total, 175)
  assert.equal(cajon.lineas[0].items.length, 3)
  assert.deepEqual(cajon.lineas[0].items.map((i) => i.nombre), ['Crédito', 'MP QR', 'PedidosYa'])
})

test('los ajustes del POS tienen su propia familia y se destacan', () => {
  const r = agruparInformativos([det('Descuentos (POS)', 500), det('Contraórdenes (POS)', 100)])
  assert.equal(r[0].id, 'pos')
  assert.equal(r[0].destacado, true)
  assert.equal(r[0].total, 600)
})

test('los diffs del POS se juntan bajo un encabezado', () => {
  const r = agruparInformativos([
    det('diffs · Crédito · cajón', 300), det('diffs · Efectivo · cajón', 123),
  ])
  const pos = r.find((g) => g.id === 'pos')
  assert.equal(pos.lineas.length, 1)
  assert.equal(pos.lineas[0].nombre, 'diffs')
  assert.equal(pos.lineas[0].total, 423)
})

test('los resumenes van juntos: no son plata nueva', () => {
  const r = agruparInformativos([det('Tarjetas', 900), det('Efectivo (ya contado en el campo Efectivo)', 300)])
  assert.equal(r[0].id, 'resumen')
  assert.equal(r[0].total, 1200)
})

test('un nombre desconocido cae en otros, sin perderse', () => {
  const r = agruparInformativos([det('Cosa rara', 42)])
  assert.equal(r[0].id, 'otros')
  assert.equal(r[0].total, 42)
})

test('las cantidades se suman dentro de cada linea agrupada', () => {
  const r = agruparInformativos([det('Vaciado · A', 10, 3), det('Vaciado · B', 20, 4)])
  assert.equal(r[0].lineas[0].cantidad, 7)
})

test('una linea sin cantidad no inventa un cero', () => {
  const r = agruparInformativos([det('Salón', 10)])
  assert.equal(r[0].lineas[0].cantidad, null)
})

test('las familias salen en orden estable y las lineas de mayor a menor', () => {
  const r = agruparInformativos([
    det('Cosa rara', 1), det('Tarjetas', 2), det('Retiro', 3), det('Salón', 4), det('Descuentos (POS)', 5),
  ])
  assert.deepEqual(r.map((g) => g.id), ['canales', 'cajon', 'pos', 'resumen', 'otros'])
})

test('dentro de una familia, las lineas grandes van primero', () => {
  const r = agruparInformativos([det('Salón', 10), det('Delivery', 500), det('Web', 100)])
  assert.deepEqual(r[0].lineas.map((l) => l.nombre), ['Delivery', 'Web', 'Salón'])
})

test('cada familia declara su titulo para la pantalla', () => {
  for (const f of FAMILIAS) {
    assert.ok(f.titulo?.length > 0, `${f.id} sin titulo`)
  }
})

test('montos como string de Prisma se suman bien', () => {
  const r = agruparInformativos([det('Salón', '10.50'), det('Delivery', '4.50')])
  assert.equal(r[0].total, 15)
})
