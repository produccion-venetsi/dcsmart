// Contrato entre el frontend y el backend del módulo Caja Mayor.
//
// Existe por un bug real: se renombró el estado ESTUDIO a ENVIADA en el enum de
// Prisma y en la validación del backend, pero el frontend siguió mandando
// 'ESTUDIO' en cuatro lugares. El backend respondía 400 "estado debe ser ENVIADA o
// RECIBIDA" y la pantalla no cargaba, lo que se veía como "cambio el local y no me
// deja". Rompía también el botón de estado y el alta de movimientos.
//
// Este test lee los tres archivos y falla si los valores dejan de coincidir, así el
// próximo renombre no puede pasar a medias.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '../../..')
// Se normaliza CRLF a LF al leer. En Windows git puede entregar los archivos con
// CRLF, y entonces cada línea termina en `\r`: como `\r` es line terminator, un `.`
// no lo matchea y cualquier regex anclada con `$` deja de encontrar lo que busca.
// Eso ya hizo fallar este test una vez, con el código perfectamente bien.
const leer = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8').replace(/\r\n/g, '\n')

const schema = leer('backend/prisma/schema.prisma')
const rutas = leer('backend/src/routes/caja_mayor.js')
const front = leer('frontend/src/lib/cajaMayor.js')

// Los valores del enum tal como los declara la base.
function enumDelSchema(nombre) {
  const m = schema.match(new RegExp(`enum ${nombre} \\{([^}]+)\\}`))
  assert.ok(m, `no se encontró el enum ${nombre} en schema.prisma`)
  return m[1]
    .split('\n')
    .map(l => l.replace(/\/\/.*/, '').trim())  // sin ancla $: ver el comentario de leer()
    .filter(l => l && !l.startsWith('@@'))
}

// Una lista tipo `const X = ['A', 'B']` de un archivo js.
function listaDe(src, nombre) {
  const m = src.match(new RegExp(`const ${nombre} = \\[([^\\]]+)\\]`))
  assert.ok(m, `no se encontró la lista ${nombre}`)
  return m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}

test('los estados del frontend son exactamente los del enum de la base', () => {
  const enBase = enumDelSchema('EstadoCM')
  // El frontend los declara como objeto: ENVIADA: 'ENVIADA', ...
  const enFront = [...front.matchAll(/^\s{2}(\w+): '(\w+)',$/gm)]
    .filter(m => enBase.includes(m[2]) || enBase.includes(m[1]))
    .map(m => m[2])
  assert.deepEqual(enFront.sort(), enBase.sort())
})

test('los estados que valida el backend son los del enum de la base', () => {
  assert.deepEqual(listaDe(rutas, 'ESTADOS').sort(), enumDelSchema('EstadoCM').sort())
})

test('las monedas del frontend son las del enum de la base', () => {
  const enBase = enumDelSchema('MonedaCM')
  const enFront = [...front.matchAll(/\{ valor: '(\w+)'/g)].map(m => m[1])
  assert.deepEqual(enFront.sort(), enBase.sort())
})

test('las monedas que valida el backend son las del enum de la base', () => {
  assert.deepEqual(listaDe(rutas, 'MONEDAS').sort(), enumDelSchema('MonedaCM').sort())
})

test('los origenes con etiqueta en el frontend son los del enum de la base', () => {
  const enBase = enumDelSchema('OrigenCM')
  const m = front.match(/ORIGEN_LABEL = \{([^}]+)\}/)
  const enFront = [...m[1].matchAll(/(\w+):/g)].map(x => x[1])
  assert.deepEqual(enFront.sort(), enBase.sort())
})

test('no quedan literales del estado viejo en el modulo', () => {
  // 'ESTUDIO' era el nombre anterior de ENVIADA. Si reaparece en cualquiera de las
  // dos puntas, es el bug volviendo.
  for (const [rel, src] of [
    ['backend/src/routes/caja_mayor.js', rutas],
    ['backend/src/lib/cajaMayor.js', leer('backend/src/lib/cajaMayor.js')],
    ['frontend/src/lib/cajaMayor.js', front],
    ['frontend/src/pages/caja-mayor/CajaMayor.jsx', leer('frontend/src/pages/caja-mayor/CajaMayor.jsx')],
    ['frontend/src/pages/caja-mayor/MovimientoForm.jsx', leer('frontend/src/pages/caja-mayor/MovimientoForm.jsx')],
  ]) {
    // Se permite en comentarios (documentan el renombre), no en código.
    const codigo = src
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    assert.equal(codigo.includes('ESTUDIO'), false, `quedó 'ESTUDIO' en código en ${rel}`)
  }
})

test('los largos de campos del frontend coinciden con los del backend', () => {
  // Si el contador del formulario dice 500 y el backend corta antes, el usuario
  // escribe de más y se come un 400 sin entender por qué.
  const lista = (src) => {
    const m = src.match(/LARGOS = \{([^}]+)\}/)
    assert.ok(m, 'no se encontró LARGOS')
    return Object.fromEntries(
      [...m[1].matchAll(/(\w+):\s*(\d+)/g)].map(x => [x[1], Number(x[2])])
    )
  }
  assert.deepEqual(lista(front), lista(leer('backend/src/lib/cajaMayor.js')))
})
