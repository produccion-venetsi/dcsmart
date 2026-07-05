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
    const { nombre, password, activo } = request.body
    const email = request.body.email?.trim().toLowerCase()
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
  // Roles globales (super_admin, dcsmart): id_app debe omitirse → null en DB
  // Roles scoped (admin, cajero): id_app requerido
  const GLOBAL_ROLE_NAMES = ['super_admin', 'dcsmart']

  fastify.post('/:id/roles', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id_app, id_role } = request.body
    if (!id_role) return reply.code(400).send({ error: 'id_role es requerido' })

    const roleRecord = await fastify.db.role.findUnique({ where: { id: id_role } })
    if (!roleRecord) return reply.code(400).send({ error: 'Rol no encontrado' })

    const isGlobal = GLOBAL_ROLE_NAMES.includes(roleRecord.nombre)

    if (isGlobal) {
      // Rol global: sin app. Buscar si ya tiene un registro global y actualizarlo.
      const existing = await fastify.db.userAppRole.findFirst({
        where: { id_user: request.params.id, id_app: null }
      })
      const userAppRole = existing
        ? await fastify.db.userAppRole.update({ where: { id: existing.id }, data: { id_role } })
        : await fastify.db.userAppRole.create({ data: { id_user: request.params.id, id_role } })
      return userAppRole
    }

    // Rol scoped: requiere id_app
    if (!id_app) return reply.code(400).send({ error: 'id_app es requerido para roles admin/cajero' })

    const userAppRole = await fastify.db.userAppRole.upsert({
      where: { id_user_id_app: { id_user: request.params.id, id_app } },
      create: { id_user: request.params.id, id_app, id_role },
      update: { id_role }
    })

    const { id_local } = request.body
    if (id_local) {
      await fastify.db.userLocalAccess.upsert({
        where: { id_user_id_app_id_local: { id_user: request.params.id, id_app, id_local } },
        create: { id_user: request.params.id, id_app, id_local },
        update: {}
      })
    }

    return userAppRole
  })

  // Quitar rol de un usuario.
  // :id_app = UUID del grupo, o "global" para quitar el rol de acceso global.
  fastify.delete('/:id/roles/:id_app', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id, id_app } = request.params
    const appFilter = id_app === 'global' ? null : id_app
    await fastify.db.userLocalAccess.deleteMany({ where: { id_user: id, id_app: appFilter } })
    await fastify.db.userAppRole.deleteMany({ where: { id_user: id, id_app: appFilter } })
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
