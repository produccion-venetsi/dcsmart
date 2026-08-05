import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarPorDireccion } from './direccionPagos.js'

const fila = (importe, ingresa_egreso, metodo, rubro) => ({
  importe,
  ingresa_egreso,
  metodo_pago: metodo ? { nombre: metodo } : null,
  rubcat: rubro ? { rubro: { nombre: rubro } } : null,
})

test('sin filas devuelve todo en cero', () => {
  const r = agregarPorDireccion([])
  assert.equal(r.total_ingresos, 0)
  assert.equal(r.total_egresos, 0)
  assert.deepEqual(r.efectivo, { ingresos: 0, egresos: 0 })
  assert.deepEqual(r.resto, { ingresos: 0, egresos: 0 })
  assert.deepEqual(r.rubros, { ingresos: [], egresos: [] })
})

test('separa por direccion: ingresa_egreso true es ingreso, false es egreso', () => {
  const r = agregarPorDireccion([
    fila(100, true,  'Transferencia', 'Ventas'),
    fila(30,  false, 'Transferencia', 'Sueldos'),
  ])
  assert.equal(r.total_ingresos, 100)
  assert.equal(r.total_egresos, 30)
})

test('los montos son positivos: un egreso no resta del total de ingresos', () => {
  const r = agregarPorDireccion([
    fila(100, true,  null, null),
    fila(100, false, null, null),
  ])
  assert.equal(r.total_ingresos, 100)
  assert.equal(r.total_egresos, 100)
})

test('efectivo se decide por el nombre del metodo, sin importar mayusculas', () => {
  const r = agregarPorDireccion([
    fila(10, false, 'Efectivo', null),
    fila(20, false, 'EFECTIVO', null),
    fila(40, false, 'efectivo en mano', null),
  ])
  assert.equal(r.efectivo.egresos, 70)
  assert.equal(r.resto.egresos, 0)
})

test('resto es el total menos el efectivo, por direccion', () => {
  const r = agregarPorDireccion([
    fila(100, true,  'Efectivo', null),
    fila(25,  true,  'Tarjeta',  null),
    fila(60,  false, 'Efectivo', null),
    fila(15,  false, 'Cheque',   null),
  ])
  assert.equal(r.efectivo.ingresos, 100)
  assert.equal(r.resto.ingresos, 25)
  assert.equal(r.efectivo.egresos, 60)
  assert.equal(r.resto.egresos, 15)
})

test('un pago sin metodo asignado cuenta en resto, no desaparece', () => {
  const r = agregarPorDireccion([fila(80, false, null, null)])
  assert.equal(r.efectivo.egresos, 0)
  assert.equal(r.resto.egresos, 80)
  assert.equal(r.total_egresos, 80)
})

test('agrupa rubros por direccion y los ordena de mayor a menor', () => {
  const r = agregarPorDireccion([
    fila(10, false, null, 'Sueldos'),
    fila(50, false, null, 'CMV Alimentos'),
    fila(20, false, null, 'Sueldos'),
    fila(70, true,  null, 'Ventas'),
  ])
  assert.deepEqual(r.rubros.egresos, [
    { nombre: 'CMV Alimentos', total: 50 },
    { nombre: 'Sueldos', total: 30 },
  ])
  assert.deepEqual(r.rubros.ingresos, [{ nombre: 'Ventas', total: 70 }])
})

test('sin rubro cae en "Sin rubro" en vez de desaparecer', () => {
  const r = agregarPorDireccion([fila(15, false, null, null)])
  assert.deepEqual(r.rubros.egresos, [{ nombre: 'Sin rubro', total: 15 }])
})

test('importe null cuenta como cero y no rompe', () => {
  const r = agregarPorDireccion([fila(null, false, 'Efectivo', 'Sueldos')])
  assert.equal(r.total_egresos, 0)
  assert.equal(r.efectivo.egresos, 0)
})

test('importe como string (Decimal de Prisma viaja en JSON como string)', () => {
  const r = agregarPorDireccion([fila('123.45', false, null, null)])
  assert.equal(r.total_egresos, 123.45)
})

test('ingresa_egreso null se trata como egreso, que es el default de la columna', () => {
  const r = agregarPorDireccion([fila(50, null, null, null)])
  assert.equal(r.total_egresos, 50)
  assert.equal(r.total_ingresos, 0)
})

test('efectivo + resto siempre reconstruye el total de su direccion', () => {
  const r = agregarPorDireccion([
    fila(100, true,  'Efectivo', 'Ventas'),
    fila(33,  true,  null,       'Ventas'),
    fila(77,  false, 'Efectivo', 'Sueldos'),
    fila(11,  false, 'Tarjeta',  'Sueldos'),
  ])
  assert.equal(r.efectivo.ingresos + r.resto.ingresos, r.total_ingresos)
  assert.equal(r.efectivo.egresos  + r.resto.egresos,  r.total_egresos)
})

test('la suma de los rubros de una direccion da el total de esa direccion', () => {
  const filas = [
    fila(10, false, null, 'Sueldos'),
    fila(50, false, null, 'CMV'),
    fila(70, true,  null, 'Ventas'),
    fila(5,  true,  null, null),
  ]
  const r = agregarPorDireccion(filas)
  const sum = (lista) => lista.reduce((s, x) => s + x.total, 0)
  assert.equal(sum(r.rubros.egresos),  r.total_egresos)
  assert.equal(sum(r.rubros.ingresos), r.total_ingresos)
})
