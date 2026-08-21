import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesMetodos, metodosParaOp } from './metodosSelect.js'

const CATALOGO = [
  { id: 'a', nombre: 'Efectivo' },
  { id: 'b', nombre: 'Transferencia' },
]

test('sin selección devuelve el catálogo tal cual', () => {
  assert.deepEqual(opcionesMetodos(CATALOGO, ''), CATALOGO)
  assert.deepEqual(opcionesMetodos(CATALOGO, null), CATALOGO)
})

test('selección presente en el catálogo no agrega nada', () => {
  assert.deepEqual(opcionesMetodos(CATALOGO, 'b'), CATALOGO)
})

test('selección ausente antepone una option con su nombre', () => {
  const r = opcionesMetodos(CATALOGO, 'x', 'Cheque')
  assert.equal(r.length, 3)
  assert.deepEqual(r[0], { id: 'x', nombre: 'Cheque (inactivo)' })
})

test('selección ausente sin nombre conocido usa un placeholder', () => {
  const r = opcionesMetodos(CATALOGO, 'x')
  assert.equal(r[0].nombre, '(método actual)')
})

test('catálogo vacío o null no rompe', () => {
  assert.deepEqual(opcionesMetodos([], 'x', 'Cheque'), [{ id: 'x', nombre: 'Cheque (inactivo)' }])
  assert.deepEqual(opcionesMetodos(null, ''), [])
})

// ── metodosParaOp: la lista corta del formulario de pagos ──

// Una foto del catálogo real de prod (63 métodos), recortada a lo que importa:
// los que se ofrecen, los que no, y los que están escritos distinto.
const CATALOGO_PROD = [
  { id: 'ef',   nombre: 'Efectivo' },
  { id: 'tr',   nombre: 'Transferencia' },
  { id: 'mp',   nombre: 'Mercado Pago' },
  { id: 'cc',   nombre: 'Cuenta Cte.' },
  { id: 'da',   nombre: 'Débito Automático' },
  { id: 'ech',  nombre: 'E-Cheque' },
  { id: 'tcr',  nombre: 'Tarjeta crédito' },
  { id: 'tdb',  nombre: 'Tarjeta débito' },
  { id: 'rap',  nombre: 'Rappi' },
  { id: 'nc',   nombre: 'Nota de Crédito' },
  { id: 'mora', nombre: 'MORATORIA' },
  { id: 'qr',   nombre: 'MP QR' },
]

test('deja solo los 8 métodos con los que se carga una op', () => {
  const r = metodosParaOp(CATALOGO_PROD)
  assert.deepEqual(r.map((m) => m.id), ['ef', 'tcr', 'tdb', 'tr', 'mp', 'ech', 'cc', 'da'])
})

test('el orden es el de METODOS_OP, no el del catálogo', () => {
  const r = metodosParaOp([...CATALOGO_PROD].reverse())
  assert.deepEqual(r.map((m) => m.nombre), [
    'Efectivo', 'Tarjeta crédito', 'Tarjeta débito', 'Transferencia',
    'Mercado Pago', 'E-Cheque', 'Cuenta Cte.', 'Débito Automático',
  ])
})

test('matchea aunque el nombre esté escrito distinto', () => {
  // La base dice "Mercado Pago" y el equipo dice "MP"; "Cuenta Cte." vs
  // "Cta. Cte."; con y sin acentos. Las ocho variantes tienen que entrar.
  const r = metodosParaOp([
    { id: '1', nombre: 'MP' }, { id: '2', nombre: 'Cta. Cte.' },
    { id: '3', nombre: 'Echeq' }, { id: '4', nombre: 'Debito Automatico' },
    { id: '5', nombre: 'Tarjeta de Credito' }, { id: '6', nombre: 'Tarjeta de Debito' },
  ])
  assert.equal(r.length, 6)
})

test('MP QR y las variantes NO se ofrecen (son otro método del catálogo)', () => {
  const r = metodosParaOp([{ id: 'qr', nombre: 'MP QR' }, { id: 'mpc', nombre: 'MP Credito' }])
  assert.deepEqual(r, [])
})

test('sin catálogo devuelve lista vacía, no rompe', () => {
  assert.deepEqual(metodosParaOp(null), [])
  assert.deepEqual(metodosParaOp([]), [])
  assert.deepEqual(metodosParaOp([{ id: 'x' }]), [])
})

test('un método que sigue activo pero ya no se ofrece no se rotula "(inactivo)"', () => {
  // Es el caso de editar una op vieja cargada con Nota de Crédito: el método
  // existe y está activo, solo dejó de estar en la lista del formulario.
  const corta = metodosParaOp(CATALOGO_PROD)
  const r = opcionesMetodos(corta, 'nc', 'Nota de Crédito', CATALOGO_PROD)
  assert.deepEqual(r[0], { id: 'nc', nombre: 'Nota de Crédito' })
  // Y uno que de verdad no está en el catálogo sí lo dice.
  const r2 = opcionesMetodos(corta, 'zzz', 'Intercompany', CATALOGO_PROD)
  assert.deepEqual(r2[0], { id: 'zzz', nombre: 'Intercompany (inactivo)' })
})
