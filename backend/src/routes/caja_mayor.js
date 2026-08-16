// Caja Mayor — reemplazo del AppSheet DC-CAJA MAYOR (app CM-PERROS-334067).
//
// A diferencia del resto de gestión NO usa appContext: se ven todos los locales
// de todos los grupos a la vez, que es como se usa la app vieja (la maneja una
// persona en DC que filtra por local desde adentro). Por eso el guard es
// authenticate + can('caja_mayor', ...) sin X-App-Id: can() sin appContext
// evalúa el OR de todos los roles del usuario más el override individual.
//
// Quién entra: super_admin siempre (bypass de can(), sin recorte), y los
// usuarios puntuales a los que se les concede el módulo `caja_mayor` por
// UserPermission (checkbox en Admin → Usuarios) — ningún rol lo trae de fábrica
// (ver MATRIX en prisma/seed.js). Para esos usuarios TODO se recorta a sus
// locales asignados, juntando todas sus apps (ver lib/localesDelUsuario.js).
//
// Cuando se carga un Pago de tipo CM, gestión lo copia acá con estado ENVIADA
// (ver copiarPagoACajaMayor en routes/pagos.js). Este módulo gestiona esa copia:
// confirma la recepción y agrega los movimientos que no vienen de gestión. Ver el
// modelo MovimientoCM en schema.prisma y la regla del signo en lib/cajaMayor.js.
//
// No hay endpoints de cambio de moneda: la tabla CAMBIO de la app vieja quedó con
// cero filas en dos años. La caja en dólares sí existe, y se resuelve con la
// columna `moneda` de movimientos_cm.

import {
  normalizarMovimiento, datosCopiaDePago, vaACajaMayor,
  saldoDeAgregados, saldosDeAgregados, validarLargos,
} from '../lib/cajaMayor.js'
import { localesDelUsuario } from '../lib/localesDelUsuario.js'

const MONEDAS = ['ARS', 'USD', 'EUR', 'BRL']
const ESTADOS = ['ENVIADA', 'RECIBIDA']
// Los que se cargan a mano en el módulo. PAGO no está: esas llegan de gestión.
const ORIGENES_MANUALES = ['PROPIO', 'APERTURA']

// De la op original solo se lee lo que hace falta para rastrearla y para detectar
// que la copia quedó desfasada; los datos del movimiento salen de la copia.
//
// Cada relación anidada es un roundtrip más: Prisma no hace un JOIN, hace una query
// por nivel. Con rubcat->rubro y rubcat->categoria adentro, una página de 100 filas
// costaba 7 queries. Rubro y categoría se resuelven aparte, en una sola consulta
// para toda la página (ver conRubCat), y esto baja a 4.
const MOV_INCLUDE = {
  pago: { select: { id: true, nro_ord: true, importe: true, foto_url: true, pdf_url: true, id_rubcat: true } },
  local: { select: { id: true, nombre: true, app: { select: { nombre: true } } } },
  receptor: { select: { id: true, nombre: true } },
}

// Resuelve rubro y categoría de los pagos de una página en UNA consulta, en vez de
// dos roundtrips anidados por fila. Devuelve las filas con `pago.rubcat` armado, que
// es lo que espera normalizarMovimiento.
async function conRubCat(fastify, filas) {
  const ids = [...new Set(filas.map(f => f.pago?.id_rubcat).filter(Boolean))]
  if (!ids.length) return filas
  const rubcats = await fastify.db.rubCat.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      rubro: { select: { nombre: true } },
      categoria: { select: { nombre: true } },
    },
  })
  const porId = new Map(rubcats.map(r => [r.id, r]))
  return filas.map(f => f.pago?.id_rubcat
    ? { ...f, pago: { ...f.pago, rubcat: porId.get(f.pago.id_rubcat) ?? null } }
    : f)
}

// Rango de fechas en hora de Argentina (offset fijo -03:00), igual que
// activity_log y reportes: un "desde 2026-08-01" es el 1 a las 00:00 de acá, no
// de UTC. Ver lib/dates.js y el incidente de fechas corridas de julio.
function rangoFechas(desde, hasta) {
  if (!desde && !hasta) return undefined
  return {
    ...(desde ? { gte: new Date(`${desde}T00:00:00.000-03:00`) } : {}),
    ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999-03:00`) } : {}),
  }
}

// El filtro, en un solo lugar: lo comparten el listado y las sumas, así la página
// que se ve y el saldo que se muestra nunca describen conjuntos distintos.
function whereMovimientos({ id_local, id_app, moneda, estado, desde, hasta, origen, allowed }) {
  const fecha = rangoFechas(desde, hasta)
  return {
    // Un local suelto, o todos los locales de un grupo. `id_local` gana si vienen
    // los dos: es el filtro más específico.
    ...(id_local ? { id_local } : id_app ? { local: { id_app } } : {}),
    // Recorte por usuario (allowed=null es super_admin/dcsmart: sin recorte).
    // Cuando viene id_local ya se validó contra allowed antes de armar el where,
    // así que acá solo aplica al caso sin local puntual.
    ...(allowed && !id_local ? { id_local: { in: allowed } } : {}),
    ...(moneda ? { moneda } : {}),
    ...(estado ? { estado } : {}),
    ...(origen ? { origen } : {}),
    ...(fecha ? { fecha } : {}),
  }
}

// Una página de movimientos. Paginado a propósito: sin esto el listado devolvía las
// 3549 filas de una vez -- 2 MB de JSON -- y el navegador se colgaba al renderizar
// la tabla. El saldo NO sale de estas filas, se calcula aparte sobre el total.
async function traerPagina(fastify, filtros, { page = 1, limit = 100 } = {}) {
  const take = Number(limit) > 0 ? Number(limit) : 100
  const skip = (Math.max(1, Number(page)) - 1) * take
  const filas = await fastify.db.movimientoCM.findMany({
    where: whereMovimientos(filtros),
    include: MOV_INCLUDE,
    orderBy: [{ fecha: 'desc' }, { created_at: 'desc' }],
    skip, take,
  })
  return (await conRubCat(fastify, filas)).map(normalizarMovimiento)
}

export default async function cajaMayorRoutes(fastify) {
  // Sin appContext a propósito: el módulo es global, no por app activa.
  // can() sin appContext evalúa el OR de todos los roles + el override
  // individual (UserPermission); super_admin bypasea.
  const ver    = [fastify.authenticate, fastify.can('caja_mayor', 'view')]
  const crear  = [fastify.authenticate, fastify.can('caja_mayor', 'create')]
  const editar = [fastify.authenticate, fastify.can('caja_mayor', 'edit')]
  const borrar = [fastify.authenticate, fastify.can('caja_mayor', 'delete')]

  // Locales a los que llega quien pregunta: null = sin recorte (super_admin /
  // dcsmart, comportamiento histórico del módulo), lista = solo esos.
  const localesPermitidos = (request) => localesDelUsuario(fastify.db, request.user.id)
  const puedeTocarLocal = (allowed, id_local) => allowed == null || allowed.includes(id_local)
  const FUERA_DE_TUS_LOCALES = 'Ese local no está entre los que tenés asignados'

  // Valida que el local exista, para no escribir movimientos huérfanos.
  async function localValido(id_local) {
    if (!id_local) return false
    const local = await fastify.db.local.findUnique({ where: { id: id_local }, select: { id: true } })
    return Boolean(local)
  }

  // ── GET / ── listado de movimientos ─────────────────────────────────────
  fastify.get('/', { preHandler: ver }, async (request, reply) => {
    const { id_local, id_app, moneda, estado, desde, hasta, origen, page = 1, limit = 100 } = request.query

    if (moneda && !MONEDAS.includes(moneda)) {
      return reply.code(400).send({ error: `moneda debe ser una de: ${MONEDAS.join(', ')}` })
    }
    if (estado && !ESTADOS.includes(estado)) {
      return reply.code(400).send({ error: `estado debe ser ENVIADA o RECIBIDA` })
    }

    const allowed = await localesPermitidos(request)
    if (id_local && !puedeTocarLocal(allowed, id_local)) {
      return reply.code(403).send({ error: FUERA_DE_TUS_LOCALES })
    }

    const filtros = { id_local, id_app, moneda, estado, desde, hasta, origen, allowed }
    const where = whereMovimientos(filtros)

    // El saldo se agrega en SQL sobre TODO el conjunto filtrado, no sobre la página:
    // si saliera de las filas visibles, cambiaría al pasar de página.
    const [movimientos, total, agregados] = await Promise.all([
      traerPagina(fastify, filtros, { page, limit }),
      fastify.db.movimientoCM.count({ where }),
      fastify.db.movimientoCM.groupBy({
        by: ['ingreso', 'estado'], where, _sum: { importe: true },
      }),
    ])

    // Se manda con y sin lo pendiente: "cuánto hay" y "cuánto va a haber" son dos
    // preguntas distintas y las dos se miran.
    return {
      movimientos,
      total,
      page: Math.max(1, Number(page)),
      limit: Number(limit) > 0 ? Number(limit) : 100,
      ...saldoDeAgregados(agregados),
    }
  })

  // ── GET /saldos ── vista consolidada por local y moneda ─────────────────
  fastify.get('/saldos', { preHandler: ver }, async (request, reply) => {
    const { moneda, desde, hasta, id_app, id_local } = request.query
    if (moneda && !MONEDAS.includes(moneda)) {
      return reply.code(400).send({ error: `moneda debe ser una de: ${MONEDAS.join(', ')}` })
    }
    const allowed = await localesPermitidos(request)
    if (id_local && !puedeTocarLocal(allowed, id_local)) {
      return reply.code(403).send({ error: FUERA_DE_TUS_LOCALES })
    }
    const where = whereMovimientos({ moneda, desde, hasta, id_app, id_local, allowed })

    // Agregado en SQL: antes traía las 3766 filas para sumarlas en JS y tardaba ~2 s.
    const [agregados, total] = await Promise.all([
      fastify.db.movimientoCM.groupBy({
        by: ['id_local', 'moneda', 'ingreso', 'estado'],
        where, _sum: { importe: true }, _count: { _all: true },
      }),
      fastify.db.movimientoCM.count({ where }),
    ])

    // Los nombres de local y grupo no vienen en un groupBy: se piden aparte, solo
    // para los locales que aparecieron.
    const ids = [...new Set(agregados.map(a => a.id_local))]
    const locales = ids.length
      ? await fastify.db.local.findMany({
        where: { id: { in: ids } },
        select: { id: true, nombre: true, app: { select: { nombre: true } } },
      })
      : []
    const nombres = new Map(locales.map(l => [l.id, { local: l.nombre, grupo: l.app?.nombre ?? null }]))

    return { saldos: saldosDeAgregados(agregados, nombres), total_movimientos: total }
  })

  // ── POST / ── cargar un movimiento propio ───────────────────────────────
  fastify.post('/', { preHandler: crear }, async (request, reply) => {
    const {
      id_local, origen = 'PROPIO', moneda = 'ARS', fecha, importe, ingreso,
      recibe, extrae, fecha_extraccion, observaciones, estado = 'ENVIADA',
    } = request.body ?? {}

    if (!ORIGENES_MANUALES.includes(origen)) {
      return reply.code(400).send({ error: `origen debe ser ${ORIGENES_MANUALES.join(' o ')}` })
    }
    if (!MONEDAS.includes(moneda)) {
      return reply.code(400).send({ error: `moneda debe ser una de: ${MONEDAS.join(', ')}` })
    }
    if (!ESTADOS.includes(estado)) {
      return reply.code(400).send({ error: 'estado debe ser ENVIADA o RECIBIDA' })
    }
    if (!await localValido(id_local)) {
      return reply.code(400).send({ error: 'Falta el local o no existe' })
    }
    const allowed = await localesPermitidos(request)
    if (!puedeTocarLocal(allowed, id_local)) {
      return reply.code(403).send({ error: FUERA_DE_TUS_LOCALES })
    }
    if (!fecha) return reply.code(400).send({ error: 'La fecha es obligatoria' })
    if (!(Number(importe) > 0)) {
      return reply.code(400).send({ error: 'El importe tiene que ser mayor a cero' })
    }
    // La dirección no se adivina: quien carga el movimiento la elige.
    if (typeof ingreso !== 'boolean') {
      return reply.code(400).send({ error: 'Elegí si el movimiento es un ingreso o un egreso' })
    }
    const largo = validarLargos({ observaciones, recibe, extrae })
    if (largo) return reply.code(400).send({ error: largo })

    // Un solo saldo de apertura por local y moneda: dos serían dos verdades.
    if (origen === 'APERTURA') {
      const yaHay = await fastify.db.movimientoCM.findFirst({
        where: { id_local, moneda, origen: 'APERTURA' }, select: { id: true },
      })
      if (yaHay) {
        return reply.code(409).send({ error: `Ese local ya tiene un saldo de apertura en ${moneda}` })
      }
    }

    const creado = await fastify.db.movimientoCM.create({
      data: {
        id_local, origen, moneda,
        fecha: new Date(fecha),
        importe: Math.abs(Number(importe)),
        ingreso,
        estado,
        recibe: recibe || null,
        extrae: extrae || null,
        fecha_extraccion: fecha_extraccion ? new Date(fecha_extraccion) : null,
        observaciones: observaciones || null,
        ...(estado === 'RECIBIDA' ? { recibida_at: new Date(), recibida_by: request.user.id } : {}),
        created_by: request.user.id,
      },
      include: MOV_INCLUDE,
    })
    return reply.code(201).send(normalizarMovimiento(creado))
  })

  // ── PATCH /:id ── editar un movimiento propio ───────────────────────────
  fastify.patch('/:id', { preHandler: editar }, async (request, reply) => {
    const { id } = request.params
    const actual = await fastify.db.movimientoCM.findUnique({ where: { id } })
    if (!actual) return reply.code(404).send({ error: 'Movimiento no encontrado' })
    const allowed = await localesPermitidos(request)
    if (!puedeTocarLocal(allowed, actual.id_local)) {
      return reply.code(403).send({ error: FUERA_DE_TUS_LOCALES })
    }
    if (actual.origen === 'PAGO') {
      return reply.code(400).send({
        error: 'Esta op vino de gestión: su importe y fecha se corrigen en Pagos. Acá solo se cambia el estado.',
      })
    }
    const { fecha, importe, ingreso, recibe, extrae, fecha_extraccion, observaciones, moneda } = request.body ?? {}
    if (moneda && !MONEDAS.includes(moneda)) {
      return reply.code(400).send({ error: `moneda debe ser una de: ${MONEDAS.join(', ')}` })
    }
    if (importe !== undefined && !(Number(importe) > 0)) {
      return reply.code(400).send({ error: 'El importe tiene que ser mayor a cero' })
    }
    const largoPatch = validarLargos({ observaciones, recibe, extrae })
    if (largoPatch) return reply.code(400).send({ error: largoPatch })

    const actualizado = await fastify.db.movimientoCM.update({
      where: { id },
      data: {
        ...(moneda !== undefined ? { moneda } : {}),
        ...(fecha !== undefined ? { fecha: fecha ? new Date(fecha) : null } : {}),
        ...(importe !== undefined ? { importe: Math.abs(Number(importe)) } : {}),
        ...(typeof ingreso === 'boolean' ? { ingreso } : {}),
        ...(recibe !== undefined ? { recibe: recibe || null } : {}),
        ...(extrae !== undefined ? { extrae: extrae || null } : {}),
        ...(fecha_extraccion !== undefined
          ? { fecha_extraccion: fecha_extraccion ? new Date(fecha_extraccion) : null } : {}),
        ...(observaciones !== undefined ? { observaciones: observaciones || null } : {}),
      },
      include: MOV_INCLUDE,
    })
    return normalizarMovimiento(actualizado)
  })

  // ── PUT /estado ── marcar ENVIADA / RECIBIDA ────────────────────────────
  //
  // Sirve para las dos procedencias. Para una op de gestión es un upsert: la fila
  // de movimientos_cm se crea recién acá, la primera vez que alguien la gestiona.
  fastify.put('/estado', { preHandler: editar }, async (request, reply) => {
    const { id, id_pago, estado, recibe, extrae, fecha_extraccion, observaciones, ingreso } = request.body ?? {}

    if (!ESTADOS.includes(estado)) {
      return reply.code(400).send({ error: 'estado debe ser ENVIADA o RECIBIDA' })
    }
    if (!id && !id_pago) {
      return reply.code(400).send({ error: 'Falta id o id_pago' })
    }
    const largoEstado = validarLargos({ observaciones, recibe, extrae })
    if (largoEstado) return reply.code(400).send({ error: largoEstado })

    const allowed = await localesPermitidos(request)

    // Al volver a ENVIADA se limpia quién la recibió: si no, quedaría la marca de
    // una recepción que se dio de baja.
    const marca = estado === 'RECIBIDA'
      ? { recibida_at: new Date(), recibida_by: request.user.id }
      : { recibida_at: null, recibida_by: null }

    const campos = {
      estado,
      ...marca,
      ...(recibe !== undefined ? { recibe: recibe || null } : {}),
      ...(extrae !== undefined ? { extrae: extrae || null } : {}),
      ...(fecha_extraccion !== undefined
        ? { fecha_extraccion: fecha_extraccion ? new Date(fecha_extraccion) : null } : {}),
      ...(observaciones !== undefined ? { observaciones: observaciones || null } : {}),
      // Corregir a mano la dirección que dedujo la regla. `direccion_manual` es lo
      // que hace que la sincronización con el pago no la vuelva a pisar.
      ...(typeof ingreso === 'boolean' ? { ingreso, direccion_manual: true } : {}),
    }

    if (id) {
      const existe = await fastify.db.movimientoCM.findUnique({ where: { id }, select: { id: true, id_local: true } })
      if (!existe) return reply.code(404).send({ error: 'Movimiento no encontrado' })
      if (!puedeTocarLocal(allowed, existe.id_local)) {
        return reply.code(403).send({ error: FUERA_DE_TUS_LOCALES })
      }
      const actualizado = await fastify.db.movimientoCM.update({
        where: { id }, data: campos, include: MOV_INCLUDE,
      })
      return normalizarMovimiento(actualizado)
    }

    // Por id_pago. Normalmente la copia ya existe (la crea gestión al cargar la
    // op), pero se hace upsert igual: si una copia no se escribió --deploy viejo,
    // op cargada antes de que existiera el módulo-- el módulo no queda trabado.
    const pago = await fastify.db.pago.findUnique({
      where: { id: id_pago },
      select: {
        id: true, id_tipo: true, id_local: true, fecha: true, importe: true,
        ingresa_egreso: true, observaciones: true,
        rubcat: { select: { rubro: { select: { nombre: true } } } },
      },
    })
    if (!pago) return reply.code(404).send({ error: 'La op no existe en gestión' })
    if (!vaACajaMayor(pago)) {
      return reply.code(400).send({
        error: pago.id_tipo !== 'CM' ? 'Esa op no es de tipo CM' : 'La op no tiene local asignado en gestión',
      })
    }
    // Por id_pago el local sale del PAGO: la fila de movimientos_cm puede no
    // existir todavía (el upsert de abajo la crea).
    if (!puedeTocarLocal(allowed, pago.id_local)) {
      return reply.code(403).send({ error: FUERA_DE_TUS_LOCALES })
    }

    const guardado = await fastify.db.movimientoCM.upsert({
      where: { id_pago },
      update: campos,
      create: { ...datosCopiaDePago(pago), ...campos, created_by: request.user.id },
      include: MOV_INCLUDE,
    })
    return normalizarMovimiento(guardado)
  })

  // ── DELETE /:id ── borrar un movimiento propio ──────────────────────────
  fastify.delete('/:id', { preHandler: borrar }, async (request, reply) => {
    const { id } = request.params
    const actual = await fastify.db.movimientoCM.findUnique({ where: { id } })
    if (!actual) return reply.code(404).send({ error: 'Movimiento no encontrado' })
    const allowed = await localesPermitidos(request)
    if (!puedeTocarLocal(allowed, actual.id_local)) {
      return reply.code(403).send({ error: FUERA_DE_TUS_LOCALES })
    }
    if (actual.origen === 'PAGO') {
      return reply.code(400).send({
        error: 'No se borra desde acá: la op vive en gestión. Si no va a la caja mayor, cambiale el tipo en Pagos.',
      })
    }
    await fastify.db.movimientoCM.delete({ where: { id } })
    return { ok: true }
  })

  // ── GET /locales ── locales con su grupo, para los selectores ───────────
  //
  // No se reusa /api/locales porque esa ruta es scoped a la app activa y acá se
  // necesitan todos los grupos juntos.
  fastify.get('/locales', { preHandler: ver }, async (request, reply) => {
    // Con recorte, los selectores solo ofrecen los locales del usuario (y por
    // ende solo los grupos que contengan alguno de ellos).
    const allowed = await localesPermitidos(request)
    const locales = await fastify.db.local.findMany({
      where: { activo: true, ...(allowed ? { id: { in: allowed } } : {}) },
      select: { id: true, nombre: true, app: { select: { id: true, nombre: true } } },
      orderBy: [{ app: { nombre: 'asc' } }, { nombre: 'asc' }],
    })
    // Se devuelven también los grupos, con su id: el selector permite elegir un
    // grupo entero (que filtra por id_app) o uno de sus locales.
    const grupos = []
    const vistos = new Set()
    for (const l of locales) {
      if (!l.app || vistos.has(l.app.id)) continue
      vistos.add(l.app.id)
      grupos.push({ id: l.app.id, nombre: l.app.nombre })
    }
    return {
      locales: locales.map(l => ({ id: l.id, nombre: l.nombre, grupo: l.app?.nombre ?? null, id_app: l.app?.id ?? null })),
      grupos,
    }
  })
}
