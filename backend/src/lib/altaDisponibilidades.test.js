import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activarDefaultEnLocal, asegurarCatalogo } from './altaDisponibilidades.js'
import { CATALOGO_INICIAL } from './disponibilidades.js'

// Base falsa: alcanza con los upsert/findMany que usa el helper. El punto de
// estos tests es que no saque nada y que no duplique, no la capa de Prisma.
function dbFalsa({ catalogo = [], activas = [] } = {}) {
  const tipos = catalogo.map((c, i) => ({ id: `t${i}`, nombre: c.nombre, id_app: c.id_app ?? 'a1' }))
  const locDisp = [...activas]
  return {
    tipos, locDisp,
    disponibilidadTipo: {
      async upsert({ where, create }) {
        const { nombre, id_app } = where.nombre_id_app
        let t = tipos.find((x) => x.nombre === nombre && x.id_app === id_app)
        if (!t) { t = { id: `t${tipos.length}`, nombre: create.nombre, id_app: create.id_app }; tipos.push(t) }
        return { id: t.id, nombre: t.nombre }
      },
    },
    localDisponibilidad: {
      async findMany({ where }) {
        return locDisp.filter((d) => d.id_local === where.id_local).map((d) => ({ id_tipo: d.id_tipo }))
      },
      async upsert({ where, create }) {
        const { id_local, id_tipo } = where.id_local_id_tipo
        if (!locDisp.some((d) => d.id_local === id_local && d.id_tipo === id_tipo)) locDisp.push(create)
        return create
      },
    },
  }
}

test('un local nuevo arranca con todo el catálogo inicial', async () => {
  const db = dbFalsa()
  const r = await activarDefaultEnLocal(db, { id_local: 'L1', id_app: 'a1' })
  assert.equal(r.activadas.length, CATALOGO_INICIAL.length)
  assert.equal(db.locDisp.length, CATALOGO_INICIAL.length)
  assert.deepEqual(
    [...r.activadas].sort(),
    CATALOGO_INICIAL.map((c) => c.nombre).sort()
  )
})

test('correrlo dos veces no duplica nada', async () => {
  const db = dbFalsa()
  await activarDefaultEnLocal(db, { id_local: 'L1', id_app: 'a1' })
  const segunda = await activarDefaultEnLocal(db, { id_local: 'L1', id_app: 'a1' })
  assert.deepEqual(segunda.activadas, [])
  assert.equal(db.locDisp.length, CATALOGO_INICIAL.length)
})

test('conserva lo que el local ya tenía y solo suma lo que falta', async () => {
  // 'Mercado Pago' es el concepto heredado de los arqueos viejos de 878COOP:
  // no está en el catálogo inicial y no tiene que desaparecer.
  const db = dbFalsa({
    catalogo: [{ nombre: 'Mercado Pago' }],
    activas: [{ id_local: 'L1', id_tipo: 't0' }],
  })
  const r = await activarDefaultEnLocal(db, { id_local: 'L1', id_app: 'a1' })
  assert.equal(r.yaTenia, 1)
  assert.equal(r.activadas.length, CATALOGO_INICIAL.length)
  assert.ok(db.locDisp.some((d) => d.id_tipo === 't0'), 'la heredada sigue activa')
  assert.equal(db.locDisp.length, CATALOGO_INICIAL.length + 1)
})

test('el catálogo de otro grupo no se mezcla', async () => {
  const db = dbFalsa({ catalogo: CATALOGO_INICIAL.map((c) => ({ nombre: c.nombre, id_app: 'otra' })) })
  await asegurarCatalogo(db, 'a1')
  const delGrupo = db.tipos.filter((t) => t.id_app === 'a1')
  assert.equal(delGrupo.length, CATALOGO_INICIAL.length)
  assert.equal(db.tipos.length, CATALOGO_INICIAL.length * 2)
})
