// Arqueo: conteo físico de efectivo por local (caja fuerte + cofre + adición),
// comparado contra lo acumulado en el sistema desde el arqueo anterior del
// mismo local. Ver docs/superpowers/specs/2026-07-16-arqueo-design.md para
// la fórmula completa.

// Busca el arqueo anterior de un local (el más reciente con fecha < la nueva).
// Devuelve null si es el primer arqueo del local.
async function getArqueoAnterior(fastify, id_local, fecha) {
  return fastify.db.arqueo.findFirst({
    where: { id_local, fecha: { lt: fecha } },
    orderBy: { fecha: 'desc' }
  })
}

// Suma Caja.efectivo del local en (fechaDesde, fechaHasta] -- fechaDesde exclusivo, fechaHasta inclusivo.
async function calcularIngresos(fastify, id_local, fechaDesde, fechaHasta) {
  const cajas = await fastify.db.caja.findMany({
    where: {
      id_local,
      fecha_inicio: {
        ...(fechaDesde ? { gt: fechaDesde } : {}),
        lte: fechaHasta
      }
    },
    select: { efectivo: true }
  })
  return cajas.reduce((acc, c) => acc + Number(c.efectivo ?? 0), 0)
}

// Suma Pago.importe del local, pagado=true, en efectivo, egreso real, en (fechaDesde, fechaHasta].
async function calcularGastos(fastify, id_local, fechaDesde, fechaHasta) {
  const metodoEfectivo = await fastify.db.metodoPago.findFirst({
    where: { nombre: { equals: 'Efectivo', mode: 'insensitive' } }
  })
  if (!metodoEfectivo) return 0
  const pagos = await fastify.db.pago.findMany({
    where: {
      id_local,
      pagado: true,
      ingresa_egreso: false,
      id_metodo: metodoEfectivo.id,
      fecha_pago: {
        ...(fechaDesde ? { gt: fechaDesde } : {}),
        lte: fechaHasta
      }
    },
    select: { importe: true }
  })
  return pagos.reduce((acc, p) => acc + Number(p.importe ?? 0), 0)
}

// El estado de auditoría de un arqueo se guarda en la tabla `audits`
// (modelo Audit) con tabla='arqueos' e id_registro=arqueo.id, igual que
// pagos y cajas.
async function getAuditedArqueoSet(fastify, arqueoIds) {
  if (!arqueoIds.length) return new Set()
  try {
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'arqueos', id_registro: { in: arqueoIds }, audit_dc: false, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    return new Set(rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (getAuditedArqueoSet)')
    return new Set()
  }
}

export default async function arqueoRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('arqueo', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('arqueo', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('arqueo', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('arqueo', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local } = request.query
    if (!id_local || !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const arqueos = await fastify.db.arqueo.findMany({
      where: { id_local },
      orderBy: { fecha: 'desc' }
    })
    const auditedSet = await getAuditedArqueoSet(fastify, arqueos.map(a => a.id))
    const data = arqueos.map(a => ({ ...a, audit: auditedSet.has(a.id) }))
    return { data }
  })

  // ── GET /:id ──────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const arqueo = await fastify.db.arqueo.findUnique({
      where: { id: request.params.id },
      include: { detalles: { include: { detalle_tipo: true } } }
    })
    if (!arqueo) return reply.code(404).send({ error: 'Arqueo no encontrado' })
    if (!request.allowedLocalIds.includes(arqueo.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }
    const auditRow = await fastify.db.audit.findFirst({
      where: { tabla: 'arqueos', id_registro: arqueo.id, vigente: true, audit_dc: false },
      include: { user: { select: { id: true, nombre: true } } }
    })
    return {
      ...arqueo,
      audit:      auditRow?.accion === 'auditado',
      audit_by:   auditRow?.user?.nombre ?? null,
      audit_date: auditRow?.fecha ?? null,
    }
  })

  // ── PATCH /:id/audit ────────────────────────────────────────────────────
  // Mismo mecanismo de historial append-only que pagos y cajas (ver pagos.js/caja.js).
  fastify.patch('/:id/audit', { preHandler: editHandler }, async (request, reply) => {
    const arqueo = await fastify.db.arqueo.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!arqueo) return reply.code(404).send({ error: 'Arqueo no encontrado' })
    if (!request.allowedLocalIds.includes(arqueo.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { observaciones } = request.body ?? {}

    const nextAccion = await fastify.db.$transaction(async (tx) => {
      const current = await tx.audit.findFirst({
        where: { tabla: 'arqueos', id_registro: request.params.id, audit_dc: false, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'arqueos', id_registro: request.params.id, audit_dc: false, vigente: true },
        data: { vigente: false }
      })

      const accion = current?.accion === 'auditado' ? 'desauditado' : 'auditado'

      await tx.audit.create({
        data: {
          id_registro:   request.params.id,
          tabla:         'arqueos',
          tipo:          'auditoria_arqueo',
          accion,
          aprobado:      accion === 'auditado',
          vigente:       true,
          audit_dc:      false,
          id_user:       request.user.id,
          fecha:         new Date(),
          observaciones: accion === 'desauditado' ? (observaciones || null) : null
        }
      })

      return accion
    })

    return { ok: true, audit: nextAccion === 'auditado' }
  })

  // ── GET /preview ──────────────────────────────────────────────────────
  // Mismo cálculo que POST /, pero sin persistir nada -- para que el
  // frontend muestre la comprobación en vivo antes de confirmar.
  fastify.get('/preview', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, fecha } = request.query
    if (!id_local || !fecha) {
      return reply.code(400).send({ error: 'id_local y fecha son requeridos' })
    }
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const fechaArqueo = new Date(fecha)
    const anterior = await getArqueoAnterior(fastify, id_local, fechaArqueo)
    const totalUltimoArqueo = anterior ? Number(anterior.total) : 0
    const fechaDesde = anterior ? anterior.fecha : null

    const ingresos = await calcularIngresos(fastify, id_local, fechaDesde, fechaArqueo)
    const gastos = await calcularGastos(fastify, id_local, fechaDesde, fechaArqueo)

    return { total_ultimo_arqueo: totalUltimoArqueo, ingresos, gastos }
  })

  // ── POST / ────────────────────────────────────────────────────────────
  // body: { id_local, fecha, caja_fuerte, cofre, adicion, detalles?: [{id_tipo?, nombre?, monto}] }
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { id_local, fecha, caja_fuerte, cofre, adicion, detalles } = request.body
    if (!id_local || !fecha || caja_fuerte == null || cofre == null || adicion == null) {
      return reply.code(400).send({ error: 'id_local, fecha, caja_fuerte, cofre y adicion son requeridos' })
    }
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }

    const fechaArqueo = new Date(fecha)
    const anterior = await getArqueoAnterior(fastify, id_local, fechaArqueo)
    const totalUltimoArqueo = anterior ? Number(anterior.total) : 0
    const fechaDesde = anterior ? anterior.fecha : null

    const total = Number(caja_fuerte) + Number(cofre) + Number(adicion)
    const ingresos = await calcularIngresos(fastify, id_local, fechaDesde, fechaArqueo)
    const gastos = await calcularGastos(fastify, id_local, fechaDesde, fechaArqueo)
    // Compara cuánto debería haber cambiado la plata según el sistema (ingresos -
    // gastos) contra cuánto cambió realmente la plata contada (total - total del
    // arqueo anterior). Positivo = falta, negativo = sobra, 0 = cuadra.
    const comprobacion = (ingresos - gastos) - (total - totalUltimoArqueo)

    const arqueo = await fastify.db.arqueo.create({
      data: {
        id_local,
        fecha: fechaArqueo,
        caja_fuerte: String(caja_fuerte),
        cofre: String(cofre),
        adicion: String(adicion),
        total: String(total),
        ingresos: String(ingresos),
        gastos: String(gastos),
        comprobacion: String(comprobacion),
        created_by: request.user.id,
        detalles: {
          create: (detalles || []).map((d) => ({
            id_tipo: d.id_tipo || null,
            nombre: d.nombre || null,
            monto: String(d.monto ?? 0)
          }))
        }
      },
      include: { detalles: true }
    })
    return reply.code(201).send(arqueo)
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  // body: { fecha, caja_fuerte, cofre, adicion, detalles?: [{id_tipo?, nombre?, monto}] }
  // Recalcula total/ingresos/gastos/comprobacion de ESTE arqueo con la misma
  // lógica del POST. No recalcula otros arqueos del local.
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existente = await fastify.db.arqueo.findUnique({ where: { id: request.params.id } })
    if (!existente) return reply.code(404).send({ error: 'Arqueo no encontrado' })
    if (!request.allowedLocalIds.includes(existente.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { fecha, caja_fuerte, cofre, adicion, detalles } = request.body
    if (!fecha || caja_fuerte == null || cofre == null || adicion == null) {
      return reply.code(400).send({ error: 'fecha, caja_fuerte, cofre y adicion son requeridos' })
    }

    const fechaArqueo = new Date(fecha)
    const anterior = await fastify.db.arqueo.findFirst({
      where: { id_local: existente.id_local, fecha: { lt: fechaArqueo }, id: { not: existente.id } },
      orderBy: { fecha: 'desc' }
    })
    const totalUltimoArqueo = anterior ? Number(anterior.total) : 0
    const fechaDesde = anterior ? anterior.fecha : null

    const total = Number(caja_fuerte) + Number(cofre) + Number(adicion)
    const ingresos = await calcularIngresos(fastify, existente.id_local, fechaDesde, fechaArqueo)
    const gastos = await calcularGastos(fastify, existente.id_local, fechaDesde, fechaArqueo)
    const comprobacion = (ingresos - gastos) - (total - totalUltimoArqueo)

    const arqueo = await fastify.db.arqueo.update({
      where: { id: existente.id },
      data: {
        fecha: fechaArqueo,
        caja_fuerte: String(caja_fuerte),
        cofre: String(cofre),
        adicion: String(adicion),
        total: String(total),
        ingresos: String(ingresos),
        gastos: String(gastos),
        comprobacion: String(comprobacion),
        detalles: {
          deleteMany: {},
          create: (detalles || []).map((d) => ({
            id_tipo: d.id_tipo || null,
            nombre: d.nombre || null,
            monto: String(d.monto ?? 0)
          }))
        }
      },
      include: { detalles: true }
    })
    return arqueo
  })

  // ── DELETE /:id ───────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existente = await fastify.db.arqueo.findUnique({ where: { id: request.params.id } })
    if (!existente) return reply.code(404).send({ error: 'Arqueo no encontrado' })
    if (!request.allowedLocalIds.includes(existente.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }
    await fastify.db.arqueoDetalle.deleteMany({ where: { id_arqueo: existente.id } })
    await fastify.db.arqueo.delete({ where: { id: existente.id } })
    return reply.code(204).send()
  })
}
