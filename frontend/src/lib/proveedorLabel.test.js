import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nombreProveedor, razonSocialExtra, etiquetaProveedor } from './proveedorLabel.js'

test('el nombre principal cae a la razón social si el nombre está vacío', () => {
  assert.equal(nombreProveedor({ nombre: 'Fura', razon_social: 'Distribuidora DTC SA' }), 'Fura')
  assert.equal(nombreProveedor({ nombre: '', razon_social: 'Distribuidora DTC SA' }), 'Distribuidora DTC SA')
  assert.equal(nombreProveedor({ nombre: '  ', razon_social: 'X' }), 'X')
  assert.equal(nombreProveedor(null), '')
})

test('la razón social solo aparece cuando difiere del nombre', () => {
  assert.equal(razonSocialExtra({ nombre: 'Fura', razon_social: 'Distribuidora DTC SA' }), 'Distribuidora DTC SA')
  // mismo texto (con mayúsculas distintas) no se repite
  assert.equal(razonSocialExtra({ nombre: 'ACME SRL', razon_social: 'acme srl' }), '')
  // sin razón social o sin nombre, no hay "extra"
  assert.equal(razonSocialExtra({ nombre: 'Fura', razon_social: '' }), '')
  assert.equal(razonSocialExtra({ nombre: '', razon_social: 'Solo Razón SA' }), '')
})

test('la etiqueta une los dos con el separador, o muestra uno solo', () => {
  assert.equal(etiquetaProveedor({ nombre: 'Fura', razon_social: 'Distribuidora DTC SA' }), 'Fura · Distribuidora DTC SA')
  assert.equal(etiquetaProveedor({ nombre: 'ACME', razon_social: 'ACME' }), 'ACME')
  assert.equal(etiquetaProveedor({ nombre: '', razon_social: 'Solo Razón SA' }), 'Solo Razón SA')
  assert.equal(etiquetaProveedor(null), '')
})
