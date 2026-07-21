import bcrypt from 'bcryptjs'

// dcsmart-analisis es OTRO backend con su propia base (dcsmart_analytics);
// esto solo llama a su API interna server-to-server, nunca escribe ahí directo.
function analyticsCreds () {
  const base = process.env.ANALYTICS_BACKEND_URL
  const secret = process.env.INTERNAL_SHARED_SECRET
  if (!base || !secret) {
    const err = new Error('Integración con Analytics no configurada')
    err.statusCode = 500
    throw err
  }
  return { base, secret }
}

async function getAnalyticsAccess (email) {
  const { base, secret } = analyticsCreds()
  const resp = await fetch(`${base}/api/internal/access/${encodeURIComponent(email)}`, {
    headers: { 'X-Internal-Secret': secret }
  })
  if (resp.status === 404) return { enabled: null, is_admin: false }
  if (!resp.ok) {
    const err = new Error('Error al consultar acceso en Analytics')
    err.statusCode = resp.status
    throw err
  }
  return resp.json()
}

async function setAnalyticsAccess (email, { enabled, is_admin }) {
  const { base, secret } = analyticsCreds()
  const resp = await fetch(`${base}/api/internal/access`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
    body: JSON.stringify({ email, enabled, is_admin })
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    const err = new Error(data.error || 'Error al actualizar acceso en Analytics')
    err.statusCode = resp.status
    throw err
  }
}

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

  // Borrado definitivo: solo permitido sobre un usuario ya desactivado (paso
  // previo obligatorio con DELETE /:id de arriba). Preserva el historial de
  // pagos/cajas/auditorías que haya creado (created_by/id_user quedan en
  // null), y borra solo lo que es propio de la cuenta (roles, accesos,
  // permisos, uso de apps).
  fastify.delete('/:id/permanente', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id } = request.params
    const user = await fastify.db.user.findUnique({ where: { id }, select: { id: true, activo: true } })
    if (!user) return reply.code(404).send({ error: 'Usuario no encontrado' })
    if (user.activo) return reply.code(409).send({ error: 'Desactivá el usuario antes de eliminarlo definitivamente' })

    await fastify.db.$transaction([
      fastify.db.pago.updateMany({ where: { created_by: id }, data: { created_by: null } }),
      fastify.db.caja.updateMany({ where: { created_by: id }, data: { created_by: null } }),
      fastify.db.audit.updateMany({ where: { id_user: id }, data: { id_user: null } }),
      fastify.db.userAppRole.deleteMany({ where: { id_user: id } }),
      fastify.db.userLocalAccess.deleteMany({ where: { id_user: id } }),
      fastify.db.userPermission.deleteMany({ where: { id_user: id } }),
      fastify.db.userAppUsage.deleteMany({ where: { id_user: id } }),
      fastify.db.user.delete({ where: { id } }),
    ])
    return reply.code(204).send()
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
    // UserLocalAccess.id_app NO es nullable (a diferencia de UserAppRole.id_app,
    // que sí acepta null para "acceso global") -- filtrar con id_app: null ahí
    // hace que Prisma tire un error de validación (500). Un rol global no tiene
    // accesos a locales puntuales asociados, así que directamente no aplica.
    if (appFilter !== null) {
      await fastify.db.userLocalAccess.deleteMany({ where: { id_user: id, id_app: appFilter } })
    }
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

  // ─── Permisos individuales por usuario (override sobre el permiso del rol) ─
  fastify.put('/:id/permissions/:moduleName', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { moduleName } = request.params
    const moduleRecord = await fastify.db.module.findUnique({ where: { nombre: moduleName } })
    if (!moduleRecord) return reply.code(404).send({ error: `Módulo '${moduleName}' no encontrado` })

    const { can_view, can_create, can_edit, can_delete } = request.body ?? {}
    const data = {
      can_view: !!can_view, can_create: !!can_create,
      can_edit: !!can_edit, can_delete: !!can_delete
    }

    const perm = await fastify.db.userPermission.upsert({
      where: { id_user_id_module: { id_user: request.params.id, id_module: moduleRecord.id } },
      create: { id_user: request.params.id, id_module: moduleRecord.id, ...data },
      update: data
    })
    return perm
  })

  fastify.delete('/:id/permissions/:moduleName', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { moduleName } = request.params
    const moduleRecord = await fastify.db.module.findUnique({ where: { nombre: moduleName } })
    if (!moduleRecord) return reply.code(404).send({ error: `Módulo '${moduleName}' no encontrado` })

    await fastify.db.userPermission.deleteMany({
      where: { id_user: request.params.id, id_module: moduleRecord.id }
    })
    return reply.code(204).send()
  })

  // GET /api/users/:id/analytics-access
  fastify.get('/:id/analytics-access', {
    preHandler: [fastify.authenticate, fastify.can('usuarios', 'view')]
  }, async (request, reply) => {
    const user = await fastify.db.user.findUnique({ where: { id: request.params.id }, select: { email: true } })
    if (!user) return reply.code(404).send({ error: 'Usuario no encontrado' })
    try {
      return await getAnalyticsAccess(user.email)
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message })
    }
  })

  // PUT /api/users/:id/analytics-access  { enabled, is_admin }
  // Habilita/deshabilita el acceso de este usuario a dcsmart-analisis (la
  // plataforma de reportes). Delegado vía API interna — ver setAnalyticsAccess.
  fastify.put('/:id/analytics-access', {
    preHandler: [fastify.authenticate, fastify.can('usuarios', 'edit')]
  }, async (request, reply) => {
    const { enabled = true, is_admin = false } = request.body || {}
    const user = await fastify.db.user.findUnique({ where: { id: request.params.id }, select: { email: true } })
    if (!user) return reply.code(404).send({ error: 'Usuario no encontrado' })

    try {
      await setAnalyticsAccess(user.email, { enabled, is_admin })
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message })
    }
    return { ok: true }
  })
}
