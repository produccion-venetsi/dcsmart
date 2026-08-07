import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargarArranquePago, metodoPorDefecto, metodoDeArranque } from './arranquePagoForm.js'

const METODOS = [
  { id: 'm1', nombre: 'Transferencia' },
  { id: 'm2', nombre: 'Efectivo' },
]

test('los metodos llegan aunque falle el contexto del local (403 de admin/cajero)', async () => {
  const r = await cargarArranquePago({
    metodos:  Promise.resolve({ data: METODOS }),
    pago:     null,
    contexto: Promise.reject(Object.assign(new Error('403'), { response: { status: 403 } })),
  })
  assert.deepEqual(r.metodos, METODOS)
  assert.equal(r.contexto, null)
  assert.equal(r.fallas.contexto, true)
})

test('los metodos llegan aunque falle el pago que se esta editando', async () => {
  const r = await cargarArranquePago({
    metodos:  Promise.resolve({ data: METODOS }),
    pago:     Promise.reject(new Error('500')),
    contexto: null,
  })
  assert.deepEqual(r.metodos, METODOS)
  assert.equal(r.pago, null)
  assert.equal(r.fallas.pago, true)
})

test('una llamada que no se pidio no cuenta como falla', async () => {
  const r = await cargarArranquePago({
    metodos:  Promise.resolve({ data: METODOS }),
    pago:     null,
    contexto: null,
  })
  assert.equal(r.fallas.pago, false)
  assert.equal(r.fallas.contexto, false)
})

test('si fallan los metodos si se propaga: sin metodos el formulario no sirve', async () => {
  await assert.rejects(
    cargarArranquePago({
      metodos:  Promise.reject(new Error('500')),
      pago:     null,
      contexto: null,
    }),
    /500/,
  )
})

test('el contexto que resuelve llega entero', async () => {
  const r = await cargarArranquePago({
    metodos:  Promise.resolve({ data: METODOS }),
    pago:     null,
    contexto: Promise.resolve({ data: { id_proveedor: 'p1', descuento_movstock: 25 } }),
  })
  assert.deepEqual(r.contexto, { id_proveedor: 'p1', descuento_movstock: 25 })
  assert.equal(r.fallas.contexto, false)
})

test('metodoPorDefecto encuentra Efectivo y no explota si no esta', () => {
  assert.equal(metodoPorDefecto(METODOS)?.id, 'm2')
  assert.equal(metodoPorDefecto([{ id: 'm1', nombre: 'Transferencia' }]), null)
  assert.equal(metodoPorDefecto([]), null)
  assert.equal(metodoPorDefecto(null), null)
})

// ── metodo de arranque por tipo ──────────────────────────────────────────────

test('MovStock arranca con Intercompany, no con Efectivo', () => {
  // No mueve plata: es mercadería entre empresas del grupo.
  assert.equal(metodoDeArranque('STK'), 'Intercompany')
})

test('Carga Avion y el resto siguen arrancando con Efectivo', () => {
  assert.equal(metodoDeArranque('B'), 'Efectivo')
  assert.equal(metodoDeArranque('A'), 'Efectivo')
  assert.equal(metodoDeArranque(undefined), 'Efectivo')
  assert.equal(metodoDeArranque(null), 'Efectivo')
})

test('metodoPorDefecto resuelve el metodo de MovStock contra la lista real', () => {
  const conInter = [...METODOS, { id: 'm3', nombre: 'Intercompany' }]
  assert.equal(metodoPorDefecto(conInter, metodoDeArranque('STK'))?.id, 'm3')
  assert.equal(metodoPorDefecto(conInter, metodoDeArranque('B'))?.id, 'm2')
  // Si el método no está en la lista devuelve null y el llamador decide: no se
  // inventa un id, que terminaría en un 400 al guardar.
  assert.equal(metodoPorDefecto(METODOS, metodoDeArranque('STK')), null)
})
