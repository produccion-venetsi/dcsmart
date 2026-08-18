import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dividirPorDireccion, dividirPorEstado, depositadoPorLocal, extraidoPorLocal, netoDeFila, proporcion,
  pendienteDepositado, pendienteExtraido, tienePendiente, textoEstado,
} from './cajaMayorVista.js'

const raiz = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const leer = (rel) => readFileSync(raiz(rel), 'utf8').replace(/\r\n/g, '\n')

// Como los devuelve GET /caja-mayor/saldos: la direccion viene desde la CAJA MAYOR, y los
// pendiente_* son los importes que siguen en estado ENVIADA.
const saldo = (local, ingresos, egresos, over = {}) => ({
  id_local: local, local, grupo: 'G', moneda: 'ARS',
  ingresos, egresos, ops: 1, en_estudio: 0,
  pendiente_ingresos: 0, pendiente_egresos: 0,
  ops_ingresos: 1, ops_egresos: 1,
  ...over,
})

// ── la traduccion cruzada ───────────────────────────────────────────────────

test('lo que el local DEPOSITO son los ingresos de la caja mayor', () => {
  // Es lo cruzado del modelo: un egreso del local es un ingreso a la caja mayor.
  // Leerlo al derecho mostraria los dos totales invertidos.
  assert.equal(depositadoPorLocal({ ingresos: 8300000, egresos: 5203000 }), 8300000)
  assert.equal(extraidoPorLocal({ ingresos: 8300000, egresos: 5203000 }), 5203000)
})

test('los importes se toman en valor absoluto', () => {
  // El modelo guarda el importe siempre positivo, pero un agregado mal armado podria
  // traer negativos y las columnas quedarian en rojo sin motivo.
  assert.equal(depositadoPorLocal({ ingresos: -100 }), 100)
  assert.equal(extraidoPorLocal({ egresos: -50 }), 50)
})

test('aguanta valores que faltan', () => {
  assert.equal(depositadoPorLocal({}), 0)
  assert.equal(depositadoPorLocal(null), 0)
  assert.equal(extraidoPorLocal(undefined), 0)
})

// ── el bug que se reporto: direccion vs estado ───────────────────────────────

test('EL CASO DE ADA: cuatro movimientos RECIBIDA se reparten por direccion, no por estado', () => {
  // Datos reales de ADA (2026-08-12): 2 movimientos ingreso=true por 8.300.000 y 2 con
  // ingreso=false por 5.203.000, LOS CUATRO en estado RECIBIDA.
  //
  // El reporte fue "estan todas en estado recibidas y aparecen en enviadas a caja mayor".
  // Las dos cosas eran ciertas a la vez -- lo que estaba mal eran los nombres de las
  // columnas, que usaban las palabras del estado para mostrar la direccion.
  const v = dividirPorDireccion([
    saldo('ADA', 8300000, 5203000, { ops: 4, ops_ingresos: 2, ops_egresos: 2, en_estudio: 0 }),
  ])
  const f = v.filas[0]
  assert.equal(f.depositado, 8300000)
  assert.equal(f.extraido, 5203000)
  // Y nada pendiente, porque los cuatro estan confirmados.
  assert.equal(f.pendiente_depositado, 0)
  assert.equal(f.pendiente_extraido, 0)
  assert.equal(f.sin_recibir, 0)
  assert.equal(textoEstado(f), 'Todo confirmado')
})

test('el estado se lee de pendiente_*, no de la direccion', () => {
  // Un local que deposito 1000 y todavia no le confirmaron 400.
  const s = saldo('X', 1000, 0, { pendiente_ingresos: 400, en_estudio: 1, ops: 3 })
  assert.equal(depositadoPorLocal(s), 1000)
  assert.equal(pendienteDepositado(s), 400)
  assert.equal(pendienteExtraido(s), 0)
  assert.equal(tienePendiente(s), true)
})

test('sin nada pendiente, tienePendiente es false', () => {
  assert.equal(tienePendiente(saldo('X', 1000, 500)), false)
})

test('en_estudio marca la fila aunque el importe pendiente sea cero', () => {
  // Un movimiento sin importe cargado, en estado ENVIADA: la fila igual tiene algo sin
  // confirmar y hay que poder verlo.
  assert.equal(tienePendiente(saldo('X', 0, 0, { en_estudio: 1 })), true)
})

test('el texto del estado dice cuantos faltan', () => {
  assert.equal(textoEstado({ sin_recibir: 2 }), '2 sin confirmar')
  assert.equal(textoEstado({ sin_recibir: 0 }), 'Todo confirmado')
  assert.equal(textoEstado({}), 'Todo confirmado')
})

// ── las dos mitades ─────────────────────────────────────────────────────────

test('los dos lados traen los mismos locales, en el mismo orden', () => {
  // Es lo que permite leerlos a la misma altura y comparar. Filtrar los ceros de un lado
  // desalinearia las filas.
  const v = dividirPorDireccion([
    saldo('A', 100, 0), saldo('B', 0, 50), saldo('C', 300, 20),
  ])
  assert.deepEqual(v.filas.map(f => f.local), ['C', 'A', 'B'])
  assert.equal(v.filas.length, 3)
})

test('ordena por lo depositado y desempata por nombre', () => {
  const v = dividirPorDireccion([saldo('Zeta', 100, 0), saldo('Alfa', 100, 0)])
  assert.deepEqual(v.filas.map(f => f.local), ['Alfa', 'Zeta'])
})

test('los totales suman las dos direcciones por separado', () => {
  const v = dividirPorDireccion([saldo('A', 100, 10), saldo('B', 200, 20)])
  assert.equal(v.totalDepositado, 300)
  assert.equal(v.totalExtraido, 30)
  assert.equal(v.neto, 270)
})

test('el neto confirmado descuenta lo pendiente de las dos direcciones', () => {
  // "Cuanto hay" y "cuanto va a haber" son dos numeros distintos y los dos se miran.
  const v = dividirPorDireccion([
    saldo('A', 1000, 400, { pendiente_ingresos: 300, pendiente_egresos: 100, en_estudio: 2 }),
  ])
  assert.equal(v.neto, 600)               // 1000 - 400
  assert.equal(v.netoConfirmado, 400)     // (1000-300) - (400-100)
  assert.equal(v.totalPendiente, 400)     // 300 + 100
})

test('con todo confirmado, el neto y el neto confirmado coinciden', () => {
  const v = dividirPorDireccion([saldo('A', 1000, 400)])
  assert.equal(v.neto, v.netoConfirmado)
})

test('cuenta los locales y los movimientos sin confirmar', () => {
  const v = dividirPorDireccion([
    saldo('A', 10, 0, { en_estudio: 2 }), saldo('B', 20, 0, { en_estudio: 3 }),
  ])
  assert.equal(v.locales, 2)
  assert.equal(v.sinRecibir, 5)
})

test('lista vacia no rompe', () => {
  const v = dividirPorDireccion([])
  assert.deepEqual(v.filas, [])
  assert.equal(v.totalDepositado, 0)
  assert.equal(v.neto, 0)
  assert.equal(v.netoConfirmado, 0)
  assert.equal(dividirPorDireccion(null).locales, 0)
})

test('un local sin nombre no muestra "undefined"', () => {
  const v = dividirPorDireccion([{ id_local: 'x', ingresos: 1, egresos: 0 }])
  assert.equal(v.filas[0].local, '—')
})

// ── neto y proporcion ───────────────────────────────────────────────────────

test('el neto de la fila usa el mismo criterio que el total', () => {
  assert.equal(netoDeFila({ depositado: 100, extraido: 30 }), 70)
  assert.equal(netoDeFila({ depositado: 30, extraido: 100 }), -70)
  assert.equal(netoDeFila({}), 0)
})

test('la proporcion es el peso dentro de la columna', () => {
  assert.equal(proporcion(50, 100), 50)
  assert.equal(proporcion(0, 100), 0)
})

test('la proporcion no se pasa de 100 ni divide por cero', () => {
  assert.equal(proporcion(200, 100), 100)
  assert.equal(proporcion(50, 0), 0)
  assert.equal(proporcion(50, null), 0)
})

// ── contrato con el backend ─────────────────────────────────────────────────

test('CONTRATO: el backend manda los campos que la vista lee', () => {
  // Si el backend deja de mandar pendiente_ingresos, las columnas de estado quedan en cero
  // sin fallar: la pantalla diria "todo confirmado" con movimientos en camino.
  const back = leer('../../../backend/src/lib/cajaMayor.js')
  for (const campo of [
    'pendiente_ingresos', 'pendiente_egresos', 'ops_ingresos', 'ops_egresos',
    'ingresos', 'egresos', 'en_estudio',
  ]) {
    assert.ok(back.includes(campo), `el backend no manda ${campo}`)
  }
})

test('CONTRATO: el estado sigue siendo ENVIADA / RECIBIDA', () => {
  // Toda la lectura del estado se apoya en que RECIBIDA es el unico valor "confirmado".
  const schema = leer('../../../backend/prisma/schema.prisma')
  const m = schema.match(/enum EstadoCM \{([^}]*)\}/)
  assert.ok(m, 'no se encontro el enum EstadoCM')
  const valores = m[1].split('\n').map(s => s.trim()).filter(v => /^[A-Z_]+$/.test(v))
  assert.deepEqual(valores.sort(), ['ENVIADA', 'RECIBIDA'])
})

// ── División por ESTADO (pedido del Trello: la primera pantalla parte por
// enviada/recibida, con la dirección adentro de cada lado) ──────────────────

test('cada fila trae los dos lados por estado, con la direccion adentro', () => {
  const v = dividirPorEstado([{
    id_local: 'L1', local: 'ADA', moneda: 'ARS',
    ingresos: 100, egresos: 50,
    pendiente_ingresos: 40, pendiente_egresos: 10,
    en_estudio: 2, ops: 5, ops_ingresos: 3, ops_egresos: 2,
  }])
  const f = v.filas[0]
  // ENVIADA = lo que sigue sin confirmar
  assert.equal(f.enviada_depositado, 40)
  assert.equal(f.enviada_extraido, 10)
  assert.equal(f.enviada_total, 50)
  assert.equal(f.ops_enviada, 2)
  // RECIBIDA = lo confirmado (total menos pendiente)
  assert.equal(f.recibida_depositado, 60)
  assert.equal(f.recibida_extraido, 40)
  assert.equal(f.recibida_total, 100)
  assert.equal(f.ops_recibida, 3)
})

test('EL CASO DE ADA al reves: todo RECIBIDA cae entero en el lado recibidas', () => {
  const v = dividirPorEstado([{
    id_local: 'L1', local: 'ADA', moneda: 'ARS',
    ingresos: 200, egresos: 80,
    pendiente_ingresos: 0, pendiente_egresos: 0,
    en_estudio: 0, ops: 4, ops_ingresos: 2, ops_egresos: 2,
  }])
  const f = v.filas[0]
  assert.equal(f.enviada_total, 0)
  assert.equal(f.ops_enviada, 0)
  assert.equal(f.recibida_total, 280)
  assert.equal(f.ops_recibida, 4)
  assert.equal(v.totalEnviada, 0)
  assert.equal(v.totalRecibida, 280)
})

test('los totales del encabezado se conservan (direccion y neto)', () => {
  const v = dividirPorEstado([{
    id_local: 'L1', local: 'A', moneda: 'ARS',
    ingresos: 100, egresos: 30, pendiente_ingresos: 20, pendiente_egresos: 0,
    en_estudio: 1, ops: 3, ops_ingresos: 2, ops_egresos: 1,
  }])
  assert.equal(v.totalDepositado, 100)
  assert.equal(v.totalExtraido, 30)
  assert.equal(v.neto, 70)
  assert.equal(v.totalPendiente, 20)
  assert.equal(v.sinRecibir, 1)
})
