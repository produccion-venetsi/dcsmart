import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  motivoNoEnviable, esEnviable, motivoDestinoInvalido, datosCopiaIntercompany,
  NOTA_ORIGEN,
} from './intercompany.js'

const opStk = (extra = {}) => ({
  id: 'p1', id_tipo: 'STK', id_local: 'L1', importe: 50000, nro_ord: 120, ...extra,
})
const LOCALES = [
  { id: 'L1', id_app: 'A' },
  { id: 'L2', id_app: 'A' },
  { id: 'L9', id_app: 'B' }, // otro grupo
]

// ── Qué se puede enviar ─────────────────────────────────────────────────────

test('una op STK con importe y local se puede enviar', () => {
  assert.equal(motivoNoEnviable(opStk()), null)
  assert.equal(esEnviable(opStk()), true)
})

test('solo se envían las STK', () => {
  assert.match(motivoNoEnviable(opStk({ id_tipo: 'A' })), /tipo STK/)
  assert.match(motivoNoEnviable(opStk({ id_tipo: null })), /tipo STK/)
})

test('sin local no hay desde dónde enviar', () => {
  assert.match(motivoNoEnviable(opStk({ id_local: null })), /local/)
})

test('el importe tiene que ser positivo', () => {
  assert.match(motivoNoEnviable(opStk({ importe: 0 })), /mayor a cero/)
  assert.match(motivoNoEnviable(opStk({ importe: null })), /mayor a cero/)
})

// Sin esto una copia se podría reenviar a un tercer local y la plata se
// multiplicaría por la cadena.
test('una copia recibida no se reenvía', () => {
  assert.match(motivoNoEnviable(opStk({ id_pago_origen: 'p0' })), /ya es una copia/)
})

test('una op que no existe no se envía', () => {
  assert.match(motivoNoEnviable(null), /no existe/)
})

// ── A dónde se puede enviar ─────────────────────────────────────────────────

test('el destino válido es otro local del mismo grupo', () => {
  assert.equal(motivoDestinoInvalido(opStk(), 'L2', LOCALES), null)
})

test('no se envía al mismo local', () => {
  assert.match(motivoDestinoInvalido(opStk(), 'L1', LOCALES), /tiene que ser otro/)
})

// La regla dura del pedido: dos grupos son dos contabilidades.
test('no se cruza de un grupo a otro', () => {
  assert.match(motivoDestinoInvalido(opStk(), 'L9', LOCALES), /mismo grupo/)
})

test('un destino que no está en la lista se rechaza', () => {
  assert.match(motivoDestinoInvalido(opStk(), 'L-desconocido', LOCALES), /no está en el grupo/)
  assert.match(motivoDestinoInvalido(opStk(), '', LOCALES), /Elegí el local/)
})

test('si no se tiene acceso al local que envía, no se puede afirmar el grupo', () => {
  const ajena = opStk({ id_local: 'L-ajeno' })
  assert.match(motivoDestinoInvalido(ajena, 'L2', LOCALES), /No tenés acceso/)
})

// ── Cómo queda la copia ─────────────────────────────────────────────────────

const copia = (extra = {}, opts = {}) => datosCopiaIntercompany(
  opStk(extra),
  { idDestino: 'L2', nombreOrigen: 'PALERMO', nroOrd: 55, ahora: new Date('2026-08-20T12:00:00Z'), ...opts },
)

test('la copia entra como INGRESO en el local destino', () => {
  const c = copia()
  assert.equal(c.ingresa_egreso, true)
  assert.equal(c.id_local, 'L2')
  assert.equal(c.importe, 50000)
})

test('la copia queda vinculada a su origen', () => {
  assert.equal(copia().id_pago_origen, 'p1')
})

test('la copia dice de dónde vino, con la OP original', () => {
  const c = copia()
  assert.ok(c.observaciones.startsWith(`${NOTA_ORIGEN} PALERMO (OP-120)`))
})

test('la nota se antepone a las observaciones que ya tenía', () => {
  const c = copia({ observaciones: 'transferencia semanal' })
  assert.match(c.observaciones, /PALERMO \(OP-120\) · transferencia semanal$/)
})

test('la copia nace pagada: del lado que recibe no hay nada que pagar', () => {
  const c = copia()
  assert.equal(c.pagado, true)
  assert.equal(c.fecha_pago.toISOString(), '2026-08-20T12:00:00.000Z')
})

// Arrastrarlos metería la op del que recibe en un circuito que no es suyo.
test('la copia NO arrastra el estado_op, el PDP ni el cliente del origen', () => {
  const c = copia({ estado_op: 'PDP', id_pdp: 'pdp1', id_cliente: 'c1', foto_url: 'gs://x' })
  assert.equal(c.estado_op, undefined)
  assert.equal(c.id_pdp, undefined)
  assert.equal(c.id_cliente, undefined)
  assert.equal(c.foto_url, undefined)
})

test('la copia conserva tipo, metodo, rubro y periodo', () => {
  const c = copia({ id_rubcat: 'rc1', id_metodo: 'm1', periodo: new Date('2026-08-01T00:00:00Z') })
  assert.equal(c.id_tipo, 'STK')
  assert.equal(c.id_metodo, 'm1')
  assert.equal(c.id_rubcat, 'rc1')
  assert.equal(c.periodo.toISOString(), '2026-08-01T00:00:00.000Z')
})

test('el numero de orden lo pone el local que recibe', () => {
  assert.equal(copia().nro_ord, 55)
  assert.equal(copia({}, { nroOrd: undefined }).nro_ord, null)
})
