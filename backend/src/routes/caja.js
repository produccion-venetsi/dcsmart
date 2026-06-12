export default async function cajaRoutes(fastify) {
  const viewHandler    = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  const createHandler  = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const editHandler    = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'edit')]
  const deleteHandler  = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta, page = 1, limit = 50 } = request.query
    const skip = (Number(page) - 1) * Number(limit)

    if (id_local && !request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = request.isSuperAdmin
      ? (id_local ? { id_local } : {})
      : { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    const where = {
      ...localFilter,
      ...(desde || hasta ? {
        fecha_inicio: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta) } : {})
        }
      } : {})
    }

    const [cajas, total] = await Promise.all([
      fastify.db.caja.findMany({
        where,
        include: {
          local:   { select: { id: true, nombre: true } },
          creador: { select: { id: true, nombre: true } }
        },
        orderBy: { fecha_inicio: 'desc' },
        skip,
        take: Number(limit)
      }),
      fastify.db.caja.count({ where })
    ])

    return { data: cajas, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /stats ─────────────────────────────────────────────────────────
  fastify.get('/stats', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (id_local && !request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = request.isSuperAdmin
      ? (id_local ? { id_local } : {})
      : { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    const where = {
      ...localFilter,
      ...(desde || hasta ? {
        fecha_inicio: {
          ...(desde && { gte: new Date(desde) }),
          ...(hasta && { lte: new Date(hasta + 'T23:59:59.999') })
        }
      } : {})
    }

    const agg = await fastify.db.caja.aggregate({
      where,
      _sum:   { total: true, efectivo: true, tickets: true, comensales: true },
      _count: { id: true }
    })

    return {
      total_recaudado:  Number(agg._sum.total      ?? 0),
      count_turnos:     agg._count.id,
      total_efectivo:   Number(agg._sum.efectivo   ?? 0),
      total_tickets:    agg._sum.tickets            ?? 0,
      total_comensales: agg._sum.comensales         ?? 0,
    }
  })

  // ── GET /:id ───────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      include: {
        local:       true,
        creador:     { select: { id: true, nombre: true } },
        movimientos: { include: { metodo_pago: true } }
      }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    return caja
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const {
      nro_turno, fecha_inicio, id_local, cajero,
      total, efectivo, fiscal, comensales, tickets, observaciones, foto_url, origin
    } = request.body

    if (!fecha_inicio || !id_local) {
      return reply.code(400).send({ error: 'fecha_inicio e id_local son requeridos' })
    }

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const caja = await fastify.db.caja.create({
      data: {
        nro_turno,
        fecha_inicio: new Date(fecha_inicio),
        id_local, cajero,
        total:        total        ? parseFloat(total)        : null,
        efectivo:     efectivo     ? parseFloat(efectivo)     : null,
        fiscal:       fiscal       ? parseFloat(fiscal)       : null,
        comensales:   comensales   ? parseInt(comensales)     : null,
        tickets:      tickets      ? parseInt(tickets)        : null,
        observaciones, foto_url,
        origin: origin || 'DCSMART',
        created_by: request.user.id
      }
    })
    return reply.code(201).send(caja)
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const {
      nro_turno, fecha_cierre, cajero, total, efectivo, fiscal,
      comensales, tickets, observaciones, foto_url
    } = request.body

    const caja = await fastify.db.caja.update({
      where: { id: request.params.id },
      data: {
        nro_turno,
        fecha_cierre:  fecha_cierre  ? new Date(fecha_cierre)  : undefined,
        cajero,
        total:         total         !== undefined ? parseFloat(total)         : undefined,
        efectivo:      efectivo      !== undefined ? parseFloat(efectivo)      : undefined,
        fiscal:        fiscal        !== undefined ? parseFloat(fiscal)        : undefined,
        comensales:    comensales    !== undefined ? parseInt(comensales)      : undefined,
        tickets:       tickets       !== undefined ? parseInt(tickets)         : undefined,
        observaciones, foto_url
      }
    })
    return caja
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    await fastify.db.caja.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
