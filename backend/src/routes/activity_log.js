// Log de actividad CRUD (crear/editar/eliminar) sobre Pagos. Solo accesible
// para super_admin -- ver ActivityLog en schema.prisma y logActivity() en
// routes/pagos.js (el único lugar que escribe acá por ahora).
export default async function activityLogRoutes(fastify) {
  const guard = [fastify.authenticate, fastify.appContext, fastify.requireSuperAdmin]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: guard }, async (request, reply) => {
    const {
      desde, hasta, tabla, id_user, accion, id_local,
      page = 1, limit = 50
    } = request.query

    if (tabla && tabla !== 'pagos') {
      return reply.code(400).send({ error: 'tabla debe ser "pagos"' })
    }
    if (accion && !['creado', 'editado', 'eliminado'].includes(accion)) {
      return reply.code(400).send({ error: 'accion debe ser "creado", "editado" o "eliminado"' })
    }
    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const where = {
      id_local: { in: id_local ? [id_local] : request.allowedLocalIds },
      ...(tabla   ? { tabla }   : {}),
      ...(id_user ? { id_user } : {}),
      ...(accion  ? { accion }  : {}),
      // ActivityLog.fecha es un instante real -- el rango se interpreta en
      // hora de Argentina (offset fijo -03:00), no UTC.
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(`${desde}T00:00:00.000-03:00`) } : {}),
          ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999-03:00`) } : {})
        }
      } : {})
    }

    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    const [rows, total] = await Promise.all([
      fastify.db.activityLog.findMany({
        where,
        include: { user: { select: { id: true, nombre: true } } },
        orderBy: { fecha: 'desc' },
        skip,
        take
      }),
      fastify.db.activityLog.count({ where })
    ])

    return { data: rows, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /usuarios ────────────────────────────────────────────────────
  fastify.get('/usuarios', { preHandler: guard }, async (request, reply) => {
    const rows = await fastify.db.activityLog.findMany({
      where: { id_local: { in: request.allowedLocalIds }, id_user: { not: null } },
      distinct: ['id_user'],
      select: { user: { select: { id: true, nombre: true } } }
    })
    return rows.map(r => r.user).filter(Boolean)
  })
}
