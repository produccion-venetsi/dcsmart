export default async function rolesRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('usuarios', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async () => {
    return fastify.db.role.findMany({
      include: {
        role_permissions: {
          include: { module: true },
          orderBy: { module: { nombre: 'asc' } }
        }
      },
      orderBy: { nombre: 'asc' }
    })
  })

  fastify.get('/modules', { preHandler: viewHandler }, async () => {
    return fastify.db.module.findMany({ orderBy: { nombre: 'asc' } })
  })
}
