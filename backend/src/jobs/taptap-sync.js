// Sincroniza los cierres de turno de TapTap para todos los locales configurados.
// Reemplaza los ~14 Apps Script individuales (uno por local, escribían a
// Google Sheets). Corre como Cloud Run Job vía Cloud Scheduler, 5am diario.
//
// Desde 2026-08 usa la API pública nueva de TapTap (ver TAPTAP_api_publica.md
// en la raíz del workspace): POST con body JSON y header x-api-secret, en
// reemplazo del GET ?groupid=&maxid= (endpoint function-dc-getturnos, que el
// proveedor da de baja). Diferencias que importan:
//   - el campo id del turno ahora se llama `turnoid`
//   - la respuesta INCLUYE el turno abierto ("Turno Actual"), que la API vieja
//     no mandaba: hay que saltearlo o queda una caja con datos parciales que la
//     idempotencia por id_externo congela para siempre
//   - hay rate limit POR CREDENCIAL: medido el 2026-08-16, nuestra clave
//     admite ~1 consulta por minuto (con 11s de pausa fallaron 12 de 15
//     locales con 400). Entre local y local se espera TAPTAP_RATE_MS, y el
//     task-timeout del Cloud Run Job está en 1800s para que entren los ~15
//     minutos que tarda la vuelta completa.
//
// Uso local: DATABASE_URL=... TAPTAP_API_SECRET=... node src/jobs/taptap-sync.js
'use strict'
import { PrismaClient } from '@prisma/client'
import { resolverMetodo } from './taptap/metodos.js'
import { mapTurno, esTurnoAbierto } from './taptap/mapping.js'
import { movimientoADetalle } from '../lib/movimientoADetalle.js'
import { ROL_POR_CLASIFICACION } from '../lib/cuadreCaja.js'

const prisma = new PrismaClient()
const API_BASE_URL = 'https://function-gethisto-679004960826.southamerica-east1.run.app'
const API_SECRET = process.env.TAPTAP_API_SECRET
// Pausa entre locales para no pisar el rate limit por credencial (medido: 1/min).
const RATE_MS = Number(process.env.TAPTAP_RATE_MS || 61000)

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
  { groupId: 'luckylouis',       id_local: 'd6944000-861e-43dd-a229-bee1c1533255' },  // LUCKY LOUIS
  { groupId: 'donaldo',          id_local: '56ASFD4' },  // DON ALDO — alta 2026-08-16, historial migrado por CSV hasta el 13/08
]

// El maxid que espera la API es NUMÉRICO. No alcanza con ordenar id_externo
// como string: las cajas de LUCERO migradas por CSV en agosto 2026 quedaron con
// id_externo del sistema viejo (ej. 'XRWQBEGX'), que gana cualquier orden
// alfabético y terminaba viajando como ?maxid=XRWQBEGX. Además hay ids con
// sufijo de caja ('208475237_0'), donde el orden string tampoco respeta el valor
// ('99999_0' > '100000'). Por eso: se toma la parte numérica previa al '_', se
// descarta lo que no sea numérico, y se compara como bigint.
async function obtenerMaxId(id_local) {
  const filas = await prisma.$queryRaw`
    SELECT MAX(split_part(id_externo, '_', 1)::bigint) AS maxid
    FROM cajas
    WHERE id_local = ${id_local}
      AND origin = 'TAPTAP'
      AND id_externo IS NOT NULL
      AND split_part(id_externo, '_', 1) ~ '^[0-9]+$'
  `
  const maxid = filas[0]?.maxid
  return maxid != null ? String(maxid) : '0'
}

// Resuelve el NOMBRE canónico del método para un monedaname de TapTap ("Transfer"
// -> "Transferencia"). En el modelo simple el método ya no es una FK del detalle:
// es su nombre. Se sigue creando la entrada en MetodoPago porque el catálogo lo
// usa el módulo de Pagos, pero el detalle solo se lleva el string.
async function resolverMetodoNombre(monedaname, cacheMetodos) {
  if (cacheMetodos.has(monedaname)) return cacheMetodos.get(monedaname)
  const existentes = await prisma.metodoPago.findMany({ select: { id: true, nombre: true } })
  const { nombre, existenteId } = resolverMetodo(monedaname, existentes)
  if (!existenteId) {
    await prisma.metodoPago.upsert({ where: { nombre }, create: { nombre }, update: {} })
  }
  cacheMetodos.set(monedaname, nombre)
  return nombre
}

// Resuelve (o crea) el DetalleTipo para un nombre, scopeado por id_app.
// Devuelve también el TIPO explícito que le corresponde al detalle: en el
// modelo simple cada fila lleva cobro/gasto/informativo escrito, así que el rol
// que antes se calculaba al LEER (clasificación del catálogo, o cobro si no
// hay) ahora se fija al ESCRIBIR — misma regla, otro momento.
async function resolverDetalleTipo(nombre, id_app, cacheDetalleTipos) {
  const key = `${id_app}|${nombre}`
  if (cacheDetalleTipos.has(key)) return cacheDetalleTipos.get(key)
  const dt = await prisma.detalleTipo.upsert({
    where: { nombre_id_app: { nombre, id_app } },
    create: { nombre, id_app },
    update: {},
    select: { id: true, clasificacion: true },
  })
  const resuelto = { id: dt.id, tipo: ROL_POR_CLASIFICACION[dt.clasificacion] ?? 'cobro' }
  cacheDetalleTipos.set(key, resuelto)
  return resuelto
}

async function procesarLocal(local, cacheMetodos, cacheDetalleTipos) {
  const local_db = await prisma.local.findUnique({ where: { id: local.id_local }, select: { id_app: true } })
  if (!local_db) throw new Error(`Local ${local.id_local} no existe en la base`)

  const maxId = await obtenerMaxId(local.id_local)
  const resp = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-secret': API_SECRET },
    body: JSON.stringify({ maxperiodid: maxId, tienda: local.groupId, tabla: 'turnos' }),
  })
  if (!resp.ok) {
    // El 400 pelado no distingue "Ratelimit superado" de "No autorizado": el
    // cuerpo sí, y sin él el diagnóstico del 2026-08-16 hubiera sido a ciegas.
    const cuerpo = await resp.text().catch(() => '')
    throw new Error(`API TapTap respondió ${resp.status}${cuerpo ? `: ${cuerpo.slice(0, 200)}` : ''}`)
  }
  const json = await resp.json()
  // El rate limit y otros rechazos vienen como {status:'error', msg} -- sin
  // esto, un "Ratelimit superado" pasaría por "0 turnos nuevos" y el hueco
  // quedaría invisible hasta que el local supere los 10 turnos de la ventana.
  if (json.status === 'error') throw new Error(`API TapTap: ${json.msg}`)
  const turnos = json.turnos || []

  let turnosNuevos = 0
  for (const turno of turnos) {
    // El turno abierto todavía va a cambiar: si se inserta ahora, el dedup por
    // id_externo bloquea la versión definitiva cuando cierre.
    if (esTurnoAbierto(turno)) continue
    const yaExiste = await prisma.caja.findFirst({
      where: { id_local: local.id_local, id_externo: String(turno.turnoid ?? turno.id) },
      select: { id: true },
    })
    if (yaExiste) continue // idempotencia: turno ya sincronizado, se saltea completo

    const { caja, movimientos, detallesSiempre, detallesSiOcurren } = mapTurno(turno)
    if (!caja.fecha_inicio) continue // turno sin fecha válida, no se puede crear

    // MODELO SIMPLE (DEV-82): los movimientos de TapTap ya no se escriben como
    // CajaMovimiento — nacen directamente como detalles de tres tipos, con la
    // MISMA regla que convirtió los históricos (lib/movimientoADetalle.js). El
    // método de pago deja de ser una FK: es el nombre del detalle. La cantidad
    // (el groupCount: 23 cobros con Crédito) viaja igual.
    const detallesDeMovimientos = []
    for (const m of movimientos) {
      const metodo = await resolverMetodoNombre(m.monedaname, cacheMetodos)
      const c = movimientoADetalle({ tipo: m.tipo, metodo })
      detallesDeMovimientos.push({ tipo: c.tipo, nombre: c.nombre, monto: String(m.monto), cantidad: m.cantidad })
    }

    const detalles = [...detallesSiempre, ...detallesSiOcurren]
    const detallesConTipo = []
    for (const d of detalles) {
      const { id: id_tipo, tipo } = await resolverDetalleTipo(d.nombre, local_db.id_app, cacheDetalleTipos)
      detallesConTipo.push({ id_tipo, tipo, nombre: d.nombre, monto: String(d.monto) })
    }

    await prisma.caja.create({
      data: {
        ...caja,
        id_local: local.id_local,
        origin: 'TAPTAP',
        detalles: { create: [...detallesDeMovimientos, ...detallesConTipo] },
      },
    })
    turnosNuevos++
  }

  return { turnosNuevos }
}

// Sin argumentos procesa todos los locales (lo que hace el Cloud Run Job).
// Con argumentos, sólo esos groupId: `node taptap-sync.js luckylouis` -- sirve
// para el alta de un local nuevo sin tocar el resto.
function localesAProcesar() {
  const filtro = process.argv.slice(2)
  if (!filtro.length) return LOCALES_TAPTAP
  const elegidos = LOCALES_TAPTAP.filter((l) => filtro.includes(l.groupId))
  const desconocidos = filtro.filter((g) => !LOCALES_TAPTAP.some((l) => l.groupId === g))
  if (desconocidos.length) throw new Error(`groupId no configurado: ${desconocidos.join(', ')}`)
  return elegidos
}

async function main() {
  if (!API_SECRET) throw new Error('Falta TAPTAP_API_SECRET (la API nueva exige x-api-secret)')
  const locales = localesAProcesar()
  if (locales.length !== LOCALES_TAPTAP.length) {
    console.log(`Corrida parcial: ${locales.map((l) => l.groupId).join(', ')}`)
  }
  const run = await prisma.tapTapSyncRun.create({ data: {} })
  const cacheMetodos = new Map()
  const cacheDetalleTipos = new Map()
  const resultado = {}
  let ok = true
  let primero = true

  for (const local of locales) {
    if (!primero) await new Promise((r) => setTimeout(r, RATE_MS))
    primero = false
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
