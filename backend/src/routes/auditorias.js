// Arma la condición OR que restringe los eventos de auditoría a los pagos/cajas
// cuyo local pertenece a la app activa (request.allowedLocalIds, de appContext).
// Si `tabla` viene fijado a 'pagos' o 'cajas', solo arma esa rama.
async function buildScopeOr(fastify, allowedLocalIds, tabla) {
  const wantsPagos   = !tabla || tabla === 'pagos'
  const wantsCajas   = !tabla || tabla === 'cajas'
  const wantsArqueos = !tabla || tabla === 'arqueos'

  const [pagos, cajas, arqueos] = await Promise.all([
    wantsPagos
      ? fastify.db.pago.findMany({ where: { id_local: { in: allowedLocalIds } }, select: { id: true } })
      : [],
    wantsCajas
      ? fastify.db.caja.findMany({ where: { id_local: { in: allowedLocalIds } }, select: { id: true } })
      : [],
    wantsArqueos
      ? fastify.db.arqueo.findMany({ where: { id_local: { in: allowedLocalIds } }, select: { id: true } })
      : []
  ])

  const scopeOr = []
  if (wantsPagos)   scopeOr.push({ tabla: 'pagos',   id_registro: { in: pagos.map(p => p.id) } })
  if (wantsCajas)   scopeOr.push({ tabla: 'cajas',   id_registro: { in: cajas.map(c => c.id) } })
  if (wantsArqueos) scopeOr.push({ tabla: 'arqueos', id_registro: { in: arqueos.map(a => a.id) } })
  return scopeOr
}

export default async function auditoriasRoutes(fastify) {
  const guard = [fastify.authenticate, fastify.appContext, fastify.requireSuperAdmin]

  // ── GET / ─────────────────────────────────────────────────────────────
  // Lista los eventos de auditoría (pagos + cajas) de la app activa
  // (X-App-Id), con filtros. Solo accesible para super_admin.
  fastify.get('/', { preHandler: guard }, async (request, reply) => {
    const {
      desde, hasta, tabla, id_user, accion,
      page = 1, limit = 50
    } = request.query

    if (tabla && !['pagos', 'cajas', 'arqueos'].includes(tabla)) {
      return reply.code(400).send({ error: 'tabla debe ser "pagos", "cajas" o "arqueos"' })
    }
    if (accion && !['auditado', 'desauditado'].includes(accion)) {
      return reply.code(400).send({ error: 'accion debe ser "auditado" o "desauditado"' })
    }

    const scopeOr = await buildScopeOr(fastify, request.allowedLocalIds, tabla)

    const where = {
      OR: scopeOr,
      ...(id_user ? { id_user } : {}),
      ...(accion  ? { accion }  : {}),
      // Audit.fecha es un instante real -- el rango se interpreta en hora
      // de Argentina (offset fijo -03:00), no UTC.
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
    const pagoIds   = rows.filter(r => r.tabla === 'pagos').map(r => r.id_registro)
    const cajaIds   = rows.filter(r => r.tabla === 'cajas').map(r => r.id_registro)
    const arqueoIds = rows.filter(r => r.tabla === 'arqueos').map(r => r.id_registro)

    const [pagos, cajas, arqueos] = await Promise.all([
      pagoIds.length
        ? fastify.db.pago.findMany({ where: { id: { in: pagoIds } }, select: { id: true, nro_ord: true } })
        : [],
      cajaIds.length
        ? fastify.db.caja.findMany({ where: { id: { in: cajaIds } }, select: { id: true, nro_turno: true } })
        : [],
      arqueoIds.length
        ? fastify.db.arqueo.findMany({ where: { id: { in: arqueoIds } }, select: { id: true, fecha: true } })
        : []
    ])

    const labelMap = new Map()
    pagos.forEach(p => labelMap.set(p.id, p.nro_ord != null ? `OP-${p.nro_ord}` : '—'))
    cajas.forEach(c => labelMap.set(c.id, c.nro_turno ? `TRN ${c.nro_turno}` : '—'))
    // Arqueo.fecha es un instante real (con hora) -- mostrar su día siempre
    // en hora de Argentina, no UTC (que puede correrlo al día siguiente para
    // arqueos hechos entre las 21:00 y medianoche hora Argentina).
    arqueos.forEach(a => labelMap.set(a.id, `ARQ ${new Date(a.fecha).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`))

    const data = rows.map(r => ({
      id: r.id,
      fecha: r.fecha,
      tabla: r.tabla,
      id_registro: r.id_registro,
      accion: r.accion,
      audit_dc: r.audit_dc,
      observaciones: r.observaciones,
      user: r.user,
      registro_label: labelMap.get(r.id_registro) ?? '—'
    }))

    return { data, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /usuarios ────────────────────────────────────────────────────
  // Lista de usuarios distintos que aparecen como autor de algún evento
  // de auditoría dentro de la app activa, para poblar el filtro de usuario.
  fastify.get('/usuarios', { preHandler: guard }, async (request, reply) => {
    const scopeOr = await buildScopeOr(fastify, request.allowedLocalIds, undefined)

    const rows = await fastify.db.audit.findMany({
      where: { OR: scopeOr, id_user: { not: null } },
      distinct: ['id_user'],
      select: { user: { select: { id: true, nombre: true } } }
    })
    return rows.map(r => r.user).filter(Boolean)
  })
}
