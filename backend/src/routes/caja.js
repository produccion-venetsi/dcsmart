import multipart from '@fastify/multipart'
import { Storage } from '@google-cloud/storage'
import { toTipoTurnoEnum, fromTipoTurnoEnum, toTipoTurnoEnumList } from '../lib/tipoTurno.js'
import { parseCsvParam } from '../lib/queryParams.js'
import { calcularCuadre } from '../lib/cuadreCaja.js'
import { buildAuditFilter } from '../lib/auditFilter.js'
import { avisarDesauditado } from '../lib/avisos.js'

// El estado de auditoría de una caja se guarda en la tabla `audits`
// (modelo Audit) con tabla='cajas' e id_registro=caja.id, igual que en pagos.
// Ver backend/src/routes/pagos.js para la explicación del historial append-only.

async function getAuditedCajaSet(fastify, cajaIds) {
  if (!cajaIds.length) return new Set()
  try {
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'cajas', id_registro: { in: cajaIds }, audit_dc: false, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    return new Set(rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (getAuditedCajaSet)')
    return new Set()
  }
}

// Extensiones aceptadas para adjuntos (fotos de cierre de caja) -- rechaza
// cualquier otro tipo de archivo en vez de subirlo tal cual a GCS.
const EXTENSIONES_ADJUNTO = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf'])

// El nombre del local se usa como carpeta en GCS -- se sanitiza para evitar
// que caracteres raros (o un intento de path traversal via "../") rompan
// la ruta del archivo dentro del bucket.
function sanitizeFolderName(nombre) {
  const limpio = String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  return limpio || 'general'
}

export default async function cajaRoutes(fastify) {
  await fastify.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
  const gcs = new Storage()

  const viewHandler    = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  const createHandler  = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const editHandler    = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'edit')]
  const deleteHandler  = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const {
      id_local, desde, hasta, audit, tipo_turno, page = 1, limit = 50,
      sort_field = 'fecha_inicio', sort_dir = 'desc'
    } = request.query
    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }
    const auditFilter = await buildAuditFilter(fastify, audit, 'cajas', request.allowedLocalIds)

    // tipo_turno puede traer varios valores separados por coma.
    const tipoTurnos = toTipoTurnoEnumList(parseCsvParam(tipo_turno))

    const where = {
      ...localFilter,
      ...auditFilter,
      ...(tipoTurnos.length ? { tipo_turno: { in: tipoTurnos } } : {}),
      ...(desde || hasta ? {
        // desde/hasta son días de calendario (input type="date") sobre un
        // campo que es un instante real (fecha_inicio) -- el rango se
        // interpreta en hora de Argentina (-03:00 fijo), marcado explícito
        // para no depender del timezone del proceso donde corra Node.
        fecha_inicio: {
          ...(desde ? { gte: new Date(`${desde}T00:00:00.000-03:00`) } : {}),
          ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999-03:00`) } : {})
        }
      } : {})
    }

    const VALID_SORT = ['fecha_inicio', 'fecha_cierre', 'nro_turno', 'cajero', 'total']
    const orderField = VALID_SORT.includes(sort_field) ? sort_field : 'fecha_inicio'
    const orderDir   = sort_dir === 'asc' ? 'asc' : 'desc'

    const [cajas, total] = await Promise.all([
      fastify.db.caja.findMany({
        where,
        include: {
          local:   { select: { id: true, nombre: true } },
          creador: { select: { id: true, nombre: true } },
          // Necesarios para calcular la diferencia de caja en el listado. Antes
          // no venian y por eso la diferencia solo se podia ver abriendo cada
          // caja, sin forma de filtrar o listar las descuadradas.
          movimientos: { select: { tipo: true, monto: true, metodo_pago: { select: { nombre: true } } } },
          detalles:    { select: { monto: true, tipo: true, detalle_tipo: { select: { clasificacion: true } } } }
        },
        orderBy: { [orderField]: orderDir },
        skip,
        take
      }),
      fastify.db.caja.count({ where })
    ])

    const auditedSet = await getAuditedCajaSet(fastify, cajas.map(c => c.id))
    const data = cajas.map(({ movimientos, detalles, ...c }) => ({
      ...c,
      tipo_turno: fromTipoTurnoEnum(c.tipo_turno),
      audit: auditedSet.has(c.id),
      // Se devuelve el cuadre calculado y no las colecciones crudas: la lista no
      // las muestra y son varios miles de filas al serializar.
      cuadre: calcularCuadre({ ...c, movimientos, detalles }),
      // Suma cruda de los detalles, para la columna "Total Det." del listado.
      // No sale del cuadre: ahi cobros/gastos/informativos salen de los
      // movimientos cuando el local carga por movimientos (origen TAPTAP), asi
      // que no suman los detalles. Los detalles ya venian en la query, esto solo
      // los totaliza antes de descartarlos.
      total_detalles: (detalles ?? []).reduce((acc, d) => {
        const n = Number(d.monto)
        return acc + (Number.isFinite(n) ? n : 0)
      }, 0)
    }))

    return { data, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /stats ─────────────────────────────────────────────────────────
  fastify.get('/stats', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta, audit, tipo_turno } = request.query

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }
    const auditFilter = await buildAuditFilter(fastify, audit, 'cajas', request.allowedLocalIds)

    // tipo_turno puede traer varios valores separados por coma.
    const tipoTurnos = toTipoTurnoEnumList(parseCsvParam(tipo_turno))

    const where = {
      ...localFilter,
      ...auditFilter,
      ...(tipoTurnos.length ? { tipo_turno: { in: tipoTurnos } } : {}),
      ...(desde || hasta ? {
        fecha_inicio: {
          ...(desde && { gte: new Date(`${desde}T00:00:00.000-03:00`) }),
          ...(hasta && { lte: new Date(`${hasta}T23:59:59.999-03:00`) })
        }
      } : {})
    }

    const agg = await fastify.db.caja.aggregate({
      where,
      _sum:   { total: true, efectivo: true, tickets: true, comensales: true },
      _count: { id: true }
    })

    return {
      total_recaudado:  Number(agg._sum.total      ?? 0),
      count_turnos:     agg._count.id,
      total_efectivo:   Number(agg._sum.efectivo   ?? 0),
      total_tickets:    agg._sum.tickets            ?? 0,
      total_comensales: agg._sum.comensales         ?? 0,
    }
  })

  // ── GET /:id ───────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      include: {
        local:       true,
        creador:     { select: { id: true, nombre: true } },
        movimientos: { include: { metodo_pago: true } },
        detalles: {
          include: {
            detalle_tipo: { select: { id: true, nombre: true, clasificacion: true } },
            // A qué cuenta corriente se le cargó el detalle. Hace falta el nombre y no solo
            // el id: el formulario de edición abre el combobox con lo que ya estaba, y con
            // solo el id abriría vacío y parecería que el detalle perdió la cuenta.
            cliente:      { select: { id: true, nombre: true, razon_social: true } }
          },
          orderBy: { created_at: 'asc' }
        }
      }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const isDc = ['super_admin', 'dcsmart'].includes(request.activeRole)

    const auditRow = await fastify.db.audit.findFirst({
      where: { tabla: 'cajas', id_registro: caja.id, vigente: true, audit_dc: false },
      include: { user: { select: { id: true, nombre: true } } }
    })
    const auditDcRow = isDc ? await fastify.db.audit.findFirst({
      where: { tabla: 'cajas', id_registro: caja.id, vigente: true, audit_dc: true }
    }) : null

    return {
      ...caja,
      tipo_turno: fromTipoTurnoEnum(caja.tipo_turno),
      audit:      auditRow?.accion === 'auditado',
      audit_by:   auditRow?.user?.nombre ?? null,
      audit_date: auditRow?.fecha ?? null,
      ...(isDc ? { audit_dc: auditDcRow?.accion === 'auditado' } : {}),
      // El desglose completo, para poder explicar contra que se comparo
      cuadre: calcularCuadre(caja)
    }
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const {
      nro_turno, tipo_turno, fecha_inicio, fecha_cierre, id_local, cajero,
      total, efectivo, fiscal, comensales, tickets, observaciones, foto_url, origin
    } = request.body

    if (!fecha_inicio || !id_local) {
      return reply.code(400).send({ error: 'fecha_inicio e id_local son requeridos' })
    }

    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const caja = await fastify.db.caja.create({
      data: {
        nro_turno:    nro_turno    ? String(parseInt(nro_turno)) : null,
        tipo_turno:   toTipoTurnoEnum(tipo_turno),
        fecha_inicio: new Date(fecha_inicio),
        // Si no se carga cierre, se asume igual a la apertura (evita cajas
        // con fecha_cierre vacía).
        fecha_cierre: fecha_cierre ? new Date(fecha_cierre)      : new Date(fecha_inicio),
        id_local, cajero,
        total:        total        ? parseFloat(total)           : null,
        efectivo:     efectivo     ? parseFloat(efectivo)        : null,
        fiscal:       fiscal       ? parseFloat(fiscal)          : null,
        comensales:   comensales   ? parseInt(comensales)        : null,
        tickets:      tickets      ? parseInt(tickets)           : null,
        observaciones, foto_url,
        origin: origin || 'DCSMART',
        created_by: request.user.id
      }
    })
    return reply.code(201).send({ ...caja, tipo_turno: fromTipoTurnoEnum(caja.tipo_turno) })
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true, fecha_inicio: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const {
      nro_turno, tipo_turno, fecha_inicio, fecha_cierre, cajero, total, efectivo, fiscal,
      comensales, tickets, observaciones, foto_url
    } = request.body

    if (fecha_inicio !== undefined && !fecha_inicio) {
      return reply.code(400).send({ error: 'fecha_inicio no puede quedar vacía' })
    }

    const caja = await fastify.db.caja.update({
      where: { id: request.params.id },
      data: {
        nro_turno,
        tipo_turno:    tipo_turno    !== undefined ? toTipoTurnoEnum(tipo_turno) : undefined,
        fecha_inicio:  fecha_inicio  !== undefined ? new Date(fecha_inicio) : undefined,
        // Si se envía cierre vacío, se asume igual a la apertura (nunca queda vacío).
        fecha_cierre:  fecha_cierre  !== undefined ? (fecha_cierre ? new Date(fecha_cierre) : new Date(fecha_inicio || existing.fecha_inicio)) : undefined,
        cajero,
        total:         total         !== undefined ? (total       !== null ? parseFloat(total)      : null) : undefined,
        efectivo:      efectivo      !== undefined ? (efectivo    !== null ? parseFloat(efectivo)   : null) : undefined,
        fiscal:        fiscal        !== undefined ? (fiscal      !== null ? parseFloat(fiscal)      : null) : undefined,
        comensales:    comensales    !== undefined ? (comensales  !== null ? parseInt(comensales)    : null) : undefined,
        tickets:       tickets       !== undefined ? (tickets     !== null ? parseInt(tickets)       : null) : undefined,
        observaciones, foto_url
      }
    })
    return { ...caja, tipo_turno: fromTipoTurnoEnum(caja.tipo_turno) }
  })

  // ── POST /upload ───────────────────────────────────────────────────────
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

    const filename = `${folder}/fotos-caja/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const file     = gcs.bucket(bucket).file(filename)
    await new Promise((resolve, reject) => {
      const stream = file.createWriteStream({ metadata: { contentType: data.mimetype } })
      data.file.pipe(stream).on('error', reject).on('finish', resolve)
    })
    return { ok: true, url: `gs://${bucket}/${filename}` }
  })

  // ── GET /:id/attachment ────────────────────────────────────────────────
  // Streams la foto de una caja desde GCS a través del backend (un navegador
  // no puede cargar una URL gs:// directamente). Ver GET /pagos/:id/attachment
  // en pagos.js para el mismo patrón.
  fastify.get('/:id/attachment', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { foto_url: true, id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })
    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const gsPath = caja.foto_url
    if (!gsPath?.startsWith('gs://')) return reply.code(404).send({ error: 'Sin adjunto' })

    const withoutScheme = gsPath.replace('gs://', '')
    const slashIdx      = withoutScheme.indexOf('/')
    const bucketName    = withoutScheme.slice(0, slashIdx)
    const filePath      = withoutScheme.slice(slashIdx + 1)

    const ext         = filePath.split('.').pop().toLowerCase()
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'

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

  // ── PATCH /:id/audit ───────────────────────────────────────────────────
  // Mismo mecanismo de historial append-only que pagos (ver pagos.js).
  fastify.patch('/:id/audit', { preHandler: editHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      // nro_turno se usa para la etiqueta del aviso al auditor.
      select: { id_local: true, nro_turno: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { observaciones } = request.body ?? {}

    const nextAccion = await fastify.db.$transaction(async (tx) => {
      const current = await tx.audit.findFirst({
        where: { tabla: 'cajas', id_registro: request.params.id, audit_dc: false, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'cajas', id_registro: request.params.id, audit_dc: false, vigente: true },
        data: { vigente: false }
      })

      const accion = current?.accion === 'auditado' ? 'desauditado' : 'auditado'

      await tx.audit.create({
        data: {
          id_registro:   request.params.id,
          tabla:         'cajas',
          tipo:          'auditoria_caja',
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

    // Despues del commit: el aviso lee el historial y necesita ver el evento nuevo.
    if (nextAccion === 'desauditado') {
      await avisarDesauditado(fastify, {
        tabla: 'cajas',
        id_registro: request.params.id,
        id_local: caja.id_local,
        quienDesaudita: request.user.id,
        etiqueta: caja.nro_turno ? `Turno ${caja.nro_turno}` : 'una caja',
        observaciones
      })
    }

    return { ok: true, audit: nextAccion === 'auditado' }
  })

  // ── PATCH /:id/audit-dc ───────────────────────────────────────────────
  // Ver pagos.js para la explicación completa del mecanismo de cascada.
  fastify.patch('/:id/audit-dc', { preHandler: [fastify.authenticate, fastify.appContext, fastify.requireDc] }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true, nro_turno: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { observaciones } = request.body ?? {}

    const result = await fastify.db.$transaction(async (tx) => {
      const currentDc = await tx.audit.findFirst({
        where: { tabla: 'cajas', id_registro: request.params.id, audit_dc: true, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'cajas', id_registro: request.params.id, audit_dc: true, vigente: true },
        data: { vigente: false }
      })

      const accionDc = currentDc?.accion === 'auditado' ? 'desauditado' : 'auditado'

      await tx.audit.create({
        data: {
          id_registro:   request.params.id,
          tabla:         'cajas',
          tipo:          'auditoria_caja',
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
        where: { tabla: 'cajas', id_registro: request.params.id, audit_dc: false, vigente: true }
      })

      let accionNormal = currentNormal?.accion === 'auditado' ? 'auditado' : 'desauditado'
      // Solo hay que avisar si la cascada CAMBIO el circuito normal. Si ya estaba
      // desauditado, no hubo nada que revertir y un aviso seria ruido.
      let cascadeo = false

      if (accionNormal !== accionDc) {
        cascadeo = true
        await tx.audit.updateMany({
          where: { tabla: 'cajas', id_registro: request.params.id, audit_dc: false, vigente: true },
          data: { vigente: false }
        })

        await tx.audit.create({
          data: {
            id_registro:   request.params.id,
            tabla:         'cajas',
            tipo:          'auditoria_caja',
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

      return { audit_dc: accionDc === 'auditado', audit: accionNormal === 'auditado', cascadeo }
    })

    // Igual que en pagos: si la cascada arrastro el circuito normal a
    // desauditado, el auditor del local tiene que enterarse.
    if (result.cascadeo && result.audit === false) {
      await avisarDesauditado(fastify, {
        tabla: 'cajas',
        id_registro: request.params.id,
        id_local: caja.id_local,
        quienDesaudita: request.user.id,
        etiqueta: caja.nro_turno ? `Turno ${caja.nro_turno}` : 'una caja',
        observaciones
      })
    }

    const { cascadeo, ...payload } = result
    return { ok: true, ...payload }
  })

  // ── GET /:id/audit-history ─────────────────────────────────────────────
  fastify.get('/:id/audit-history', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })
    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const isDc = ['super_admin', 'dcsmart'].includes(request.activeRole)

    return fastify.db.audit.findMany({
      where: {
        tabla: 'cajas',
        id_registro: request.params.id,
        ...(isDc ? {} : { audit_dc: false })
      },
      orderBy: { fecha: 'desc' },
      include: { user: { select: { id: true, nombre: true } } }
    })
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    // Se trae la caja ENTERA, con sus movimientos y detalles: es un hard delete en cascada
    // y esto es lo único que va a quedar de todo eso.
    //
    // Antes este endpoint no registraba nada en activity_log: se borraba la caja con todos
    // sus movimientos y no quedaba rastro de que hubieran existido. El de pagos sí lo hacía.
    const existing = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      include: {
        movimientos: true,
        detalles: true,
      },
    })
    if (!existing) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    // El motivo lo escribe quien elimina. Opcional (se pidió "permitir escribir una
    // observación", no obligarla) y recortado: es una explicación, no un documento.
    const motivo = String(request.body?.motivo ?? '').trim().slice(0, 500) || null

    // Como logActivity en pagos: un fallo del registro no puede impedir el borrado, pero se
    // hace ANTES para que el rastro exista incluso si el delete falla a mitad de camino.
    try {
      await fastify.db.activityLog.create({
        data: {
          tabla: 'cajas',
          id_registro: existing.id,
          id_local: existing.id_local,
          accion: 'eliminado',
          id_user: request.user.id,
          motivo,
          // Los Decimal de Prisma no son JSON: se serializan con el replacer de abajo.
          snapshot: JSON.parse(JSON.stringify(existing, (_, v) =>
            typeof v === 'bigint' ? v.toString()
              : (v && typeof v === 'object' && typeof v.toFixed === 'function') ? v.toString()
                : v)),
        },
      })
    } catch (err) {
      fastify.log.error({ err, id: existing.id }, 'No se pudo registrar la eliminación de la caja')
    }

    // Eliminar registros dependientes antes que la caja (FK constraints)
    await fastify.db.cajaMovimiento.deleteMany({ where: { id_caja: request.params.id } })
    await fastify.db.cajaDetalle.deleteMany({ where: { id_caja: request.params.id } })
    await fastify.db.caja.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
