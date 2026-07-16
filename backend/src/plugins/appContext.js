import fp from 'fastify-plugin'

async function appContextPlugin(fastify) {
  fastify.decorate('appContext', async (request, reply) => {
    const appId = request.headers['x-app-id']
    if (!appId) {
      return reply.code(400).send({ error: 'Header X-App-Id requerido' })
    }

    // Rol del usuario en ESTA app (si tiene fila explícita).
    const appRole = await fastify.db.userAppRole.findFirst({
      where: { id_user: request.user.id, id_app: appId },
      include: { role: true }
    })

    // Roles globales del usuario: super_admin / dcsmart tienen acceso a TODAS las apps,
    // tengan o no una fila UserAppRole para esta app puntual.
    const allRoles = await fastify.db.userAppRole.findMany({
      where: { id_user: request.user.id },
      include: { role: true }
    })
    const elevated = allRoles.find(r => r.role.nombre === 'super_admin')
      || allRoles.find(r => r.role.nombre === 'dcsmart')

    // Rol efectivo para esta app: el elevado global manda; si no, el rol específico.
    const effective = elevated || appRole
    if (!effective) {
      return reply.code(403).send({ error: 'Sin acceso a esta app' })
    }

    const roleName = effective.role.nombre

    const app = await fastify.db.app.findUnique({
      where: { id: appId },
      select: { solo_super_admin: true }
    })
    if (app?.solo_super_admin && roleName !== 'super_admin') {
      return reply.code(403).send({ error: 'Sin acceso a esta app' })
    }

    request.activeAppId   = appId
    request.activeRole    = roleName
    request.effectiveRoleId = effective.id_role
    request.isSuperAdmin  = roleName === 'super_admin'

    // super_admin y dcsmart: acceso a todos los locales activos de la app.
    if (roleName === 'super_admin' || roleName === 'dcsmart') {
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

    // admin sin locales específicos = acceso a TODOS los locales activos de la app
    if (roleName === 'admin' && localAccess.length === 0) {
      const allLocales = await fastify.db.local.findMany({
        where: { id_app: appId, activo: true },
        select: { id: true }
      })
      request.allowedLocalIds = allLocales.map(l => l.id)
      return
    }

    // cajero: solo el local explícitamente asignado (siempre 1)
    request.allowedLocalIds = localAccess.map(la => la.id_local)
  })
}

export default fp(appContextPlugin)
