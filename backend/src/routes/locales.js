export default async function localesRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('locales', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_app, page = 1, limit = 100 } = request.query
    const skip = (Number(page) - 1) * Number(limit)
    const take = Number(limit)
    const where = id_app ? { id_app } : undefined

    const [data, total] = await Promise.all([
      fastify.db.local.findMany({
        where,
        include: { app: { select: { id: true, nombre: true, slug: true } } },
        orderBy: { nombre: 'asc' },
        skip,
        take
      }),
      fastify.db.local.count({ where })
    ])

    return { data, total, page: Number(page), limit: take }
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const local = await fastify.db.local.findUnique({
      where: { id: request.params.id },
      include: { app: true }
    })
    if (!local) return reply.code(404).send({ error: 'Local no encontrado' })
    return local
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'create')]
  }, async (request, reply) => {
    const { nombre, id_app, direccion, telefono, activo } = request.body
    if (!nombre || !id_app) return reply.code(400).send({ error: 'nombre e id_app son requeridos' })
    try {
      const local = await fastify.db.local.create({
        data: { nombre, id_app, direccion, telefono, activo: activo ?? true }
      })
      return reply.code(201).send(local)
    } catch (err) {
      if (err.code === 'P2003') return reply.code(400).send({ error: 'App no existe' })
      throw err
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'edit')]
  }, async (request, reply) => {
    const { nombre, direccion, telefono, activo } = request.body
    try {
      const local = await fastify.db.local.update({
        where: { id: request.params.id },
        data: { nombre, direccion, telefono, activo }
      })
      return local
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Local no encontrado' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'delete')]
  }, async (request, reply) => {
    const id = request.params.id
    const [cajas, pagos] = await Promise.all([
      fastify.db.caja.count({ where: { id_local: id } }),
      fastify.db.pago.count({ where: { id_local: id } })
    ])
    if (cajas > 0 || pagos > 0) {
      return reply.code(409).send({ error: `No se puede eliminar: el local tiene ${cajas} caja(s) y ${pagos} pago(s)` })
    }
    try {
      await fastify.db.local.delete({ where: { id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Local no encontrado' })
      throw err
    }
  })
}
