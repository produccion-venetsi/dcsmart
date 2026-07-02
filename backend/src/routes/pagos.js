import { Storage } from '@google-cloud/storage'
import multipart from '@fastify/multipart'

// El estado de auditoría de un pago se guarda en la tabla `audits`
// (modelo Audit) con tabla='pagos' e id_registro=pago.id, NO como columna del pago.
// Cada auditar/desauditar inserta una fila nueva (historial append-only);
// el estado actual es la fila con vigente=true de ese id_registro.

// Devuelve un Set con los ids de pago que están auditados (vigente y con
// accion='auditado'), de entre los ids dados.
async function getAuditedSet(fastify, pagoIds) {
  if (!pagoIds.length) return new Set()
  try {
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'pagos', id_registro: { in: pagoIds }, vigente: true, accion: 'auditado' },
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
      where: { tabla: 'pagos', id_registro: { in: pagoIds }, vigente: true, accion: 'auditado' },
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
  await fastify.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
  const gcs = new Storage()

  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const {
      id_local, id_proveedor, id_proveedores, pagado, estado_op,
      desde, hasta, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
      audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick,
      sort_field = 'fecha', sort_dir = 'desc',
      page = 1, limit = 50
    } = request.query

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    // Rubcat: cmv_quick > id_rubcats (multi) > id_rub/id_cat > id_rubcat
    const rubcatIdsArr = id_rubcats ? id_rubcats.split(',').filter(Boolean) : []
    let rubcatFilter = {}
    if (cmv_quick === 'true') {
      rubcatFilter = { rubcat: { rubro: { nombre: { startsWith: 'CMV', mode: 'insensitive' } } } }
    } else if (rubcatIdsArr.length > 0) {
      rubcatFilter = { id_rubcat: { in: rubcatIdsArr } }
    } else if (id_rub || id_cat) {
      rubcatFilter = { rubcat: { ...(id_rub ? { id_rub } : {}), ...(id_cat ? { id_cat } : {}) } }
    } else if (id_rubcat) {
      rubcatFilter = { id_rubcat }
    }

    // Proveedor: multi > single
    const provIdsArr = id_proveedores ? id_proveedores.split(',').filter(Boolean) : []
    const proveedorFilter = provIdsArr.length > 0
      ? { id_proveedor: { in: provIdsArr } }
      : id_proveedor ? { id_proveedor } : {}

    const auditFilter = await buildAuditFilter(fastify, audit, request.allowedLocalIds)

    const where = {
      ...localFilter,
      ...rubcatFilter,
      ...auditFilter,
      ...proveedorFilter,
      ...(nro_ord        ? { nro_ord: parseInt(nro_ord) }                  : {}),
      ...(id_tipo        ? { id_tipo }                                      : {}),
      ...(id_metodo      ? { id_metodo }                                    : {}),
      ...(pagado         !== undefined ? { pagado:         pagado         === 'true' } : {}),
      ...(ingresa_egreso !== undefined ? { ingresa_egreso: ingresa_egreso === 'true' } : {}),
      ...(estado_op      ? { estado_op }                                    : {}),
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta) } : {})
        }
      } : {})
    }

    const VALID_SORT = ['fecha', 'importe', 'fecha_pago', 'periodo', 'nro_ord']
    const orderField = VALID_SORT.includes(sort_field) ? sort_field : 'fecha'
    const orderDir   = sort_dir === 'asc' ? 'asc' : 'desc'
    const orderBy    = sort_field === 'proveedor'
      ? { proveedor: { nombre: orderDir } }
      : { [orderField]: orderDir }

    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

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
        orderBy,
        skip,
        take
      }),
      fastify.db.pago.count({ where })
    ])

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

    // Estado de auditoría desde la tabla `audits` (fila vigente, si existe).
    const auditRow = await fastify.db.audit.findFirst({
      where: { tabla: 'pagos', id_registro: pago.id, vigente: true },
      include: { user: { select: { id: true, nombre: true } } }
    })

    return {
      ...pago,
      audit:      auditRow?.accion === 'auditado',
      audit_by:   auditRow?.user?.nombre ?? null,
      audit_date: auditRow?.fecha ?? null,
    }
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const {
      nro_ord, fecha, id_proveedor, id_rubcat, id_tipo, pv, nro,
      importe_neto, descuento, importe, id_metodo, cashflow,
      observaciones, pagado, fecha_pago, estado_op, foto_url, pdf_url,
      periodo, ingresa_egreso, periodico, id_local, impuestos
    } = request.body

    if (!fecha) return reply.code(400).send({ error: 'fecha es requerida' })
    if (!importe && importe !== 0) return reply.code(400).send({ error: 'importe es requerido' })
    if (!id_local) return reply.code(400).send({ error: 'id_local es requerido' })

    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    let finalNroOrd = nro_ord ? (parseInt(nro_ord) || null) : null
    if (!finalNroOrd) {
      const last = await fastify.db.pago.findFirst({
        where: { id_local, nro_ord: { not: null } },
        orderBy: { nro_ord: 'desc' },
        select: { nro_ord: true }
      })
      finalNroOrd = (last?.nro_ord ?? 0) + 1
    }

    const pago = await fastify.db.pago.create({
      data: {
        nro_ord:        finalNroOrd,
        fecha:          new Date(fecha),
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
        periodico:      periodico      ?? false,
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
      periodo, ingresa_egreso, periodico, id_local
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
        periodico:      periodico      !== undefined ? periodico                  : undefined,
        id_local:       id_local       !== undefined ? id_local                  : undefined,
      }
    })
    return pago
  })

  // ── PATCH /:id/audit ───────────────────────────────────────────────────
  // Alterna el estado de auditoría creando una fila nueva en `audits`
  // (historial append-only). Nunca se borra: la fila anterior se marca
  // vigente=false y se inserta una nueva vigente=true con la acción inversa.
  fastify.patch('/:id/audit', { preHandler: editHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { observaciones } = request.body ?? {}

    const nextAccion = await fastify.db.$transaction(async (tx) => {
      const current = await tx.audit.findFirst({
        where: { tabla: 'pagos', id_registro: request.params.id, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'pagos', id_registro: request.params.id, vigente: true },
        data: { vigente: false }
      })

      const accion = current?.accion === 'auditado' ? 'desauditado' : 'auditado'

      await tx.audit.create({
        data: {
          id_registro:   request.params.id,
          tabla:         'pagos',
          tipo:          'auditoria_pago',
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
  // Historial completo de eventos de auditoría de un pago, más reciente primero.
  fastify.get('/:id/audit-history', { preHandler: viewHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    if (!request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    return fastify.db.audit.findMany({
      where: { tabla: 'pagos', id_registro: request.params.id },
      orderBy: { fecha: 'desc' },
      include: { user: { select: { id: true, nombre: true } } }
    })
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

  // ── POST /revertir-pdp ────────────────────────────────────────────────
  // Revierte pagos de PDP → CUENTA_CTE (inverso de mandar-pdp).
  fastify.post('/revertir-pdp', { preHandler: editHandler }, async (request, reply) => {
    const { ids } = request.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'Sin pagos seleccionados' })
    }
    const result = await fastify.db.pago.updateMany({
      where: { id: { in: ids }, id_local: { in: request.allowedLocalIds }, estado_op: 'PDP' },
      data: { estado_op: 'CUENTA_CTE', pagado: false, fecha_pago: null, id_metodo: null }
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

  // ── PATCH /:id/periodico ───────────────────────────────────────────────────
  fastify.patch('/:id/periodico', { preHandler: editHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true, periodico: true }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    if (!request.allowedLocalIds.includes(pago.id_local)) return reply.code(403).send({ error: 'Sin acceso' })
    const updated = await fastify.db.pago.update({
      where: { id: request.params.id },
      data: { periodico: !pago.periodico },
      select: { periodico: true }
    })
    return { ok: true, periodico: updated.periodico }
  })

  // ── POST /upload ───────────────────────────────────────────────────────────
  fastify.post('/upload', { preHandler: [fastify.authenticate, fastify.appContext] }, async (request, reply) => {
    const { id_local } = request.query
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'No se recibió archivo' })
    const bucket = process.env.GCS_BUCKET_NAME
    if (!bucket) return reply.code(500).send({ error: 'GCS_BUCKET_NAME no configurado' })

    let folder = 'general'
    if (id_local) {
      const local = await fastify.db.local.findUnique({ where: { id: id_local }, select: { nombre: true } })
      if (local?.nombre) folder = local.nombre
    }

    const ext      = data.filename.split('.').pop().toLowerCase()
    const type     = ext === 'pdf' ? 'pdf' : 'foto'
    const filename = `${folder}/facturas/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const file     = gcs.bucket(bucket).file(filename)
    await new Promise((resolve, reject) => {
      const stream = file.createWriteStream({ metadata: { contentType: data.mimetype } })
      data.file.pipe(stream).on('error', reject).on('finish', resolve)
    })
    return { ok: true, type, url: `gs://${bucket}/${filename}` }
  })

  // ── GET /:id/multimoneda ───────────────────────────────────────────────────
  fastify.get('/:id/multimoneda', { preHandler: viewHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({ where: { id: request.params.id }, select: { id_local: true } })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    if (!request.allowedLocalIds.includes(pago.id_local)) return reply.code(403).send({ error: 'Sin acceso' })
    return fastify.db.multiMoneda.findMany({ where: { id_pago: request.params.id } })
  })

  // ── POST /:id/multimoneda (upsert — un registro por pago) ─────────────────
  fastify.post('/:id/multimoneda', { preHandler: editHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({ where: { id: request.params.id }, select: { id_local: true } })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    if (!request.allowedLocalIds.includes(pago.id_local)) return reply.code(403).send({ error: 'Sin acceso' })
    const { tipo, tdc, monto } = request.body
    const row = await fastify.db.multiMoneda.upsert({
      where: { id_pago: request.params.id },
      create: { id_pago: request.params.id, tipo, tdc: parseFloat(tdc), monto: parseFloat(monto) },
      update: { tipo, tdc: parseFloat(tdc), monto: parseFloat(monto), fecha: new Date() }
    })
    return reply.code(201).send(row)
  })

  // ── PUT /:id/multimoneda/:mmId ─────────────────────────────────────────────
  fastify.put('/:id/multimoneda/:mmId', { preHandler: editHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({ where: { id: request.params.id }, select: { id_local: true } })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    if (!request.allowedLocalIds.includes(pago.id_local)) return reply.code(403).send({ error: 'Sin acceso' })
    const { tipo, tdc, monto } = request.body
    const row = await fastify.db.multiMoneda.update({
      where: { id: request.params.mmId },
      data: { ...(tipo != null ? { tipo } : {}), ...(tdc != null ? { tdc: parseFloat(tdc) } : {}), ...(monto != null ? { monto: parseFloat(monto) } : {}) }
    })
    return row
  })

  // ── DELETE /:id/multimoneda/:mmId ─────────────────────────────────────────
  fastify.delete('/:id/multimoneda/:mmId', { preHandler: editHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({ where: { id: request.params.id }, select: { id_local: true } })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    if (!request.allowedLocalIds.includes(pago.id_local)) return reply.code(403).send({ error: 'Sin acceso' })
    await fastify.db.multiMoneda.delete({ where: { id: request.params.mmId } })
    return reply.code(204).send()
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
    await fastify.db.multiMoneda.deleteMany({ where: { id_pago: request.params.id } })
    await fastify.db.pago.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
