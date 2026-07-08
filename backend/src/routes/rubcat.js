export default async function rubcatRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('rubros', 'view')]

  // ─── RUBROS ───────────────────────────────────────
  fastify.get('/rubros', { preHandler: viewHandler }, async () => {
    return fastify.db.rubro.findMany({ orderBy: { nombre: 'asc' } })
  })

  fastify.post('/rubros', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'create')]
  }, async (request, reply) => {
    const { nombre } = request.body
    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })
    try {
      const rubro = await fastify.db.rubro.create({ data: { nombre } })
      return reply.code(201).send(rubro)
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'El rubro ya existe' })
      throw err
    }
  })

  fastify.put('/rubros/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'edit')]
  }, async (request, reply) => {
    try {
      const rubro = await fastify.db.rubro.update({
        where: { id: request.params.id },
        data: { nombre: request.body.nombre }
      })
      return rubro
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Rubro no encontrado' })
      throw err
    }
  })

  fastify.delete('/rubros/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.rubro.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Rubro no encontrado' })
      throw err
    }
  })

  // ─── CATEGORIAS ───────────────────────────────────
  fastify.get('/categorias', { preHandler: viewHandler }, async () => {
    return fastify.db.categoria.findMany({ orderBy: { nombre: 'asc' } })
  })

  fastify.post('/categorias', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'create')]
  }, async (request, reply) => {
    const { nombre } = request.body
    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })
    try {
      const cat = await fastify.db.categoria.create({ data: { nombre } })
      return reply.code(201).send(cat)
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'La categoría ya existe' })
      throw err
    }
  })

  fastify.put('/categorias/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'edit')]
  }, async (request, reply) => {
    try {
      const cat = await fastify.db.categoria.update({
        where: { id: request.params.id },
        data: { nombre: request.body.nombre }
      })
      return cat
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Categoría no encontrada' })
      throw err
    }
  })

  fastify.delete('/categorias/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.categoria.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Categoría no encontrada' })
      throw err
    }
  })

  // ─── RUBCAT ───────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { search } = request.query
    return fastify.db.rubCat.findMany({
      where: search ? {
        OR: [
          { rubro:     { nombre: { contains: search, mode: 'insensitive' } } },
          { categoria: { nombre: { contains: search, mode: 'insensitive' } } }
        ]
      } : {},
      include: { rubro: true, categoria: true },
      orderBy: [{ rubro: { nombre: 'asc' } }, { categoria: { nombre: 'asc' } }]
    })
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const rubcat = await fastify.db.rubCat.findUnique({
      where: { id: request.params.id },
      include: { rubro: true, categoria: true }
    })
    if (!rubcat) return reply.code(404).send({ error: 'RubCat no encontrado' })
    return rubcat
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'create')]
  }, async (request, reply) => {
    const { id_cat, id_rub, cuenta, tipo, costo, clasificacion } = request.body
    if (!id_cat || !id_rub) return reply.code(400).send({ error: 'id_cat e id_rub son requeridos' })
    try {
      const rubcat = await fastify.db.rubCat.create({
        data: { id_cat, id_rub, cuenta, tipo, costo, clasificacion },
        include: { rubro: true, categoria: true }
      })
      return reply.code(201).send(rubcat)
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'La combinación rubro-categoría ya existe' })
      throw err
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'edit')]
  }, async (request, reply) => {
    const { cuenta, tipo, costo, clasificacion } = request.body
    try {
      const rubcat = await fastify.db.rubCat.update({
        where: { id: request.params.id },
        data: { cuenta, tipo, costo, clasificacion },
        include: { rubro: true, categoria: true }
      })
      return rubcat
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'RubCat no encontrado' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.rubCat.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'RubCat no encontrado' })
      throw err
    }
  })
}
