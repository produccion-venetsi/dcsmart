export default async function appsRoutes(fastify) {
  const preHandler = [fastify.authenticate, fastify.can('apps', 'view')]

  fastify.get('/', { preHandler }, async () => {
    return fastify.db.app.findMany({ orderBy: { nombre: 'asc' } })
  })

  fastify.get('/:id', { preHandler }, async (request, reply) => {
    const app = await fastify.db.app.findUnique({
      where: { id: request.params.id },
      include: { locales: true }
    })
    if (!app) return reply.code(404).send({ error: 'App no encontrada' })
    return app
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('apps', 'create')]
  }, async (request, reply) => {
    const { nombre, slug, activo } = request.body
    if (!nombre || !slug) return reply.code(400).send({ error: 'nombre y slug son requeridos' })
    try {
      const app = await fastify.db.app.create({
        data: { nombre, slug, activo: activo ?? true }
      })
      return reply.code(201).send(app)
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'El slug ya existe' })
      throw err
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('apps', 'edit')]
  }, async (request, reply) => {
    const { nombre, slug, activo } = request.body
    try {
      const app = await fastify.db.app.update({
        where: { id: request.params.id },
        data: { nombre, slug, activo }
      })
      return app
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'App no encontrada' })
      if (err.code === 'P2002') return reply.code(409).send({ error: 'El slug ya existe' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('apps', 'delete')]
  }, async (request, reply) => {
    const id = request.params.id
    const deps = await fastify.db.local.count({ where: { id_app: id } })
    if (deps > 0) {
      return reply.code(409).send({ error: `No se puede eliminar: la app tiene ${deps} local(es) asociado(s)` })
    }
    try {
      await fastify.db.app.delete({ where: { id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'App no encontrada' })
      throw err
    }
  })
}
