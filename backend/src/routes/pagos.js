import { Storage } from '@google-cloud/storage'
import { extraerDeArchivo, aCamposFormulario, camposConDato, validarAritmetica, matchearMetodoPago } from '../lib/leerFactura.js'
import multipart from '@fastify/multipart'
import { parseNroOrd } from '../lib/nroOrd.js'
import { sanitizeFolderName, parseGsPath } from '../lib/gcsPaths.js'
import { partirIdsPorEstado } from '../lib/estadoOp.js'
import { parseCsvParam } from '../lib/queryParams.js'
import { parseRangosFecha, whereRangosFecha } from '../lib/rangosFecha.js'
import { wheresDeuda, deudaNeta } from '../lib/deuda.js'

// parseFloat('') / parseFloat(null) dan NaN -- a diferencia de `|| null`,
// esto no confunde un 0 real (valor válido y frecuente, ej. descuento=0)
// con un campo vacío.
function toFloatOrNull(v) {
  if (v === null || v === '') return null
  const n = parseFloat(v)
  return Number.isNaN(n) ? null : n
}

// El pago trae campos Decimal/BigInt que Prisma no acepta tal cual dentro de
// un campo Json -- este roundtrip los deja como string/number planos.
function toSnapshotSafe(obj) {
  return JSON.parse(JSON.stringify(obj))
}

// Registra un evento en el log de actividad CRUD (solo visible para
// super_admin, ver GET /activity-log en routes/activity-log.js). No debe
// bloquear la operación principal si falla -- se loguea el error y sigue.
async function logActivity(fastify, { id_registro, id_local, accion, id_user, snapshot }) {
  try {
    await fastify.db.activityLog.create({
      data: { tabla: 'pagos', id_registro, id_local, accion, id_user, snapshot }
    })
  } catch (err) {
    fastify.log.error({ err }, `No se pudo registrar activity_log (${accion}) para pago ${id_registro}`)
  }
}

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
      where: { tabla: 'pagos', id_registro: { in: pagoIds }, audit_dc: false, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    return new Set(rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (getAuditedSet)')
    return new Set()
  }
}

// Igual que getAuditedSet pero para el circuito de auditoría DC (audit_dc: true).
async function getAuditedDcSet(fastify, pagoIds) {
  if (!pagoIds.length) return new Set()
  try {
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'pagos', id_registro: { in: pagoIds }, audit_dc: true, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    return new Set(rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (getAuditedDcSet)')
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
      where: { tabla: 'pagos', id_registro: { in: pagoIds }, audit_dc: false, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    const auditedIds = [...new Set(rows.map(r => r.id_registro))]
    return audit === 'true' ? { id: { in: auditedIds } } : { id: { notIn: auditedIds } }
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (buildAuditFilter)')
    return {}
  }
}

// Calcula el próximo nro_ord correlativo para un local: (último nro_ord
// no nulo de ese local, descendente) + 1, o 1 si el local no tiene pagos
// con nro_ord asignado todavía.
async function getNextNroOrd(fastify, id_local) {
  const last = await fastify.db.pago.findFirst({
    where: { id_local, nro_ord: { not: null } },
    orderBy: { nro_ord: 'desc' },
    select: { nro_ord: true }
  })
  return (last?.nro_ord ?? 0) + 1
}

// Traduce errores de Prisma (u otros inesperados) al guardar un pago a un
// mensaje entendible para el usuario, en vez del error crudo de la DB.
function translatePagoError(err) {
  if (err.code === 'P2003') {
    const field = err.meta?.field_name || ''
    if (field.includes('proveedor')) return 'El proveedor seleccionado no existe o fue eliminado'
    if (field.includes('rubcat'))    return 'El rubro / categoría seleccionado no existe o fue eliminado'
    if (field.includes('metodo'))    return 'El método de pago seleccionado no existe o fue eliminado'
    if (field.includes('local'))     return 'El local seleccionado no existe o fue eliminado'
    return 'Uno de los datos seleccionados (proveedor, rubro/categoría, método de pago o local) no es válido'
  }
  if (err.code === 'P2025') return 'El registro no existe o ya fue eliminado'
  return 'No se pudo guardar el pago. Revisá los campos obligatorios e intentá de nuevo'
}

// Extensiones aceptadas para adjuntos (fotos de factura / PDF) -- rechaza
// cualquier otro tipo de archivo en vez de subirlo tal cual a GCS.
const EXTENSIONES_ADJUNTO = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf'])

// Para leer con IA: imagenes y PDF. Gemini acepta el PDF nativo por inlineData,
// asi que no hay que rasterizarlo. Se agrego porque muchos proveedores mandan la
// factura electronica en PDF y obligar a sacarle una foto a la pantalla se leia
// peor. Queda afuera 'gif', que si sirve como adjunto pero no como factura.
const EXTENSIONES_LECTURA = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'])

// La whitelist de campos de fecha y el manejo de zonas horarias viven en
// lib/rangosFecha.js, que además soporta varios rangos combinados con AND.

// Construye el `where` de Prisma compartido entre GET /pagos (list/export)
// y GET /pagos/summary, para que el resumen agregado matchee exactamente
// los mismos pagos que ve la tabla con los mismos filtros.
async function buildPagosWhere(fastify, request, query) {
  const {
    id_local, id_proveedor, id_proveedores, pagado, estado_op,
    desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
    audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q, observaciones
  } = query

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

  // Tipo, método y estado OP admiten varios valores (CSV), igual que
  // id_rubcats e id_proveedores.
  const tipoIds   = parseCsvParam(id_tipo)
  const metodoIds = parseCsvParam(id_metodo)
  const estadoOps = parseCsvParam(estado_op)

  const auditFilter = await buildAuditFilter(fastify, audit, request.allowedLocalIds)

  const qStr = q?.trim()
  let qFilter = {}
  if (qStr) {
    const qNum = parseNroOrd(qStr)
    qFilter = {
      OR: [
        ...(qNum != null ? [{ nro_ord: qNum }] : []),
        { proveedor: { nombre:       { contains: qStr, mode: 'insensitive' } } },
        { proveedor: { razon_social: { contains: qStr, mode: 'insensitive' } } },
        { rubcat: { cuenta:               { contains: qStr, mode: 'insensitive' } } },
        { rubcat: { rubro:     { nombre: { contains: qStr, mode: 'insensitive' } } } },
        { rubcat: { categoria: { nombre: { contains: qStr, mode: 'insensitive' } } } },
      ]
    }
  }

  return {
    ...localFilter,
    ...rubcatFilter,
    ...auditFilter,
    ...proveedorFilter,
    ...qFilter,
    ...(nro_ord        ? { nro_ord: parseInt(nro_ord) }                  : {}),
    ...(tipoIds.length   ? { id_tipo:   { in: tipoIds } }                 : {}),
    ...(metodoIds.length ? { id_metodo: { in: metodoIds } }               : {}),
    ...(pagado         !== undefined ? { pagado:         pagado         === 'true' } : {}),
    ...(ingresa_egreso !== undefined ? { ingresa_egreso: ingresa_egreso === 'true' } : {}),
    ...(estadoOps.length ? { estado_op: { in: estadoOps } }               : {}),
    ...(observaciones?.trim()
      ? { observaciones: { contains: observaciones.trim(), mode: 'insensitive' } }
      : {}),
    // Uno o varios rangos de fecha, combinados con AND. Cada campo lleva su
    // propia interpretación de zona horaria. Ver lib/rangosFecha.js.
    ...whereRangosFecha(parseRangosFecha(campo_fecha, desde, hasta))
  }
}

export default async function pagosRoutes(fastify) {
  await fastify.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
  const gcs = new Storage()

  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'delete')]

  // ── GET /contexto-local/:id_local ─────────────────────────────────────
  //
  // Lo mínimo del local que necesitan Carga Avión y MovStock para arrancar: el
  // proveedor contra el que facturan y el porcentaje de descuento pactado.
  //
  // Existe porque `GET /api/locales/:id` pide `locales:view`, que solo tienen
  // super_admin y dcsmart: para admin y cajero devolvía 403 y dejaba el
  // formulario inusable. El permiso acá es `pagos:create` — quien puede cargar
  // un pago en un local puede leer el contexto de ese pago — y el alcance lo
  // sigue acotando `allowedLocalIds`, sin abrir el módulo Locales entero.
  fastify.get('/contexto-local/:id_local', { preHandler: createHandler }, async (request, reply) => {
    const { id_local } = request.params
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const local = await fastify.db.local.findUnique({
      where: { id: id_local },
      select: { id: true, id_proveedor: true, descuento_movstock: true }
    })
    if (!local) return reply.code(404).send({ error: 'Local no encontrado' })

    return {
      id: local.id,
      id_proveedor: local.id_proveedor,
      // Decimal de Prisma: se manda como número para que el formulario no tenga
      // que distinguir "0" de "0.00" ni parsear un string (un local en 0 es un
      // descuento pactado en cero, no un local sin configurar).
      descuento_movstock: local.descuento_movstock == null ? null : Number(local.descuento_movstock),
    }
  })

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const {
      id_local, id_proveedor, id_proveedores, pagado, estado_op,
      desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
      audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q, observaciones,
      include_impuestos,
      sort_field = 'fecha', sort_dir = 'desc',
      page = 1, limit = 50
    } = request.query

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const where = await buildPagosWhere(fastify, request, {
      id_local, id_proveedor, id_proveedores, pagado, estado_op,
      desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
      audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q, observaciones
    })

    const VALID_SORT = ['fecha', 'importe', 'fecha_pago', 'periodo', 'nro_ord', 'created_at']
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
          creador:     { select: { id: true, nombre: true } },
          // Solo para el export: la tabla no los necesita y son N filas mas
          // por pago en cada pagina.
          ...(include_impuestos === 'true'
            ? { impuestos: { select: { id: true, tipo: true, monto: true } } }
            : {}),
        },
        orderBy,
        skip,
        take
      }),
      fastify.db.pago.count({ where })
    ])

    const isDc = ['super_admin', 'dcsmart'].includes(request.activeRole)
    const auditedSet = await getAuditedSet(fastify, pagos.map(p => p.id))
    const auditedDcSet = isDc ? await getAuditedDcSet(fastify, pagos.map(p => p.id)) : new Set()
    const data = pagos.map(p => ({
      ...p,
      audit: auditedSet.has(p.id),
      ...(isDc ? { audit_dc: auditedDcSet.has(p.id) } : {})
    }))

    return { data, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /summary ──────────────────────────────────────────────────────────
  // Totales agregados (SUM en la base, no en el frontend) para los pagos
  // que matchean los mismos filtros que la tabla/CSV. Se usa para mostrar
  // el cuadro resumen sin tener que traer y sumar todas las filas.
  fastify.get('/summary', { preHandler: viewHandler }, async (request, reply) => {
    const {
      id_local, id_proveedor, id_proveedores, pagado, estado_op,
      desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
      audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q, observaciones
    } = request.query

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const where = await buildPagosWhere(fastify, request, {
      id_local, id_proveedor, id_proveedores, pagado, estado_op,
      desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
      audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q, observaciones
    })

    const { egresos, ingresos } = wheresDeuda(where)

    const [totalAgg, porImpuestoRows, egresosAgg, ingresosAgg] = await Promise.all([
      fastify.db.pago.aggregate({ where, _sum: { importe: true } }),
      fastify.db.impuesto.groupBy({ by: ['tipo'], where: { pago: where }, _sum: { monto: true } }),
      fastify.db.pago.aggregate({ where: egresos,  _sum: { importe: true }, _count: { id: true } }),
      fastify.db.pago.aggregate({ where: ingresos, _sum: { importe: true } })
    ])

    return {
      total_importe: Number(totalAgg._sum.importe ?? 0),
      // Deuda del conjunto FILTRADO, no del local entero: es lo que hace falta
      // para "cuánto le debo a este proveedor". Ver lib/deuda.js.
      total_deuda: deudaNeta(egresosAgg._sum.importe, ingresosAgg._sum.importe),
      count_deuda: egresosAgg._count.id,
      por_impuesto: Object.fromEntries(
        porImpuestoRows.map(row => [row.tipo, Number(row._sum.monto ?? 0)])
      )
    }
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
          ...(desde ? { gte: new Date(`${desde}T00:00:00.000Z`) } : {}),
          ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999Z`) } : {})
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
      params.push(new Date(`${desde}T00:00:00.000Z`))
      conditions += ` AND fecha >= $${params.length}`
    }
    if (hasta) {
      params.push(new Date(`${hasta}T23:59:59.999Z`))
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

  // ── GET /next-nro-ord ────────────────────────────────────────────────
  fastify.get('/next-nro-ord', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local } = request.query
    if (!id_local) return reply.code(400).send({ error: 'id_local es requerido' })
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }
    const nro_ord = await getNextNroOrd(fastify, id_local)
    return { nro_ord }
  })

  // ── GET /check-duplicado ─────────────────────────────────────────────────
  // Chequeo advisory (no bloqueante) de factura duplicada: mismo proveedor +
  // punto de venta + nro de comprobante, dentro del mismo local. `exclude_id`
  // se manda al editar un pago existente, para no matchear contra sí mismo.
  fastify.get('/check-duplicado', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, id_proveedor, pv, nro, exclude_id } = request.query
    if (!id_local || !id_proveedor || !pv || !nro) return { duplicado: false }
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }
    const pvNum  = parseInt(pv)
    const nroNum = parseInt(nro)
    if (isNaN(pvNum) || isNaN(nroNum)) return { duplicado: false }

    const existing = await fastify.db.pago.findFirst({
      where: {
        id_local, id_proveedor, pv: pvNum, nro: nroNum,
        ...(exclude_id ? { id: { not: exclude_id } } : {})
      },
      select: { id: true, nro_ord: true, fecha: true }
    })
    return { duplicado: Boolean(existing), pago: existing || null }
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
      where: { tabla: 'pagos', id_registro: pago.id, vigente: true, audit_dc: false },
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

    if (!fecha) return reply.code(400).send({ error: 'La fecha de la factura es obligatoria' })
    if (!importe && importe !== 0) return reply.code(400).send({ error: 'El importe es obligatorio' })
    if (!id_local) return reply.code(400).send({ error: 'Seleccioná un local' })
    if (!id_rubcat) return reply.code(400).send({ error: 'El rubro / categoría es obligatorio' })
    if (!id_metodo) return reply.code(400).send({ error: 'El método de pago es obligatorio' })
    // Carga Avión (id_tipo 'B') recibe tickets manuscritos de los locales, sin
    // punto de venta ni número de comprobante fiscal real: quedan opcionales.
    if (id_tipo !== 'B') {
      if (!pv)  return reply.code(400).send({ error: 'El punto de venta es obligatorio' })
      if (!nro) return reply.code(400).send({ error: 'El número de comprobante es obligatorio' })
    }
    if (!cashflow)  return reply.code(400).send({ error: 'El cashflow es obligatorio' })

    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    let finalNroOrd = nro_ord ? (parseInt(nro_ord) || null) : null
    if (!finalNroOrd) {
      finalNroOrd = await getNextNroOrd(fastify, id_local)
    }

    try {
      const pago = await fastify.db.pago.create({
        data: {
          nro_ord:        finalNroOrd,
          fecha:          new Date(fecha),
          id_proveedor:   id_proveedor   || null,
          id_rubcat,
          id_tipo:        id_tipo        || null,
          pv:             pv             ? (parseInt(pv) || null)    : null,
          nro:            nro            ? BigInt(nro)              : null,
          importe_neto:   importe_neto   ? parseFloat(importe_neto) : null,
          descuento:      descuento      ? parseFloat(descuento)    : null,
          importe:        importe        ? parseFloat(importe)      : null,
          id_metodo,
          cashflow:       cashflow       ? new Date(cashflow)       : null,
          observaciones,
          pagado:         pagado         ?? false,
          fecha_pago:     fecha_pago     ? new Date(fecha_pago)     : null,
          estado_op:      estado_op      || null,
          foto_url, pdf_url,
          periodo:        periodo        ? new Date(periodo)        : null,
          ingresa_egreso: ingresa_egreso ?? true,
          periodico:      periodico      ?? false,
          id_local,
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
      await logActivity(fastify, {
        id_registro: pago.id, id_local, accion: 'creado',
        id_user: request.user.id, snapshot: toSnapshotSafe(pago)
      })
      return reply.code(201).send(pago)
    } catch (err) {
      return reply.code(400).send({ error: translatePagoError(err) })
    }
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true, id_tipo: true }
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

    if (id_rubcat !== undefined && !id_rubcat) {
      return reply.code(400).send({ error: 'El rubro / categoría es obligatorio' })
    }
    if (id_metodo !== undefined && !id_metodo) {
      return reply.code(400).send({ error: 'El método de pago es obligatorio' })
    }
    const effectiveTipo = id_tipo !== undefined ? id_tipo : existing.id_tipo
    if (effectiveTipo !== 'B') {
      if (pv !== undefined && !pv) {
        return reply.code(400).send({ error: 'El punto de venta es obligatorio' })
      }
      if (nro !== undefined && !nro) {
        return reply.code(400).send({ error: 'El número de comprobante es obligatorio' })
      }
    }
    if (cashflow !== undefined && !cashflow) {
      return reply.code(400).send({ error: 'El cashflow es obligatorio' })
    }

    try {
      const pago = await fastify.db.pago.update({
        where: { id: request.params.id },
        data: {
          nro_ord:        nro_ord        !== undefined ? (parseInt(nro_ord) || null) : undefined,
          fecha:          fecha                       ? new Date(fecha)             : undefined,
          id_proveedor:   id_proveedor   !== undefined ? (id_proveedor || null)      : undefined,
          id_rubcat:      id_rubcat      !== undefined ? id_rubcat                  : undefined,
          id_tipo:        id_tipo        !== undefined ? (id_tipo || null)           : undefined,
          pv:             pv             !== undefined ? (parseInt(pv) || null)     : undefined,
          nro:            nro            !== undefined ? (nro ? BigInt(nro) : null) : undefined,
          importe_neto:   importe_neto   !== undefined ? toFloatOrNull(importe_neto) : undefined,
          descuento:      descuento      !== undefined ? toFloatOrNull(descuento)    : undefined,
          importe:        importe        !== undefined ? toFloatOrNull(importe)      : undefined,
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
        },
        include: { impuestos: true }
      })
      await logActivity(fastify, {
        id_registro: pago.id, id_local: pago.id_local, accion: 'editado',
        id_user: request.user.id, snapshot: toSnapshotSafe(pago)
      })
      return pago
    } catch (err) {
      return reply.code(400).send({ error: translatePagoError(err) })
    }
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
        where: { tabla: 'pagos', id_registro: request.params.id, audit_dc: false, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'pagos', id_registro: request.params.id, audit_dc: false, vigente: true },
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

  // ── PATCH /:id/audit-dc ───────────────────────────────────────────────
  // Circuito de auditoría exclusivo de super_admin/dcsmart. Cascadea el
  // estado al circuito normal cuando difiere, sin dejar rastro visible
  // para admin/cajero (observaciones null en la fila cascadeada).
  fastify.patch('/:id/audit-dc', { preHandler: [fastify.authenticate, fastify.appContext, fastify.requireDc] }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { observaciones } = request.body ?? {}

    const result = await fastify.db.$transaction(async (tx) => {
      const currentDc = await tx.audit.findFirst({
        where: { tabla: 'pagos', id_registro: request.params.id, audit_dc: true, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'pagos', id_registro: request.params.id, audit_dc: true, vigente: true },
        data: { vigente: false }
      })

      const accionDc = currentDc?.accion === 'auditado' ? 'desauditado' : 'auditado'

      await tx.audit.create({
        data: {
          id_registro:   request.params.id,
          tabla:         'pagos',
          tipo:          'auditoria_pago',
          accion:        accionDc,
          aprobado:      accionDc === 'auditado',
          vigente:       true,
          audit_dc:      true,
          id_user:       request.user.id,
          fecha:         new Date(),
          observaciones: accionDc === 'desauditado' ? (observaciones || null) : null
        }
      })

      const currentNormal = await tx.audit.findFirst({
        where: { tabla: 'pagos', id_registro: request.params.id, audit_dc: false, vigente: true }
      })

      let accionNormal = currentNormal?.accion === 'auditado' ? 'auditado' : 'desauditado'

      if (accionNormal !== accionDc) {
        await tx.audit.updateMany({
          where: { tabla: 'pagos', id_registro: request.params.id, audit_dc: false, vigente: true },
          data: { vigente: false }
        })

        await tx.audit.create({
          data: {
            id_registro:   request.params.id,
            tabla:         'pagos',
            tipo:          'auditoria_pago',
            accion:        accionDc,
            aprobado:      accionDc === 'auditado',
            vigente:       true,
            audit_dc:      false,
            id_user:       request.user.id,
            fecha:         new Date(),
            observaciones: null
          }
        })

        accionNormal = accionDc
      }

      return { audit_dc: accionDc === 'auditado', audit: accionNormal === 'auditado' }
    })

    return { ok: true, ...result }
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

    const isDc = ['super_admin', 'dcsmart'].includes(request.activeRole)

    return fastify.db.audit.findMany({
      where: {
        tabla: 'pagos',
        id_registro: request.params.id,
        ...(isDc ? {} : { audit_dc: false })
      },
      orderBy: { fecha: 'desc' },
      include: { user: { select: { id: true, nombre: true } } }
    })
  })

  // ── GET /:id/activity-history ──────────────────────────────────────────
  // Quién creó, editó o eliminó este pago, más reciente primero. Es el mismo
  // dato que la pantalla Actividad pero acotado a un pago, para no tener que
  // ir a buscarlo por OP cuando ya se está mirando el detalle.
  //
  // Restringido a los roles internos (super_admin y dcsmart), igual que la
  // fecha de creación y el circuito DC del mismo panel: es información de
  // control interno, no del operador del local.
  fastify.get('/:id/activity-history', { preHandler: viewHandler }, async (request, reply) => {
    if (!['super_admin', 'dcsmart'].includes(request.activeRole)) {
      return reply.code(403).send({ error: 'Sin acceso al historial de actividad' })
    }

    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    // El pago pudo haberse eliminado y su rastro sigue en el log: por eso no
    // se responde 404 si no está, solo se valida el acceso cuando existe.
    if (pago && !request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const rows = await fastify.db.activityLog.findMany({
      where: {
        tabla: 'pagos',
        id_registro: request.params.id,
        id_local: { in: request.allowedLocalIds }
      },
      orderBy: { fecha: 'desc' },
      include: { user: { select: { id: true, nombre: true } } }
    })

    return rows
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
  //
  // Un pago que NO venia del flujo PDP queda en estado_op = CAJA: la plata
  // salio de la caja. Los que venian de PDP/MP_PDP conservan su estado.
  // Ver lib/estadoOp.js.
  fastify.post('/pagar', { preHandler: editHandler }, async (request, reply) => {
    const { ids, fecha_pago, id_metodo } = request.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'Sin pagos seleccionados' })
    }
    if (!id_metodo) {
      return reply.code(400).send({ error: 'Forma de pago requerida' })
    }

    // Se leen antes para decidir el estado de cada uno y para devolverle al
    // frontend que ids quedaron en CAJA (asi no duplica la regla).
    const afectados = await fastify.db.pago.findMany({
      where:  { id: { in: ids }, id_local: { in: request.allowedLocalIds } },
      select: { id: true, estado_op: true }
    })
    if (afectados.length === 0) return { ok: true, count: 0, ids_caja: [] }

    const { idsCaja, idsConservan } = partirIdsPorEstado(afectados)
    const datosComunes = {
      pagado:     true,
      fecha_pago: fecha_pago ? new Date(fecha_pago) : new Date(),
      id_metodo
    }

    await fastify.db.$transaction([
      ...(idsCaja.length ? [fastify.db.pago.updateMany({
        where: { id: { in: idsCaja } },
        data:  { ...datosComunes, estado_op: 'CAJA' }
      })] : []),
      ...(idsConservan.length ? [fastify.db.pago.updateMany({
        where: { id: { in: idsConservan } },
        data:  datosComunes
      })] : []),
    ])

    return { ok: true, count: afectados.length, ids_caja: idsCaja }
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

    const parsed = parseGsPath(gsPath)
    if (!parsed) return reply.code(404).send({ error: 'Sin adjunto' })
    const { bucket: bucketName, filePath } = parsed

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
    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'No se recibió archivo' })
    const bucket = process.env.GCS_BUCKET_NAME
    if (!bucket) return reply.code(500).send({ error: 'GCS_BUCKET_NAME no configurado' })

    const ext = data.filename.split('.').pop().toLowerCase()
    if (!EXTENSIONES_ADJUNTO.has(ext)) {
      return reply.code(400).send({ error: `Tipo de archivo no permitido (.${ext})` })
    }

    let folder = 'general'
    if (id_local) {
      const local = await fastify.db.local.findUnique({ where: { id: id_local }, select: { nombre: true } })
      if (local?.nombre) folder = sanitizeFolderName(local.nombre)
    }

    const type     = ext === 'pdf' ? 'pdf' : 'foto'
    const filename = `${folder}/facturas/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const file     = gcs.bucket(bucket).file(filename)
    await new Promise((resolve, reject) => {
      const stream = file.createWriteStream({ metadata: { contentType: data.mimetype } })
      data.file.pipe(stream).on('error', reject).on('finish', resolve)
    })
    return { ok: true, type, url: `gs://${bucket}/${filename}` }
  })

  // ── POST /leer-factura ─────────────────────────────────────────────────────
  // Lee los datos de una factura (foto o PDF) para precargar el formulario. No
  // guarda nada: devuelve campos sueltos y la persona los revisa y confirma.
  // Quien quiera guardar el archivo lo sube aparte por /upload, como cualquier
  // otro adjunto.
  fastify.post('/leer-factura', { preHandler: [fastify.authenticate, fastify.appContext] }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'No se recibió archivo' })

    const ext = (data.filename ?? '').split('.').pop().toLowerCase()
    if (!EXTENSIONES_LECTURA.has(ext)) {
      return reply.code(400).send({ error: `Solo se puede leer una foto o un PDF (.${ext} no sirve)` })
    }

    // Pasado el limite de multipart (20 MB) toBuffer() lanza, y sin esto salia
    // un 500 sin explicacion. Un PDF de factura pesa unos pocos cientos de KB:
    // si alguien manda algo de 20 MB, casi seguro se equivoco de archivo.
    let buffer
    try {
      buffer = await data.toBuffer()
    } catch {
      return reply.code(413).send({ error: 'El archivo es demasiado grande (máximo 20 MB)' })
    }

    let crudo
    try {
      crudo = await extraerDeArchivo(buffer, data.mimetype)
    } catch (err) {
      // El formulario tiene que quedar usable a mano si esto falla, asi que el
      // error se informa y no se rompe nada de lo ya cargado.
      request.log.error({ err }, 'Falló la lectura de la factura')
      return reply.code(502).send({ error: 'No se pudo leer la factura. Cargá los datos a mano.' })
    }

    const campos = aCamposFormulario(crudo)
    if (!campos) {
      return { legible: false, campos: null, marcados: [], proveedor: null, aritmetica: null }
    }

    // El CUIT es lo que hace util esto: hay 4458 proveedores con CUIT limpio.
    // Si no se encuentra, se devuelve la razon social leida para que la pantalla
    // ofrezca crearlo, en vez de dejar al usuario buscando a ciegas.
    let proveedor = null
    if (campos.cuit_emisor) {
      const encontrado = await fastify.db.proveedor.findFirst({
        where: { cuit: campos.cuit_emisor },
        select: { id: true, nombre: true, razon_social: true, cuit: true }
      })
      proveedor = encontrado
        ? { estado: 'encontrado', ...encontrado }
        : { estado: 'no_encontrado', cuit: campos.cuit_emisor, razon_social: campos.razon_social_emisor }
    }

    // La factura dice "Contado" o "Cuenta Corriente 30 días" y el catálogo tiene
    // "Efectivo" y "Cuenta Cte.": el match resuelve esos sinónimos. Si leyó algo
    // que no se pudo mapear, se devuelve el texto igual para que se vea.
    let metodo = null
    if (campos.condicion_venta) {
      const metodos = await fastify.db.metodoPago.findMany({
        where: { activo: true },
        select: { id: true, nombre: true }
      })
      metodo = matchearMetodoPago(campos.condicion_venta, metodos)
    }

    const marcados = camposConDato(campos)
    if (metodo?.id) marcados.push('id_metodo')

    return {
      legible: true,
      campos,
      marcados,
      proveedor,
      metodo,
      aritmetica: validarAritmetica(campos)
    }
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
      include: { impuestos: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    // Se registra el snapshot ANTES de borrar -- es el único rastro que va a
    // quedar de este pago una vez hecho el hard delete.
    await logActivity(fastify, {
      id_registro: existing.id, id_local: existing.id_local, accion: 'eliminado',
      id_user: request.user.id, snapshot: toSnapshotSafe(existing)
    })

    // Eliminar registros dependientes antes que el pago (FK constraints)
    await fastify.db.impuesto.deleteMany({ where: { id_pago: request.params.id } })
    await fastify.db.multiMoneda.deleteMany({ where: { id_pago: request.params.id } })
    await fastify.db.pago.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
