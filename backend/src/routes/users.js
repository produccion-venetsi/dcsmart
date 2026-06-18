import bcrypt from 'bcryptjs'

export default async function usersRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('usuarios', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async () => {
    return fastify.db.user.findMany({
      select: {
        id: true, email: true, nombre: true, avatar_url: true,
        activo: true, created_at: true,
        user_app_roles: { include: { app: true, role: true } },
        local_access: { include: { local: { select: { id: true, nombre: true } }, app: { select: { id: true } } } }
      },
      orderBy: { nombre: 'asc' }
    })
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const user = await fastify.db.user.findUnique({
      where: { id: request.params.id },
      select: {
        id: true, email: true, nombre: true, avatar_url: true,
        activo: true, google_id: true, created_at: true, updated_at: true,
        user_app_roles: { include: { app: true, role: true } },
        local_access: { include: { local: { select: { id: true, nombre: true } }, app: { select: { id: true } } } },
        user_permissions: { include: { module: true } }
      }
    })
    if (!user) return reply.code(404).send({ error: 'Usuario no encontrado' })
    return user
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('usuarios', 'create')]
  }, async (request, reply) => {
    const { email, nombre, password, activo } = request.body
    if (!email || !nombre) return reply.code(400).send({ error: 'email y nombre son requeridos' })

    const existing = await fastify.db.user.findUnique({ where: { email } })
    if (existing) return reply.code(409).send({ error: 'El email ya existe' })

    const data = {
      email, nombre, activo: activo ?? true,
      ...(password ? { password_hash: await bcrypt.hash(password, 12) } : {})
    }

    const user = await fastify.db.user.create({
      data,
      select: { id: true, email: true, nombre: true, activo: true, created_at: true }
    })
    return reply.code(201).send(user)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('usuarios', 'edit')]
  }, async (request, reply) => {
    const { nombre, avatar_url, activo, password } = request.body
    const data = {
      nombre, avatar_url, activo,
      ...(password ? { password_hash: await bcrypt.hash(password, 12) } : {})
    }
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k])

    try {
      const user = await fastify.db.user.update({
        where: { id: request.params.id },
        data,
        select: { id: true, email: true, nombre: true, avatar_url: true, activo: true, updated_at: true }
      })
      return user
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Usuario no encontrado' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('usuarios', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.user.update({
        where: { id: request.params.id },
        data: { activo: false }
      })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Usuario no encontrado' })
      throw err
    }
  })

  // ─── Asignación de rol/app — solo super_admin ──────────────────────────────
  fastify.post('/:id/roles', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id_app, id_role, id_local } = request.body
    if (!id_app || !id_role) return reply.code(400).send({ error: 'id_app e id_role son requeridos' })

    const userAppRole = await fastify.db.userAppRole.upsert({
      where: { id_user_id_app: { id_user: request.params.id, id_app } },
      create: { id_user: request.params.id, id_app, id_role },
      update: { id_role }
    })

    // Si se especifica id_local, crear registro de acceso específico a ese local
    if (id_local) {
      await fastify.db.userLocalAccess.upsert({
        where: { id_user_id_app_id_local: { id_user: request.params.id, id_app, id_local } },
        create: { id_user: request.params.id, id_app, id_local },
        update: {}
      })
    }

    return userAppRole
  })

  // Quitar rol/app de un usuario (también limpia sus accesos a locales de esa app)
  fastify.delete('/:id/roles/:id_app', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id, id_app } = request.params
    await fastify.db.userLocalAccess.deleteMany({ where: { id_user: id, id_app } })
    await fastify.db.userAppRole.deleteMany({ where: { id_user: id, id_app } })
    return reply.code(204).send()
  })

  // ─── Acceso a locales — solo super_admin ───────────────────────────────────
  // Agregar acceso a un local puntual (el usuario debe tener rol en la app)
  fastify.post('/:id/local-access', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id_app, id_local } = request.body
    if (!id_app || !id_local) return reply.code(400).send({ error: 'id_app e id_local son requeridos' })

    const hasRole = await fastify.db.userAppRole.findUnique({
      where: { id_user_id_app: { id_user: request.params.id, id_app } }
    })
    if (!hasRole) return reply.code(400).send({ error: 'El usuario no tiene rol en esta app' })

    const access = await fastify.db.userLocalAccess.upsert({
      where: { id_user_id_app_id_local: { id_user: request.params.id, id_app, id_local } },
      create: { id_user: request.params.id, id_app, id_local },
      update: {}
    })
    return reply.code(201).send(access)
  })

  // Quitar acceso a un local puntual
  fastify.delete('/:id/local-access', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id_app, id_local } = request.body
    if (!id_app || !id_local) return reply.code(400).send({ error: 'id_app e id_local son requeridos' })

    await fastify.db.userLocalAccess.deleteMany({
      where: { id_user: request.params.id, id_app, id_local }
    })
    return reply.code(204).send()
  })
}
