import { toTipoTurnoEnumList } from '../lib/tipoTurno.js'
import { parseCsvParam } from '../lib/queryParams.js'
import { wheresDeuda, deudaNeta } from '../lib/deuda.js'
import { resolverRangoCmv } from '../lib/rangoCmv.js'
import { agregarPorDireccion } from '../lib/direccionPagos.js'
import { agregarDescuadre, agruparDetallesReporte } from '../lib/descuadreAgregado.js'
import {
  etiquetaTurno, promedioPorCubierto, pctFiscal, ordenarPorTurno,
  desglosarPorTurno, totalizarPorNombre
} from '../lib/turnos.js'

// Comprobantes que entran al reporte BALANCE (ver GET /balance). Son los tipos
// fiscales; el reporte se define por este conjunto, no por lo que el usuario
// tenga filtrado en pantalla. Valores del enum TipoPago en schema.prisma.
const TIPOS_BALANCE = ['A', 'C', 'M', 'NDA', 'NCA']

export default async function reportesRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.appContext, fastify.can('reportes', 'view')]

  fastify.get('/cajas', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta, tipo_turno } = request.query

    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) {
      return {
        kpi: {}, secondary: [], weekly: [], fiscal: {}, payments: [], pay_total: 0,
        descuadre: { absoluto: 0, cantidad_cajas: 0, sin_total: 0 },
        desglose_detalles: []
      }
    }

    // fecha_inicio es un instante real (con hora) -- el rango se interpreta
    // en hora de Argentina (offset fijo -03:00), no UTC.
    const desdeDate = new Date(`${desde}T00:00:00.000-03:00`)
    const hastaDate = new Date(`${hasta}T23:59:59.999-03:00`)

    // Dos listas por la asimetría del @map: el SQL crudo compara contra la
    // etiqueta ("Tarde") y Prisma contra la clave del enum ("TARDE").
    const tipoTurnoLabels = parseCsvParam(tipo_turno)
    const tipoTurnoEnums  = toTipoTurnoEnumList(tipoTurnoLabels)

    const localFilter = { id_local: { in: localIds } }
    const cajaWhere = {
      ...localFilter,
      ...(tipoTurnoEnums.length ? { tipo_turno: { in: tipoTurnoEnums } } : {}),
      fecha_inicio: { gte: desdeDate, lte: hastaDate }
    }

    const cajaAgg = await fastify.db.caja.aggregate({
      where: cajaWhere,
      _sum: { total: true, efectivo: true, fiscal: true, tickets: true, comensales: true },
      _count: { id: true }
    })

    // Se traen las colecciones por caja para poder aplicar calcularCuadre a cada
    // una: el descuadre del periodo no se puede sacar de un agregado, porque un
    // faltante y un sobrante iguales se cancelarian. Desde los indices de FK del
    // 2026-08-05 esto no escanea tablas enteras (un mes de LOS GALGOS son ~90
    // cajas y ~630 detalles).
    const cajasConHijos = await fastify.db.caja.findMany({
      where: cajaWhere,
      select: {
        total: true,
        efectivo: true,
        // calcularCuadre decide la fuente (detalles/movimientos) por origin:
        // sin este campo, toda caja se leeria como no-TapTap.
        origin: true,
        movimientos: { select: { tipo: true, monto: true, metodo_pago: { select: { nombre: true } } } },
        detalles: {
          select: {
            monto: true, tipo: true, nombre: true,
            detalle_tipo: { select: { nombre: true, clasificacion: true } }
          }
        }
      }
    })

    const descuadre = agregarDescuadre(cajasConHijos)
    // El desglose sale de los mismos detalles que ya se trajeron, sin otra
    // consulta. No se calcula un total de detalles aca: ya existe abajo como
    // `detalles_total`, que sale del SQL crudo y ademas filtra por app.
    const desgloseDetalles = agruparDetallesReporte(cajasConHijos.flatMap(c => c.detalles ?? []))

    const totalVentas   = Number(cajaAgg._sum.total    ?? 0)
    const totalFiscal   = Number(cajaAgg._sum.fiscal   ?? 0)
    const totalTickets  = Number(cajaAgg._sum.tickets  ?? 0)
    const totalComens   = Number(cajaAgg._sum.comensales ?? 0)
    const totalEfectivo = Number(cajaAgg._sum.efectivo ?? 0)
    const countZ        = cajaAgg._count.id

    const ticketProm = totalTickets > 0 ? Math.round(totalVentas / totalTickets) : 0
    const noFiscal = totalVentas - totalFiscal

    const payParams = []
    const localPlaceholders = localIds.map((_, i) => `$${i + 1}`).join(', ')
    payParams.push(...localIds)
    payParams.push(desdeDate)
    payParams.push(hastaDate)
    // Nota: el enum de Postgres guarda el label visible (@map), ej. "Tarde" --
    // no la clave interna de Prisma ("TARDE"). Para SQL crudo se compara
    // contra las etiquetas tal cual llegan del frontend (tipoTurnoLabels), NO
    // contra tipoTurnoEnums (esa lista es solo para el `where` de Prisma más
    // arriba).
    let payTipoClause = ''
    if (tipoTurnoLabels.length) {
      // Placeholders dinámicos, igual que localPlaceholders más arriba.
      const ph = tipoTurnoLabels.map((_, i) => `$${payParams.length + i + 1}`).join(', ')
      payParams.push(...tipoTurnoLabels)
      payTipoClause = `AND c.tipo_turno::text IN (${ph})`
    }

    // MODELO SIMPLE (DEV-82/83): los cobros ya no viven en caja_movimientos
    // (la tabla quedó vacía con la migración del 2026-08-19) sino como
    // detalles con tipo='cobro', cuyo NOMBRE es el método. Esto además arregla
    // un sesgo histórico: antes este gráfico solo veía TapTap/Fudo (los únicos
    // que escribían movimientos); ahora entran también las cajas manuales.
    //
    // El efectivo se suma como línea propia desde el campo cajas.efectivo --
    // el conteo real del cajón. El detalle "Efectivo (ya contado...)" que dejó
    // la conversión es informativo y NO entra (sumaría esa plata dos veces).
    //
    // Se agrupa TAMBIÉN por turno y el total del período se reconstruye
    // sumando, en vez de correr dos consultas que agrupan distinto: así el
    // desglose por turno no puede quedar desalineado con el total de arriba.
    const payRows = await fastify.db.$queryRawUnsafe(`
      SELECT turno, nombre, SUM(total) AS total FROM (
        SELECT c.tipo_turno::text AS turno,
               TRIM(COALESCE(cd.nombre, dt.nombre, 'Sin especificar')) AS nombre,
               cd.monto AS total
        FROM caja_detalles cd
        JOIN cajas c ON cd.id_caja = c.id
        LEFT JOIN detalle_tipos dt ON cd.id_tipo = dt.id
        WHERE c.id_local IN (${localPlaceholders})
          AND c.fecha_inicio >= $${localIds.length + 1}
          AND c.fecha_inicio <= $${localIds.length + 2}
          AND cd.tipo = 'cobro'
          ${payTipoClause}
        UNION ALL
        SELECT c.tipo_turno::text, 'Efectivo', c.efectivo
        FROM cajas c
        WHERE c.id_local IN (${localPlaceholders})
          AND c.fecha_inicio >= $${localIds.length + 1}
          AND c.fecha_inicio <= $${localIds.length + 2}
          AND c.efectivo IS NOT NULL AND c.efectivo <> 0
          ${payTipoClause}
      ) x
      GROUP BY turno, nombre
      ORDER BY total DESC
    `, ...payParams)

    const payTotales = totalizarPorNombre(payRows)
    const payTotal = payTotales.reduce((s, r) => s + r.val, 0)
    const PAY_COLORS = ['#3FA9DE', '#7FD49B', '#EF6F8E', '#4BC4CC', '#F4C152', '#F08A5D', '#B98CD8', '#9b958c']
    const payments = payTotales.map((r, i) => ({
      ...r,
      pct: payTotal > 0 ? ((r.val / payTotal) * 100).toFixed(1) : '0.0',
      color: PAY_COLORS[i % PAY_COLORS.length]
    }))
    // El color se toma del agregado del período para que un mismo método se vea
    // del mismo color en todos los turnos y en el gráfico de arriba.
    const colorPorMetodo = new Map(payments.map(p => [p.name, p.color]))
    const payPorTurno = desglosarPorTurno(payRows)

    const digital = payments
      .filter(p => !p.name.toLowerCase().includes('efectivo'))
      .reduce((s, p) => s + p.val, 0)

    // fecha_inicio es una columna `timestamp` (sin tz) que guarda el instante
    // en UTC -- para truncar por semana en el día real (Argentina), primero
    // hay que reinterpretar el valor crudo como UTC (`AT TIME ZONE 'UTC'`,
    // que lo convierte a timestamptz) y RECIÉN ahí convertirlo a hora
    // Argentina (`AT TIME ZONE 'America/Argentina/Buenos_Aires'`, que lo
    // vuelve timestamp local). Aplicar un solo `AT TIME ZONE` sobre el valor
    // crudo hace el camino inverso (lo trata como si ya fuera hora Argentina)
    // y da el mismo resultado incorrecto que no convertir nada.
    const weekParams = [...localIds, desdeDate, hastaDate]
    let weekTipoClause = ''
    if (tipoTurnoLabels.length) {
      const ph = tipoTurnoLabels.map((_, i) => `$${weekParams.length + i + 1}`).join(', ')
      weekParams.push(...tipoTurnoLabels)
      weekTipoClause = `AND tipo_turno::text IN (${ph})`
    }
    const weekRows = await fastify.db.$queryRawUnsafe(`
      SELECT
        DATE_TRUNC('week', fecha_inicio AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS week_start,
        SUM(COALESCE(total, 0)) AS total
      FROM cajas
      WHERE id_local IN (${localPlaceholders})
        AND fecha_inicio >= $${localIds.length + 1}
        AND fecha_inicio <= $${localIds.length + 2}
        ${weekTipoClause}
      GROUP BY DATE_TRUNC('week', fecha_inicio AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires')
      ORDER BY week_start
    `, ...weekParams)

    const weekly = weekRows.map((r, i) => ({
      week: r.week_start,
      label: `Sem ${i + 1}`,
      total: Number(r.total)
    }))

    // "Gastos del período": la plata que salió de la caja, por nombre. Antes
    // acá había un "desglose de detalles" que existía para ver los cobros de
    // las cajas manuales -- eso hoy vive en `payments` (todos los cobros son
    // detalles). Sumar TODOS los detalles ahora mezclaría cobros con sus
    // espejos informativos (los "Vaciado · X", el efectivo ya contado) y daría
    // un total sin sentido; lo que faltaba contar en el reporte es el gasto,
    // que en el modelo simple NO resta de la venta y se informa aparte.
    const detParams = [...localIds, desdeDate, hastaDate]
    let detTipoClause = ''
    if (tipoTurnoLabels.length) {
      const ph = tipoTurnoLabels.map((_, i) => `$${detParams.length + i + 1}`).join(', ')
      detParams.push(...tipoTurnoLabels)
      detTipoClause = `AND c.tipo_turno::text IN (${ph})`
    }
    const detRows = await fastify.db.$queryRawUnsafe(`
      SELECT
        c.tipo_turno::text AS turno,
        TRIM(COALESCE(cd.nombre, dt.nombre, 'Sin nombre')) AS nombre,
        SUM(cd.monto) AS total
      FROM caja_detalles cd
      JOIN cajas c ON cd.id_caja = c.id
      LEFT JOIN detalle_tipos dt ON cd.id_tipo = dt.id
      WHERE c.id_local IN (${localPlaceholders})
        AND c.fecha_inicio >= $${localIds.length + 1}
        AND c.fecha_inicio <= $${localIds.length + 2}
        AND cd.tipo = 'gasto'
        ${detTipoClause}
      GROUP BY c.tipo_turno, TRIM(COALESCE(cd.nombre, dt.nombre, 'Sin nombre'))
      ORDER BY total DESC
    `, ...detParams)

    // Los informativos del período, agregados por nombre. El frontend los
    // agrupa en familias con la MISMA lib que usa el detalle de caja
    // (gruposInformativos): canales de venta, movimientos del cajón, ajustes
    // del POS, resúmenes. Acá solo se suman -- la semántica vive en un lugar.
    const infoRows = await fastify.db.$queryRawUnsafe(`
      SELECT
        TRIM(COALESCE(cd.nombre, dt.nombre, 'Sin nombre')) AS nombre,
        SUM(cd.monto) AS monto,
        SUM(cd.cantidad) AS cantidad
      FROM caja_detalles cd
      JOIN cajas c ON cd.id_caja = c.id
      LEFT JOIN detalle_tipos dt ON cd.id_tipo = dt.id
      WHERE c.id_local IN (${localPlaceholders})
        AND c.fecha_inicio >= $${localIds.length + 1}
        AND c.fecha_inicio <= $${localIds.length + 2}
        AND cd.tipo = 'informativo'
        ${detTipoClause}
      GROUP BY TRIM(COALESCE(cd.nombre, dt.nombre, 'Sin nombre'))
      ORDER BY monto DESC
    `, ...detParams)
    const informativos = infoRows
      .map((r) => ({ nombre: r.nombre, monto: Number(r.monto), cantidad: r.cantidad != null ? Number(r.cantidad) : null }))
      .filter((r) => r.monto !== 0)

    const DET_COLORS = ['#3FA9DE', '#7FD49B', '#EF6F8E', '#4BC4CC', '#F4C152', '#F08A5D', '#B98CD8', '#9b958c', '#E0938C', '#5FA8D9']
    const detTotales = totalizarPorNombre(detRows)
    const gastosTotal = detTotales.reduce((s, r) => s + r.val, 0)
    const gastos = detTotales
      .filter(r => r.val !== 0)
      .map((r, i) => ({
        ...r,
        pct: gastosTotal > 0 ? ((r.val / gastosTotal) * 100).toFixed(1) : '0.0',
        color: DET_COLORS[i % DET_COLORS.length]
      }))
    const colorPorGasto = new Map(gastos.map(d => [d.name, d.color]))
    const gastosPorTurno = desglosarPorTurno(detRows)

    const pctZ      = totalVentas > 0 ? ((totalFiscal / totalVentas) * 100).toFixed(0) : '0'
    const pctNoFisc = totalVentas > 0 ? ((noFiscal / totalVentas) * 100).toFixed(0) : '0'

    // ── Desglose por turno ──────────────────────────────────────────────────
    // Una fila por turno con lo mismo que los KPI de arriba, más su propio
    // desglose de métodos y detalles. Con el filtro de turno puesto, salen solo
    // los turnos filtrados: es el mismo `where` que el resto del reporte.
    const turnoRows = await fastify.db.caja.groupBy({
      by: ['tipo_turno'],
      where: cajaWhere,
      _sum: { total: true, fiscal: true, comensales: true, tickets: true, efectivo: true },
      _count: { id: true }
    })

    const turnos = ordenarPorTurno(turnoRows.map(row => {
      const turno = etiquetaTurno(row.tipo_turno)
      const total = Number(row._sum.total ?? 0)
      const fiscalTurno = Number(row._sum.fiscal ?? 0)
      const cubiertos = Number(row._sum.comensales ?? 0)
      const ticketsTurno = Number(row._sum.tickets ?? 0)

      return {
        turno,
        total,
        cubiertos,
        prom_cubierto: promedioPorCubierto(total, cubiertos),
        fiscal: fiscalTurno,
        pct_fiscal: pctFiscal(fiscalTurno, total),
        tickets: ticketsTurno,
        ticket_promedio: ticketsTurno > 0 ? Math.round(total / ticketsTurno) : null,
        efectivo: Number(row._sum.efectivo ?? 0),
        count_z: row._count.id,
        // Cada turno se lleva su propio desglose para poder abrirlo sin pedir
        // nada más al servidor.
        payments: (payPorTurno.get(turno) ?? []).map(p => ({ ...p, color: colorPorMetodo.get(p.name) })),
        gastos: (gastosPorTurno.get(turno) ?? [])
          .filter(d => d.val !== 0)
          .map(d => ({ ...d, color: colorPorGasto.get(d.name) })),
      }
    }))

    return {
      turnos,
      kpi: {
        total_ventas: totalVentas,
        total_z: totalFiscal,
        ticket_promedio: ticketProm,
        cubiertos: totalComens,
        count_z: countZ,
        total_tickets: totalTickets,
        efectivo: totalEfectivo,
        pct_z: pctZ,
        pct_no_fiscal: pctNoFisc
      },
      secondary: [
        { label: 'Porc Z',    val: pctZ + '%',      color: '#EFEDE8' },
        { label: 'Z Digitales', val: digital,         color: '#3FB6BD' },
        { label: 'Porc Avión', val: pctNoFisc + '%', color: 'rgba(255,255,255,.55)' }
      ],
      weekly,
      fiscal: { fiscal: totalFiscal, no_fiscal: noFiscal, digital },
      payments,
      pay_total: payTotal,
      gastos,
      gastos_total: gastosTotal,
      informativos,
      descuadre,
      desglose_detalles: desgloseDetalles
    }
  })

  // ── GET /pagos ──────────────────────────────────────────────────────────
  fastify.get('/pagos', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta, campo_fecha } = request.query
    const CAMPOS_FECHA_VALIDOS = ['fecha', 'fecha_pago', 'cashflow', 'periodo']
    const campoFecha = CAMPOS_FECHA_VALIDOS.includes(campo_fecha) ? campo_fecha : 'fecha'

    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) {
      return {
        // El spread mantiene la forma de la respuesta igual con scope vacio: el
        // frontend nunca tiene que distinguir "sin locales" de "sin datos".
        ...agregarPorDireccion([]),
        total_adeudado: 0, count_adeudado: 0,
        count_auditados: 0, count_no_auditados: 0,
        total_efectivo: 0, count_efectivo: 0,
        total_gastos: 0, total_cmv: 0,
        pendientes_impuestos: 0, pendientes_sueldos: 0, pendientes_proveedores: 0
      }
    }

    // fecha/cashflow/periodo son "día calendario" (medianoche UTC) -> rango en
    // UTC. fecha_pago es un instante real en hora Argentina (se carga con hora,
    // el arqueo lo compara como instante) -> rango con offset -03:00, si no los
    // pagos hechos de noche (21-24hs ART) caen en el día UTC siguiente.
    const sufFecha = campoFecha === 'fecha_pago' ? '-03:00' : 'Z'
    const desdeDate = new Date(`${desde}T00:00:00.000${sufFecha}`)
    const hastaDate = new Date(`${hasta}T23:59:59.999${sufFecha}`)
    const localFilter = { id_local: { in: localIds } }
    const fechaWhere = { [campoFecha]: { gte: desdeDate, lte: hastaDate } }

    // La deuda es egresos impagos menos ingresos impagos: una nota de crédito
    // cargada como ingreso resta sola, sin listas de tipos. Ver lib/deuda.js.
    const { egresos, ingresos } = wheresDeuda({ ...localFilter, ...fechaWhere })

    const [egresosAgg, ingresosAgg, efectivoAgg, pagosEnRango] = await Promise.all([
      fastify.db.pago.aggregate({
        where: egresos,
        _sum: { importe: true },
        _count: { id: true }
      }),
      fastify.db.pago.aggregate({
        where: ingresos,
        _sum: { importe: true }
      }),
      fastify.db.pago.aggregate({
        where: { ...localFilter, ...fechaWhere, metodo_pago: { nombre: { equals: 'Efectivo', mode: 'insensitive' } } },
        _sum: { importe: true },
        _count: { id: true }
      }),
      fastify.db.pago.findMany({
        where: { ...localFilter, ...fechaWhere },
        select: {
          id: true, importe: true, pagado: true, ingresa_egreso: true, id_tipo: true,
          // metodo_pago hace falta para separar "en efectivo" del resto de las
          // formas; el rubro, para el desglose completo en torta.
          metodo_pago: { select: { nombre: true } },
          rubcat: { select: { rubro: { select: { nombre: true } } } }
        }
      })
    ])

    // Gastos = egresos del período (pagados o no). CMV total = egresos con
    // rubro "CMV *" del período. Pendientes = egresos impagos del período,
    // excluyendo NCA/NCB (notas de crédito) y CMV (se muestra aparte),
    // desglosados por rubro real: Impositivo, Sueldos, y el resto (Proveedores).
    // Impuestos/Sueldos/Resto (tarjeta aparte) = mismo desglose que Gastos,
    // pero sobre TODOS los egresos del período (pagados o no), sin excluir
    // NCA/NCB -- "Resto" es simplemente Gastos - CMV - Impuestos - Sueldos.
    let totalGastos = 0, totalCmv = 0
    let pendImpuestos = 0, pendSueldos = 0, pendProveedores = 0
    let totalImpuestos = 0, totalSueldos = 0
    for (const p of pagosEnRango) {
      // Los ingresos RESTAN en vez de saltearse: una nota de crédito de CMV es
      // mercadería devuelta y baja el CMV; una impositiva baja Impuestos.
      // Ignorarlas inflaba los gastos con plata que volvió (bug 2026-08-20).
      const importe = Number(p.importe ?? 0) * (p.ingresa_egreso === true ? -1 : 1)
      const rubroNombre = p.rubcat?.rubro?.nombre || ''
      const esCmv = /^CMV/i.test(rubroNombre)

      totalGastos += importe
      if (esCmv) totalCmv += importe
      if (rubroNombre === 'Impositivo') totalImpuestos += importe
      else if (rubroNombre === 'Sueldos') totalSueldos += importe

      // Pendientes: solo egresos impagos, como siempre — la deuda neta de los
      // ingresos impagos ya la descuenta deudaNeta en total_adeudado.
      if (!p.pagado && p.ingresa_egreso !== true) {
        if (rubroNombre === 'Impositivo') pendImpuestos += importe
        else if (rubroNombre === 'Sueldos') pendSueldos += importe
        else if (!esCmv) pendProveedores += importe
      }
    }

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
      ...agregarPorDireccion(pagosEnRango),
      total_adeudado: deudaNeta(egresosAgg._sum.importe, ingresosAgg._sum.importe),
      count_adeudado: egresosAgg._count.id,
      count_auditados: countAuditados,
      count_no_auditados: countNoAuditados,
      // OJO: total_efectivo/count_efectivo suman las DOS direcciones en un solo
      // numero. Se dejan por compatibilidad, pero la pantalla ya no los usa: usa
      // efectivo.ingresos y efectivo.egresos de agregarPorDireccion.
      total_efectivo: Number(efectivoAgg._sum.importe ?? 0),
      count_efectivo: efectivoAgg._count.id,
      total_gastos: totalGastos,
      total_cmv: totalCmv,
      pendientes_impuestos: pendImpuestos,
      pendientes_sueldos: pendSueldos,
      pendientes_proveedores: pendProveedores,
      total_impuestos: totalImpuestos,
      total_sueldos: totalSueldos,
      total_resto: totalGastos - totalCmv - totalImpuestos - totalSueldos
    }
  })

  // ── GET /cmv ────────────────────────────────────────────────────────────
  fastify.get('/cmv', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta, mes, mes_desde, mes_hasta } = request.query

    // El CMV va SIEMPRE por período contable (ver lib/rangoCmv.js): pedirlo por
    // mes y por rango de días daba dos números distintos para el mismo julio.
    // Un rango de días se acepta pero se redondea a los meses que toca.
    const rango = resolverRangoCmv({ mes, mes_desde, mes_hasta, desde, hasta })
    if (!rango) {
      return reply.code(400).send({
        error: 'Pedí un mes (YYYY-MM), un rango de meses (mes_desde/mes_hasta) o un rango de días (YYYY-MM-DD), siempre con el inicio antes del fin'
      })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) {
      return { kpis: [], alimentos: [], bebidas: [], movstock: [], ventas_total: 0, cmv_total_monto: 0, cmv_total_pct: '0.00', modo: rango.modo, mes_desde: rango.mesDesde, mes_hasta: rango.mesHasta, dia_desde: rango.diaDesde, dia_hasta: rango.diaHasta }
    }

    // Las fechas salen todas de resolverRangoCmv: fecha_inicio (Caja) es un
    // instante real y va con el offset de Argentina; periodo/fecha (Pago) se
    // guardan a medianoche UTC del día elegido y van en UTC puro. Mezclarlos
    // corría el filtro 3 horas.
    const { campoPago, pagoDesde, pagoHasta, ventasDesde, ventasHasta, mesDesde, mesHasta } = rango
    // El nombre de columna se interpola en el SQL, así que no se confía en que
    // venga bien de arriba: solo estos dos valores son aceptables.
    if (campoPago !== 'periodo' && campoPago !== 'fecha') {
      return reply.code(500).send({ error: 'Campo de fecha inválido' })
    }
    const localPlaceholders = localIds.map((_, i) => `$${i + 1}`).join(', ')

    const ventasAgg = await fastify.db.caja.aggregate({
      where: {
        id_local: { in: localIds },
        fecha_inicio: { gte: ventasDesde, lte: ventasHasta }
      },
      _sum: { total: true }
    })

    const ventasTotal = Number(ventasAgg._sum.total ?? 0)

    // CMV costs: pagos grouped by rubro + categoría
    // Rubros with name LIKE 'CMV%' are CMV rubros
    const costParams = [...localIds, pagoDesde, pagoHasta]
    const costRows = await fastify.db.$queryRawUnsafe(`
      SELECT
        r.nombre AS rubro,
        c.nombre AS categoria,
        -- Firmado: una nota de crédito de CMV (ingreso) resta — es mercadería
        -- que volvió, no costo.
        SUM(CASE WHEN p.ingresa_egreso THEN -COALESCE(p.importe, 0) ELSE COALESCE(p.importe, 0) END) AS total
      FROM pagos p
      JOIN rubcat rc ON p.id_rubcat = rc.id
      JOIN rubros r ON rc.id_rub = r.id
      JOIN categorias c ON rc.id_cat = c.id
      WHERE p.id_local IN (${localPlaceholders})
        AND p.${campoPago} >= $${localIds.length + 1}
        AND p.${campoPago} <= $${localIds.length + 2}
        AND UPPER(r.nombre) LIKE 'CMV%'
      GROUP BY r.nombre, c.nombre
      ORDER BY total DESC
    `, ...costParams)

    // Split into alimentos / bebidas / movstock. Antes "CMV MovStock" y
    // "CMV MovStock B2B" (rubros reales, ver seed/base) caían silenciosamente
    // dentro de "alimentos" porque solo se distinguía BEBIDA vs el resto --
    // el total general los sumaba bien, pero no se veían como categoría propia.
    const alimentos = []
    const bebidas = []
    const movstock = []
    let totalAlimentos = 0
    let totalBebidas = 0
    let totalMovstock = 0
    let totalGeneral = 0

    for (const row of costRows) {
      const val = Number(row.total)
      totalGeneral += val
      const rubroUp = row.rubro.toUpperCase()
      if (rubroUp.includes('MOVSTOCK')) {
        movstock.push({ name: row.categoria, val })
        totalMovstock += val
      } else if (rubroUp.includes('BEBIDA')) {
        bebidas.push({ name: row.categoria, val })
        totalBebidas += val
      } else {
        alimentos.push({ name: row.categoria, val })
        totalAlimentos += val
      }
    }

    // KPIs
    const cmvTotal = ventasTotal > 0 ? ((totalGeneral / ventasTotal) * 100) : 0
    const cmvAlimentos = ventasTotal > 0 ? ((totalAlimentos / ventasTotal) * 100) : 0
    const cmvBebidas = ventasTotal > 0 ? ((totalBebidas / ventasTotal) * 100) : 0
    const cmvMovstock = ventasTotal > 0 ? ((totalMovstock / ventasTotal) * 100) : 0

    // Percentage heights for bar rendering
    const aMax = alimentos.length ? Math.max(...alimentos.map(a => a.val)) : 1
    const bMax = bebidas.length ? Math.max(...bebidas.map(b => b.val)) : 1
    const mMax = movstock.length ? Math.max(...movstock.map(m => m.val)) : 1

    return {
      // Qué se leyó realmente y en qué modo: 'periodo' (contable, meses
      // completos) o 'fecha' (rango de días parcial, por fecha de carga del
      // pago). La pantalla lo dice en vez de dejar que el usuario crea que un
      // rango de una semana midió el mes.
      modo: rango.modo,
      mes_desde: mesDesde,
      mes_hasta: mesHasta,
      dia_desde: rango.diaDesde,
      dia_hasta: rango.diaHasta,
      ventas_total: ventasTotal,
      cmv_total_monto: totalGeneral,
      cmv_total_pct: cmvTotal.toFixed(2),
      kpis: [
        { label: 'CMV Total',     val: cmvTotal.toFixed(2) },
        { label: 'CMV Alimentos', val: cmvAlimentos.toFixed(2) },
        { label: 'CMV Bebidas',   val: cmvBebidas.toFixed(2) },
        { label: 'CMV MovStock',  val: cmvMovstock.toFixed(2) },
      ],
      alimentos: alimentos.map(a => ({
        ...a,
        h: (a.val / aMax * 100).toFixed(1)
      })),
      bebidas: bebidas.map(b => ({
        ...b,
        h: (b.val / bMax * 100).toFixed(1)
      })),
      movstock: movstock.map(m => ({
        ...m,
        h: (m.val / mMax * 100).toFixed(1)
      })),
      total_alimentos: totalAlimentos,
      total_movstock: totalMovstock,
      total_bebidas: totalBebidas,
      total_general: totalGeneral
    }
  })

  // ── GET /cmv/detalle ─────────────────────────────────────────────────────
  // La composición de UNA categoría del CMV ("Carnes", "Vinos"): qué
  // proveedores la forman y por cuánto, en el mismo rango que el reporte.
  // Alimenta el drill-down de las tablas por grupo — el número deja de ser
  // opaco: se clickea y se ve de dónde salió.
  fastify.get('/cmv/detalle', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta, mes, mes_desde, mes_hasta, categoria, grupo } = request.query

    if (!categoria) return reply.code(400).send({ error: 'Falta la categoría' })
    // El mismo resolutor de rango que el reporte: los números del drill-down
    // tienen que hablar del MISMO tiempo que la fila que se clickeó.
    const rango = resolverRangoCmv({ mes, mes_desde, mes_hasta, desde, hasta })
    if (!rango) return reply.code(400).send({ error: 'Rango de fechas inválido' })

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }
    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) return { proveedores: [], total: 0 }

    const { campoPago, pagoDesde, pagoHasta } = rango
    if (campoPago !== 'periodo' && campoPago !== 'fecha') {
      return reply.code(500).send({ error: 'Campo de fecha inválido' })
    }

    // El mismo reparto en grupos que usa el reporte (movstock gana, después
    // bebidas, el resto es alimentos): una categoría puede llamarse igual en
    // dos rubros CMV distintos y el grupo la desambigua.
    const filtroGrupo = grupo === 'movstock'
      ? `AND UPPER(r.nombre) LIKE '%MOVSTOCK%'`
      : grupo === 'bebidas'
        ? `AND UPPER(r.nombre) LIKE '%BEBIDA%' AND UPPER(r.nombre) NOT LIKE '%MOVSTOCK%'`
        : grupo === 'alimentos'
          ? `AND UPPER(r.nombre) NOT LIKE '%BEBIDA%' AND UPPER(r.nombre) NOT LIKE '%MOVSTOCK%'`
          : ''

    const localPlaceholders = localIds.map((_, i) => `$${i + 1}`).join(', ')
    const rows = await fastify.db.$queryRawUnsafe(`
      SELECT
        COALESCE(pr.nombre, 'Sin proveedor') AS proveedor,
        COUNT(*)::int AS cantidad,
        SUM(CASE WHEN p.ingresa_egreso THEN -COALESCE(p.importe, 0) ELSE COALESCE(p.importe, 0) END) AS total
      FROM pagos p
      JOIN rubcat rc ON p.id_rubcat = rc.id
      JOIN rubros r ON rc.id_rub = r.id
      JOIN categorias c ON rc.id_cat = c.id
      LEFT JOIN proveedores pr ON p.id_proveedor = pr.id
      WHERE p.id_local IN (${localPlaceholders})
        AND p.${campoPago} >= $${localIds.length + 1}
        AND p.${campoPago} <= $${localIds.length + 2}
        AND UPPER(r.nombre) LIKE 'CMV%'
        AND c.nombre = $${localIds.length + 3}
        ${filtroGrupo}
      GROUP BY COALESCE(pr.nombre, 'Sin proveedor')
      ORDER BY total DESC
    `, ...localIds, pagoDesde, pagoHasta, categoria)

    const proveedores = rows.map((r) => ({ nombre: r.proveedor, cantidad: r.cantidad, total: Number(r.total) }))
    return { proveedores, total: proveedores.reduce((a, r) => a + r.total, 0) }
  })

  // ── GET /balance ───────────────────────────────────────────────────────
  // Listado de comprobantes fiscales para contabilidad: un renglón por
  // comprobante con proveedor, CUIT, tipo, PV-Nro, fecha de factura, neto, IVA
  // discriminado por alícuota, total y forma de pago.
  //
  // Solo super_admin: expone CUIT y razón social de todos los proveedores.
  //
  // Los tipos son fijos (TIPOS_BALANCE), no se toman del filtro de pantalla: el
  // reporte se define justamente por ser el conjunto de comprobantes fiscales.
  // Filtra siempre por `fecha` (fecha de factura), no por fecha de pago.
  fastify.get('/balance', {
    preHandler: [fastify.authenticate, fastify.appContext, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }
    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) return { data: [] }

    // `fecha` es día calendario (medianoche UTC), su rango va en UTC.
    const rows = await fastify.db.pago.findMany({
      where: {
        id_local: { in: localIds },
        id_tipo:  { in: TIPOS_BALANCE },
        fecha: {
          gte: new Date(`${desde}T00:00:00.000Z`),
          lte: new Date(`${hasta}T23:59:59.999Z`)
        }
      },
      select: {
        id: true, nro_ord: true, fecha: true, id_tipo: true,
        // `ingresa_egreso` para que la pantalla y el export puedan restar las
        // notas de crédito: en el libro de IVA compras una NCA acredita.
        ingresa_egreso: true,
        pv: true, nro: true, importe_neto: true, descuento: true, importe: true,
        proveedor:   { select: { nombre: true, razon_social: true, cuit: true } },
        metodo_pago: { select: { nombre: true } },
        impuestos:   { select: { tipo: true, monto: true } }
      },
      orderBy: [{ fecha: 'asc' }, { nro_ord: 'asc' }]
    })

    return { data: rows }
  })

  // ── GET /fuera-de-termino ───────────────────────────────────────────────
  // Facturas cargadas dentro del rango pedido pero cuyo período es de un mes
  // anterior al de la carga. Sirve para ajustar un informe ya enviado sin tener
  // que cruzar Excels a mano: son justamente las que cambian los números de un
  // mes que el cliente ya recibió. Ver lib/fueraDeTermino.js para el criterio.
  //
  // El filtro va en SQL porque compara dos columnas entre sí, algo que el
  // `where` de Prisma no expresa.
  fastify.get('/fuera-de-termino', { preHandler: viewHandler }, async (request, reply) => {
    const { desde, hasta, id_local } = request.query

    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }
    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) return { data: [], total: 0 }

    // created_at es un instante real -> el rango va en hora de Argentina.
    const desdeDate = new Date(`${desde}T00:00:00.000-03:00`)
    const hastaDate = new Date(`${hasta}T23:59:59.999-03:00`)

    // El AT TIME ZONE doble pasa created_at (timestamptz en UTC) a hora local
    // de Argentina antes de truncar el mes, por el mismo motivo que
    // lib/fueraDeTermino.js: un pago cargado 22hs del último día del mes es el
    // día 1 del mes siguiente en UTC y quedaría marcado como atrasado sin serlo.
    const rows = await fastify.db.$queryRaw`
      SELECT p.id, p.nro_ord, p.fecha, p.periodo, p.created_at, p.importe,
             p.id_tipo, p.pagado,
             pr.nombre AS proveedor,
             l.nombre  AS local,
             u.nombre  AS cargado_por
      FROM pagos p
      LEFT JOIN proveedores pr ON pr.id = p.id_proveedor
      LEFT JOIN locales     l  ON l.id  = p.id_local
      LEFT JOIN users       u  ON u.id  = p.created_by
      WHERE p.id_local = ANY(${localIds})
        AND p.created_at >= ${desdeDate}
        AND p.created_at <= ${hastaDate}
        AND p.periodo IS NOT NULL
        AND date_trunc('month', p.periodo)
              < date_trunc('month', p.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires')
      ORDER BY p.created_at DESC
    `

    return {
      data: rows.map(r => ({ ...r, importe: Number(r.importe ?? 0) })),
      total: rows.length
    }
  })
}
