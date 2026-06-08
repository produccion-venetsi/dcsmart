export default async function impuestosRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('pagos', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_pago, page = 1, limit = 100 } = request.query
    const skip = (Number(page) - 1) * Number(limit)
    const where = id_pago ? { id_pago } : {}

    const [impuestos, total] = await Promise.all([
      fastify.db.impuesto.findMany({
        where,
        include: {
          pago: { select: { id: true, nro_ord: true, fecha: true, id_local: true } }
        },
        orderBy: { id: 'asc' },
        skip,
        take: Number(limit)
      }),
      fastify.db.impuesto.count({ where })
    ])

    return { data: impuestos, total, page: Number(page), limit: Number(limit) }
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'create')]
  }, async (request, reply) => {
    const { id_pago, tipo, monto } = request.body
    if (!id_pago || !tipo || monto == null) {
      return reply.code(400).send({ error: 'id_pago, tipo y monto son requeridos' })
    }
    const imp = await fastify.db.impuesto.create({
      data: { id_pago, tipo, monto: parseFloat(monto) },
      include: { pago: { select: { id: true, nro_ord: true, fecha: true } } }
    })
    return reply.code(201).send(imp)
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.impuesto.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Impuesto no encontrado' })
      throw err
    }
  })
}
