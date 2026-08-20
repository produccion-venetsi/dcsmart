import { parseMonto, parseEntero } from '../lib/montos.js'

const TIPOS_MOVIMIENTO = ['INICIAL', 'INGRESO', 'GASTO', 'COBRO', 'RETIRO', 'VACIADO']

export default async function cajaMoveRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja_movimientos', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja_movimientos', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja_movimientos', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja_movimientos', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_caja } = request.query

    const where = {
      ...(id_caja ? { id_caja } : {}),
      caja: { id_local: { in: request.allowedLocalIds } }
    }

    return fastify.db.cajaMovimiento.findMany({
      where,
      include: { metodo_pago: true },
      orderBy: { id: 'asc' }
    })
  })

  // ── GET /:id ───────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const mov = await fastify.db.cajaMovimiento.findUnique({
      where: { id: request.params.id },
      include: { metodo_pago: true, caja: true }
    })
    if (!mov) return reply.code(404).send({ error: 'Movimiento no encontrado' })

    if (!request.allowedLocalIds.includes(mov.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    return mov
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { tipo, id_metodo, monto, id_caja, cantidad } = request.body
    if (!tipo || monto === undefined || !id_caja) {
      return reply.code(400).send({ error: 'tipo, monto e id_caja son requeridos' })
    }
    if (!TIPOS_MOVIMIENTO.includes(tipo)) {
      return reply.code(400).send({ error: `tipo inválido. Use: ${TIPOS_MOVIMIENTO.join(', ')}` })
    }

    // El monto de un movimiento es siempre positivo: la dirección la da el
    // tipo (regla del proyecto). Lo no numérico es 400, no NaN → 500.
    const rMonto = parseMonto(monto, { requerido: true, positivo: true })
    if (!rMonto.ok) return reply.code(400).send({ error: rMonto.error })
    const rCant = parseEntero(cantidad, { campo: 'cantidad' })
    if (!rCant.ok) return reply.code(400).send({ error: rCant.error })

    const caja = await fastify.db.caja.findUnique({
      where: { id: id_caja },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const mov = await fastify.db.cajaMovimiento.create({
      data: {
        tipo,
        id_metodo: id_metodo || null,
        monto:     rMonto.value,
        id_caja,
        cantidad:  rCant.value
      },
      include: { metodo_pago: true }
    })
    return reply.code(201).send(mov)
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.cajaMovimiento.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Movimiento no encontrado' })

    if (!request.allowedLocalIds.includes(existing.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { tipo, id_metodo, monto, cantidad } = request.body
    if (tipo !== undefined && !TIPOS_MOVIMIENTO.includes(tipo)) {
      return reply.code(400).send({ error: `tipo inválido. Use: ${TIPOS_MOVIMIENTO.join(', ')}` })
    }
    let montoVal
    if (monto !== undefined) {
      const r = parseMonto(monto, { requerido: true, positivo: true })
      if (!r.ok) return reply.code(400).send({ error: r.error })
      montoVal = r.value
    }
    let cantVal
    if (cantidad !== undefined) {
      const r = parseEntero(cantidad, { campo: 'cantidad' })
      if (!r.ok) return reply.code(400).send({ error: r.error })
      cantVal = r.value
    }
    const mov = await fastify.db.cajaMovimiento.update({
      where: { id: request.params.id },
      data: {
        tipo,
        // '' significa "sacar el método": va como null, no como FK inválida
        // (antes el string vacío explotaba con P2003 → 500).
        id_metodo: id_metodo !== undefined ? (id_metodo || null) : undefined,
        monto:     montoVal,
        cantidad:  cantVal
      },
      include: { metodo_pago: true }
    })
    return mov
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.cajaMovimiento.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Movimiento no encontrado' })

    if (!request.allowedLocalIds.includes(existing.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    await fastify.db.cajaMovimiento.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
