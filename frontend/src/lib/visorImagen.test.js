import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PASO, rotar, normalizar, rotarDerecha, rotarIzquierda, estaDeCostado,
  transformCss, resetearVista, etiquetaVista, VISTA_INICIAL,
} from './visorImagen.js'

// ── rotar ───────────────────────────────────────────────────────────────────

test('gira de a un cuarto de vuelta', () => {
  assert.equal(rotarDerecha(0), 90)
  assert.equal(rotarDerecha(90), 180)
  assert.equal(rotarDerecha(180), 270)
})

test('cuatro giros vuelven al principio, no a 360', () => {
  let g = 0
  for (let i = 0; i < 4; i++) g = rotarDerecha(g)
  assert.equal(g, 0)
})

test('hacia la izquierda desde 0 da 270, no -90', () => {
  // El módulo de JS con negativos da negativo: -90 % 360 === -90. Un rotate(-90deg)
  // se ve igual pero después no se puede comparar con 270 y rompe `estaDeCostado`.
  assert.equal(rotarIzquierda(0), 270)
  assert.equal(rotarIzquierda(90), 0)
})

test('cuatro giros a la izquierda tambien cierran', () => {
  let g = 0
  for (let i = 0; i < 4; i++) g = rotarIzquierda(g)
  assert.equal(g, 0)
})

test('normalizar lleva cualquier angulo al rango', () => {
  assert.equal(normalizar(450), 90)
  assert.equal(normalizar(-450), 270)
  assert.equal(normalizar(720), 0)
  assert.equal(normalizar(-90), 270)
})

test('normalizar y rotar son cosas distintas', () => {
  // rotar(450) con un delta por defecto de 90 devolvia 180: se leia como
  // "normalizame esto" y sumaba otro cuarto de vuelta.
  assert.equal(normalizar(450), 90)
  assert.equal(rotar(450, 90), 180)
  assert.equal(rotar(450, 0), 90)
})

test('valores basura se tratan como 0', () => {
  assert.equal(normalizar(null), 0)
  assert.equal(normalizar(undefined), 0)
  assert.equal(normalizar('hola'), 0)
  assert.equal(rotar(0, null), 0)
})

test('el paso es de 90 grados', () => {
  assert.equal(PASO, 90)
})

// ── de costado ──────────────────────────────────────────────────────────────

test('sabe cuando la imagen quedo de costado', () => {
  assert.equal(estaDeCostado(0), false)
  assert.equal(estaDeCostado(90), true)
  assert.equal(estaDeCostado(180), false)
  assert.equal(estaDeCostado(270), true)
})

test('de costado tambien vale con angulos sin normalizar', () => {
  assert.equal(estaDeCostado(-90), true)
  assert.equal(estaDeCostado(450), true)
})

// ── transform ───────────────────────────────────────────────────────────────

test('el translate va ANTES del scale y del rotate', () => {
  // El orden es lo que hace que arrastrar una imagen rotada se sienta natural: con
  // `translate scale rotate`, el translate queda en coordenadas de pantalla. Si el
  // rotate fuera primero, tirar a la derecha movería la foto para abajo.
  const t = transformCss({ x: 10, y: 20, scale: 2, rot: 90 })
  assert.equal(t, 'translate(10px, 20px) scale(2) rotate(90deg)')
  assert.ok(t.indexOf('translate') < t.indexOf('scale'))
  assert.ok(t.indexOf('scale') < t.indexOf('rotate'))
})

test('sin rotacion no se escribe rotate(0deg)', () => {
  assert.equal(transformCss({ x: 0, y: 0, scale: 1 }), 'translate(0px, 0px) scale(1)')
})

test('el transform normaliza el angulo', () => {
  assert.match(transformCss({ rot: -90 }), /rotate\(270deg\)/)
})

test('sin argumentos da un transform neutro y valido', () => {
  assert.equal(transformCss(), 'translate(0px, 0px) scale(1)')
})

// ── reset ───────────────────────────────────────────────────────────────────

test('el reset endereza el zoom pero NO la rotacion', () => {
  // Si el reset tambien enderezara la imagen, quien giro una factura para poder
  // leerla y despues hace doble click la ve volver a quedar de costado. La rotacion
  // corrige el archivo, no es parte de la navegacion.
  const r = resetearVista({ scale: 3, x: 100, y: -50, rot: 90 })
  assert.deepEqual(r, { scale: 1, x: 0, y: 0, rot: 90 })
})

test('el reset normaliza la rotacion que traia', () => {
  assert.equal(resetearVista({ rot: -90 }).rot, 270)
})

test('el reset sin vista devuelve el estado inicial', () => {
  assert.deepEqual(resetearVista(), VISTA_INICIAL)
  assert.deepEqual(resetearVista(null), VISTA_INICIAL)
})

test('la vista inicial no tiene zoom ni giro', () => {
  assert.deepEqual(VISTA_INICIAL, { scale: 1, x: 0, y: 0, rot: 0 })
})

// ── etiqueta ────────────────────────────────────────────────────────────────

test('muestra el zoom en porcentaje', () => {
  assert.equal(etiquetaVista({ scale: 1 }), '100%')
  assert.equal(etiquetaVista({ scale: 2.5 }), '250%')
  assert.equal(etiquetaVista({ scale: 0.25 }), '25%')
})

test('agrega los grados solo cuando esta rotada', () => {
  assert.equal(etiquetaVista({ scale: 1, rot: 0 }), '100%')
  assert.equal(etiquetaVista({ scale: 1.5, rot: 90 }), '150% · 90°')
})

test('la etiqueta sin argumentos no dice NaN', () => {
  assert.equal(etiquetaVista(), '100%')
})
