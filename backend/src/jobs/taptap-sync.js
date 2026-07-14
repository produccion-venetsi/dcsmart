// Sincroniza los cierres de turno de TapTap para todos los locales configurados.
// Reemplaza los ~14 Apps Script individuales (uno por local, escribían a
// Google Sheets). Corre como Cloud Run Job vía Cloud Scheduler, 5am diario.
//
// Uso local: DATABASE_URL=... node src/jobs/taptap-sync.js
'use strict'
import { PrismaClient } from '@prisma/client'
import { resolverMetodo } from './taptap/metodos.js'
import { mapTurno } from './taptap/mapping.js'

const prisma = new PrismaClient()
const API_BASE_URL = 'https://function-dc-getturnos-679004960826.southamerica-east1.run.app/'

// groupId de TapTap -> id_local de DCSmart. Agregar acá cuando se sume un local nuevo.
const LOCALES_TAPTAP = [
  { groupId: 'tognicafetap',     id_local: '6cda1b66' },
  { groupId: 'tognipizza',       id_local: '6cda1b67' },
  { groupId: 'mafia',            id_local: 'HFIUOE76' },
  { groupId: 'latinotacuari84',  id_local: 'KHBJON43545' },
  { groupId: 'latinotacuari185', id_local: 'KHBJON435' },
  { groupId: 'lafuerza',         id_local: 'd77f7289' },
  { groupId: 'latinopaseocolon', id_local: 'FGHDVTV' },
  { groupId: 'clublucero',       id_local: 'J45J3822' },
  { groupId: 'raix',             id_local: '5401bfa7' },
  { groupId: 'romadelabasto',    id_local: 'e5b7eb5f' },
  { groupId: 'farmacialezama',   id_local: 'e1bea49b-d306-47f2-bcc8-1ffd9cda41d9' },
  { groupId: 'picsa',            id_local: 'KSYVVXZN' },
  { groupId: 'bebop',            id_local: 'UYPLAVIG' },
  { groupId: 'casonaazopardo',   id_local: 'OLHGEOYQ' },  // ALDOS — POIUYTR (config original) no existe en la base
]

async function obtenerMaxId(id_local) {
  const ultimo = await prisma.caja.findFirst({
    where: { id_local, origin: 'TAPTAP', id_externo: { not: null } },
    orderBy: { id_externo: 'desc' }, // string, pero los ids de TapTap crecen en longitud junto con el valor en este rango, ok para maxid
    select: { id_externo: true },
  })
  return ultimo?.id_externo || '0'
}

// Resuelve (o crea) el MetodoPago para un monedaname de TapTap, cacheando
// en memoria durante la corrida para no repetir queries.
async function resolverMetodoId(monedaname, cacheMetodos) {
  if (cacheMetodos.has(monedaname)) return cacheMetodos.get(monedaname)
  const existentes = await prisma.metodoPago.findMany({ select: { id: true, nombre: true } })
  const { nombre, existenteId } = resolverMetodo(monedaname, existentes)
  let id = existenteId
  if (!id) {
    const creado = await prisma.metodoPago.upsert({ where: { nombre }, create: { nombre }, update: {} })
    id = creado.id
  }
  cacheMetodos.set(monedaname, id)
  return id
}

// Resuelve (o crea) el DetalleTipo para un nombre, scopeado por id_app.
async function resolverDetalleTipoId(nombre, id_app, cacheDetalleTipos) {
  const key = `${id_app}|${nombre}`
  if (cacheDetalleTipos.has(key)) return cacheDetalleTipos.get(key)
  const dt = await prisma.detalleTipo.upsert({
    where: { nombre_id_app: { nombre, id_app } },
    create: { nombre, id_app },
    update: {},
  })
  cacheDetalleTipos.set(key, dt.id)
  return dt.id
}

async function procesarLocal(local, cacheMetodos, cacheDetalleTipos) {
  const local_db = await prisma.local.findUnique({ where: { id: local.id_local }, select: { id_app: true } })
  if (!local_db) throw new Error(`Local ${local.id_local} no existe en la base`)

  const maxId = await obtenerMaxId(local.id_local)
  const url = `${API_BASE_URL}?groupid=${local.groupId}&maxid=${maxId}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`API TapTap respondió ${resp.status}`)
  const json = await resp.json()
  const turnos = json.turnos || []

  let turnosNuevos = 0
  for (const turno of turnos) {
    const yaExiste = await prisma.caja.findFirst({
      where: { id_local: local.id_local, id_externo: String(turno.id) },
      select: { id: true },
    })
    if (yaExiste) continue // idempotencia: turno ya sincronizado, se saltea completo

    const { caja, movimientos, detallesSiempre, detallesSiOcurren } = mapTurno(turno)
    if (!caja.fecha_inicio) continue // turno sin fecha válida, no se puede crear

    const movimientosConMetodo = []
    for (const m of movimientos) {
      const id_metodo = await resolverMetodoId(m.monedaname, cacheMetodos)
      movimientosConMetodo.push({ tipo: m.tipo, id_metodo, monto: String(m.monto), cantidad: m.cantidad })
    }

    const detalles = [...detallesSiempre, ...detallesSiOcurren]
    const detallesConTipo = []
    for (const d of detalles) {
      const id_tipo = await resolverDetalleTipoId(d.nombre, local_db.id_app, cacheDetalleTipos)
      detallesConTipo.push({ id_tipo, nombre: d.nombre, monto: String(d.monto) })
    }

    await prisma.caja.create({
      data: {
        ...caja,
        id_local: local.id_local,
        origin: 'TAPTAP',
        movimientos: { create: movimientosConMetodo },
        detalles: { create: detallesConTipo },
      },
    })
    turnosNuevos++
  }

  return { turnosNuevos }
}

async function main() {
  const run = await prisma.tapTapSyncRun.create({ data: {} })
  const cacheMetodos = new Map()
  const cacheDetalleTipos = new Map()
  const resultado = {}
  let ok = true

  for (const local of LOCALES_TAPTAP) {
    try {
      resultado[local.id_local] = await procesarLocal(local, cacheMetodos, cacheDetalleTipos)
      console.log(`[${local.groupId}] ${resultado[local.id_local].turnosNuevos} turnos nuevos`)
    } catch (err) {
      ok = false
      resultado[local.id_local] = { error: err.message }
      console.error(`[${local.groupId}] ERROR: ${err.message}`)
    }
  }

  await prisma.tapTapSyncRun.update({
    where: { id: run.id },
    data: { finished_at: new Date(), resultado, ok },
  })
  console.log('Sincronización finalizada.', ok ? '(sin errores)' : '(con errores, ver resultado)')
}

main()
  .catch((e) => { console.error('ERROR FATAL:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
