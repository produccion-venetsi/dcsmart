// backend/src/jobs/fudo-sync.js
// Arma las cajas de DCSmart a partir de las ventas de Fudo. Corre como Cloud Run
// Job vía Cloud Scheduler, 7am diario (una hora despues del corte de las 06:00).
//
// Uso local: DATABASE_URL=... FUDO_API_KEY_GRISGRIS=... FUDO_API_SECRET_GRISGRIS=... node src/jobs/fudo-sync.js
// (el sufijo es el envSufijo de cada local en LOCALES_FUDO, no hay variable generica)
// Un solo local:  node src/jobs/fudo-sync.js LTRXNBIR
'use strict'
import { PrismaClient } from '@prisma/client'
import { crearCliente } from './fudo/api.js'
import { diasAProcesar, ventanaDia } from './fudo/dias.js'
import { resolverMetodos } from './fudo/metodos.js'
import { mapDia, esMovimientoDelJob, DETALLES_SIEMPRE } from './fudo/mapping.js'
import { CATALOGO_ESTANDAR_DETALLE_TIPOS } from '../lib/detalleTiposEstandar.js'

// Clasificacion que le corresponde a cada nombre segun el catalogo estandar
// (el que se siembra a toda app nueva). Si el nombre no esta en el catalogo
// (caso de 'Tarjetas', propio del job), se cae en 'informativo'.
const CLASIFICACION_POR_NOMBRE = new Map(
  CATALOGO_ESTANDAR_DETALLE_TIPOS.map((t) => [t.nombre, t.clasificacion])
)
const clasificacionDe = (nombre) => CLASIFICACION_POR_NOMBRE.get(nombre) ?? 'informativo'

const prisma = new PrismaClient()

// Cada local es una cuenta aparte de Fudo: la API no tiene concepto de sucursal,
// asi que cada uno trae su propio par de credenciales desde el entorno.
const LOCALES_FUDO = [
  { nombre: 'GRIS GRIS', id_local: 'LTRXNBIR', horaCorte: 6, envSufijo: 'GRISGRIS' },
  { nombre: 'CONDARCO', id_local: 'ltuibyvty', horaCorte: 6, envSufijo: 'CONDARCO' },
]

// Cuantos dias se reprocesan en cada corrida. Un dia ya cerrado puede recibir
// una venta tardia o una anulacion, cosa que TapTap (que avanza por maxid y
// nunca vuelve) no necesitaba contemplar.
const DIAS_A_REPROCESAR = 4

// Sin fallback a una variable generica: con 14 locales, si a uno le falta su
// secret y existe un FUDO_API_KEY sin sufijo, el job no fallaba -- leia la
// cuenta de Fudo de OTRO local y escribia esas ventas bajo el id_local
// equivocado, con pinta de datos normales. Mejor romper con un mensaje que
// diga exactamente que variable falta.
function credenciales(local) {
  const keyVar = `FUDO_API_KEY_${local.envSufijo}`
  const secretVar = `FUDO_API_SECRET_${local.envSufijo}`
  const apiKey = process.env[keyVar]
  const apiSecret = process.env[secretVar]
  if (!apiKey) throw new Error(`Falta ${keyVar} para el local ${local.nombre}`)
  if (!apiSecret) throw new Error(`Falta ${secretVar} para el local ${local.nombre}`)
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

  // Reproceso: se reemplaza SOLO lo que escribe el job. INICIAL/RETIRO/VACIADO
  // (y tambien INGRESO) sobreviven porque Fudo no los expone -- son la carga
  // manual del encargado. OJO: la proteccion es por TIPO, no por quien lo
  // creo. Si alguien carga a mano un COBRO o un GASTO en una caja de Fudo, el
  // reproceso se lo lleva igual: no hay forma de distinguir su origen.
  const existentes = await prisma.cajaMovimiento.findMany({
    where: { id_caja: previa.id },
    select: { id: true, tipo: true },
  })
  const aBorrar = existentes.filter((m) => esMovimientoDelJob(m.tipo)).map((m) => m.id)

  await prisma.$transaction([
    // Cinturon y tirantes: el filtro por tipo va tambien en la clausula del
    // deleteMany, para que un refactor del findMany de arriba no lo convierta
    // en un borrado sin techo.
    prisma.cajaMovimiento.deleteMany({
      where: { id: { in: aBorrar }, id_caja: previa.id, tipo: { in: ['COBRO', 'GASTO'] } },
    }),
    // Igual que con los movimientos: solo se tocan los detalles que escribe
    // el job (DETALLES_SIEMPRE). Un CajaDetalle puede llevar id_cliente y ser
    // una linea de cuenta corriente -- plata anotada en la cuenta de alguien
    // -- y borrar todos los detalles de la caja la haria desaparecer sin
    // rastro en la proxima corrida.
    prisma.cajaDetalle.deleteMany({ where: { id_caja: previa.id, nombre: { in: DETALLES_SIEMPRE } } }),
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
  const errores = []
  // Metodos de pago que no matchearon ningun MetodoPago existente (ni por
  // alias de nombre, ni por code, ni por nombre normalizado): quedaron bajo
  // "Metodo desconocido". Ya no aborta el local -- la plata entra igual y
  // esto queda como rastro para ir a clasificarlos a mano.
  const metodosSinResolver = []
  // La ventana de reproceso es de 4 dias: un dia que falla (un 500 de Fudo)
  // y aborta los dias siguientes puede dejarlos sin sincronizar para siempre
  // si el problema tarda mas de 4 dias en resolverse. Por eso el try/catch es
  // POR DIA: uno que falla se registra y se sigue con el resto.
  for (const fecha of diasAProcesar(new Date(), DIAS_A_REPROCESAR, local.horaCorte)) {
    try {
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

      const { porCode, sinResolver } = resolverMetodos(armado.metodos, metodosExistentes)
      if (sinResolver.length) {
        // Un PaymentMethod puede no venir en el `included` de la respuesta: el
        // code (y a veces el name) quedan undefined, y ese es justo el caso
        // mas dificil de diagnosticar si se muestra como string vacio.
        for (const m of sinResolver) {
          console.warn(`[${local.nombre}] ${fecha}: método de pago sin equivalente -- code="${m.code ?? '(sin code)'}" name="${m.name ?? '(sin nombre)'}" -> se carga bajo "Metodo desconocido"`)
        }
        metodosSinResolver.push(...sinResolver.map((m) => ({ fecha, code: m.code ?? null, name: m.name ?? null })))
      }

      const tiposPorNombre = new Map()
      for (const d of armado.detalles) {
        const dt = await prisma.detalleTipo.upsert({
          where: { nombre_id_app: { nombre: d.nombre, id_app: local_db.id_app } },
          create: { nombre: d.nombre, id_app: local_db.id_app, clasificacion: clasificacionDe(d.nombre) },
          update: {},
        })
        tiposPorNombre.set(d.nombre, dt.id)
      }

      const r = await escribirCaja({ local, armado, metodosPorCode: porCode, tiposPorNombre })
      if (r === 'nueva') nuevas++
      else actualizadas++
    } catch (err) {
      errores.push({ fecha, error: err.message })
    }
  }

  return { cajasNuevas: nuevas, cajasActualizadas: actualizadas, diasSinVentas: sinVentas, errores, metodosSinResolver }
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
      // Dias individuales que fallaron (ver el try/catch por dia en
      // procesarLocal) no interrumpen el local, pero la corrida no es "ok":
      // esos dias quedan pendientes para la proxima ventana de reproceso.
      if (r.errores.length) ok = false
      console.log(`[${local.nombre}] ${r.cajasNuevas} nuevas, ${r.cajasActualizadas} actualizadas, ${r.diasSinVentas} días sin ventas, ${r.errores.length} día(s) con error, ${r.metodosSinResolver.length} método(s) sin resolver`)
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

  // Sin esto, un local que fallo entero dejaba el proceso en exit 0: Cloud Run
  // reporta SUCCESS y ninguna alerta se dispara. El detalle del error queda en
  // `resultado`, pero nadie lo mira si nada avisa que hay que mirarlo.
  if (!ok) process.exitCode = 1
}

main()
  .catch((e) => { console.error('ERROR FATAL:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
