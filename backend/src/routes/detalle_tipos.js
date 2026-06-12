export default async function detalleTiposRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  // ── GET / — lista todos los tipos de la app activa ─────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    return fastify.db.detalleTipo.findMany({
      where: { id_app: request.activeAppId },
      include: { local: { select: { id: true, nombre: true } } },
      orderBy: [{ id_local: 'asc' }, { nombre: 'asc' }]
    })
  })

  // ── POST / — crear tipo nuevo ──────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { nombre, id_local } = request.body
    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }

    try {
      const tipo = await fastify.db.detalleTipo.create({
        data: {
          nombre,
          id_app: request.activeAppId,
          id_local: id_local || null,
          activo: true
        },
        include: { local: { select: { id: true, nombre: true } } }
      })
      return reply.code(201).send(tipo)
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'Ya existe un tipo con ese nombre en esta app' })
      throw e
    }
  })

  // ── PUT /:id — editar (nombre y activo) ───────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.detalleTipo.findUnique({ where: { id: request.params.id } })
    if (!existing) return reply.code(404).send({ error: 'Tipo no encontrado' })
    if (existing.id_app !== request.activeAppId) return reply.code(403).send({ error: 'Sin acceso' })

    const { nombre, activo } = request.body
    const tipo = await fastify.db.detalleTipo.update({
      where: { id: request.params.id },
      data: { nombre, activo },
      include: { local: { select: { id: true, nombre: true } } }
    })
    return tipo
  })

  // ── DELETE /:id — soft delete si tiene detalles, hard delete si no ─────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.detalleTipo.findUnique({
      where: { id: request.params.id },
      include: { _count: { select: { detalles: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Tipo no encontrado' })
    if (existing.id_app !== request.activeAppId) return reply.code(403).send({ error: 'Sin acceso' })

    if (existing._count.detalles > 0) {
      await fastify.db.detalleTipo.update({ where: { id: request.params.id }, data: { activo: false } })
    } else {
      await fastify.db.detalleTipo.delete({ where: { id: request.params.id } })
    }
    return reply.code(204).send()
  })
}
