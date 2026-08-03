import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

// sessionStorage y FileReader son del navegador. Se sustituyen por lo mínimo
// que usa el módulo, que es más honesto que meter jsdom entero para tres
// métodos. El FileReader falso tarda a propósito: la carrera que se testea
// abajo solo existe porque leer un archivo grande no es instantáneo.
const almacen = new Map()
globalThis.sessionStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
}
globalThis.FileReader = class {
  readAsDataURL(file) {
    setTimeout(async () => {
      const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
      this.result = `data:${file.type};base64,${b64}`
      this.onload()
    }, 10)
  }
}

const { saveDraft, loadDraft, clearDraft } = await import('./formDraft.js')

beforeEach(() => almacen.clear())

test('saveDraft y loadDraft: lo guardado vuelve igual', async () => {
  await saveDraft('k', { form: { importe: '100' } })
  assert.deepEqual(loadDraft('k').data, { form: { importe: '100' } })
})

test('loadDraft: sin borrador devuelve null', () => {
  assert.equal(loadDraft('no-existe'), null)
})

test('clearDraft: despues de borrar no hay nada que recuperar', async () => {
  await saveDraft('k', { form: { importe: '100' } })
  clearDraft('k')
  assert.equal(loadDraft('k'), null)
})

test('saveDraft: los archivos se reconstruyen como File', async () => {
  const foto = new File(['xx'], 'factura.jpg', { type: 'image/jpeg' })
  await saveDraft('k', { form: {} }, { foto })

  const { files } = loadDraft('k')
  assert.equal(files.foto.name, 'factura.jpg')
  assert.equal(files.foto.type, 'image/jpeg')
  assert.equal(await files.foto.text(), 'xx')
})

test('un save que arranco antes del clearDraft no revive el borrador', async () => {
  // El caso real: se cancela el formulario mientras se estaba serializando la
  // foto. Si esa escritura tardia llegaba igual, al volver a entrar aparecia
  // "Se recupero la carga que tenias sin guardar" con la factura descartada.
  const foto = new File(['xx'], 'factura.jpg', { type: 'image/jpeg' })
  const enVuelo = saveDraft('k', { form: { importe: '100' } }, { foto })

  clearDraft('k')       // la persona cancela antes de que termine de guardar
  await enVuelo

  assert.equal(loadDraft('k'), null)
})

test('despues de un descarte se puede volver a guardar normalmente', async () => {
  clearDraft('k')
  await saveDraft('k', { form: { importe: '250' } })
  assert.deepEqual(loadDraft('k').data, { form: { importe: '250' } })
})
