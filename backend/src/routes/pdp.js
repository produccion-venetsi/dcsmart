import { Storage } from '@google-cloud/storage'

export default async function pdpRoutes(fastify) {
  const gcs = new Storage()

  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'create')]

  // ── GET / ─────────────────────────────────────────────────────────────
  // Historial de PDP de un local, más reciente primero.
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local } = request.query
    if (!id_local || !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const pdps = await fastify.db.pdp.findMany({
      where: { id_local },
      orderBy: { created_at: 'desc' },
      include: { creador: { select: { nombre: true } } }
    })
    return { data: pdps }
  })

  // ── POST / ────────────────────────────────────────────────────────────
  // Registra un PDP recién generado en el frontend: el PDF ya está subido a
  // GCS (vía POST /pagos/upload), acá solo se deja constancia del lote.
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { id_local, pago_ids, pdf_url } = request.body
    if (!id_local || !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    if (!Array.isArray(pago_ids) || !pago_ids.length) {
      return reply.code(400).send({ error: 'pago_ids es requerido' })
    }
    if (!pdf_url?.startsWith('gs://')) {
      return reply.code(400).send({ error: 'pdf_url inválido' })
    }

    const pagos = await fastify.db.pago.findMany({
      where: { id: { in: pago_ids } },
      select: { id: true, importe: true, id_local: true }
    })
    if (pagos.some(p => p.id_local !== id_local)) {
      return reply.code(400).send({ error: 'Uno o más pagos no pertenecen al local indicado' })
    }
    const total = pagos.reduce((acc, p) => acc + Number(p.importe ?? 0), 0)

    const pdp = await fastify.db.pdp.create({
      data: {
        id_local,
        created_by: request.user.id,
        pdf_url,
        cantidad_pagos: pagos.length,
        total
      }
    })
    await fastify.db.pago.updateMany({
      where: { id: { in: pago_ids } },
      data: { id_pdp: pdp.id }
    })
    return { ok: true, id: pdp.id }
  })

  // ── GET /:id/attachment ───────────────────────────────────────────────
  // Streams el PDF privado de GCS a través del backend (mismo patrón que
  // pagos.js:698), y deja registrada la fecha de última descarga.
  fastify.get('/:id/attachment', { preHandler: viewHandler }, async (request, reply) => {
    const pdp = await fastify.db.pdp.findUnique({
      where:  { id: request.params.id },
      select: { pdf_url: true, id_local: true }
    })
    if (!pdp) return reply.code(404).send({ error: 'PDP no encontrado' })
    if (!request.allowedLocalIds.includes(pdp.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }
    if (!pdp.pdf_url?.startsWith('gs://')) return reply.code(404).send({ error: 'Sin adjunto' })

    const withoutScheme = pdp.pdf_url.replace('gs://', '')
    const slashIdx       = withoutScheme.indexOf('/')
    const bucketName     = withoutScheme.slice(0, slashIdx)
    const filePath       = withoutScheme.slice(slashIdx + 1)

    reply.header('Content-Type', 'application/pdf')
    reply.header('Cache-Control', 'private, max-age=300')

    const stream = gcs.bucket(bucketName).file(filePath).createReadStream({
      userProject: process.env.GCS_PROJECT_ID,
    })
    stream.on('error', (err) => {
      fastify.log.error({ err, gsPath: pdp.pdf_url }, 'GCS stream error')
      if (!reply.sent) reply.code(502).send({ error: 'No se pudo obtener el archivo' })
    })

    fastify.db.pdp.update({
      where: { id: request.params.id },
      data: { ultima_descarga: new Date() }
    }).catch((err) => fastify.log.error({ err }, 'No se pudo actualizar ultima_descarga del PDP'))

    return reply.send(stream)
  })
}
