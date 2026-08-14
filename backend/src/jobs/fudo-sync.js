// backend/src/jobs/fudo-sync.js
// Arma las cajas de DCSmart a partir de las ventas de Fudo. Corre como Cloud Run
// Job vía Cloud Scheduler, 7am diario (una hora despues del corte de las 06:00).
//
// Uso local: DATABASE_URL=... FUDO_API_KEY=... FUDO_API_SECRET=... node src/jobs/fudo-sync.js
// Un solo local:  node src/jobs/fudo-sync.js LTRXNBIR
'use strict'
import { PrismaClient } from '@prisma/client'
import { crearCliente } from './fudo/api.js'
import { diasAProcesar, ventanaDia } from './fudo/dias.js'
import { resolverMetodos } from './fudo/metodos.js'
import { mapDia, esMovimientoDelJob } from './fudo/mapping.js'

const prisma = new PrismaClient()

// Cada local es una cuenta aparte de Fudo: la API no tiene concepto de sucursal,
// asi que cada uno trae su propio par de credenciales desde el entorno.
const LOCALES_FUDO = [
  { nombre: 'GRIS GRIS', id_local: 'LTRXNBIR', horaCorte: 6, envSufijo: 'GRISGRIS' },
]

// Cuantos dias se reprocesan en cada corrida. Un dia ya cerrado puede recibir
// una venta tardia o una anulacion, cosa que TapTap (que avanza por maxid y
// nunca vuelve) no necesitaba contemplar.
const DIAS_A_REPROCESAR = 4

function credenciales(local) {
  const apiKey = process.env[`FUDO_API_KEY_${local.envSufijo}`] || process.env.FUDO_API_KEY
  const apiSecret = process.env[`FUDO_API_SECRET_${local.envSufijo}`] || process.env.FUDO_API_SECRET
  if (!apiKey || !apiSecret) throw new Error(`Faltan credenciales de Fudo para ${local.nombre}`)
  return { apiKey, apiSecret }
}

// Crea la caja del dia, o la actualiza conservando lo que cargo el encargado.
async function escribirCaja({ local, armado, metodosPorCode, tiposPorNombre }) {
  const { caja, movimientos, detalles } = armado

  const previa = await prisma.caja.findFirst({
    where: { id_local: local.id_local, id_externo: caja.id_externo, origin: 'FFUDO' },
    select: { id: true },
  })

  const datosMovimientos = movimientos.map((m) => ({
    tipo: m.tipo,
    id_metodo: metodosPorCode.get(m.code),
    monto: m.monto,
    cantidad: m.cantidad,
  }))
  const datosDetalles = detalles.map((d) => ({
    id_tipo: tiposPorNombre.get(d.nombre),
    nombre: d.nombre,
    monto: d.monto,
  }))

  if (!previa) {
    await prisma.caja.create({
      data: {
        ...caja,
        id_local: local.id_local,
        fecha_inicio: new Date(caja.fecha_inicio),
        fecha_cierre: new Date(caja.fecha_cierre),
        movimientos: { create: datosMovimientos },
        detalles: { create: datosDetalles },
      },
    })
    return 'nueva'
  }

  // Reproceso: se reemplaza SOLO lo que escribe el job. Los INICIAL/RETIRO/
  // VACIADO que cargo el encargado se quedan donde estan -- Fudo no los expone,
  // asi que pisarlos seria borrar trabajo de la gente.
  const existentes = await prisma.cajaMovimiento.findMany({
    where: { id_caja: previa.id },
    select: { id: true, tipo: true },
  })
  const aBorrar = existentes.filter((m) => esMovimientoDelJob(m.tipo)).map((m) => m.id)

  await prisma.$transaction([
    prisma.cajaMovimiento.deleteMany({ where: { id: { in: aBorrar } } }),
    prisma.cajaDetalle.deleteMany({ where: { id_caja: previa.id } }),
    prisma.caja.update({
      where: { id: previa.id },
      data: {
        total: caja.total,
        efectivo: caja.efectivo,
        fiscal: caja.fiscal,
        comensales: caja.comensales,
        tickets: caja.tickets,
        cajero: caja.cajero,
        observaciones: caja.observaciones,
        movimientos: { create: datosMovimientos },
        detalles: { create: datosDetalles },
      },
    }),
  ])
  return 'actualizada'
}

async function procesarLocal(local) {
  const local_db = await prisma.local.findUnique({ where: { id: local.id_local }, select: { id_app: true } })
  if (!local_db) throw new Error(`Local ${local.id_local} no existe en la base`)

  const cliente = crearCliente(credenciales(local))
  const metodosExistentes = await prisma.metodoPago.findMany({ select: { id: true, nombre: true } })

  let nuevas = 0, actualizadas = 0, sinVentas = 0
  for (const fecha of diasAProcesar(new Date(), DIAS_A_REPROCESAR, local.horaCorte)) {
    const { desde, hasta } = ventanaDia(fecha, local.horaCorte)
    const ventas = await cliente.ventasDelDia({ desde, hasta })
    const gastos = await cliente.gastosDelDia({ fecha })

    const armado = mapDia({
      ventas: ventas.data,
      incluidos: ventas.included,
      gastos: gastos.data,
      fecha,
      horaCorte: local.horaCorte,
    })
    if (!armado) { sinVentas++; continue }

    const { porCode, faltantes } = resolverMetodos([...armado.codes], metodosExistentes)
    if (faltantes.length) {
      throw new Error(`Métodos de pago de Fudo sin equivalente en DCSmart: ${faltantes.join(', ')}`)
    }

    const tiposPorNombre = new Map()
    for (const d of armado.detalles) {
      const dt = await prisma.detalleTipo.upsert({
        where: { nombre_id_app: { nombre: d.nombre, id_app: local_db.id_app } },
        create: { nombre: d.nombre, id_app: local_db.id_app, clasificacion: 'informativo' },
        update: {},
      })
      tiposPorNombre.set(d.nombre, dt.id)
    }

    const r = await escribirCaja({ local, armado, metodosPorCode: porCode, tiposPorNombre })
    if (r === 'nueva') nuevas++
    else actualizadas++
  }

  return { cajasNuevas: nuevas, cajasActualizadas: actualizadas, diasSinVentas: sinVentas }
}

function localesAProcesar() {
  const filtro = process.argv.slice(2)
  if (!filtro.length) return LOCALES_FUDO
  const elegidos = LOCALES_FUDO.filter((l) => filtro.includes(l.id_local))
  const desconocidos = filtro.filter((f) => !LOCALES_FUDO.some((l) => l.id_local === f))
  if (desconocidos.length) throw new Error(`id_local no configurado: ${desconocidos.join(', ')}`)
  return elegidos
}

async function main() {
  const locales = localesAProcesar()
  const run = await prisma.fudoSyncRun.create({ data: {} })
  const resultado = {}
  let ok = true

  for (const local of locales) {
    try {
      resultado[local.id_local] = await procesarLocal(local)
      const r = resultado[local.id_local]
      console.log(`[${local.nombre}] ${r.cajasNuevas} nuevas, ${r.cajasActualizadas} actualizadas, ${r.diasSinVentas} días sin ventas`)
    } catch (err) {
      ok = false
      resultado[local.id_local] = { error: err.message }
      console.error(`[${local.nombre}] ERROR: ${err.message}`)
    }
  }

  await prisma.fudoSyncRun.update({
    where: { id: run.id },
    data: { finished_at: new Date(), resultado, ok },
  })
  console.log('Sincronización finalizada.', ok ? '(sin errores)' : '(con errores, ver resultado)')
}

main()
  .catch((e) => { console.error('ERROR FATAL:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
