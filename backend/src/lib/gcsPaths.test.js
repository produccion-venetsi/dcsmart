import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeFolderName, parseGsPath, contentTypePorExt } from './gcsPaths.js'

// Ojo: no pasa a minusculas ni usa guiones medios. El comportamiento se
// congela tal cual porque los adjuntos ya subidos estan en estas carpetas.
test('sanitizeFolderName saca acentos y pasa los espacios a guion bajo', () => {
  assert.equal(sanitizeFolderName('Gran Danzón'), 'Gran_Danzon')
  assert.equal(sanitizeFolderName('GRIS GRIS'),   'GRIS_GRIS')
  assert.equal(sanitizeFolderName('878'),         '878')
})

test('sanitizeFolderName neutraliza path traversal', () => {
  const r = sanitizeFolderName('../../etc')
  assert.ok(!r.includes('..'), `no deberia tener .. : ${r}`)
  assert.ok(!r.includes('/'),  `no deberia tener / : ${r}`)
})

test('sanitizeFolderName cae en general si queda vacio', () => {
  assert.equal(sanitizeFolderName(''),    'general')
  assert.equal(sanitizeFolderName(null),  'general')
  assert.equal(sanitizeFolderName('///'), 'general')
})

test('parseGsPath separa bucket y path', () => {
  assert.deepEqual(
    parseGsPath('gs://mi-bucket/locales/878/logo.png'),
    { bucket: 'mi-bucket', filePath: 'locales/878/logo.png' }
  )
})

test('parseGsPath devuelve null si no es gs://', () => {
  for (const v of ['https://a.com/x.png', '', null, undefined, 'gs://solo-bucket', 'gs://bucket/']) {
    assert.equal(parseGsPath(v), null, `deberia ser null: ${v}`)
  }
})

test('contentTypePorExt mapea las imagenes y el pdf', () => {
  assert.equal(contentTypePorExt('png'),  'image/png')
  assert.equal(contentTypePorExt('webp'), 'image/webp')
  assert.equal(contentTypePorExt('jpg'),  'image/jpeg')
  assert.equal(contentTypePorExt('JPEG'), 'image/jpeg')
  assert.equal(contentTypePorExt('pdf'),  'application/pdf')
  assert.equal(contentTypePorExt('raro'), 'application/octet-stream')
  assert.equal(contentTypePorExt(null),   'application/octet-stream')
})
