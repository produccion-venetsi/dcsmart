// Intercompany — pasar plata de un local a otro del MISMO grupo.
//
// La op de tipo STK que cargó el local que envía se espeja en el local que
// recibe como un INGRESO, unidas por `id_pago_origen`. Las reglas de qué se
// puede enviar, a dónde, y cómo queda la copia viven en lib/intercompany.js;
// acá está el acceso a la base y los permisos.
//
// Quién entra: rol operativo del grupo (admin, externo, dcsmart, super_admin)
// — mover plata entre locales no es una tarea de caja. El guard es de rol Y de
// permiso sobre `pagos`: el módulo no tiene tabla propia, las ops son pagos.

import { TIPO_INTERCOMPANY } from '../lib/intercompany.js'
import { crearCopiaIntercompany, localesDelGrupo } from '../lib/enviarIntercompany.js'

// Lo que la pantalla necesita de cada op para listarla y decidir.
const SELECT_OP = {
  id: true, nro_ord: true, fecha: true, importe: true, id_tipo: true,
  id_local: true, id_pago_origen: true, observaciones: true, pagado: true,
  local: { select: { id: true, nombre: true } },
  proveedor: { select: { nombre: true } },
  metodo_pago: { select: { nombre: true } },
}

export default async function intercompanyRoutes(fastify) {
  const ver    = [fastify.authenticate, fastify.appContext, fastify.requireOperativo, fastify.can('pagos', 'view')]
  const enviar = [fastify.authenticate, fastify.appContext, fastify.requireOperativo, fastify.can('pagos', 'create')]

  const localesDe = (request) => localesDelGrupo(fastify.db, request)

  // ── GET /locales ── a qué locales se puede enviar ───────────────────────
  fastify.get('/locales', { preHandler: ver }, async (request) => {
    return { locales: await localesDe(request) }
  })

  // ── GET / ── las ops del grupo, enviadas y por enviar ───────────────────
  //
  // Una sola consulta para las dos listas: la pantalla las parte por
  // `id_pago_origen` (la copia lo tiene, la original no) y por si ya tiene
  // copias. Así los dos lados hablan siempre del mismo conjunto.
  fastify.get('/', { preHandler: ver }, async (request, reply) => {
    const { desde, hasta, id_local } = request.query
    const locales = await localesDe(request)
    if (id_local && !locales.some((l) => l.id === id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const ids = id_local ? [id_local] : locales.map((l) => l.id)
    if (!ids.length) return { pendientes: [], enviadas: [] }

    // `fecha` es día calendario (medianoche UTC): su rango va en UTC puro.
    const rango = (desde || hasta) ? {
      fecha: {
        ...(desde ? { gte: new Date(`${desde}T00:00:00.000Z`) } : {}),
        ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999Z`) } : {}),
      },
    } : {}

    const ops = await fastify.db.pago.findMany({
      where: { id_local: { in: ids }, id_tipo: TIPO_INTERCOMPANY, ...rango },
      select: { ...SELECT_OP, copias: { select: { id: true, id_local: true, nro_ord: true, local: { select: { nombre: true } } } } },
      orderBy: [{ fecha: 'desc' }, { nro_ord: 'desc' }],
      take: 300,
    })

    // Las copias recibidas no se ofrecen para enviar: se listan aparte para
    // que el local que recibió también vea de dónde le entró la plata.
    const pendientes = ops.filter((o) => !o.id_pago_origen && o.copias.length === 0)
    const enviadas   = ops.filter((o) => !o.id_pago_origen && o.copias.length > 0)
    const recibidas  = ops.filter((o) => o.id_pago_origen)
    return { pendientes, enviadas, recibidas }
  })

  // ── POST /enviar ── crear el espejo en el local destino ─────────────────
  //
  // Para las ops que YA estaban cargadas. Las nuevas se marcan directamente en
  // el formulario de Pagos, que llama al mismo helper.
  fastify.post('/enviar', { preHandler: enviar }, async (request, reply) => {
    const { id_pago, id_local_destino } = request.body ?? {}
    if (!id_pago) return reply.code(400).send({ error: 'Falta la op a enviar' })

    const pago = await fastify.db.pago.findUnique({
      where: { id: id_pago },
      select: { ...SELECT_OP, periodo: true, cashflow: true, id_proveedor: true, id_rubcat: true, id_metodo: true, pv: true, nro: true, importe_neto: true },
    })
    if (!pago) return reply.code(404).send({ error: 'La op no existe' })

    try {
      const copia = await crearCopiaIntercompany(fastify.db, {
        pago,
        idDestino: id_local_destino,
        locales: await localesDe(request),
        userId: request.user.id,
      })
      return reply.code(201).send({ copia })
    } catch (err) {
      if (err.statusCode) return reply.code(err.statusCode).send({ error: err.message })
      throw err
    }
  })

  // ── DELETE /enviar/:id_pago ── revertir el envío ────────────────────────
  //
  // Borra la copia. Se permite solo si el local que recibió no la tocó: si ya
  // la pagó, la mandó a un PDP o la auditó, deshacer por atrás dejaría a ese
  // local con un circuito abierto sobre una op que desapareció.
  fastify.delete('/enviar/:id_pago', { preHandler: enviar }, async (request, reply) => {
    const copias = await fastify.db.pago.findMany({
      where: { id_pago_origen: request.params.id_pago },
      select: { id: true, id_local: true, id_pdp: true, estado_op: true },
    })
    if (!copias.length) return reply.code(404).send({ error: 'Esa op no tiene un envío que revertir' })

    const locales = await localesDe(request)
    for (const c of copias) {
      if (!locales.some((l) => l.id === c.id_local)) {
        return reply.code(403).send({ error: 'Sin acceso al local que recibió' })
      }
      if (c.id_pdp || c.estado_op) {
        return reply.code(409).send({
          error: 'El local que recibió ya empezó a operar esta op (está en un PDP o tiene estado). Borrala desde Pagos si corresponde.',
        })
      }
    }

    const auditadas = await fastify.db.audit.count({
      where: { tabla: 'pagos', id_registro: { in: copias.map((c) => c.id) }, vigente: true, accion: 'auditado' },
    })
    if (auditadas) {
      return reply.code(409).send({ error: 'La op que recibió el otro local ya está auditada: no se revierte desde acá' })
    }

    const { count } = await fastify.db.pago.deleteMany({ where: { id: { in: copias.map((c) => c.id) } } })
    return { ok: true, borradas: count }
  })
}
