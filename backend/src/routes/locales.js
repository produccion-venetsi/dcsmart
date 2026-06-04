export default async function localesRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('locales', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_app } = request.query
    return fastify.db.local.findMany({
      where: id_app ? { id_app } : undefined,
      include: { app: { select: { id: true, nombre: true, slug: true } } },
      orderBy: { nombre: 'asc' }
    })
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
    try {
      await fastify.db.local.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Local no encontrado' })
      throw err
    }
  })
}
