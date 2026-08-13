import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TIPOS_PAGO, ETIQUETA_TIPO, etiquetaTipo, TIPOS_QUE_RESTAN, resta } from './tiposPago.js'

const SCHEMA = readFileSync(
  new URL('../../../backend/prisma/schema.prisma', import.meta.url), 'utf8'
).replace(/\r\n/g, '\n')

// Los valores del enum tal como estan en el schema. El `@map` no cambia el nombre que usa
// la app (DC_1 se guarda como "DC (1)" pero se escribe DC_1).
function enumDelSchema() {
  const m = SCHEMA.match(/enum TipoPago \{([\s\S]*?)\n\}/)
  assert.ok(m, 'no se encontro el enum TipoPago')
  return m[1]
    .split('\n')
    .map(l => l.trim().split(/\s+/)[0])
    .filter(v => /^[A-Z][A-Z0-9_]*$/.test(v))
}

test('CONTRATO: la lista tiene exactamente los valores del enum', () => {
  // Un valor en el enum que falte aca es un pago que se puede guardar pero no filtrar; uno
  // de mas es una opcion del select que la base rechaza.
  assert.deepEqual([...TIPOS_PAGO].sort(), enumDelSchema().sort())
})

test('CONTRATO: NDC esta en el enum y en la lista', () => {
  // Es el tipo que se pidio agregar. El test lo nombra para que quede el rastro.
  assert.ok(enumDelSchema().includes('NDC'), 'falta NDC en el enum de Prisma')
  assert.ok(TIPOS_PAGO.includes('NDC'), 'falta NDC en la lista del frontend')
})

test('no hay tipos repetidos', () => {
  assert.equal(TIPOS_PAGO.length, new Set(TIPOS_PAGO).size)
})

test('CONTRATO: la lista NO esta duplicada a mano en las pantallas', () => {
  // Era el problema original: la misma lista escrita en PagoForm y en PagoList. Si alguien
  // vuelve a pegarla, este test lo agarra.
  for (const archivo of ['../pages/pagos/PagoForm.jsx', '../pages/pagos/PagoList.jsx']) {
    const src = readFileSync(new URL(archivo, import.meta.url), 'utf8')
    assert.ok(
      !/'DDJJ'\s*,\s*'FF'/.test(src),
      `${archivo} tiene la lista de tipos escrita a mano: usar TIPOS_PAGO`
    )
  }
})

// ── etiquetas ───────────────────────────────────────────────────────────────

test('los tipos con nombre propio se explican', () => {
  assert.equal(etiquetaTipo('NCA'), 'NCA (nota de crédito A)')
  assert.equal(etiquetaTipo('NDC'), 'NDC (nota de débito C)')
})

test('un tipo sin etiqueta se muestra tal cual', () => {
  // Una factura A se llama "A": inventarle un nombre largo seria peor.
  assert.equal(etiquetaTipo('A'), 'A')
  assert.equal(etiquetaTipo('B'), 'B')
})

test('un tipo desconocido no muestra "undefined"', () => {
  assert.equal(etiquetaTipo('ZZZ'), 'ZZZ')
  assert.equal(etiquetaTipo(null), null)
})

test('todas las etiquetas corresponden a un tipo que existe', () => {
  for (const k of Object.keys(ETIQUETA_TIPO)) {
    assert.ok(TIPOS_PAGO.includes(k), `${k} tiene etiqueta pero no esta en la lista`)
  }
})

// ── que resta ───────────────────────────────────────────────────────────────

test('solo las notas de CREDITO restan', () => {
  assert.equal(resta('NCA'), true)
  assert.equal(resta('NCB'), true)
})

test('las notas de DEBITO no restan, incluida NDC', () => {
  // La D del medio es de debito: suman. NDC entra en este grupo.
  assert.equal(resta('NDA'), false)
  assert.equal(resta('ND'), false)
  assert.equal(resta('NDC'), false)
})

test('una factura normal no resta', () => {
  assert.equal(resta('A'), false)
  assert.equal(resta(undefined), false)
})

test('CONTRATO: lo que resta coincide con el export', () => {
  // exportPagos.js tiene su propia lista para el archivo que se manda al contador: si una
  // resta en la pantalla y no en el export, los dos totales no cierran.
  const exp = readFileSync(new URL('./exportPagos.js', import.meta.url), 'utf8')
  const m = exp.match(/const TIPOS_NOTA_CREDITO = \[([^\]]*)\]/)
  assert.ok(m, 'no se encontro TIPOS_NOTA_CREDITO en exportPagos.js')
  const delExport = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort()
  assert.deepEqual([...TIPOS_QUE_RESTAN].sort(), delExport)
})
