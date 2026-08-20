// Disponibilidades — la plata del local que NO está en el cajón: Mercado Pago,
// dólares, la cuenta del banco. Es lo que se cuenta en el arqueo además del
// efectivo.
//
// Dos cosas distintas viven acá:
//   1. El CATÁLOGO del grupo (qué conceptos existen: "MP a Liquidar", "BBVA").
//   2. Qué tiene ACTIVO cada local — la lista que el arqueo le va a pedir.
//
// La lista por local se define al dar de alta el local y se corrige desde
// Locales: el que cuenta la plata no tiene que acordarse de qué cuentas tiene
// su local, y por eso el arqueo dejó de ofrecerle un combo con todo.
//
// Quién administra: rol operativo del grupo (admin para arriba). Cargar los
// montos en el arqueo es otra cosa y va con el permiso de arqueo.

import { FAMILIAS_DISPONIBILIDAD, ordenarDisponibilidades } from '../lib/disponibilidades.js'

const SELECT_TIPO = { id: true, nombre: true, familia: true, activo: true, orden: true }

export default async function disponibilidadesRoutes(fastify) {
  // Ver el catálogo alcanza con poder ver arqueos: el formulario lo necesita.
  const ver      = [fastify.authenticate, fastify.appContext, fastify.can('arqueo', ['view', 'create'])]
  // Tocarlo es de administración del grupo.
  const admin    = [fastify.authenticate, fastify.appContext, fastify.requireOperativo]

  // El grupo cuyo catálogo se pide. Por defecto el activo, pero con `id_local`
  // manda el grupo de ESE local: un super_admin editando la ficha de un local
  // de otro cliente tiene que ver las cuentas de ese cliente, no las del grupo
  // que tenga seleccionado en la barra.
  async function appDelPedido(request, reply, id_local) {
    if (!id_local) return request.activeAppId
    if (!request.allowedLocalIds.includes(id_local)) {
      reply.code(403).send({ error: 'Sin acceso a ese local' })
      return null
    }
    const local = await fastify.db.local.findUnique({ where: { id: id_local }, select: { id_app: true } })
    if (!local) { reply.code(404).send({ error: 'Local no encontrado' }); return null }
    return local.id_app
  }

  // ── GET / ── el catálogo del grupo ──────────────────────────────────────
  fastify.get('/', { preHandler: ver }, async (request, reply) => {
    const id_app = await appDelPedido(request, reply, request.query.id_local)
    if (!id_app) return
    const todos = request.query.all === '1' || request.query.all === 'true'
    const tipos = await fastify.db.disponibilidadTipo.findMany({
      where: { id_app, ...(todos ? {} : { activo: true }) },
      select: SELECT_TIPO,
    })
    return { familias: FAMILIAS_DISPONIBILIDAD, tipos: ordenarDisponibilidades(tipos) }
  })

  // ── POST / ── agregar un concepto al catálogo ───────────────────────────
  fastify.post('/', { preHandler: admin }, async (request, reply) => {
    const { nombre, familia = 'otro', orden, id_local } = request.body ?? {}
    // Mismo criterio que el GET: si viene de la ficha de un local, la cuenta se
    // crea en el grupo de ese local.
    const id_app = await appDelPedido(request, reply, id_local)
    if (!id_app) return
    const limpio = String(nombre ?? '').trim()
    if (!limpio) return reply.code(400).send({ error: 'Poné un nombre' })
    if (limpio.length > 60) return reply.code(400).send({ error: 'El nombre no puede pasar de 60 caracteres' })
    if (!FAMILIAS_DISPONIBILIDAD.some((f) => f.id === familia)) {
      return reply.code(400).send({ error: 'Familia inválida' })
    }
    try {
      const tipo = await fastify.db.disponibilidadTipo.create({
        data: { id_app, nombre: limpio, familia, orden: Number(orden) || 100 },
        select: SELECT_TIPO,
      })
      return reply.code(201).send(tipo)
    } catch (err) {
      // Único por (nombre, id_app): dos "BBVA" en el mismo grupo serían dos
      // cuentas distintas para el que carga.
      if (err.code === 'P2002') return reply.code(409).send({ error: 'Ya existe una disponibilidad con ese nombre en el grupo' })
      throw err
    }
  })

  // ── PATCH /:id ── renombrar, mover de familia, activar o desactivar ─────
  fastify.patch('/:id', { preHandler: admin }, async (request, reply) => {
    const { nombre, familia, activo, orden } = request.body ?? {}
    const actual = await fastify.db.disponibilidadTipo.findUnique({
      where: { id: request.params.id }, select: { id_app: true },
    })
    if (!actual) return reply.code(404).send({ error: 'No existe' })
    if (actual.id_app !== request.activeAppId) return reply.code(403).send({ error: 'Es de otro grupo' })
    if (familia !== undefined && !FAMILIAS_DISPONIBILIDAD.some((f) => f.id === familia)) {
      return reply.code(400).send({ error: 'Familia inválida' })
    }
    const tipo = await fastify.db.disponibilidadTipo.update({
      where: { id: request.params.id },
      data: {
        ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
        ...(familia !== undefined ? { familia } : {}),
        ...(typeof activo === 'boolean' ? { activo } : {}),
        ...(orden !== undefined ? { orden: Number(orden) || 100 } : {}),
      },
      select: SELECT_TIPO,
    })
    return tipo
  })

  // ── GET /local/:id_local ── qué tiene activo ese local ──────────────────
  fastify.get('/local/:id_local', { preHandler: ver }, async (request, reply) => {
    const { id_local } = request.params
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const filas = await fastify.db.localDisponibilidad.findMany({
      where: { id_local },
      include: { tipo: { select: SELECT_TIPO } },
    })
    // Solo las activas del catálogo: desactivar un concepto lo saca de todos
    // los locales sin tener que ir local por local.
    const activas = filas.filter((f) => f.tipo.activo)
      .map((f) => ({ ...f.tipo, orden: f.orden ?? f.tipo.orden }))
    return { disponibilidades: ordenarDisponibilidades(activas) }
  })

  // ── PUT /local/:id_local ── definir la lista del local ──────────────────
  //
  // Reemplaza la lista entera: es lo que hace la pantalla de Locales, donde se
  // ven todos los conceptos con su tilde. Los arqueos ya cargados no se tocan
  // -- guardan su propio detalle, no una referencia a esta lista.
  fastify.put('/local/:id_local', { preHandler: admin }, async (request, reply) => {
    const { id_local } = request.params
    const { ids } = request.body ?? {}
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    if (!Array.isArray(ids)) return reply.code(400).send({ error: 'Mandá la lista de disponibilidades' })

    // Los ids tienen que ser del catálogo del grupo DE ESE LOCAL —no del que el
    // usuario tenga seleccionado en la barra—: sin esto se podría colgar de un
    // local la cuenta bancaria de otro cliente.
    const id_app = await appDelPedido(request, reply, id_local)
    if (!id_app) return
    const validos = await fastify.db.disponibilidadTipo.findMany({
      where: { id: { in: ids }, id_app },
      select: { id: true },
    })
    if (validos.length !== ids.length) {
      return reply.code(400).send({ error: 'Alguna disponibilidad no es del grupo' })
    }

    await fastify.db.$transaction([
      fastify.db.localDisponibilidad.deleteMany({ where: { id_local } }),
      ...(ids.length
        ? [fastify.db.localDisponibilidad.createMany({ data: ids.map((id_tipo) => ({ id_local, id_tipo })) })]
        : []),
    ])
    return { ok: true, total: ids.length }
  })
}
