import fp from 'fastify-plugin'

async function permissionsPlugin(fastify) {
  fastify.decorate('can', (moduleName, action) => {
    return async (request, reply) => {
      const userId = request.user.id

      const moduleRecord = await fastify.db.module.findUnique({
        where: { nombre: moduleName }
      })

      if (!moduleRecord) {
        return reply.code(403).send({ error: `Módulo '${moduleName}' no encontrado` })
      }

      const userPerm = await fastify.db.userPermission.findUnique({
        where: { id_user_id_module: { id_user: userId, id_module: moduleRecord.id } }
      })

      if (userPerm) {
        const permKey = `can_${action}`
        if (!userPerm[permKey]) {
          return reply.code(403).send({ error: 'Acceso denegado' })
        }
        return
      }

      const userAppRole = await fastify.db.userAppRole.findFirst({
        where: {
          id_user: userId,
          ...(request.activeAppId ? { id_app: request.activeAppId } : {})
        }
      })

      if (!userAppRole) {
        return reply.code(403).send({ error: 'Sin rol asignado' })
      }

      const rolePerm = await fastify.db.rolePermission.findUnique({
        where: {
          id_role_id_module: {
            id_role: userAppRole.id_role,
            id_module: moduleRecord.id
          }
        }
      })

      if (!rolePerm || !rolePerm[`can_${action}`]) {
        return reply.code(403).send({ error: 'Acceso denegado' })
      }
    }
  })
}

export default fp(permissionsPlugin)
