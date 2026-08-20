import fp from 'fastify-plugin'

async function permissionsPlugin(fastify) {
  // Guard: solo usuarios con rol super_admin (en cualquier app) pueden continuar.
  // Se usa en endpoints sensibles como asignar roles / accesos a otros usuarios.
  fastify.decorate('requireSuperAdmin', async (request, reply) => {
    const roles = await fastify.db.userAppRole.findMany({
      where: { id_user: request.user.id },
      include: { role: true }
    })
    if (!roles.some(r => r.role.nombre === 'super_admin')) {
      return reply.code(403).send({ error: 'Solo el super admin puede realizar esta acción' })
    }
  })

  // Guard: solo super_admin o dcsmart pueden auditar por el circuito DC.
  // Requiere que fastify.appContext haya corrido antes (usa request.activeRole).
  fastify.decorate('requireDc', async (request, reply) => {
    if (!['super_admin', 'dcsmart'].includes(request.activeRole)) {
      return reply.code(403).send({ error: 'Solo DCSmart puede realizar esta acción' })
    }
  })

  // `can('caja', 'view')` o `can('caja', ['view', 'create'])`: con una lista
  // alcanza con que el usuario tenga UNA de las acciones. Sirve para los
  // catálogos de apoyo (los nombres de detalle, por ejemplo): quien puede
  // CREAR una caja necesita leer el catálogo aunque no tenga `view` del módulo
  // -- es el caso de data_entry, que abría el alta con el combo vacío y un
  // error en pantalla (2026-08-20).
  fastify.decorate('can', (moduleName, action) => {
    const acciones = Array.isArray(action) ? action : [action]
    return async (request, reply) => {
      const userId = request.user.id
      const permKeys = acciones.map((a) => `can_${a}`)

      const moduleRecord = await fastify.db.module.findUnique({
        where: { nombre: moduleName }
      })

      if (!moduleRecord) {
        return reply.code(403).send({ error: `Módulo '${moduleName}' no encontrado` })
      }

      // super_admin: bypass total (lo marca appContext en rutas con contexto de app).
      if (request.isSuperAdmin) return

      // Roles a evaluar:
      //  - Si appContext corrió, usa el rol efectivo de la app (incluye el rol elevado
      //    global de super_admin/dcsmart).
      //  - Si no (rutas globales: apps/locales/usuarios/rubcat/...), evalúa TODOS los
      //    roles del usuario (OR), evitando depender de un findFirst arbitrario.
      let roleIds, roleNames
      if (request.effectiveRoleId) {
        roleIds = [request.effectiveRoleId]
        roleNames = request.activeRole ? [request.activeRole] : []
      } else {
        const appRoles = await fastify.db.userAppRole.findMany({
          where: { id_user: userId },
          include: { role: true }
        })
        if (appRoles.some(ar => ar.role.nombre === 'super_admin')) return
        if (appRoles.length === 0) {
          return reply.code(403).send({ error: 'Sin rol asignado' })
        }
        roleIds = [...new Set(appRoles.map(ar => ar.id_role))]
        roleNames = [...new Set(appRoles.map(ar => ar.role.nombre))]
      }

      // Permiso por rol: se concede si CUALQUIERA de los roles a evaluar lo permite.
      const rolePerms = await fastify.db.rolePermission.findMany({
        where: { id_role: { in: roleIds }, id_module: moduleRecord.id }
      })
      const roleGrants = rolePerms.some(rp => permKeys.some((k) => rp[k]))

      // dcsmart: igual que super_admin, nunca queda bloqueado por un override
      // individual si su rol ya concede el permiso -- solo un override que
      // AMPLÍE (nunca uno que restrinja) tiene sentido para este rol.
      if (roleGrants && roleNames.includes('dcsmart')) return

      // Override por usuario (autoritativo si existe, salvo el caso dcsmart de arriba).
      const userPerm = await fastify.db.userPermission.findUnique({
        where: { id_user_id_module: { id_user: userId, id_module: moduleRecord.id } }
      })
      if (userPerm) {
        if (permKeys.some((k) => userPerm[k])) return
        return reply.code(403).send({ error: 'Acceso denegado' })
      }

      if (!roleGrants) {
        return reply.code(403).send({ error: 'Acceso denegado' })
      }
    }
  })
}

export default fp(permissionsPlugin)
