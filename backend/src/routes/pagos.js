export default async function pagosRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('pagos', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const {
      id_local, id_proveedor, pagado, estado_op,
      desde, hasta, page = 1, limit = 50
    } = request.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      ...(id_local     ? { id_local }     : {}),
      ...(id_proveedor ? { id_proveedor } : {}),
      ...(pagado !== undefined ? { pagado: pagado === 'true' } : {}),
      ...(estado_op    ? { estado_op }    : {}),
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta) } : {})
        }
      } : {})
    }

    const [pagos, total] = await Promise.all([
      fastify.db.pago.findMany({
        where,
        include: {
          proveedor:   { select: { id: true, nombre: true } },
          rubcat:      { include: { rubro: true, categoria: true } },
          metodo_pago: true,
          local:       { select: { id: true, nombre: true } },
          creador:     { select: { id: true, nombre: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: Number(limit)
      }),
      fastify.db.pago.count({ where })
    ])

    return { data: pagos, total, page: Number(page), limit: Number(limit) }
  })

  fastify.get('/stats', { preHandler: viewHandler }, async (request) => {
    const { id_local, desde, hasta } = request.query
    const where = {
      ...(id_local ? { id_local } : {}),
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta + 'T23:59:59.999') } : {})
        }
      } : {})
    }

    const [total, noPagados, pagados] = await Promise.all([
      fastify.db.pago.aggregate({
        where,
        _sum:   { importe: true },
        _count: { id: true }
      }),
      fastify.db.pago.aggregate({
        where: { ...where, pagado: false },
        _sum:   { importe: true },
        _count: { id: true }
      }),
      fastify.db.pago.aggregate({
        where: { ...where, pagado: true },
        _sum:   { importe: true },
        _count: { id: true }
      })
    ])

    return {
      importe_total:      Number(total._sum.importe     ?? 0),
      count_total:        total._count.id,
      importe_pendientes: Number(noPagados._sum.importe ?? 0),
      count_pendientes:   noPagados._count.id,
      importe_pagados:    Number(pagados._sum.importe   ?? 0),
      count_pagados:      pagados._count.id
    }
  })

  fastify.get('/chart', { preHandler: viewHandler }, async (request) => {
    const { id_local, desde, hasta } = request.query

    const params = []
    let conditions = `WHERE fecha IS NOT NULL`

    if (id_local) {
      params.push(id_local)
      conditions += ` AND id_local = $${params.length}`
    }
    if (desde) {
      params.push(new Date(desde))
      conditions += ` AND fecha >= $${params.length}`
    }
    if (hasta) {
      params.push(new Date(hasta + 'T23:59:59.999'))
      conditions += ` AND fecha <= $${params.length}`
    }

    const rows = await fastify.db.$queryRawUnsafe(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', fecha), 'YYYY-MM') AS mes,
        SUM(CASE WHEN pagado = true  THEN COALESCE(importe, 0) ELSE 0 END) AS pagados,
        SUM(CASE WHEN pagado = false THEN COALESCE(importe, 0) ELSE 0 END) AS pendientes
      FROM pagos
      ${conditions}
      GROUP BY DATE_TRUNC('month', fecha)
      ORDER BY DATE_TRUNC('month', fecha)
    `, ...params)

    return rows.map(r => ({
      mes:        r.mes,
      pagados:    Number(r.pagados    ?? 0),
      pendientes: Number(r.pendientes ?? 0)
    }))
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      include: {
        proveedor:   true,
        rubcat:      { include: { rubro: true, categoria: true } },
        metodo_pago: true,
        local:       true,
        creador:     { select: { id: true, nombre: true } },
        impuestos:   true
      }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    return pago
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'create')]
  }, async (request, reply) => {
    const {
      nro_ord, fecha, id_proveedor, id_rubcat, id_tipo, pv, nro,
      importe_neto, descuento, importe, id_metodo, cashflow,
      observaciones, pagado, fecha_pago, estado_op, foto_url, pdf_url,
      periodo, ingresa_egreso, id_local, impuestos
    } = request.body

    const pago = await fastify.db.pago.create({
      data: {
        nro_ord:       nro_ord       ? parseInt(nro_ord)       : null,
        fecha:         fecha         ? new Date(fecha)         : null,
        id_proveedor:  id_proveedor  || null,
        id_rubcat:     id_rubcat     || null,
        id_tipo:       id_tipo       || null,
        pv:            pv            ? parseInt(pv)            : null,
        nro:           nro           ? BigInt(nro)             : null,
        importe_neto:  importe_neto  ? parseFloat(importe_neto)  : null,
        descuento:     descuento     ? parseFloat(descuento)     : null,
        importe:       importe       ? parseFloat(importe)       : null,
        id_metodo:     id_metodo     || null,
        cashflow:      cashflow      ? new Date(cashflow)      : null,
        observaciones,
        pagado:        pagado        ?? false,
        fecha_pago:    fecha_pago    ? new Date(fecha_pago)    : null,
        estado_op:     estado_op     || null,
        foto_url, pdf_url,
        periodo:       periodo       ? new Date(periodo)       : null,
        ingresa_egreso: ingresa_egreso ?? true,
        id_local:      id_local      || null,
        created_by:    request.user.id,
        ...(impuestos && impuestos.length > 0 ? {
          impuestos: {
            create: impuestos.map(imp => ({
              tipo:  imp.tipo,
              monto: parseFloat(imp.monto)
            }))
          }
        } : {})
      },
      include: { impuestos: true }
    })
    return reply.code(201).send(pago)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'edit')]
  }, async (request, reply) => {
    const {
      nro_ord, fecha, id_proveedor, id_rubcat, id_tipo, pv, nro,
      importe_neto, descuento, importe, id_metodo, cashflow,
      observaciones, pagado, fecha_pago, estado_op, foto_url, pdf_url,
      periodo, ingresa_egreso, id_local
    } = request.body

    try {
      const pago = await fastify.db.pago.update({
        where: { id: request.params.id },
        data: {
          nro_ord:        nro_ord        !== undefined ? parseInt(nro_ord)        : undefined,
          fecha:          fecha                       ? new Date(fecha)           : undefined,
          id_proveedor:   id_proveedor   !== undefined ? id_proveedor             : undefined,
          id_rubcat:      id_rubcat      !== undefined ? id_rubcat                : undefined,
          id_tipo:        id_tipo        !== undefined ? id_tipo                  : undefined,
          pv:             pv             !== undefined ? parseInt(pv)             : undefined,
          nro:            nro            !== undefined ? (nro ? BigInt(nro) : null) : undefined,
          importe_neto:   importe_neto   !== undefined ? parseFloat(importe_neto)  : undefined,
          descuento:      descuento      !== undefined ? parseFloat(descuento)      : undefined,
          importe:        importe        !== undefined ? parseFloat(importe)        : undefined,
          id_metodo:      id_metodo      !== undefined ? id_metodo                 : undefined,
          cashflow:       cashflow                    ? new Date(cashflow)         : undefined,
          observaciones,
          pagado,
          fecha_pago:     fecha_pago                  ? new Date(fecha_pago)       : undefined,
          estado_op,
          foto_url, pdf_url,
          periodo:        periodo                     ? new Date(periodo)          : undefined,
          ingresa_egreso,
          id_local
        }
      })
      return pago
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
      throw err
    }
  })

  fastify.patch('/:id/audit', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'edit')]
  }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({ where: { id: request.params.id } })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })

    await fastify.db.audit.create({
      data: {
        id_registro: request.params.id,
        tabla:       'pagos',
        tipo:        'auditoria_pago',
        aprobado:    true,
        id_user:     request.user.email,
        fecha:       new Date()
      }
    })
    return { ok: true }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.pago.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
      throw err
    }
  })
}
