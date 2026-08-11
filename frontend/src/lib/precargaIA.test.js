import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  rellenar, patchDesdeLectura, puedeChequearDuplicado, faltaParaDuplicado,
  LARGO_PV, LARGO_NRO,
} from './precargaIA.js'

const raiz = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const leer = (rel) => readFileSync(raiz(rel), 'utf8').replace(/\r\n/g, '\n')

// ── relleno con ceros ───────────────────────────────────────────────────────

test('rellena hasta el largo del formato', () => {
  assert.equal(rellenar('3', LARGO_PV), '00003')
  assert.equal(rellenar('12', LARGO_NRO), '00000012')
})

test('un número ya completo no cambia', () => {
  assert.equal(rellenar('00003', LARGO_PV), '00003')
  assert.equal(rellenar('12345678', LARGO_NRO), '12345678')
})

test('un número más largo que el formato se deja como vino', () => {
  // Recortar sería inventar otro comprobante. Que se vea raro y lo corrija la
  // persona es mejor que guardar un número distinto del de la factura.
  assert.equal(rellenar('123456', LARGO_PV), '123456')
})

test('saca todo lo que no sea dígito antes de contar', () => {
  // La IA a veces devuelve "0001-A" o con espacios.
  assert.equal(rellenar('1-A', LARGO_PV), '00001')
  assert.equal(rellenar(' 42 ', LARGO_NRO), '00000042')
})

test('acepta números, no solo strings', () => {
  assert.equal(rellenar(3, LARGO_PV), '00003')
  assert.equal(rellenar(0, LARGO_PV), '') // 0 no es un punto de venta
  assert.equal(rellenar('000', LARGO_PV), '') // ni '000': se trata como no leido
})

test('vacío y basura dan vacío, no "00000"', () => {
  // Un "00000" precargado se ve como un dato leído cuando no se leyó nada.
  for (const v of ['', null, undefined, 'ABC', '   ']) {
    assert.equal(rellenar(v, LARGO_PV), '', `falló con ${JSON.stringify(v)}`)
  }
})

// ── el patch ────────────────────────────────────────────────────────────────

test('precarga pv y nro CON los ceros puestos', () => {
  const p = patchDesdeLectura({ pv: '3', nro: '145' })
  assert.equal(p.pv, '00003')
  assert.equal(p.nro, '00000145')
})

test('el período queda igual a la fecha de la factura', () => {
  const p = patchDesdeLectura({ fecha: '2026-07-15' })
  assert.equal(p.periodo, '2026-07-15')
  assert.equal(p.fecha, '2026-07-15')
})

test('sin fecha no se inventa un período', () => {
  const p = patchDesdeLectura({ pv: '1', nro: '2' })
  assert.equal('periodo' in p, false)
  assert.equal('fecha' in p, false)
})

test('lo que la lectura no trajo NO se toca', () => {
  // Un null de la lectura no puede borrar algo que la persona ya escribió: por eso
  // la clave no tiene que estar en el patch.
  const p = patchDesdeLectura({ fecha: '2026-07-15', pv: null, nro: null, importe_neto: null })
  assert.deepEqual(Object.keys(p).sort(), ['fecha', 'periodo'])
})

test('el importe total no se precarga: se calcula solo', () => {
  const p = patchDesdeLectura({ importe: 12345, importe_neto: 10000 })
  assert.equal('importe' in p, false)
  assert.equal(p.importe_neto, '10000')
})

test('los importes viajan como string, que es lo que espera el input', () => {
  const p = patchDesdeLectura({ importe_neto: 1000.5, descuento: 50 })
  assert.equal(p.importe_neto, '1000.5')
  assert.equal(p.descuento, '50')
})

test('una lectura vacía da un patch vacío, no un formulario en blanco', () => {
  assert.deepEqual(patchDesdeLectura({}), {})
  assert.deepEqual(patchDesdeLectura(null), {})
})

// ── duplicado ───────────────────────────────────────────────────────────────

test('el duplicado se puede chequear solo con los tres datos', () => {
  assert.equal(puedeChequearDuplicado({ id_proveedor: 'p1', pv: '00001', nro: '00000002' }), true)
  assert.equal(puedeChequearDuplicado({ id_proveedor: 'p1', pv: '00001' }), false)
  assert.equal(puedeChequearDuplicado({ pv: '00001', nro: '00000002' }), false)
  assert.equal(puedeChequearDuplicado({}), false)
})

test('dice qué falta, para no callarse cuando no se pudo mirar', () => {
  assert.deepEqual(faltaParaDuplicado({ pv: '1', nro: '2' }), ['el proveedor'])
  assert.deepEqual(faltaParaDuplicado({ id_proveedor: 'p1' }), ['el punto de venta', 'el número'])
  assert.deepEqual(faltaParaDuplicado({ id_proveedor: 'p1', pv: '1', nro: '2' }), [])
})

// ── Contrato con los largos del formulario ──────────────────────────────────

test('los largos son los mismos que aplica el formulario a mano', () => {
  // Si el formulario cambiara a otro largo, la precarga con IA quedaría con un
  // formato distinto del que se escribe a mano y nadie lo notaría.
  const src = leer('../pages/pagos/PagoForm.jsx')
  assert.match(src, new RegExp(`padLeft\\(e\\.target\\.value, ${LARGO_PV}\\)`), `el pv a mano ya no usa ${LARGO_PV}`)
  assert.match(src, new RegExp(`padLeft\\(e\\.target\\.value, ${LARGO_NRO}\\)`), `el nro a mano ya no usa ${LARGO_NRO}`)
})

test('el chequeo de duplicado del backend pide los mismos tres datos', () => {
  const src = leer('../../../backend/src/routes/pagos.js')
  const bloque = src.slice(src.indexOf("fastify.get('/check-duplicado'"))
  assert.match(bloque, /!id_local \|\| !id_proveedor \|\| !pv \|\| !nro/)
})
