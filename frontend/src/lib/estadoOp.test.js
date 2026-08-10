import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ESTADOS_OP, ESTADO_OP_LABEL, ESTADO_OP_OPTIONS, ESTADO_OP_BADGE,
  ESTADO_CTA_CTE_CLIENTE, etiquetaEstadoOp, badgeEstadoOp,
} from './estadoOp.js'

const raiz = (rel) => fileURLToPath(new URL(rel, import.meta.url))
// Los archivos del repo tienen CRLF: `.` no matchea `\r`, así que un regex que
// funciona en Linux acá corta mal. Se normaliza al leer.
const leer = (rel) => readFileSync(raiz(rel), 'utf8').replace(/\r\n/g, '\n')

// ─── Contrato con el enum de Prisma ─────────────────────────────────────────
// El motivo de este archivo: la lista de estados estaba copiada en PagoForm y en
// PagoList. Ya pasó una vez con el enum de Caja Mayor (ESTUDIO -> ENVIADA): se
// renombró en el backend, el frontend siguió mandando el nombre viejo y la pantalla
// contestaba 400. Si mañana se agrega o saca un estado en la base, falla acá.

test('los estados son exactamente los del enum EstadoOp de Prisma', () => {
  const schema = leer('../../../backend/prisma/schema.prisma')
  const bloque = schema.match(/enum EstadoOp \{([^}]*)\}/)
  assert.ok(bloque, 'no se encontró el enum EstadoOp en schema.prisma')

  // Cada línea es `NOMBRE` o `NOMBRE @map("NOMBRE CON ESPACIOS")`.
  const delEnum = bloque[1]
    .split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('@@') && !l.startsWith('//'))
    .map((l) => l.split(/\s+/)[0])

  assert.deepEqual(
    [...ESTADOS_OP].sort(), [...delEnum].sort(),
    `el front usa [${ESTADOS_OP}] y el enum tiene [${delEnum}]`
  )
})

test('la etiqueta de cada estado es el @map de la base, o su propio nombre', () => {
  const schema = leer('../../../backend/prisma/schema.prisma')
  const bloque = schema.match(/enum EstadoOp \{([^}]*)\}/)
  for (const linea of bloque[1].split('\n').map((l) => l.trim())) {
    if (!linea || linea.startsWith('@@') || linea.startsWith('//')) continue
    const clave = linea.split(/\s+/)[0]
    const map = linea.match(/@map\("([^"]+)"\)/)
    assert.equal(
      ESTADO_OP_LABEL[clave], map ? map[1] : clave,
      `la etiqueta de ${clave} no coincide con lo que guarda la base`
    )
  }
})

test('ningún estado se queda sin etiqueta ni sin color', () => {
  for (const e of ESTADOS_OP) {
    assert.ok(ESTADO_OP_LABEL[e], `${e} sin etiqueta`)
    assert.ok(ESTADO_OP_BADGE[e], `${e} sin badge`)
  }
})

test('CUENTA CTE y CTA CTE CLI no comparten color: son deudas opuestas', () => {
  assert.notEqual(ESTADO_OP_BADGE.CUENTA_CTE, ESTADO_OP_BADGE.CTA_CTE_CLI)
})

// ─── Contrato con la regla de cuenta corriente ──────────────────────────────

test('el estado que exige cliente es el mismo que filtra el saldo en el backend', () => {
  const lib = leer('../../../backend/src/lib/cuentaCorriente.js')
  const filtro = lib.match(/estado_op:\s*'([A-Z_]+)'/)
  assert.ok(filtro, 'no se encontró el estado_op del filtro en lib/cuentaCorriente.js')
  assert.equal(ESTADO_CTA_CTE_CLIENTE, filtro[1])
})

// ─── Las pantallas usan la lista compartida, no una copia ───────────────────

test('PagoForm y PagoList no vuelven a declarar su propia lista de estados', () => {
  for (const archivo of ['../pages/pagos/PagoForm.jsx', '../pages/pagos/PagoList.jsx']) {
    const src = leer(archivo)
    assert.doesNotMatch(
      src, /const ESTADO_OP_OPTIONS\s*=\s*\[/,
      `${archivo} declara su propia lista de estados: tiene que importarla de lib/estadoOp.js`
    )
    assert.match(src, /from '\.\.\/\.\.\/lib\/estadoOp\.js'/, `${archivo} no importa lib/estadoOp.js`)
  }
})

// ─── Helpers ────────────────────────────────────────────────────────────────

test('las opciones salen en el orden de la lista, con su etiqueta', () => {
  assert.deepEqual(ESTADO_OP_OPTIONS.map((o) => o.value), ESTADOS_OP)
  assert.equal(ESTADO_OP_OPTIONS.at(-1).label, 'CTA CTE CLI')
})

test('un estado desconocido no rompe la pantalla', () => {
  assert.equal(etiquetaEstadoOp('LO_QUE_SEA'), 'LO_QUE_SEA')
  assert.equal(etiquetaEstadoOp(null), '')
  assert.equal(etiquetaEstadoOp(undefined), '')
  assert.equal(badgeEstadoOp('LO_QUE_SEA'), 'badge-muted')
  assert.equal(badgeEstadoOp(null), 'badge-muted')
})
