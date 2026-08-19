import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motivoDesactualizado, resultadoRecalculado, textoDesactualizado } from './arqueoDesactualizado.js'

test('una sola caja tardia se dice en singular', () => {
  assert.match(motivoDesactualizado({ cajas_tardias: 1 }), /Se cargó 1 caja/)
})

test('varias cajas tardias se cuentan', () => {
  assert.match(motivoDesactualizado({ cajas_tardias: 3 }), /Se cargaron 3 cajas/)
})

test('sin cajas tardias, el motivo es un cambio en el periodo', () => {
  assert.match(motivoDesactualizado({ cajas_tardias: 0 }), /Cambiaron las cajas o los pagos/)
  assert.match(motivoDesactualizado(), /Cambiaron las cajas o los pagos/)
})

test('el resultado se dice como en el resto de la pantalla', () => {
  assert.equal(resultadoRecalculado({ comprobacion: 0 }), 'Cuadra')
  assert.match(resultadoRecalculado({ comprobacion: 1300 }), /^Falta \$1\.300,00$/)
  assert.match(resultadoRecalculado({ comprobacion: -523700 }), /^Sobra \$523\.700,00$/)
  assert.equal(resultadoRecalculado(null), '—')
})

test('el texto completo une motivo y resultado', () => {
  const t = textoDesactualizado({ difiere: true, cajas_tardias: 2, comprobacion: 0 })
  assert.match(t, /Se cargaron 2 cajas/)
  assert.match(t, /Cuadra/)
})

test('si no difiere no hay nada que decir', () => {
  assert.equal(textoDesactualizado({ difiere: false, cajas_tardias: 0, comprobacion: 5 }), '')
  assert.equal(textoDesactualizado(null), '')
})
