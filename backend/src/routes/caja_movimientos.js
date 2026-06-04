export default async function cajaMoveRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('caja_movimientos', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_caja } = request.query
    return fastify.db.cajaMovimiento.findMany({
      where: id_caja ? { id_caja } : undefined,
      include: { metodo_pago: true },
      orderBy: { id: 'asc' }
    })
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const mov = await fastify.db.cajaMovimiento.findUnique({
      where: { id: request.params.id },
      include: { metodo_pago: true, caja: true }
    })
    if (!mov) return reply.code(404).send({ error: 'Movimiento no encontrado' })
    return mov
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('caja_movimientos', 'create')]
  }, async (request, reply) => {
    const { tipo, id_metodo, monto, id_caja, cantidad } = request.body
    if (!tipo || monto === undefined || !id_caja) {
      return reply.code(400).send({ error: 'tipo, monto e id_caja son requeridos' })
    }

    const mov = await fastify.db.cajaMovimiento.create({
      data: {
        tipo,
        id_metodo: id_metodo || null,
        monto: parseFloat(monto),
        id_caja,
        cantidad: cantidad ? parseInt(cantidad) : null
      },
      include: { metodo_pago: true }
    })
    return reply.code(201).send(mov)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('caja_movimientos', 'edit')]
  }, async (request, reply) => {
    const { tipo, id_metodo, monto, cantidad } = request.body
    try {
      const mov = await fastify.db.cajaMovimiento.update({
        where: { id: request.params.id },
        data: {
          tipo,
          id_metodo: id_metodo !== undefined ? id_metodo : undefined,
          monto: monto !== undefined ? parseFloat(monto) : undefined,
          cantidad: cantidad !== undefined ? parseInt(cantidad) : undefined
        },
        include: { metodo_pago: true }
      })
      return mov
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Movimiento no encontrado' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('caja_movimientos', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.cajaMovimiento.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Movimiento no encontrado' })
      throw err
    }
  })
}
