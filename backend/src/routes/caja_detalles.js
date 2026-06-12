export default async function cajaDetallesRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  // ── GET /tipos ─────────────────────────────────────────────────────────
  fastify.get('/tipos', { preHandler: viewHandler }, async (request) => {
    return fastify.db.detalleTipo.findMany({
      where: { id_app: request.activeAppId, activo: true },
      orderBy: { nombre: 'asc' }
    })
  })

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_caja } = request.query

    const where = {
      ...(id_caja ? { id_caja } : {}),
      caja: { id_local: { in: request.allowedLocalIds } }
    }

    return fastify.db.cajaDetalle.findMany({
      where,
      include: {
        metodo:       { select: { id: true, nombre: true } },
        detalle_tipo: { select: { id: true, nombre: true } }
      },
      orderBy: { created_at: 'asc' }
    })
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { id_caja, id_tipo, nombre, monto, id_metodo, observaciones } = request.body

    if (!id_caja || monto === undefined) {
      return reply.code(400).send({ error: 'id_caja y monto son requeridos' })
    }

    const caja = await fastify.db.caja.findUnique({
      where: { id: id_caja },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const detalle = await fastify.db.cajaDetalle.create({
      data: {
        id_caja,
        id_tipo:      id_tipo      || null,
        nombre:       nombre       || null,
        monto:        parseFloat(monto),
        id_metodo:    id_metodo    || null,
        observaciones: observaciones || null
      },
      include: {
        metodo:       { select: { id: true, nombre: true } },
        detalle_tipo: { select: { id: true, nombre: true } }
      }
    })
    return reply.code(201).send(detalle)
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.cajaDetalle.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Detalle no encontrado' })

    if (!request.allowedLocalIds.includes(existing.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    await fastify.db.cajaDetalle.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
