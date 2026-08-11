import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ORIGENES_MANUALES, ORIGEN_LABEL, naceEnCajaMayor, tieneCicloDeRecepcion,
} from './cajaMayor.js'

const raiz = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const leer = (rel) => readFileSync(raiz(rel), 'utf8').replace(/\r\n/g, '\n')

// ── quién nace en la caja mayor ─────────────────────────────────────────────

test('lo cargado a mano nace en la caja mayor', () => {
  assert.equal(naceEnCajaMayor('PROPIO'), true)
  assert.equal(naceEnCajaMayor('APERTURA'), true)
})

test('lo que viene de una op de gestion NO nace ahi', () => {
  // El local mandó la plata: la caja mayor todavía tiene que confirmar que llegó.
  assert.equal(naceEnCajaMayor('PAGO'), false)
})

test('solo los de gestion tienen ciclo enviada -> recibida', () => {
  // Es lo que decide si se muestra el botón "Recibir": ofrecerlo en un movimiento
  // que se acaba de cargar a mano no significa nada, la plata ya está.
  assert.equal(tieneCicloDeRecepcion('PAGO'), true)
  assert.equal(tieneCicloDeRecepcion('PROPIO'), false)
  assert.equal(tieneCicloDeRecepcion('APERTURA'), false)
})

test('un origen desconocido se trata como de gestion', () => {
  // Ante la duda se muestra la acción: esconderla dejaría un movimiento sin forma de
  // confirmarlo desde la pantalla.
  assert.equal(tieneCicloDeRecepcion('LO_QUE_SEA'), true)
  assert.equal(tieneCicloDeRecepcion(undefined), true)
  assert.equal(tieneCicloDeRecepcion(null), true)
})

test('todos los origenes tienen etiqueta', () => {
  for (const o of ['PAGO', ...ORIGENES_MANUALES]) {
    assert.ok(ORIGEN_LABEL[o], `${o} sin etiqueta`)
  }
})

// ── Contrato con el backend ─────────────────────────────────────────────────

test('los origenes manuales son los mismos que acepta el POST', () => {
  // Si el backend agregara uno y acá no, ese movimiento mostraría "Recibir" aunque
  // se acabe de cargar a mano.
  const src = leer('../../../backend/src/routes/caja_mayor.js')
  const m = src.match(/const ORIGENES_MANUALES = \[(.*?)\]/)
  assert.ok(m, 'no se encontró ORIGENES_MANUALES en el backend')
  const delBackend = [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1])
  assert.deepEqual([...ORIGENES_MANUALES].sort(), delBackend.sort())
})

test('los origenes existen en el enum de Prisma', () => {
  const schema = leer('../../../backend/prisma/schema.prisma')
  const bloque = schema.match(/enum OrigenCM \{([^}]*)\}/)
  assert.ok(bloque, 'no se encontró el enum OrigenCM')
  const delEnum = bloque[1]
    .split('\n').map((l) => l.trim().split(/\s+/)[0])
    .filter((l) => l && !l.startsWith('@@') && !l.startsWith('//'))

  for (const o of ORIGENES_MANUALES) {
    assert.ok(delEnum.includes(o), `${o} no está en el enum OrigenCM`)
  }
  // Y que PAGO siga siendo el de gestión: si se renombrara, `tieneCicloDeRecepcion`
  // devolvería true para todo y el botón volvería a aparecer donde no va.
  assert.ok(delEnum.includes('PAGO'), 'el enum ya no tiene PAGO')
})

test('el formulario carga los manuales como RECIBIDA', () => {
  // Si volviera a nacer ENVIADA, cada movimiento cargado a mano quedaría esperando
  // una confirmación que nadie tiene por qué dar.
  const src = leer('../pages/caja-mayor/MovimientoForm.jsx')
  assert.match(src, /estado:\s*movimiento\?\.estado \?\? ESTADOS\.RECIBIDA/)
})
