export default async function cajaRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('caja', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_local, desde, hasta, page = 1, limit = 50 } = request.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      ...(id_local ? { id_local } : {}),
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
          local: { select: { id: true, nombre: true } },
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

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      include: {
        local: true,
        creador: { select: { id: true, nombre: true } },
        movimientos: { include: { metodo_pago: true } }
      }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })
    return caja
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('caja', 'create')]
  }, async (request, reply) => {
    const {
      nro_turno, fecha_inicio, id_local, cajero,
      total, efectivo, fiscal, comensales, tickets, observaciones, foto_url, origin
    } = request.body

    if (!fecha_inicio || !id_local) {
      return reply.code(400).send({ error: 'fecha_inicio e id_local son requeridos' })
    }

    const caja = await fastify.db.caja.create({
      data: {
        nro_turno,
        fecha_inicio: new Date(fecha_inicio),
        id_local, cajero,
        total: total ? parseFloat(total) : null,
        efectivo: efectivo ? parseFloat(efectivo) : null,
        fiscal: fiscal ? parseFloat(fiscal) : null,
        comensales: comensales ? parseInt(comensales) : null,
        tickets: tickets ? parseInt(tickets) : null,
        observaciones, foto_url,
        origin: origin || 'DCSMART',
        created_by: request.user.id
      }
    })
    return reply.code(201).send(caja)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('caja', 'edit')]
  }, async (request, reply) => {
    const {
      nro_turno, fecha_cierre, cajero, total, efectivo, fiscal,
      comensales, tickets, observaciones, foto_url
    } = request.body

    try {
      const caja = await fastify.db.caja.update({
        where: { id: request.params.id },
        data: {
          nro_turno,
          fecha_cierre: fecha_cierre ? new Date(fecha_cierre) : undefined,
          cajero,
          total: total !== undefined ? parseFloat(total) : undefined,
          efectivo: efectivo !== undefined ? parseFloat(efectivo) : undefined,
          fiscal: fiscal !== undefined ? parseFloat(fiscal) : undefined,
          comensales: comensales !== undefined ? parseInt(comensales) : undefined,
          tickets: tickets !== undefined ? parseInt(tickets) : undefined,
          observaciones, foto_url
        }
      })
      return caja
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Caja no encontrada' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('caja', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.caja.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Caja no encontrada' })
      throw err
    }
  })
}
