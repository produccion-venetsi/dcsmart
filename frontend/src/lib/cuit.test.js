import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CUIT_GENERICO, esCuitValido, digitoVerificador, formatearCuit, revisarCuit,
  soloDigitos, textoOfrecerGenerico,
} from './cuit.js'

// ── el genérico ─────────────────────────────────────────────────────────────

test('el CUIT genérico es válido de verdad', () => {
  // Si no pasara el módulo 11, cada pago cargado con el genérico quedaría con un
  // CUIT inválido en la base y el problema saldría después, en la factura.
  assert.equal(esCuitValido(CUIT_GENERICO), true)
  assert.equal(CUIT_GENERICO, '30999999995')
})

// ── dígito verificador ──────────────────────────────────────────────────────

test('calcula el dígito verificador del genérico', () => {
  assert.equal(digitoVerificador('3099999999'), 5)
})

test('sin 10 dígitos no hay dígito que calcular', () => {
  assert.equal(digitoVerificador('123'), null)
  assert.equal(digitoVerificador(''), null)
  assert.equal(digitoVerificador('12345678901'), null)
})

test('el dígito siempre queda entre 0 y 9', () => {
  // El caso de resto 1 daría 10, que no es un dígito.
  for (let i = 0; i < 400; i++) {
    const base = String(20000000000 + i * 7919).slice(0, 10)
    const dv = digitoVerificador(base)
    assert.ok(dv >= 0 && dv <= 9, `${base} dio ${dv}`)
  }
})

// ── válidos ─────────────────────────────────────────────────────────────────

test('acepta CUITs válidos con cada prefijo', () => {
  // Se arman con el dígito verificador calculado, así que son consistentes por
  // construcción y el test no depende de CUITs reales de nadie.
  for (const pref of ['20', '23', '24', '27', '30', '33', '34']) {
    const diez = pref + '12345678'
    const cuit = diez + digitoVerificador(diez)
    assert.equal(esCuitValido(cuit), true, `${cuit} (prefijo ${pref}) debería ser válido`)
  }
})

test('acepta con guiones, puntos y espacios', () => {
  assert.equal(esCuitValido('30-99999999-5'), true)
  assert.equal(esCuitValido('30.99999999.5'), true)
  assert.equal(esCuitValido(' 30 99999999 5 '), true)
})

// ── inválidos ───────────────────────────────────────────────────────────────

test('rechaza el dígito verificador equivocado', () => {
  // Mismo número que el genérico con el último cambiado: es el error de tipeo que
  // esta validación existe para atrapar.
  assert.equal(esCuitValido('30999999994'), false)
  assert.equal(esCuitValido('30999999990'), false)
})

test('rechaza un prefijo que no existe', () => {
  // Puede pasar el módulo 11 y no ser el CUIT de nadie.
  const diez = '9912345678'
  const cuit = diez + digitoVerificador(diez)
  assert.equal(esCuitValido(cuit), false, `${cuit} tiene prefijo 99`)
})

test('rechaza todos los dígitos iguales', () => {
  assert.equal(esCuitValido('11111111111'), false)
  assert.equal(esCuitValido('00000000000'), false)
})

test('rechaza largos que no son 11', () => {
  assert.equal(esCuitValido('3099999999'), false)
  assert.equal(esCuitValido('309999999955'), false)
  assert.equal(esCuitValido(''), false)
})

test('rechaza lo que no es un número', () => {
  for (const v of [null, undefined, 'no tengo', 'AB-CDEFGHIJ-K', {}]) {
    assert.equal(esCuitValido(v), false, `falló con ${JSON.stringify(v)}`)
  }
})

// ── el aviso ────────────────────────────────────────────────────────────────

test('un CUIT válido no dice nada', () => {
  assert.equal(revisarCuit(CUIT_GENERICO), null)
  assert.equal(revisarCuit('30-99999999-5'), null)
})

test('vacío tampoco dice nada: es un dato que falta, no un error', () => {
  // El campo es opcional en los tres formularios donde se usa.
  assert.equal(revisarCuit(''), null)
  assert.equal(revisarCuit(null), null)
  assert.equal(revisarCuit('   '), null)
})

test('mientras se tipea avisa que falta, sin decir que está mal', () => {
  // Decir "no es válido" en el tercer dígito es ruido y entrena a ignorar el aviso.
  const r = revisarCuit('309')
  assert.equal(r.estado, 'incompleto')
  assert.equal(r.ofreceGenerico, false)
  assert.match(r.mensaje, /Faltan 8 dígitos/)
})

test('con los 11 dígitos y el verificador mal, ofrece el genérico', () => {
  const r = revisarCuit('30999999994')
  assert.equal(r.estado, 'invalido')
  assert.equal(r.mensaje, 'No es un CUIT válido')
  assert.equal(r.ofreceGenerico, true)
})

test('de más también ofrece el genérico, y dice cuántos escribió', () => {
  const r = revisarCuit('309999999955')
  assert.equal(r.estado, 'largo')
  assert.equal(r.ofreceGenerico, true)
  assert.match(r.mensaje, /12/)
})

test('el texto es el que pidió el negocio, con el genérico adentro', () => {
  const t = textoOfrecerGenerico()
  assert.match(t, /No es un CUIT válido/)
  assert.match(t, /30999999995/)
})

// ── formato ─────────────────────────────────────────────────────────────────

test('se muestra con guiones', () => {
  assert.equal(formatearCuit('30999999995'), '30-99999999-5')
  assert.equal(formatearCuit('30-99999999-5'), '30-99999999-5')
})

test('lo que no tiene 11 dígitos se muestra tal cual', () => {
  // Formatear a medias mostraría "30-999-" mientras se tipea.
  assert.equal(formatearCuit('309'), '309')
  assert.equal(formatearCuit(''), '')
})

test('soloDigitos limpia todo lo demás', () => {
  assert.equal(soloDigitos('30-99999999-5'), '30999999995')
  assert.equal(soloDigitos('abc'), '')
  assert.equal(soloDigitos(null), '')
})
