export default async function reportesRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.appContext, fastify.can('reportes', 'view')]

  fastify.get('/cajas', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) {
      return { kpi: {}, secondary: [], weekly: [], fiscal: {}, payments: [], pay_total: 0 }
    }

    const desdeDate = new Date(desde)
    const hastaDate = new Date(hasta + 'T23:59:59.999')

    const localFilter = { id_local: { in: localIds } }
    const cajaWhere = {
      ...localFilter,
      fecha_inicio: { gte: desdeDate, lte: hastaDate }
    }

    const cajaAgg = await fastify.db.caja.aggregate({
      where: cajaWhere,
      _sum: { total: true, efectivo: true, fiscal: true, tickets: true, comensales: true },
      _count: { id: true }
    })

    const totalVentas   = Number(cajaAgg._sum.total    ?? 0)
    const totalFiscal   = Number(cajaAgg._sum.fiscal   ?? 0)
    const totalTickets  = Number(cajaAgg._sum.tickets  ?? 0)
    const totalComens   = Number(cajaAgg._sum.comensales ?? 0)
    const countZ        = cajaAgg._count.id

    const ticketProm = totalTickets > 0 ? Math.round(totalVentas / totalTickets) : 0
    const noFiscal = totalVentas - totalFiscal

    const payParams = []
    const localPlaceholders = localIds.map((_, i) => `$${i + 1}`).join(', ')
    payParams.push(...localIds)
    payParams.push(desdeDate)
    payParams.push(hastaDate)

    const payRows = await fastify.db.$queryRawUnsafe(`
      SELECT mp.nombre, SUM(cm.monto) AS total
      FROM caja_movimientos cm
      JOIN cajas c ON cm.id_caja = c.id
      JOIN metodos_pago mp ON cm.id_metodo = mp.id
      WHERE c.id_local IN (${localPlaceholders})
        AND c.fecha_inicio >= $${localIds.length + 1}
        AND c.fecha_inicio <= $${localIds.length + 2}
        AND cm.tipo = 'COBRO'
      GROUP BY mp.nombre
      ORDER BY total DESC
    `, ...payParams)

    const payTotal = payRows.reduce((s, r) => s + Number(r.total), 0)
    const PAY_COLORS = ['#3FA9DE', '#7FD49B', '#EF6F8E', '#4BC4CC', '#F4C152', '#F08A5D', '#B98CD8', '#9b958c']
    const payments = payRows.map((r, i) => ({
      name: r.nombre,
      val: Number(r.total),
      pct: payTotal > 0 ? ((Number(r.total) / payTotal) * 100).toFixed(1) : '0.0',
      color: PAY_COLORS[i % PAY_COLORS.length]
    }))

    const digital = payments
      .filter(p => !p.name.toLowerCase().includes('efectivo'))
      .reduce((s, p) => s + p.val, 0)

    const weekParams = [...localIds, desdeDate, hastaDate]
    const weekRows = await fastify.db.$queryRawUnsafe(`
      SELECT
        DATE_TRUNC('week', fecha_inicio)::date AS week_start,
        SUM(COALESCE(total, 0)) AS total
      FROM cajas
      WHERE id_local IN (${localPlaceholders})
        AND fecha_inicio >= $${localIds.length + 1}
        AND fecha_inicio <= $${localIds.length + 2}
      GROUP BY DATE_TRUNC('week', fecha_inicio)
      ORDER BY week_start
    `, ...weekParams)

    const weekly = weekRows.map((r, i) => ({
      week: r.week_start,
      label: `Sem ${i + 1}`,
      total: Number(r.total)
    }))

    const detParams = [...localIds, desdeDate, hastaDate, request.activeAppId]
    const detRows = await fastify.db.$queryRawUnsafe(`
      SELECT dt.clasificacion, SUM(cd.monto) AS total
      FROM caja_detalles cd
      JOIN cajas c ON cd.id_caja = c.id
      LEFT JOIN detalle_tipos dt ON cd.id_tipo = dt.id
      WHERE c.id_local IN (${localPlaceholders})
        AND c.fecha_inicio >= $${localIds.length + 1}
        AND c.fecha_inicio <= $${localIds.length + 2}
        AND dt.id_app = $${localIds.length + 3}
      GROUP BY dt.clasificacion
    `, ...detParams)

    const detMap = {}
    for (const r of detRows) detMap[r.clasificacion] = Number(r.total)
    const desperdicios  = detMap['desperdicio']  ?? 0
    const invitaciones  = detMap['invitacion']   ?? 0

    const pctZ      = totalVentas > 0 ? ((totalFiscal / totalVentas) * 100).toFixed(0) : '0'
    const pctNoFisc = totalVentas > 0 ? ((noFiscal / totalVentas) * 100).toFixed(0) : '0'

    return {
      kpi: {
        total_ventas: totalVentas,
        total_z: totalFiscal,
        ticket_promedio: ticketProm,
        cubiertos: totalComens,
        count_z: countZ,
        total_tickets: totalTickets,
        pct_z: pctZ,
        pct_no_fiscal: pctNoFisc
      },
      secondary: [
        { label: 'Porc Z',          val: pctZ + '%',      color: '#EFEDE8' },
        { label: 'Z Digitales',      val: digital,         color: '#3FB6BD' },
        { label: 'Porc Avión',       val: pctNoFisc + '%', color: 'rgba(255,255,255,.55)' },
        { label: 'Desperdicios',     val: desperdicios,    color: '#E0938C' },
        { label: 'Invitaciones',     val: invitaciones,    color: '#D8B98C' }
      ],
      weekly,
      fiscal: { fiscal: totalFiscal, no_fiscal: noFiscal, digital },
      payments,
      pay_total: payTotal
    }
  })

  // ── GET /pagos ──────────────────────────────────────────────────────────
  fastify.get('/pagos', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) {
      return {
        total_adeudado: 0, count_adeudado: 0,
        count_auditados: 0, count_no_auditados: 0,
        total_efectivo: 0, count_efectivo: 0
      }
    }

    const desdeDate = new Date(desde)
    const hastaDate = new Date(hasta + 'T23:59:59.999')
    const localFilter = { id_local: { in: localIds } }
    const fechaWhere = { fecha: { gte: desdeDate, lte: hastaDate } }

    const [adeudadoAgg, efectivoAgg, pagosEnRango] = await Promise.all([
      fastify.db.pago.aggregate({
        where: { ...localFilter, pagado: false, ...fechaWhere },
        _sum: { importe: true },
        _count: { id: true }
      }),
      fastify.db.pago.aggregate({
        where: { ...localFilter, ...fechaWhere, metodo_pago: { nombre: { equals: 'Efectivo', mode: 'insensitive' } } },
        _sum: { importe: true },
        _count: { id: true }
      }),
      fastify.db.pago.findMany({
        where: { ...localFilter, ...fechaWhere },
        select: { id: true }
      })
    ])

    const pagoIds = pagosEnRango.map(p => p.id)
    let countAuditados = 0
    if (pagoIds.length) {
      try {
        const auditRows = await fastify.db.audit.findMany({
          where: { tabla: 'pagos', id_registro: { in: pagoIds }, vigente: true, accion: 'auditado' },
          select: { id_registro: true }
        })
        countAuditados = new Set(auditRows.map(r => r.id_registro)).size
      } catch (err) {
        fastify.log.error({ err }, 'No se pudo leer la tabla audits (GET /reportes/pagos)')
        countAuditados = 0
      }
    }
    const countNoAuditados = pagoIds.length - countAuditados

    return {
      total_adeudado: Number(adeudadoAgg._sum.importe ?? 0),
      count_adeudado: adeudadoAgg._count.id,
      count_auditados: countAuditados,
      count_no_auditados: countNoAuditados,
      total_efectivo: Number(efectivoAgg._sum.importe ?? 0),
      count_efectivo: efectivoAgg._count.id
    }
  })

  // ── GET /cmv ────────────────────────────────────────────────────────────
  fastify.get('/cmv', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) {
      return { kpis: [], alimentos: [], bebidas: [], ajustes: [], ventas_total: 0 }
    }

    const desdeDate = new Date(desde)
    const hastaDate = new Date(hasta + 'T23:59:59.999')
    const localPlaceholders = localIds.map((_, i) => `$${i + 1}`).join(', ')

    const ventasAgg = await fastify.db.caja.aggregate({
      where: {
        id_local: { in: localIds },
        fecha_inicio: { gte: desdeDate, lte: hastaDate }
      },
      _sum: { total: true }
    })

    const ventasTotal = Number(ventasAgg._sum.total ?? 0)

    // CMV costs: pagos grouped by rubro + categoría
    // Rubros with name LIKE 'CMV%' are CMV rubros
    const costParams = [...localIds, desdeDate, hastaDate]
    const costRows = await fastify.db.$queryRawUnsafe(`
      SELECT
        r.nombre AS rubro,
        c.nombre AS categoria,
        SUM(COALESCE(p.importe, 0)) AS total
      FROM pagos p
      JOIN rubcat rc ON p.id_rubcat = rc.id
      JOIN rubros r ON rc.id_rub = r.id
      JOIN categorias c ON rc.id_cat = c.id
      WHERE p.id_local IN (${localPlaceholders})
        AND p.fecha >= $${localIds.length + 1}
        AND p.fecha <= $${localIds.length + 2}
        AND UPPER(r.nombre) LIKE 'CMV%'
      GROUP BY r.nombre, c.nombre
      ORDER BY total DESC
    `, ...costParams)

    // Split into alimentos / bebidas
    const alimentos = []
    const bebidas = []
    let totalAlimentos = 0
    let totalBebidas = 0
    let totalGeneral = 0

    for (const row of costRows) {
      const val = Number(row.total)
      totalGeneral += val
      const rubroUp = row.rubro.toUpperCase()
      if (rubroUp.includes('BEBIDA')) {
        bebidas.push({ name: row.categoria, val })
        totalBebidas += val
      } else {
        alimentos.push({ name: row.categoria, val })
        totalAlimentos += val
      }
    }

    // Ajustes from caja_detalles (invitaciones, consumo personal, comercial)
    const detParams = [...localIds, desdeDate, hastaDate, request.activeAppId]
    const detRows = await fastify.db.$queryRawUnsafe(`
      SELECT
        COALESCE(dt.nombre, cd.nombre, 'Otros') AS nombre,
        dt.clasificacion,
        SUM(cd.monto) AS total
      FROM caja_detalles cd
      JOIN cajas ca ON cd.id_caja = ca.id
      LEFT JOIN detalle_tipos dt ON cd.id_tipo = dt.id
      WHERE ca.id_local IN (${localPlaceholders})
        AND ca.fecha_inicio >= $${localIds.length + 1}
        AND ca.fecha_inicio <= $${localIds.length + 2}
        AND (dt.id_app = $${localIds.length + 3} OR dt.id_app IS NULL)
        AND (dt.clasificacion IN ('invitacion', 'consumo_personal', 'comercial', 'desperdicio')
             OR dt.clasificacion IS NULL)
      GROUP BY dt.nombre, cd.nombre, dt.clasificacion
      ORDER BY total DESC
    `, ...detParams)

    const ajustes = detRows.map(r => ({
      name: r.nombre,
      val: Number(r.total),
      negative: r.clasificacion === 'comercial'
    }))
    const totalAjustes = ajustes.reduce((s, a) => s + (a.negative ? -a.val : a.val), 0)

    // KPIs
    const cmvTotal = ventasTotal > 0 ? ((totalGeneral / ventasTotal) * 100) : 0
    const cmvAlimentos = ventasTotal > 0 ? ((totalAlimentos / ventasTotal) * 100) : 0
    const cmvBebidas = ventasTotal > 0 ? ((totalBebidas / ventasTotal) * 100) : 0
    const cmvStock = ventasTotal > 0 ? ((totalAjustes / ventasTotal) * 100) : 0

    // Percentage heights for bar rendering
    const aMax = alimentos.length ? Math.max(...alimentos.map(a => a.val)) : 1
    const bMax = bebidas.length ? Math.max(...bebidas.map(b => b.val)) : 1

    return {
      ventas_total: ventasTotal,
      kpis: [
        { label: 'CMV Total',     val: cmvTotal.toFixed(2) },
        { label: 'CMV Alimentos', val: cmvAlimentos.toFixed(2) },
        { label: 'CMV Bebidas',   val: cmvBebidas.toFixed(2) },
        { label: 'CMV Ajustes',   val: cmvStock.toFixed(2) },
      ],
      alimentos: alimentos.map(a => ({
        ...a,
        h: (a.val / aMax * 100).toFixed(1)
      })),
      bebidas: bebidas.map(b => ({
        ...b,
        h: (b.val / bMax * 100).toFixed(1)
      })),
      ajustes,
      total_alimentos: totalAlimentos,
      total_bebidas: totalBebidas,
      total_ajustes: totalAjustes,
      total_general: totalGeneral
    }
  })
}
