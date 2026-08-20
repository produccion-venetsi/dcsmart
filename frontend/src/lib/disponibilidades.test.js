import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FAMILIAS_DISPONIBILIDAD, ordenarDisponibilidades, agruparDisponibilidades,
  totalDisponibilidades, CATALOGO_INICIAL, nombreDisponibilidad,
} from './disponibilidades.js'

const t = (nombre, familia = 'otro', orden = 100) => ({ nombre, familia, orden })

test('ordena por familia, despues por orden, y el nombre desempata', () => {
  const r = ordenarDisponibilidades([
    t('Zeta', 'otro', 10), t('BBVA', 'banco', 20), t('MP Hoy', 'mp', 20),
    t('Dolares', 'moneda', 10), t('MP a Liquidar', 'mp', 30),
  ])
  assert.deepEqual(r.map((x) => x.nombre), ['MP Hoy', 'MP a Liquidar', 'BBVA', 'Dolares', 'Zeta'])
})

test('con el mismo orden manda el nombre: la lista no baila entre recargas', () => {
  const r = ordenarDisponibilidades([t('Santander', 'banco', 10), t('Galicia', 'banco', 10)])
  assert.deepEqual(r.map((x) => x.nombre), ['Galicia', 'Santander'])
})

test('una familia desconocida cae al final, no se pierde', () => {
  const r = ordenarDisponibilidades([t('Rara', 'inventada', 1), t('MP Hoy', 'mp', 99)])
  assert.deepEqual(r.map((x) => x.nombre), ['MP Hoy', 'Rara'])
})

test('agrupa solo las familias que tienen algo', () => {
  const g = agruparDisponibilidades([t('MP Hoy', 'mp', 10), t('Dolares', 'moneda', 10)])
  assert.deepEqual(g.map((x) => x.familia), ['mp', 'moneda'])
  assert.equal(g[0].nombre, 'Mercado Pago')
})

test('el catalogo inicial cubre lo que pidio el equipo', () => {
  const nombres = CATALOGO_INICIAL.map((c) => c.nombre)
  for (const n of ['MP Disponible', 'MP Hoy', 'MP a Liquidar', 'Dolares']) {
    assert.ok(nombres.includes(n), `falta ${n}`)
  }
  // Toda entrada del catálogo declara una familia conocida.
  for (const c of CATALOGO_INICIAL) {
    assert.ok(FAMILIAS_DISPONIBILIDAD.some((f) => f.id === c.familia), `${c.nombre}: familia ${c.familia}`)
  }
})

// ── Cómo se lee el nombre de una línea ya cargada ───────────────────────────

test('manda el catalogo nuevo cuando la linea lo tiene', () => {
  assert.equal(nombreDisponibilidad({
    disponibilidad: { nombre: 'MP Hoy' }, detalle_tipo: { nombre: 'Salon' }, nombre: 'viejo',
  }), 'MP Hoy')
})

// Los 63 detalles cargados antes del cambio apuntan al catálogo de cajas: un
// arqueo de 2025 tiene que seguir leyéndose igual que el día que se cargó.
test('un arqueo viejo se sigue leyendo por su catalogo de entonces', () => {
  assert.equal(nombreDisponibilidad({ detalle_tipo: { nombre: 'Mercado Pago' } }), 'Mercado Pago')
  assert.equal(nombreDisponibilidad({ nombre: 'Escrito a mano' }), 'Escrito a mano')
})

test('sin nada no rompe la pantalla', () => {
  assert.equal(nombreDisponibilidad({}), 'Sin concepto')
  assert.equal(nombreDisponibilidad(null), 'Sin concepto')
})

// ── Total ───────────────────────────────────────────────────────────────────

test('suma las cargadas y cuenta las que faltan', () => {
  const r = totalDisponibilidades([{ monto: 1000 }, { monto: '250.50' }, { monto: '' }, { monto: null }])
  assert.equal(r.total, 1250.5)
  assert.equal(r.sinCargar, 2)
  assert.equal(r.cargadas, 2)
})

// Un renglón vacío no es un cero: se avisa que falta en vez de dar por bueno un
// total al que le falta una cuenta entera.
test('lo que no se cargo no cuenta como cero', () => {
  const r = totalDisponibilidades([{ monto: '' }, { monto: '' }])
  assert.equal(r.total, 0)
  assert.equal(r.sinCargar, 2)
  assert.equal(r.cargadas, 0)
})

test('un cero cargado A PROPOSITO si cuenta como cargado', () => {
  const r = totalDisponibilidades([{ monto: 0 }, { monto: '0' }])
  assert.equal(r.sinCargar, 0)
  assert.equal(r.cargadas, 2)
})

test('los montos van en positivo: son plata que hay, no un movimiento', () => {
  assert.equal(totalDisponibilidades([{ monto: -500 }]).total, 500)
})

test('un texto que no es numero se cuenta como sin cargar', () => {
  const r = totalDisponibilidades([{ monto: 'abc' }, { monto: 100 }])
  assert.equal(r.total, 100)
  assert.equal(r.sinCargar, 1)
})

test('sin lineas no explota', () => {
  assert.deepEqual(totalDisponibilidades(), { total: 0, sinCargar: 0, cargadas: 0 })
  assert.deepEqual(totalDisponibilidades([]), { total: 0, sinCargar: 0, cargadas: 0 })
})
