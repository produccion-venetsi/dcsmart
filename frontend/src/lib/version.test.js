import test from 'node:test'
import assert from 'node:assert/strict'
import { construirVersion } from './version.js'

// El problema: la versión salía de package.json y nadie se acordaba de subirla,
// así que el cartel de "Hay una versión nueva" siempre decía "Tenés la v1.0.0",
// deploy tras deploy. Un número que nunca cambia no sirve para saber si tenés la
// última. Ahora el patch se calcula solo con la cantidad de commits.

test('el patch sale de la cantidad de commits, no de package.json', () => {
  assert.equal(construirVersion('1.0.0', '312'), '1.0.312')
  assert.equal(construirVersion('1.0.0', '4'), '1.0.4')
})

test('respeta el major y el minor que se declaran a mano', () => {
  // Subir a 2.0 sigue siendo una decisión humana: se edita package.json.
  assert.equal(construirVersion('2.1.0', '500'), '2.1.500')
  assert.equal(construirVersion('1.3.99', '7'), '1.3.7')
})

test('sin cantidad de commits cae a la version de package.json', () => {
  // Build sin git disponible (un tarball, un contenedor sin .git). Mejor la
  // version declarada que un numero inventado.
  assert.equal(construirVersion('1.0.0', null), '1.0.0')
  assert.equal(construirVersion('1.0.0', ''), '1.0.0')
  assert.equal(construirVersion('1.0.0', undefined), '1.0.0')
})

test('un conteo que no es un numero no ensucia la version', () => {
  assert.equal(construirVersion('1.0.0', 'fatal: not a git repository'), '1.0.0')
  assert.equal(construirVersion('1.0.0', '12abc'), '1.0.0')
  assert.equal(construirVersion('1.0.0', '-3'), '1.0.0')
})

test('un conteo de 1 es sospechoso (checkout shallow en CI) y se ignora', () => {
  // actions/checkout hace fetch shallow por defecto: `git rev-list --count HEAD`
  // devuelve 1 y la version se congelaria en 1.0.1 sin que nadie lo note. Los
  // workflows piden fetch-depth: 0, y esto es el segundo cinturon.
  assert.equal(construirVersion('1.0.0', '1'), '1.0.0')
  assert.equal(construirVersion('1.0.0', '0'), '1.0.0')
  assert.equal(construirVersion('1.0.0', '2'), '1.0.2')
})

test('tolera espacios alrededor (la salida de git trae newline)', () => {
  assert.equal(construirVersion('1.0.0', '  312\n'), '1.0.312')
})

test('una version de package.json rara no rompe el build', () => {
  assert.equal(construirVersion('', '312'), '0.0.312')
  assert.equal(construirVersion(null, '312'), '0.0.312')
  assert.equal(construirVersion('1', '312'), '1.0.312')
  assert.equal(construirVersion('1.2', '312'), '1.2.312')
})
