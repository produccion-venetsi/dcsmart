export default async function metodosRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('metodos_pago', 'view')]

  // Por defecto solo los activos: es lo que consumen los combos de cajas y
  // pagos, donde un método dado de baja no tiene que ser elegible. La pantalla
  // de administración pide ?all=1 para ver (y reactivar) los inactivos.
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const all = request.query.all === '1' || request.query.all === 'true'
    return fastify.db.metodoPago.findMany({
      where: all ? {} : { activo: true },
      orderBy: { nombre: 'asc' }
    })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('metodos_pago', 'create')]
  }, async (request, reply) => {
    const { nombre, activo } = request.body
    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })
    try {
      const m = await fastify.db.metodoPago.create({ data: { nombre, activo: activo ?? true } })
      return reply.code(201).send(m)
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'El método ya existe' })
      throw err
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('metodos_pago', 'edit')]
  }, async (request, reply) => {
    const { nombre, activo } = request.body
    try {
      const m = await fastify.db.metodoPago.update({
        where: { id: request.params.id },
        data: { nombre, activo }
      })
      return m
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Método no encontrado' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('metodos_pago', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.metodoPago.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Método no encontrado' })
      if (err.code === 'P2003') {
        return reply.code(409).send({ error: 'El método está en uso por pagos o movimientos: desactivalo en vez de borrarlo' })
      }
      throw err
    }
  })
}
