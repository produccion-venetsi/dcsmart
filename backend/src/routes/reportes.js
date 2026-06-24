export default async function reportesRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
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

    const msRange = hastaDate.getTime() - desdeDate.getTime()
    const prevDesde = new Date(desdeDate.getTime() - msRange - 86400000)
    const prevHasta = new Date(desdeDate.getTime() - 1)
    const prevCajaWhere = {
      ...localFilter,
      fecha_inicio: { gte: prevDesde, lte: prevHasta }
    }

    const [cajaAgg, prevCajaAgg, pagoAdeudado] = await Promise.all([
      fastify.db.caja.aggregate({
        where: cajaWhere,
        _sum: { total: true, efectivo: true, fiscal: true, tickets: true, comensales: true },
        _count: { id: true }
      }),
      fastify.db.caja.aggregate({
        where: prevCajaWhere,
        _sum: { total: true }
      }),
      fastify.db.pago.aggregate({
        where: { ...localFilter, pagado: false, fecha: { gte: desdeDate, lte: hastaDate } },
        _sum: { importe: true },
        _count: { id: true }
      })
    ])

    const totalVentas   = Number(cajaAgg._sum.total    ?? 0)
    const totalFiscal   = Number(cajaAgg._sum.fiscal   ?? 0)
    const totalEfectivo = Number(cajaAgg._sum.efectivo ?? 0)
    const totalTickets  = Number(cajaAgg._sum.tickets  ?? 0)
    const totalComens   = Number(cajaAgg._sum.comensales ?? 0)
    const countZ        = cajaAgg._count.id
    const prevVentas    = Number(prevCajaAgg._sum.total ?? 0)
    const totalAdeudado = Number(pagoAdeudado._sum.importe ?? 0)

    const ticketProm = totalTickets > 0 ? Math.round(totalVentas / totalTickets) : 0
    const pctVsAnterior = prevVentas > 0
      ? (((totalVentas - prevVentas) / prevVentas) * 100).toFixed(1)
      : null
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
    const pctAdeud  = totalVentas > 0 ? ((totalAdeudado / totalVentas) * 100).toFixed(1) : '0.0'

    return {
      kpi: {
        total_ventas: totalVentas,
        total_z: totalFiscal,
        ticket_promedio: ticketProm,
        total_adeudado: totalAdeudado,
        cubiertos: totalComens,
        count_z: countZ,
        total_tickets: totalTickets,
        pct_vs_anterior: pctVsAnterior,
        pct_z: pctZ,
        pct_no_fiscal: pctNoFisc,
        pct_adeudado: pctAdeud
      },
      secondary: [
        { label: 'Porc Z',          val: pctZ + '%',      color: '#EFEDE8' },
        { label: 'Porc No Fiscal',   val: pctNoFisc + '%', color: '#EFEDE8' },
        { label: 'Z Digitales',      val: digital,         color: '#3FB6BD' },
        { label: 'Porc Avión',       val: '0%',            color: 'rgba(255,255,255,.55)' },
        { label: 'Desperdicios',     val: desperdicios,    color: '#E0938C' },
        { label: 'Invitaciones',     val: invitaciones,    color: '#D8B98C' }
      ],
      weekly,
      fiscal: { fiscal: totalFiscal, no_fiscal: noFiscal, digital },
      payments,
      pay_total: payTotal
    }
  })
}
