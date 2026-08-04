import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  TIPOS_MOVIMIENTO, TIPOS_MOVIMIENTO_ALTA, ORDEN_MOVIMIENTOS,
  esMovimientoDeIngreso, claseBadgeMovimiento, labelMovimiento,
} from './tiposMovimiento.js'

const raiz = (rel) => fileURLToPath(new URL(rel, import.meta.url))

// ─── Contrato con el backend ────────────────────────────────────────────────
// Estos dos tests son el motivo por el que existe este archivo: el select del
// front ofrecía APERTURA y CIERRE, que no están ni en el enum de Prisma ni en la
// validación de la ruta, y nadie se enteró hasta que un usuario recibió
// "Error al agregar movimiento". Si mañana alguien agrega o saca un tipo del
// backend, esto falla acá antes de llegar a producción.

test('los tipos elegibles son exactamente los que valida la ruta del backend', () => {
  const ruta = readFileSync(raiz('../../../backend/src/routes/caja_movimientos.js'), 'utf8')
  const linea = ruta.match(/const TIPOS_MOVIMIENTO = \[(.*?)\]/s)
  assert.ok(linea, 'no se encontró TIPOS_MOVIMIENTO en backend/src/routes/caja_movimientos.js')
  const delBackend = [...linea[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])

  assert.deepEqual(
    [...TIPOS_MOVIMIENTO_ALTA].sort(), [...delBackend].sort(),
    `el front ofrece [${TIPOS_MOVIMIENTO_ALTA}] y el backend acepta [${delBackend}]`
  )
})

test('todos los tipos que se muestran existen en el enum de Prisma', () => {
  const schema = readFileSync(raiz('../../../backend/prisma/schema.prisma'), 'utf8')
  const bloque = schema.match(/enum TipoMovimiento \{([^}]*)\}/)
  assert.ok(bloque, 'no se encontró el enum TipoMovimiento en schema.prisma')
  const delEnum = bloque[1]
    .split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('@@') && !l.startsWith('//'))

  for (const tipo of TIPOS_MOVIMIENTO) {
    assert.ok(delEnum.includes(tipo), `${tipo} no está en el enum TipoMovimiento`)
  }
  assert.deepEqual([...TIPOS_MOVIMIENTO].sort(), [...delEnum].sort())
})

test('APERTURA y CIERRE no vuelven a aparecer: no existen en ningún lado', () => {
  assert.ok(!TIPOS_MOVIMIENTO.includes('APERTURA'))
  assert.ok(!TIPOS_MOVIMIENTO.includes('CIERRE'))
  assert.ok(!TIPOS_MOVIMIENTO_ALTA.includes('APERTURA'))
  assert.ok(!TIPOS_MOVIMIENTO_ALTA.includes('CIERRE'))
})

test('lo elegible es un subconjunto de lo que se puede mostrar', () => {
  for (const tipo of TIPOS_MOVIMIENTO_ALTA) {
    assert.ok(TIPOS_MOVIMIENTO.includes(tipo), `${tipo} es elegible pero no está en TIPOS_MOVIMIENTO`)
  }
})

test('EGRESO se muestra pero no se puede elegir: el backend lo rechaza', () => {
  assert.ok(TIPOS_MOVIMIENTO.includes('EGRESO'))
  assert.ok(!TIPOS_MOVIMIENTO_ALTA.includes('EGRESO'))
})

test('el orden de los grupos cubre todos los tipos, sin sobrar ni faltar', () => {
  assert.deepEqual([...ORDEN_MOVIMIENTOS].sort(), [...TIPOS_MOVIMIENTO].sort())
})

test('cada tipo tiene su etiqueta legible', () => {
  for (const tipo of TIPOS_MOVIMIENTO) {
    const label = labelMovimiento(tipo)
    assert.notEqual(label, tipo, `${tipo} no tiene etiqueta propia`)
    assert.match(label, /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/)
  }
})

test('labelMovimiento: sin tipo y tipo desconocido no rompen', () => {
  assert.equal(labelMovimiento(null), 'Sin tipo')
  assert.equal(labelMovimiento(''), 'Sin tipo')
  assert.equal(labelMovimiento('RAREZA'), 'RAREZA')
})

// ─── Color del badge ────────────────────────────────────────────────────────

test('lo que suma plata a la caja va en verde', () => {
  for (const tipo of ['INICIAL', 'INGRESO', 'COBRO']) {
    assert.equal(esMovimientoDeIngreso(tipo), true, tipo)
    assert.equal(claseBadgeMovimiento(tipo), 'badge-green', tipo)
  }
})

test('lo que saca o mueve plata va en rojo', () => {
  for (const tipo of ['GASTO', 'EGRESO', 'RETIRO', 'VACIADO']) {
    assert.equal(esMovimientoDeIngreso(tipo), false, tipo)
    assert.equal(claseBadgeMovimiento(tipo), 'badge-red', tipo)
  }
})

test('INICIAL ahora es verde: era el saldo de apertura pintado como salida', () => {
  // El código viejo ponía verde sólo INGRESO y APERTURA (que no existe), así que
  // el saldo inicial real salía rojo, como si fuera plata que se iba.
  assert.equal(claseBadgeMovimiento('INICIAL'), 'badge-green')
})

test('un tipo desconocido no se pinta de verde por accidente', () => {
  assert.equal(claseBadgeMovimiento('RAREZA'), 'badge-red')
  assert.equal(claseBadgeMovimiento(null), 'badge-red')
})
