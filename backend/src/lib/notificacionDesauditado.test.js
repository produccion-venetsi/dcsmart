import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destinatarioDeAviso } from './notificacionDesauditado.js'

// El historial que recibe la funcion es SIEMPRE post-commit: incluye el
// `desauditado` que se acaba de crear. Los casos de abajo lo reflejan.
const ev = (accion, id_user, fecha) => ({ accion, id_user, fecha: new Date(fecha) })

test('sin historial no hay a quien avisar', () => {
  assert.equal(destinatarioDeAviso({ historial: [], quienDesaudita: 'u1' }), null)
})

test('el argumento entero puede venir vacio sin romper', () => {
  assert.equal(destinatarioDeAviso({}), null)
})

test('historial null no rompe', () => {
  assert.equal(destinatarioDeAviso({ historial: null, quienDesaudita: 'u1' }), null)
})

test('caso real: A audita, B desaudita -> el aviso va a A', () => {
  const historial = [
    ev('auditado',    'A', '2026-08-01T10:00:00Z'),
    ev('desauditado', 'B', '2026-08-02T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'B' }), 'A')
})

test('no se avisa a uno mismo: A audita y A desaudita', () => {
  const historial = [
    ev('auditado',    'A', '2026-08-01T10:00:00Z'),
    ev('desauditado', 'A', '2026-08-02T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'A' }), null)
})

test('toma el ultimo auditado, no el primero', () => {
  const historial = [
    ev('auditado',    'viejo',   '2026-07-01T10:00:00Z'),
    ev('desauditado', 'alguien', '2026-07-15T10:00:00Z'),
    ev('auditado',    'nuevo',   '2026-08-01T10:00:00Z'),
    ev('desauditado', 'B',       '2026-08-02T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'B' }), 'nuevo')
})

test('el orden del array no importa: decide la fecha', () => {
  const historial = [
    ev('desauditado', 'B',     '2026-08-02T10:00:00Z'),
    ev('auditado',    'viejo', '2026-07-01T10:00:00Z'),
    ev('auditado',    'nuevo', '2026-08-01T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'B' }), 'nuevo')
})

test('un historial que nunca tuvo un auditado no genera aviso', () => {
  const historial = [ev('desauditado', 'B', '2026-08-02T10:00:00Z')]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'B' }), null)
})

test('un auditado sin id_user no genera aviso', () => {
  const historial = [
    ev('auditado',    null, '2026-08-01T10:00:00Z'),
    ev('desauditado', 'B',  '2026-08-02T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'B' }), null)
})

test('eventos con fecha null se ignoran en vez de romper el orden', () => {
  const historial = [
    ev('auditado', 'bueno', '2026-08-01T10:00:00Z'),
    { accion: 'auditado', id_user: 'sinfecha', fecha: null },
    ev('desauditado', 'B', '2026-08-02T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'B' }), 'bueno')
})

test('acciones que no son auditado se ignoran', () => {
  const historial = [
    ev('auditado', 'auditor', '2026-07-01T10:00:00Z'),
    ev('otra_cosa', 'ruido',  '2026-08-01T10:00:00Z'),
    ev('desauditado', 'B',    '2026-08-02T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'B' }), 'auditor')
})

test('cascada de audit-dc: el auditor del circuito normal recibe el aviso', () => {
  // audit_dc no entra en el historial que se le pasa (avisos.js filtra
  // audit_dc: false), asi que la cascada se ve como un desauditado normal.
  const historial = [
    ev('auditado',    'auditor_local', '2026-08-01T10:00:00Z'),
    ev('desauditado', 'dcsmart',       '2026-08-02T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'dcsmart' }), 'auditor_local')
})
