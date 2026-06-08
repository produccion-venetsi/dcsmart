export default async function proveedoresRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('proveedores', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { activo, search, page = 1, limit = 50 } = request.query
    const skip = (Number(page) - 1) * Number(limit)
    const take = Number(limit)

    const where = {
      ...(activo !== undefined ? { activo: activo === 'true' } : {}),
      ...(search ? {
        OR: [
          { nombre: { contains: search, mode: 'insensitive' } },
          { razon_social: { contains: search, mode: 'insensitive' } },
          { cuit: { contains: search } }
        ]
      } : {})
    }

    const [data, total] = await Promise.all([
      fastify.db.proveedor.findMany({
        where,
        include: { rubcat: { include: { rubro: true, categoria: true } } },
        orderBy: { nombre: 'asc' },
        skip,
        take
      }),
      fastify.db.proveedor.count({ where })
    ])

    return { data, total, page: Number(page), limit: take }
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const proveedor = await fastify.db.proveedor.findUnique({
      where: { id: request.params.id },
      include: { rubcat: { include: { rubro: true, categoria: true } } }
    })
    if (!proveedor) return reply.code(404).send({ error: 'Proveedor no encontrado' })
    return proveedor
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('proveedores', 'create')]
  }, async (request, reply) => {
    const {
      nombre, razon_social, cuit, banco, cbu, alias,
      direccion_url, detalle_direc, telefono, mail_contacto,
      mail_envio, tag, id_rubcat, activo
    } = request.body

    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })

    const proveedor = await fastify.db.proveedor.create({
      data: {
        nombre, razon_social, cuit, banco, cbu, alias,
        direccion_url, detalle_direc, telefono, mail_contacto,
        mail_envio, tag, id_rubcat: id_rubcat || null,
        activo: activo ?? true
      }
    })
    return reply.code(201).send(proveedor)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('proveedores', 'edit')]
  }, async (request, reply) => {
    const {
      nombre, razon_social, cuit, banco, cbu, alias,
      direccion_url, detalle_direc, telefono, mail_contacto,
      mail_envio, tag, id_rubcat, activo
    } = request.body

    try {
      const proveedor = await fastify.db.proveedor.update({
        where: { id: request.params.id },
        data: {
          nombre, razon_social, cuit, banco, cbu, alias,
          direccion_url, detalle_direc, telefono, mail_contacto,
          mail_envio, tag, id_rubcat, activo
        }
      })
      return proveedor
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Proveedor no encontrado' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('proveedores', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.proveedor.update({
        where: { id: request.params.id },
        data: { activo: false }
      })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Proveedor no encontrado' })
      throw err
    }
  })
}
