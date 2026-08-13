import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ESTADOS, ETIQUETA_ESTADO, AYUDA_ESTADO, ESTADOS_ABIERTOS,
  esEstadoValido, normalizarEstado, contarPorEstado, contarAbiertos,
  numerarDesdeOrden, moverEnLista, moverUno, validarOrden,
  siguienteFolio, validarFolio, fechaISO, fechaParaGuardar,
  periodoISO, periodoParaGuardar,
} from './inspecciones.js'

// ── estados ─────────────────────────────────────────────────────────────────

test('los seis estados que pidio el usuario', () => {
  assert.deepEqual(ESTADOS, ['OK', 'VENCIDO', 'EN_ESPERA', 'FALTA', 'REVISAR', 'PROX_VENC'])
})

test('cada estado tiene etiqueta y ayuda', () => {
  for (const e of ESTADOS) {
    assert.ok(ETIQUETA_ESTADO[e], `${e} sin etiqueta`)
    assert.ok(AYUDA_ESTADO[e], `${e} sin ayuda`)
  }
})

test('los abiertos son los que piden accion, y OK no esta', () => {
  assert.ok(!ESTADOS_ABIERTOS.includes('OK'))
  assert.ok(!ESTADOS_ABIERTOS.includes('EN_ESPERA'), 'en espera ya se gestiono: no pide accion')
  assert.ok(ESTADOS_ABIERTOS.every((e) => ESTADOS.includes(e)))
})

test('valida contra la lista', () => {
  assert.equal(esEstadoValido('OK'), true)
  assert.equal(esEstadoValido('LISTO'), false)
})

// ── normalizacion ───────────────────────────────────────────────────────────

test('acepta las formas que escribiria una persona', () => {
  assert.equal(normalizarEstado('ok'), 'OK')
  assert.equal(normalizarEstado('En Espera'), 'EN_ESPERA')
  assert.equal(normalizarEstado('en espera'), 'EN_ESPERA')
  assert.equal(normalizarEstado('PROX VENC'), 'PROX_VENC')
  assert.equal(normalizarEstado('prox-venc'), 'PROX_VENC')
  assert.equal(normalizarEstado('Prox. Venc.'), 'PROX_VENC')
  assert.equal(normalizarEstado('PROXIMO VENCIMIENTO'), 'PROX_VENC')
})

test('lo que no se reconoce da null, no un estado inventado', () => {
  for (const v of [null, '', 'listo', 'x', 'VENCIENDO?', 42]) {
    assert.equal(normalizarEstado(v), null, `${v} no dio null`)
  }
})

// ── contadores ──────────────────────────────────────────────────────────────

test('cuenta por estado, con los seis presentes aunque esten en cero', () => {
  const c = contarPorEstado([{ estado: 'OK' }, { estado: 'OK' }, { estado: 'FALTA' }])
  assert.equal(c.OK, 2)
  assert.equal(c.FALTA, 1)
  assert.equal(c.VENCIDO, 0, 'los que no aparecen tienen que venir en cero, no undefined')
  assert.equal(Object.keys(c).length, 6)
})

test('cuenta los abiertos', () => {
  const folios = [{ estado: 'OK' }, { estado: 'VENCIDO' }, { estado: 'FALTA' }, { estado: 'EN_ESPERA' }]
  assert.equal(contarAbiertos(folios), 2)
})

test('sin folios los contadores no rompen', () => {
  assert.equal(contarAbiertos(null), 0)
  assert.equal(contarPorEstado(undefined).OK, 0)
})

// ── numeracion ──────────────────────────────────────────────────────────────

test('numera de 1 a N segun el orden recibido', () => {
  assert.deepEqual(numerarDesdeOrden(['c', 'a', 'b']), [
    { id: 'c', folio: 1 }, { id: 'a', folio: 2 }, { id: 'b', folio: 3 },
  ])
})

test('renumerar deja la planilla SIN huecos', () => {
  // El motivo de renumerar todo en vez de intercambiar dos numeros: si antes habia
  // 1, 2, 5, 9 (por borrados), despues de cualquier movimiento queda 1, 2, 3, 4.
  const r = numerarDesdeOrden(['a', 'b', 'c', 'd'])
  assert.deepEqual(r.map((x) => x.folio), [1, 2, 3, 4])
})

test('lista vacia da lista vacia', () => {
  assert.deepEqual(numerarDesdeOrden([]), [])
  assert.deepEqual(numerarDesdeOrden(null), [])
})

// ── mover ───────────────────────────────────────────────────────────────────

test('mueve del medio al principio', () => {
  assert.deepEqual(moverEnLista(['a', 'b', 'c', 'd'], 2, 0), ['c', 'a', 'b', 'd'])
})

test('mueve del principio al final', () => {
  assert.deepEqual(moverEnLista(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
})

test('mover al mismo lugar no cambia nada', () => {
  assert.deepEqual(moverEnLista(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c'])
})

test('un destino fuera de rango se pega al extremo, no pierde el folio', () => {
  // Pasa al arrastrar debajo de la ultima fila.
  assert.deepEqual(moverEnLista(['a', 'b', 'c'], 0, 99), ['b', 'c', 'a'])
  assert.deepEqual(moverEnLista(['a', 'b', 'c'], 2, -5), ['c', 'a', 'b'])
})

test('un origen fuera de rango deja la lista igual', () => {
  assert.deepEqual(moverEnLista(['a', 'b'], 7, 0), ['a', 'b'])
})

test('mover NUNCA pierde ni duplica elementos', () => {
  const base = ['a', 'b', 'c', 'd', 'e']
  for (let d = 0; d < base.length; d++) {
    for (let h = -2; h < base.length + 2; h++) {
      const r = moverEnLista(base, d, h)
      assert.equal(r.length, base.length, `${d}->${h} cambio la cantidad`)
      assert.deepEqual([...r].sort(), [...base].sort(), `${d}->${h} perdio o duplico`)
    }
  }
})

test('subir y bajar de a uno', () => {
  assert.deepEqual(moverUno(['a', 'b', 'c'], 'b', 'arriba'), ['b', 'a', 'c'])
  assert.deepEqual(moverUno(['a', 'b', 'c'], 'b', 'abajo'), ['a', 'c', 'b'])
})

test('subir el primero o bajar el ultimo no hace nada', () => {
  assert.deepEqual(moverUno(['a', 'b'], 'a', 'arriba'), ['a', 'b'])
  assert.deepEqual(moverUno(['a', 'b'], 'b', 'abajo'), ['a', 'b'])
})

test('mover un id que no esta deja la lista igual', () => {
  assert.deepEqual(moverUno(['a', 'b'], 'z', 'arriba'), ['a', 'b'])
})

// ── validar el orden que llega del navegador ─────────────────────────────────

test('una permutacion exacta se acepta', () => {
  assert.equal(validarOrden(['c', 'a', 'b'], ['a', 'b', 'c']), null)
})

test('rechaza si falta un folio: la planilla cambio mientras se ordenaba', () => {
  // El caso real: alguien agrego un folio desde otra pantalla. Si se aceptara, el folio
  // nuevo quedaria sin numero.
  const err = validarOrden(['a', 'b'], ['a', 'b', 'c'])
  assert.ok(err)
  assert.match(err, /cambió mientras la ordenabas/)
  assert.match(err, /3 folios y llegaron 2/)
})

test('rechaza repetidos', () => {
  assert.match(validarOrden(['a', 'a', 'b'], ['a', 'b', 'c']), /repetidos/)
})

test('rechaza un folio de otra carpeta', () => {
  assert.match(validarOrden(['a', 'z', 'c'], ['a', 'b', 'c']), /no es de esta carpeta/)
})

test('rechaza lo que no es una lista', () => {
  assert.match(validarOrden(null, ['a']), /lista de folios/)
  assert.match(validarOrden('a,b', ['a']), /lista de folios/)
})

// ── alta ────────────────────────────────────────────────────────────────────

test('el folio nuevo va al final', () => {
  assert.equal(siguienteFolio(7), 8)
  assert.equal(siguienteFolio(null), 1, 'la primera carpeta arranca en 1')
  assert.equal(siguienteFolio(undefined), 1)
})

test('el concepto es obligatorio', () => {
  assert.match(validarFolio({ concepto: '' }), /concepto/)
  assert.match(validarFolio({ concepto: '   ' }), /concepto/)
  assert.equal(validarFolio({ concepto: 'Matafuegos' }), null)
})

test('un estado invalido se rechaza; sin estado se acepta', () => {
  assert.match(validarFolio({ concepto: 'X', estado: 'LISTO' }), /Estado inválido/)
  assert.equal(validarFolio({ concepto: 'X', estado: 'prox venc' }), null)
  assert.equal(validarFolio({ concepto: 'X', estado: null }), null)
  assert.equal(validarFolio({ concepto: 'X', estado: '' }), null)
})

// ── fecha ───────────────────────────────────────────────────────────────────

test('la fecha va y viene como YYYY-MM-DD', () => {
  assert.equal(fechaISO(new Date(Date.UTC(2026, 8, 15))), '2026-09-15')
  assert.equal(fechaISO('2026-09-15T00:00:00.000Z'), '2026-09-15')
  assert.equal(fechaISO(null), null)
})

test('guardar una fecha la deja a medianoche UTC', () => {
  const d = fechaParaGuardar('2026-09-15')
  assert.equal(d.toISOString(), '2026-09-15T00:00:00.000Z')
})

test('vaciar la fecha guarda null', () => {
  for (const v of [null, '', undefined]) assert.equal(fechaParaGuardar(v), null)
})

test('una fecha con formato raro devuelve undefined para que la ruta la rechace', () => {
  // undefined y null significan cosas distintas: null es "borrarla", undefined es "esto
  // no es una fecha". Si se confundieran, un typo borraria el vencimiento en silencio.
  assert.equal(fechaParaGuardar('15/09/2026'), undefined)
  assert.equal(fechaParaGuardar('ayer'), undefined)
  assert.equal(fechaParaGuardar(null), null)
})

// ── contrato con el esquema ─────────────────────────────────────────────────

test('CONTRATO: el enum de la base tiene los mismos seis estados', () => {
  // Si el lib acepta un estado que el enum no tiene, la ruta lo valida bien y la
  // escritura falla en la base.
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
  const i = schema.indexOf('enum EstadoFolio')
  assert.ok(i > -1, 'no existe el enum EstadoFolio en el esquema')
  const bloque = schema.slice(i, schema.indexOf('\n}', i))
  for (const e of ESTADOS) {
    assert.match(bloque, new RegExp(`\\b${e}\\b`), `${e} no está en el enum de la base`)
  }
})

test('CONTRATO: vence es una columna DATE', () => {
  // Si fuera timestamp, la fecha se corre un dia en GMT-3 (ya paso con 2076 cajas).
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
  const i = schema.indexOf('model InspeccionFolio')
  const bloque = schema.slice(i, schema.indexOf('\n}', i))
  assert.match(bloque, /vence\s+DateTime\?\s+@db\.Date/)
})

// ── periodo ─────────────────────────────────────────────────────────────────

test('el periodo va y viene como YYYY-MM', () => {
  assert.equal(periodoISO(new Date(Date.UTC(2026, 8, 1))), '2026-09')
  assert.equal(periodoISO('2026-09-01T00:00:00.000Z'), '2026-09')
  assert.equal(periodoISO(null), null)
})

test('guardar un periodo lo deja en el dia 1 del mes', () => {
  // Igual que Pago.periodo: el mes se representa con su primer dia.
  assert.equal(periodoParaGuardar('2026-09').toISOString(), '2026-09-01T00:00:00.000Z')
})

test('acepta una fecha completa y se queda con el mes', () => {
  // Por si llega desde una carga por API en vez del input month.
  assert.equal(periodoParaGuardar('2026-09-23').toISOString(), '2026-09-01T00:00:00.000Z')
})

test('vaciar el periodo guarda null', () => {
  for (const v of [null, '', undefined]) assert.equal(periodoParaGuardar(v), null)
})

test('un periodo mal formado devuelve undefined para que la ruta lo rechace', () => {
  // Igual que fechaParaGuardar: null es "borralo", undefined es "esto no es un periodo".
  for (const v of ['09/2026', '2026', 'setiembre', '2026-13', '2026-00']) {
    assert.equal(periodoParaGuardar(v), undefined, `${v} no dio undefined`)
  }
})

test('CONTRATO: periodo es una columna DATE', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
  const i = schema.indexOf('model InspeccionFolio')
  const bloque = schema.slice(i, schema.indexOf('\n}', i))
  assert.match(bloque, /periodo\s+DateTime\?\s+@db\.Date/)
  assert.match(bloque, /fecha_emision\s+DateTime\?\s+@db\.Date/)
})
