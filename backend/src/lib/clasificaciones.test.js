import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLASIFICACIONES, normalizarClasificacion } from './clasificaciones.js'

test('las tres vigentes se devuelven tal cual', () => {
  for (const c of CLASIFICACIONES) {
    assert.equal(normalizarClasificacion(c), c)
  }
})

test('los valores historicos se traducen al vigente', () => {
  assert.equal(normalizarClasificacion('ingreso'), 'cobro')
  assert.equal(normalizarClasificacion('medio_pago'), 'cobro')
  assert.equal(normalizarClasificacion('egreso'), 'gasto')
  assert.equal(normalizarClasificacion('canal'), 'informativo')
  assert.equal(normalizarClasificacion('otro'), 'informativo')
  assert.equal(normalizarClasificacion('calculo'), 'informativo')
})

test('tolera mayusculas: TapTap manda algunos valores asi', () => {
  assert.equal(normalizarClasificacion('CANAL'), 'informativo')
  assert.equal(normalizarClasificacion('Cobro'), 'cobro')
})

test('un valor invalido devuelve null para que la ruta lo rechace', () => {
  assert.equal(normalizarClasificacion('cualquier_cosa'), null)
  assert.equal(normalizarClasificacion('cobros'), null)
})

test('la ausencia de valor devuelve null, no un default', () => {
  // La ruta necesita distinguir "no mando clasificacion" (usa la del tipo) de
  // "mando una invalida" (400). Los dos casos llegan aca como null, asi que la
  // ruta chequea undefined antes de llamar.
  assert.equal(normalizarClasificacion(undefined), null)
  assert.equal(normalizarClasificacion(null), null)
  assert.equal(normalizarClasificacion(''), null)
})
