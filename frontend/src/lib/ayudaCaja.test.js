import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AYUDA_CAMPOS, BLOQUES_CAJA, ayudaDe, tipCorto } from './ayudaCaja.js'

test('todos los campos tienen titulo y explicacion', () => {
  for (const [campo, a] of Object.entries(AYUDA_CAMPOS)) {
    assert.ok(a.titulo?.length > 0, `${campo} sin titulo`)
    assert.ok(a.que?.length > 20, `${campo} con explicacion demasiado corta`)
  }
})

// La confusión que más caro sale: el efectivo. Que la ayuda diga
// explícitamente qué NO incluye es el punto del ejercicio.
test('la ayuda del efectivo aclara que no incluye tarjetas ni apps', () => {
  assert.match(AYUDA_CAMPOS.efectivo.ojo, /tarjeta/i)
})

test('la ayuda del total aclara que es la venta y no lo que quedo', () => {
  assert.match(AYUDA_CAMPOS.total.ojo, /no es|no lo que|venta completa/i)
})

test('la ayuda del gasto explica que no reduce la venta', () => {
  assert.match(AYUDA_CAMPOS.gasto.ojo, /no reduce/i)
})

test('la ayuda del fiado explica que cuenta como venta', () => {
  assert.match(AYUDA_CAMPOS.fiado.ojo, /venta/i)
})

test('ningun texto usa jerga contable', () => {
  // "haber" y "debe" quedan afuera a propósito: son verbos comunes ("tiene que
  // haber en el cajón") y como sustantivo contable no aparecen solos.
  const jerga = /saldo|disponibilidad|conciliaci|devengad|imputa|asiento contable/i
  for (const [campo, a] of Object.entries(AYUDA_CAMPOS)) {
    const texto = `${a.que} ${a.ojo ?? ''}`
    assert.equal(jerga.test(texto), false, `${campo} usa jerga: ${texto}`)
  }
})

test('los tres bloques estan y en el orden del turno', () => {
  assert.deepEqual(BLOQUES_CAJA.map((b) => b.id), ['venta', 'cobros', 'efectivo'])
})

test('ayudaDe devuelve null para un campo desconocido', () => {
  assert.equal(ayudaDe('inventado'), null)
  assert.equal(tipCorto('inventado'), '')
})

test('el tip corto une la explicacion con la aclaracion', () => {
  const t = tipCorto('efectivo')
  assert.ok(t.includes(AYUDA_CAMPOS.efectivo.que))
  assert.ok(t.includes(AYUDA_CAMPOS.efectivo.ojo))
})
