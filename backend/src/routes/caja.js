// El estado de auditoría de una caja se guarda en la tabla `audits`
// (modelo Audit) con tabla='cajas' e id_registro=caja.id, igual que en pagos.
// Ver backend/src/routes/pagos.js para la explicación del historial append-only.

async function getAuditedCajaSet(fastify, cajaIds) {
  if (!cajaIds.length) return new Set()
  try {
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'cajas', id_registro: { in: cajaIds }, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    return new Set(rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (getAuditedCajaSet)')
    return new Set()
  }
}

async function buildCajaAuditFilter(fastify, audit, allowedLocalIds) {
  if (audit === undefined) return {}
  try {
    const cajasInScope = await fastify.db.caja.findMany({
      where: { id_local: { in: allowedLocalIds } },
      select: { id: true }
    })
    const cajaIds = cajasInScope.map(c => c.id)
    if (!cajaIds.length) return audit === 'true' ? { id: { in: [] } } : {}
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'cajas', id_registro: { in: cajaIds }, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    const auditedIds = [...new Set(rows.map(r => r.id_registro))]
    return audit === 'true' ? { id: { in: auditedIds } } : { id: { notIn: auditedIds } }
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (buildCajaAuditFilter)')
    return {}
  }
}

export default async function cajaRoutes(fastify) {
  const viewHandler    = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  const createHandler  = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const editHandler    = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'edit')]
  const deleteHandler  = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta, audit, page = 1, limit = 50 } = request.query
    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }
    const auditFilter = await buildCajaAuditFilter(fastify, audit, request.allowedLocalIds)

    const where = {
      ...localFilter,
      ...auditFilter,
      ...(desde || hasta ? {
        fecha_inicio: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta) } : {})
        }
      } : {})
    }

    const [cajas, total] = await Promise.all([
      fastify.db.caja.findMany({
        where,
        include: {
          local:   { select: { id: true, nombre: true } },
          creador: { select: { id: true, nombre: true } }
        },
        orderBy: { fecha_inicio: 'desc' },
        skip,
        take
      }),
      fastify.db.caja.count({ where })
    ])

    const auditedSet = await getAuditedCajaSet(fastify, cajas.map(c => c.id))
    const data = cajas.map(c => ({ ...c, audit: auditedSet.has(c.id) }))

    return { data, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /stats ─────────────────────────────────────────────────────────
  fastify.get('/stats', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    const where = {
      ...localFilter,
      ...(desde || hasta ? {
        fecha_inicio: {
          ...(desde && { gte: new Date(desde) }),
          ...(hasta && { lte: new Date(hasta + 'T23:59:59.999') })
        }
      } : {})
    }

    const agg = await fastify.db.caja.aggregate({
      where,
      _sum:   { total: true, efectivo: true, tickets: true, comensales: true },
      _count: { id: true }
    })

    return {
      total_recaudado:  Number(agg._sum.total      ?? 0),
      count_turnos:     agg._count.id,
      total_efectivo:   Number(agg._sum.efectivo   ?? 0),
      total_tickets:    agg._sum.tickets            ?? 0,
      total_comensales: agg._sum.comensales         ?? 0,
    }
  })

  // ── GET /:id ───────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      include: {
        local:       true,
        creador:     { select: { id: true, nombre: true } },
        movimientos: { include: { metodo_pago: true } },
        detalles: {
          include: {
            detalle_tipo: { select: { id: true, nombre: true } }
          },
          orderBy: { created_at: 'asc' }
        }
      }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const auditRow = await fastify.db.audit.findFirst({
      where: { tabla: 'cajas', id_registro: caja.id, vigente: true },
      include: { user: { select: { id: true, nombre: true } } }
    })

    return {
      ...caja,
      audit:      auditRow?.accion === 'auditado',
      audit_by:   auditRow?.user?.nombre ?? null,
      audit_date: auditRow?.fecha ?? null,
    }
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const {
      nro_turno, fecha_inicio, fecha_cierre, id_local, cajero,
      total, efectivo, fiscal, comensales, tickets, observaciones, foto_url, origin
    } = request.body

    if (!fecha_inicio || !id_local) {
      return reply.code(400).send({ error: 'fecha_inicio e id_local son requeridos' })
    }

    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const caja = await fastify.db.caja.create({
      data: {
        nro_turno:    nro_turno    ? String(parseInt(nro_turno)) : null,
        fecha_inicio: new Date(fecha_inicio),
        fecha_cierre: fecha_cierre ? new Date(fecha_cierre)      : null,
        id_local, cajero,
        total:        total        ? parseFloat(total)           : null,
        efectivo:     efectivo     ? parseFloat(efectivo)        : null,
        fiscal:       fiscal       ? parseFloat(fiscal)          : null,
        comensales:   comensales   ? parseInt(comensales)        : null,
        tickets:      tickets      ? parseInt(tickets)           : null,
        observaciones, foto_url,
        origin: origin || 'DCSMART',
        created_by: request.user.id
      }
    })
    return reply.code(201).send(caja)
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const {
      nro_turno, fecha_cierre, cajero, total, efectivo, fiscal,
      comensales, tickets, observaciones, foto_url
    } = request.body

    const caja = await fastify.db.caja.update({
      where: { id: request.params.id },
      data: {
        nro_turno,
        fecha_cierre:  fecha_cierre  ? new Date(fecha_cierre)  : undefined,
        cajero,
        total:         total         !== undefined ? parseFloat(total)         : undefined,
        efectivo:      efectivo      !== undefined ? parseFloat(efectivo)      : undefined,
        fiscal:        fiscal        !== undefined ? parseFloat(fiscal)        : undefined,
        comensales:    comensales    !== undefined ? parseInt(comensales)      : undefined,
        tickets:       tickets       !== undefined ? parseInt(tickets)         : undefined,
        observaciones, foto_url
      }
    })
    return caja
  })

  // ── PATCH /:id/audit ───────────────────────────────────────────────────
  // Mismo mecanismo de historial append-only que pagos (ver pagos.js).
  fastify.patch('/:id/audit', { preHandler: editHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { observaciones } = request.body ?? {}

    const nextAccion = await fastify.db.$transaction(async (tx) => {
      const current = await tx.audit.findFirst({
        where: { tabla: 'cajas', id_registro: request.params.id, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'cajas', id_registro: request.params.id, vigente: true },
        data: { vigente: false }
      })

      const accion = current?.accion === 'auditado' ? 'desauditado' : 'auditado'

      await tx.audit.create({
        data: {
          id_registro:   request.params.id,
          tabla:         'cajas',
          tipo:          'auditoria_caja',
          accion,
          aprobado:      accion === 'auditado',
          vigente:       true,
          id_user:       request.user.id,
          fecha:         new Date(),
          observaciones: accion === 'desauditado' ? (observaciones || null) : null
        }
      })

      return accion
    })

    return { ok: true, audit: nextAccion === 'auditado' }
  })

  // ── GET /:id/audit-history ─────────────────────────────────────────────
  fastify.get('/:id/audit-history', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })
    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    return fastify.db.audit.findMany({
      where: { tabla: 'cajas', id_registro: request.params.id },
      orderBy: { fecha: 'desc' },
      include: { user: { select: { id: true, nombre: true } } }
    })
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    // Eliminar registros dependientes antes que la caja (FK constraints)
    await fastify.db.cajaMovimiento.deleteMany({ where: { id_caja: request.params.id } })
    await fastify.db.cajaDetalle.deleteMany({ where: { id_caja: request.params.id } })
    await fastify.db.caja.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
