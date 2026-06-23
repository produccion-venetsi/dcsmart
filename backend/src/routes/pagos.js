import { Storage } from '@google-cloud/storage'

const gcs = new Storage({ projectId: process.env.GCS_PROJECT_ID })

// El estado de auditoría de un pago se guarda en la tabla `audits`
// (modelo Audit) con tabla='pagos' e id_registro=pago.id, NO como columna del pago.

// Devuelve un Set con los ids de pago que están auditados, de entre los ids dados.
// Si la tabla `audits` no existiera / fallara la consulta, degradamos a "ninguno
// auditado" para no romper el listado de pagos.
async function getAuditedSet(fastify, pagoIds) {
  if (!pagoIds.length) return new Set()
  try {
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'pagos', id_registro: { in: pagoIds } },
      select: { id_registro: true }
    })
    return new Set(rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (getAuditedSet)')
    return new Set()
  }
}

// Construye el filtro Prisma { id: { in/notIn } } para auditados/no-auditados.
// Si `audit` es undefined, no filtra (devuelve {}). Ante un error de la tabla
// `audits`, devolvemos {} (sin filtrar) para no romper la consulta de pagos.
async function buildAuditFilter(fastify, audit, allowedLocalIds) {
  if (audit === undefined) return {}
  try {
    const pagosInScope = await fastify.db.pago.findMany({
      where: { id_local: { in: allowedLocalIds } },
      select: { id: true }
    })
    const pagoIds = pagosInScope.map(p => p.id)
    if (!pagoIds.length) return audit === 'true' ? { id: { in: [] } } : {}
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'pagos', id_registro: { in: pagoIds } },
      select: { id_registro: true }
    })
    const auditedIds = [...new Set(rows.map(r => r.id_registro))]
    return audit === 'true' ? { id: { in: auditedIds } } : { id: { notIn: auditedIds } }
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (buildAuditFilter)')
    return {}
  }
}

export default async function pagosRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const {
      id_local, id_proveedor, pagado, estado_op,
      desde, hasta, id_tipo, id_rub, id_cat, id_rubcat,
      audit, ingresa_egreso, id_metodo, nro_ord,
      page = 1, limit = 50
    } = request.query
    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    const rubcatFilter = (id_rub || id_cat)
      ? { rubcat: { ...(id_rub ? { id_rub } : {}), ...(id_cat ? { id_cat } : {}) } }
      : id_rubcat ? { id_rubcat } : {}

    // El estado "auditado" no es una columna de pagos: vive en la tabla `audits`.
    // Para filtrar, traemos los ids de pagos que tienen registro de auditoría.
    const auditFilter = await buildAuditFilter(fastify, audit, request.allowedLocalIds)

    const where = {
      ...localFilter,
      ...rubcatFilter,
      ...auditFilter,
      ...(id_proveedor    ? { id_proveedor }                                : {}),
      ...(nro_ord         ? { nro_ord: parseInt(nro_ord) }                  : {}),
      ...(id_tipo         ? { id_tipo }                                     : {}),
      ...(id_metodo       ? { id_metodo }                                   : {}),
      ...(pagado          !== undefined ? { pagado:         pagado         === 'true' } : {}),
      ...(ingresa_egreso  !== undefined ? { ingresa_egreso: ingresa_egreso === 'true' } : {}),
      ...(estado_op       ? { estado_op }                                   : {}),
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
          proveedor:   { select: { id: true, nombre: true, razon_social: true } },
          rubcat:      { include: { rubro: true, categoria: true } },
          metodo_pago: true,
          local:       { select: { id: true, nombre: true } },
          creador:     { select: { id: true, nombre: true } }
        },
        orderBy: { fecha: 'desc' },
        skip,
        take
      }),
      fastify.db.pago.count({ where })
    ])

    // Marcar cada pago con audit:true/false según exista registro en `audits`.
    const auditedSet = await getAuditedSet(fastify, pagos.map(p => p.id))
    const data = pagos.map(p => ({ ...p, audit: auditedSet.has(p.id) }))

    return { data, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /stats ─────────────────────────────────────────────────────────
  fastify.get('/stats', { preHandler: viewHandler }, async (request, reply) => {
    const {
      id_local, desde, hasta, id_tipo, id_rub, id_cat, id_rubcat,
      audit, ingresa_egreso, id_metodo, id_proveedor, pagado, estado_op
    } = request.query

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    const rubcatFilter = (id_rub || id_cat)
      ? { rubcat: { ...(id_rub ? { id_rub } : {}), ...(id_cat ? { id_cat } : {}) } }
      : id_rubcat ? { id_rubcat } : {}

    const auditFilter = await buildAuditFilter(fastify, audit, request.allowedLocalIds)

    const where = {
      ...localFilter,
      ...rubcatFilter,
      ...auditFilter,
      ...(id_proveedor   ? { id_proveedor }                                : {}),
      ...(id_tipo        ? { id_tipo }                                     : {}),
      ...(id_metodo      ? { id_metodo }                                   : {}),
      ...(pagado         !== undefined ? { pagado:         pagado         === 'true' } : {}),
      ...(ingresa_egreso !== undefined ? { ingresa_egreso: ingresa_egreso === 'true' } : {}),
      ...(estado_op      ? { estado_op }                                   : {}),
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta + 'T23:59:59.999') } : {})
        }
      } : {})
    }

    const [total, noPagados, pagados] = await Promise.all([
      fastify.db.pago.aggregate({ where, _sum: { importe: true }, _count: { id: true } }),
      fastify.db.pago.aggregate({ where: { ...where, pagado: false }, _sum: { importe: true }, _count: { id: true } }),
      fastify.db.pago.aggregate({ where: { ...where, pagado: true },  _sum: { importe: true }, _count: { id: true } })
    ])

    return {
      importe_total:      Number(total._sum.importe      ?? 0),
      count_total:        total._count.id,
      importe_pendientes: Number(noPagados._sum.importe  ?? 0),
      count_pendientes:   noPagados._count.id,
      importe_pagados:    Number(pagados._sum.importe    ?? 0),
      count_pagados:      pagados._count.id
    }
  })

  // ── GET /chart ─────────────────────────────────────────────────────────
  fastify.get('/chart', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    // Sin locales permitidos (admin/cajero sin asignaciones) ⇒ nada que mostrar.
    if (!id_local && request.allowedLocalIds.length === 0) {
      return []
    }

    const params = []
    let conditions = `WHERE fecha IS NOT NULL`

    if (id_local) {
      params.push(id_local)
      conditions += ` AND id_local = $${params.length}`
    } else {
      const placeholders = request.allowedLocalIds
        .map((_, i) => `$${params.length + i + 1}`)
        .join(', ')
      conditions += ` AND id_local IN (${placeholders})`
      params.push(...request.allowedLocalIds)
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

  // ── GET /:id ───────────────────────────────────────────────────────────
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

    if (!request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    // Estado de auditoría desde la tabla `audits` (último registro si existe).
    const auditRow = await fastify.db.audit.findFirst({
      where: { tabla: 'pagos', id_registro: pago.id },
      orderBy: { fecha: 'desc' }
    })

    return {
      ...pago,
      audit:      !!auditRow,
      audit_by:   auditRow?.id_user ?? null,
      audit_date: auditRow?.fecha   ?? null,
    }
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const {
      nro_ord, fecha, id_proveedor, id_rubcat, id_tipo, pv, nro,
      importe_neto, descuento, importe, id_metodo, cashflow,
      observaciones, pagado, fecha_pago, estado_op, foto_url, pdf_url,
      periodo, ingresa_egreso, id_local, impuestos
    } = request.body

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const pago = await fastify.db.pago.create({
      data: {
        nro_ord:        nro_ord        ? (parseInt(nro_ord) || null) : null,
        fecha:          fecha          ? new Date(fecha)            : null,
        id_proveedor:   id_proveedor   || null,
        id_rubcat:      id_rubcat      || null,
        id_tipo:        id_tipo        || null,
        pv:             pv             ? (parseInt(pv) || null)    : null,
        nro:            nro            ? BigInt(nro)              : null,
        importe_neto:   importe_neto   ? parseFloat(importe_neto) : null,
        descuento:      descuento      ? parseFloat(descuento)    : null,
        importe:        importe        ? parseFloat(importe)      : null,
        id_metodo:      id_metodo      || null,
        cashflow:       cashflow       ? new Date(cashflow)       : null,
        observaciones,
        pagado:         pagado         ?? false,
        fecha_pago:     fecha_pago     ? new Date(fecha_pago)     : null,
        estado_op:      estado_op      || null,
        foto_url, pdf_url,
        periodo:        periodo        ? new Date(periodo)        : null,
        ingresa_egreso: ingresa_egreso ?? true,
        id_local:       id_local       || null,
        created_by:     request.user.id,
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

  // ── PUT /:id ──────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const {
      nro_ord, fecha, id_proveedor, id_rubcat, id_tipo, pv, nro,
      importe_neto, descuento, importe, id_metodo, cashflow,
      observaciones, pagado, fecha_pago, estado_op, foto_url, pdf_url,
      periodo, ingresa_egreso, id_local
    } = request.body

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso al local destino' })
    }

    const pago = await fastify.db.pago.update({
      where: { id: request.params.id },
      data: {
        nro_ord:        nro_ord        !== undefined ? (parseInt(nro_ord) || null) : undefined,
        fecha:          fecha                       ? new Date(fecha)             : undefined,
        id_proveedor:   id_proveedor   !== undefined ? id_proveedor               : undefined,
        id_rubcat:      id_rubcat      !== undefined ? id_rubcat                  : undefined,
        id_tipo:        id_tipo        !== undefined ? id_tipo                    : undefined,
        pv:             pv             !== undefined ? (parseInt(pv) || null)     : undefined,
        nro:            nro            !== undefined ? (nro ? BigInt(nro) : null) : undefined,
        importe_neto:   importe_neto   !== undefined ? parseFloat(importe_neto)   : undefined,
        descuento:      descuento      !== undefined ? parseFloat(descuento)      : undefined,
        importe:        importe        !== undefined ? parseFloat(importe)        : undefined,
        id_metodo:      id_metodo      !== undefined ? id_metodo                  : undefined,
        cashflow:       cashflow                    ? new Date(cashflow)          : undefined,
        observaciones,
        pagado,
        fecha_pago:     fecha_pago                  ? new Date(fecha_pago)        : undefined,
        estado_op,
        foto_url, pdf_url,
        periodo:        periodo                     ? new Date(periodo)           : undefined,
        ingresa_egreso,
        id_local:       id_local       !== undefined ? id_local                  : undefined,
      }
    })
    return pago
  })

  // ── PATCH /:id/audit ───────────────────────────────────────────────────
  // Alterna el estado de auditoría. Auditar = crear fila en `audits`.
  // Des-auditar = borrar las filas de auditoría de ese pago.
  fastify.patch('/:id/audit', { preHandler: editHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const existing = await fastify.db.audit.findFirst({
      where: { tabla: 'pagos', id_registro: request.params.id }
    })

    if (existing) {
      // Ya auditado → revertir (borrar todas las filas de auditoría del pago).
      await fastify.db.audit.deleteMany({
        where: { tabla: 'pagos', id_registro: request.params.id }
      })
      return { ok: true, audit: false }
    }

    // No auditado → crear registro de auditoría.
    await fastify.db.audit.create({
      data: {
        id_registro: request.params.id,
        tabla:       'pagos',
        tipo:        'auditoria_pago',
        aprobado:    true,
        id_user:     request.user.id,
        fecha:       new Date()
      }
    })
    return { ok: true, audit: true }
  })

  // ── POST /mandar-pdp ───────────────────────────────────────────────────
  // Flujo PDP, etapa 1: mueve los pagos seleccionados a estado PDP
  // (desde la "deuda" en cuenta corriente al armado del PDP).
  fastify.post('/mandar-pdp', { preHandler: editHandler }, async (request, reply) => {
    const { ids } = request.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'Sin pagos seleccionados' })
    }
    // Solo afecta pagos de locales a los que el usuario tiene acceso.
    const result = await fastify.db.pago.updateMany({
      where: { id: { in: ids }, id_local: { in: request.allowedLocalIds } },
      data: { estado_op: 'PDP' }
    })
    return { ok: true, count: result.count }
  })

  // ── POST /pagar ────────────────────────────────────────────────────────
  // Flujo PDP, etapa 2: marca los pagos seleccionados como pagados,
  // registrando fecha de pago y forma de pago (método).
  fastify.post('/pagar', { preHandler: editHandler }, async (request, reply) => {
    const { ids, fecha_pago, id_metodo } = request.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'Sin pagos seleccionados' })
    }
    if (!id_metodo) {
      return reply.code(400).send({ error: 'Forma de pago requerida' })
    }
    const result = await fastify.db.pago.updateMany({
      where: { id: { in: ids }, id_local: { in: request.allowedLocalIds } },
      data: {
        pagado:     true,
        fecha_pago: fecha_pago ? new Date(fecha_pago) : new Date(),
        id_metodo
      }
    })
    return { ok: true, count: result.count }
  })

  // ── GET /:id/attachment ────────────────────────────────────────────────
  // Streams a private GCS file (foto or pdf) through the backend.
  // The client sends its JWT as normal; this avoids exposing gs:// paths.
  fastify.get('/:id/attachment', { preHandler: viewHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where:  { id: request.params.id },
      select: { foto_url: true, pdf_url: true, id_local: true }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    if (!request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const type   = request.query.type === 'pdf' ? 'pdf' : 'foto'
    const gsPath = type === 'pdf' ? pago.pdf_url : pago.foto_url
    if (!gsPath?.startsWith('gs://')) return reply.code(404).send({ error: 'Sin adjunto' })

    const withoutScheme = gsPath.replace('gs://', '')
    const slashIdx      = withoutScheme.indexOf('/')
    const bucketName    = withoutScheme.slice(0, slashIdx)
    const filePath      = withoutScheme.slice(slashIdx + 1)

    const ext         = filePath.split('.').pop().toLowerCase()
    const contentType = type === 'pdf' ? 'application/pdf'
                      : ext === 'png'  ? 'image/png'
                      : 'image/jpeg'

    reply.header('Content-Type', contentType)
    reply.header('Cache-Control', 'private, max-age=300')

    const stream = gcs.bucket(bucketName).file(filePath).createReadStream({
      userProject: process.env.GCS_PROJECT_ID,
    })
    stream.on('error', (err) => {
      fastify.log.error({ err, gsPath }, 'GCS stream error')
      if (!reply.sent) reply.code(502).send({ error: 'No se pudo obtener el archivo' })
    })
    return reply.send(stream)
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    // Eliminar registros dependientes antes que el pago (FK constraints)
    await fastify.db.impuesto.deleteMany({ where: { id_pago: request.params.id } })
    await fastify.db.audit.deleteMany({ where: { tabla: 'pagos', id_registro: request.params.id } })
    await fastify.db.pago.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
