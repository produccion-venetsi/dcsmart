export default async function auditoriasRoutes(fastify) {
  const guard = [fastify.authenticate, fastify.requireSuperAdmin]

  // ── GET / ─────────────────────────────────────────────────────────────
  // Lista todos los eventos de auditoría (pagos + cajas), con filtros.
  // Vista global — no depende de appContext ni de locales permitidos,
  // solo accesible para super_admin.
  fastify.get('/', { preHandler: guard }, async (request, reply) => {
    const {
      desde, hasta, tabla, id_user, accion,
      page = 1, limit = 50
    } = request.query

    if (tabla && !['pagos', 'cajas'].includes(tabla)) {
      return reply.code(400).send({ error: 'tabla debe ser "pagos" o "cajas"' })
    }
    if (accion && !['auditado', 'desauditado'].includes(accion)) {
      return reply.code(400).send({ error: 'accion debe ser "auditado" o "desauditado"' })
    }

    const where = {
      ...(tabla   ? { tabla }   : {}),
      ...(id_user ? { id_user } : {}),
      ...(accion  ? { accion }  : {}),
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta + 'T23:59:59.999') } : {})
        }
      } : {})
    }

    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    const [rows, total] = await Promise.all([
      fastify.db.audit.findMany({
        where,
        include: { user: { select: { id: true, nombre: true } } },
        orderBy: { fecha: { sort: 'desc', nulls: 'last' } },
        skip,
        take
      }),
      fastify.db.audit.count({ where })
    ])

    // Resolver registro_label: Audit es polimórfica (tabla + id_registro),
    // sin relación Prisma a Pago/Caja. Se resuelve con dos queries acotadas
    // a los ids presentes en esta página (no a toda la tabla).
    const pagoIds = rows.filter(r => r.tabla === 'pagos').map(r => r.id_registro)
    const cajaIds = rows.filter(r => r.tabla === 'cajas').map(r => r.id_registro)

    const [pagos, cajas] = await Promise.all([
      pagoIds.length
        ? fastify.db.pago.findMany({ where: { id: { in: pagoIds } }, select: { id: true, nro_ord: true } })
        : [],
      cajaIds.length
        ? fastify.db.caja.findMany({ where: { id: { in: cajaIds } }, select: { id: true, nro_turno: true } })
        : []
    ])

    const labelMap = new Map()
    pagos.forEach(p => labelMap.set(p.id, p.nro_ord != null ? `OP-${p.nro_ord}` : '—'))
    cajas.forEach(c => labelMap.set(c.id, c.nro_turno ? `TRN ${c.nro_turno}` : '—'))

    const data = rows.map(r => ({
      id: r.id,
      fecha: r.fecha,
      tabla: r.tabla,
      id_registro: r.id_registro,
      accion: r.accion,
      observaciones: r.observaciones,
      user: r.user,
      registro_label: labelMap.get(r.id_registro) ?? '—'
    }))

    return { data, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /usuarios ────────────────────────────────────────────────────
  // Lista de usuarios distintos que aparecen como autor de algún evento
  // de auditoría, para poblar el filtro de usuario en el frontend.
  fastify.get('/usuarios', { preHandler: guard }, async (request, reply) => {
    const rows = await fastify.db.audit.findMany({
      where: { id_user: { not: null } },
      distinct: ['id_user'],
      select: { user: { select: { id: true, nombre: true } } }
    })
    return rows.map(r => r.user).filter(Boolean)
  })
}
