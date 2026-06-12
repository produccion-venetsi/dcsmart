import fp from 'fastify-plugin'

async function appContextPlugin(fastify) {
  fastify.decorate('appContext', async (request, reply) => {
    const appId = request.headers['x-app-id']
    if (!appId) {
      return reply.code(400).send({ error: 'Header X-App-Id requerido' })
    }

    const userAppRole = await fastify.db.userAppRole.findFirst({
      where: { id_user: request.user.id, id_app: appId },
      include: { role: true }
    })

    if (!userAppRole) {
      return reply.code(403).send({ error: 'Sin acceso a esta app' })
    }

    request.activeAppId = appId
    request.isSuperAdmin = userAppRole.role.nombre === 'super_admin'

    // Super_admin: todos los locales activos de la app (aislamiento por app igualmente)
    // Usuario normal: locales según user_local_access, o todos si no tiene registros
    if (request.isSuperAdmin) {
      const locales = await fastify.db.local.findMany({
        where: { id_app: appId, activo: true },
        select: { id: true }
      })
      request.allowedLocalIds = locales.map(l => l.id)
      return
    }

    const localAccess = await fastify.db.userLocalAccess.findMany({
      where: { id_user: request.user.id, id_app: appId },
      select: { id_local: true }
    })

    if (localAccess.length === 0) {
      const locales = await fastify.db.local.findMany({
        where: { id_app: appId, activo: true },
        select: { id: true }
      })
      request.allowedLocalIds = locales.map(l => l.id)
    } else {
      request.allowedLocalIds = localAccess.map(la => la.id_local)
    }
  })
}

export default fp(appContextPlugin)
