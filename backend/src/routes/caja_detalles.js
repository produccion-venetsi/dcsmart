export default async function cajaDetallesRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  // ── GET /tipos ─────────────────────────────────────────────────────────
  // Acepta id_local opcional y devuelve tipos app-wide + tipos del local específico
  fastify.get('/tipos', { preHandler: viewHandler }, async (request) => {
    const { id_local } = request.query
    return fastify.db.detalleTipo.findMany({
      where: {
        id_app: request.activeAppId,
        activo: true,
        OR: [
          { id_local: null },
          ...(id_local ? [{ id_local }] : [])
        ]
      },
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
        detalle_tipo: { select: { id: true, nombre: true, clasificacion: true } }
      },
      orderBy: { created_at: 'asc' }
    })
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { id_caja, id_tipo, nombre, monto, observaciones } = request.body

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

    // tipo y nombre se derivan del tipo del catálogo cuando se elige id_tipo
    let tipo = null
    let nombreFinal = nombre || null
    if (id_tipo) {
      const dt = await fastify.db.detalleTipo.findUnique({
        where: { id: id_tipo },
        select: { clasificacion: true, nombre: true }
      })
      if (!dt) return reply.code(400).send({ error: 'Tipo de detalle inexistente' })
      tipo = dt.clasificacion
      nombreFinal = dt.nombre
    }

    const detalle = await fastify.db.cajaDetalle.create({
      data: {
        id_caja,
        tipo,
        id_tipo:       id_tipo       || null,
        nombre:        nombreFinal,
        monto:         parseFloat(monto),
        observaciones: observaciones || null
      },
      include: {
        detalle_tipo: { select: { id: true, nombre: true, clasificacion: true } }
      }
    })
    return reply.code(201).send(detalle)
  })

  // ── PUT /:id ───────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.cajaDetalle.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Detalle no encontrado' })

    if (!request.allowedLocalIds.includes(existing.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { id_tipo, nombre, monto, observaciones } = request.body
    if (monto === undefined) return reply.code(400).send({ error: 'El monto es requerido' })

    // tipo y nombre se derivan del tipo del catálogo cuando se elige id_tipo,
    // igual que en la creación (ver POST /)
    let tipo = existing.tipo
    let nombreFinal = nombre !== undefined ? (nombre || null) : existing.nombre
    if (id_tipo !== undefined) {
      if (id_tipo) {
        const dt = await fastify.db.detalleTipo.findUnique({
          where: { id: id_tipo },
          select: { clasificacion: true, nombre: true }
        })
        if (!dt) return reply.code(400).send({ error: 'Tipo de detalle inexistente' })
        tipo = dt.clasificacion
        nombreFinal = dt.nombre
      } else {
        tipo = null
      }
    }

    const detalle = await fastify.db.cajaDetalle.update({
      where: { id: request.params.id },
      data: {
        id_tipo:       id_tipo       !== undefined ? (id_tipo || null) : undefined,
        tipo,
        nombre:        nombreFinal,
        monto:         parseFloat(monto),
        observaciones: observaciones !== undefined ? (observaciones || null) : undefined
      },
      include: {
        detalle_tipo: { select: { id: true, nombre: true, clasificacion: true } }
      }
    })
    return detalle
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
