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

  fastify.decorate('can', (moduleName, action) => {
    return async (request, reply) => {
      const userId = request.user.id
      const permKey = `can_${action}`

      const moduleRecord = await fastify.db.module.findUnique({
        where: { nombre: moduleName }
      })

      if (!moduleRecord) {
        return reply.code(403).send({ error: `Módulo '${moduleName}' no encontrado` })
      }

      // super_admin: bypass total (lo marca appContext en rutas con contexto de app).
      if (request.isSuperAdmin) return

      // Override por usuario (autoritativo si existe).
      const userPerm = await fastify.db.userPermission.findUnique({
        where: { id_user_id_module: { id_user: userId, id_module: moduleRecord.id } }
      })
      if (userPerm) {
        if (userPerm[permKey]) return
        return reply.code(403).send({ error: 'Acceso denegado' })
      }

      // Roles a evaluar:
      //  - Si appContext corrió, usa el rol efectivo de la app (incluye el rol elevado
      //    global de super_admin/dcsmart).
      //  - Si no (rutas globales: apps/locales/usuarios/rubcat/...), evalúa TODOS los
      //    roles del usuario (OR), evitando depender de un findFirst arbitrario.
      let roleIds
      if (request.effectiveRoleId) {
        roleIds = [request.effectiveRoleId]
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
      }

      // Permiso por rol: se concede si CUALQUIERA de los roles a evaluar lo permite.
      const rolePerms = await fastify.db.rolePermission.findMany({
        where: { id_role: { in: roleIds }, id_module: moduleRecord.id }
      })

      if (!rolePerms.some(rp => rp[permKey])) {
        return reply.code(403).send({ error: 'Acceso denegado' })
      }
    }
  })
}

export default fp(permissionsPlugin)
