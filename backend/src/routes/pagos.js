export default async function pagosRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('pagos', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const {
      id_local, id_proveedor, pagado, estado_op,
      desde, hasta, page = 1, limit = 50
    } = request.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      ...(id_local ? { id_local } : {}),
      ...(id_proveedor ? { id_proveedor } : {}),
      ...(pagado !== undefined ? { pagado: pagado === 'true' } : {}),
      ...(estado_op ? { estado_op } : {}),
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
          proveedor: { select: { id: true, nombre: true } },
          rubcat: { include: { rubro: true, categoria: true } },
          metodo_pago: true,
          creador: { select: { id: true, nombre: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: Number(limit)
      }),
      fastify.db.pago.count({ where })
    ])

    return { data: pagos, total, page: Number(page), limit: Number(limit) }
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      include: {
        proveedor: true,
        rubcat: { include: { rubro: true, categoria: true } },
        metodo_pago: true,
        local: true,
        creador: { select: { id: true, nombre: true } },
        auditor: { select: { id: true, nombre: true } },
        impuestos: true
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
        nro_ord: nro_ord ? parseInt(nro_ord) : null,
        fecha: fecha ? new Date(fecha) : null,
        id_proveedor: id_proveedor || null,
        id_rubcat: id_rubcat || null,
        id_tipo: id_tipo || null,
        pv: pv ? parseInt(pv) : null,
        nro: nro ? parseInt(nro) : null,
        importe_neto: importe_neto ? parseFloat(importe_neto) : null,
        descuento: descuento ? parseFloat(descuento) : null,
        importe: importe ? parseFloat(importe) : null,
        id_metodo: id_metodo || null,
        cashflow: cashflow ? new Date(cashflow) : null,
        observaciones,
        pagado: pagado ?? false,
        fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
        estado_op: estado_op || null,
        foto_url, pdf_url,
        periodo: periodo ? new Date(periodo) : null,
        ingresa_egreso: ingresa_egreso ?? true,
        id_local: id_local || null,
        created_by: request.user.id,
        ...(impuestos && impuestos.length > 0 ? {
          impuestos: {
            create: impuestos.map(imp => ({
              tipo: imp.tipo,
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
          nro_ord: nro_ord !== undefined ? parseInt(nro_ord) : undefined,
          fecha: fecha ? new Date(fecha) : undefined,
          id_proveedor: id_proveedor !== undefined ? id_proveedor : undefined,
          id_rubcat: id_rubcat !== undefined ? id_rubcat : undefined,
          id_tipo: id_tipo !== undefined ? id_tipo : undefined,
          pv: pv !== undefined ? parseInt(pv) : undefined,
          nro: nro !== undefined ? parseInt(nro) : undefined,
          importe_neto: importe_neto !== undefined ? parseFloat(importe_neto) : undefined,
          descuento: descuento !== undefined ? parseFloat(descuento) : undefined,
          importe: importe !== undefined ? parseFloat(importe) : undefined,
          id_metodo: id_metodo !== undefined ? id_metodo : undefined,
          cashflow: cashflow ? new Date(cashflow) : undefined,
          observaciones,
          pagado,
          fecha_pago: fecha_pago ? new Date(fecha_pago) : undefined,
          estado_op,
          foto_url, pdf_url,
          periodo: periodo ? new Date(periodo) : undefined,
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
    try {
      const pago = await fastify.db.pago.update({
        where: { id: request.params.id },
        data: {
          audit: true,
          user_audit: request.user.id,
          audit_date: new Date()
        }
      })
      return pago
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
      throw err
    }
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
