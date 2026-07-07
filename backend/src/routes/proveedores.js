export default async function proveedoresRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('proveedores', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { activo, search, page = 1, limit = 50 } = request.query
    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    // El CUIT se guarda con o sin guiones según cómo lo haya cargado cada
    // usuario (el formulario no fuerza una máscara). Para que la búsqueda
    // encuentre un proveedor sin importar el formato guardado, además del
    // texto tal cual se buscan los dígitos solos y, si son 11 (CUIT
    // completo), el formato canónico XX-XXXXXXXX-X.
    const digits = search ? search.replace(/\D/g, '') : ''
    const cuitVariants = digits
      ? [digits, ...(digits.length === 11 ? [`${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`] : [])]
      : []

    const where = {
      ...(activo !== undefined ? { activo: activo === 'true' } : {}),
      ...(search ? {
        OR: [
          { nombre: { contains: search, mode: 'insensitive' } },
          { razon_social: { contains: search, mode: 'insensitive' } },
          { cuit: { contains: search } },
          ...cuitVariants.map(v => ({ cuit: { contains: v } }))
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
      mail_envio, tag, cuenta, observaciones, tipo_local, tipo,
      id_rubcat, plazo, activo
    } = request.body

    if (!nombre && !razon_social) return reply.code(400).send({ error: 'nombre o razon_social es requerido' })

    const proveedor = await fastify.db.proveedor.create({
      data: {
        nombre, razon_social, cuit, banco, cbu, alias,
        direccion_url, detalle_direc, telefono, mail_contacto,
        mail_envio, tag, cuenta, observaciones, tipo_local, tipo,
        id_rubcat: id_rubcat || null,
        plazo: plazo != null ? parseInt(plazo) : null,
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
      mail_envio, tag, cuenta, observaciones, tipo_local, tipo,
      id_rubcat, plazo, activo
    } = request.body

    try {
      const proveedor = await fastify.db.proveedor.update({
        where: { id: request.params.id },
        data: {
          nombre, razon_social, cuit, banco, cbu, alias,
          direccion_url, detalle_direc, telefono, mail_contacto,
          mail_envio, tag, cuenta, observaciones, tipo_local, tipo,
          id_rubcat,
          plazo: plazo != null ? parseInt(plazo) : null,
          activo
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
