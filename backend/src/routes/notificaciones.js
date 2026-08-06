// Avisos del propio usuario. No pasa por `can()`: no es un modulo del sistema de
// permisos, son datos personales. Solo exige estar autenticado, y TODA consulta
// esta acotada a request.user.id -- nunca se puede leer ni marcar la de otro.
//
// Tampoco pasa por `appContext`: un aviso es del usuario, no de la app activa. Si
// le desauditan algo de un grupo y esta mirando otro, el aviso le llega igual.

export default async function notificacionesRoutes(fastify) {
  const guard = [fastify.authenticate]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: guard }, async (request) => {
    // Tope duro: el contador del sidebar pide limit=1 y la pantalla pide 100.
    const limit = Math.min(Number(request.query.limit) || 20, 100)

    const [data, no_leidas] = await Promise.all([
      fastify.db.notificacion.findMany({
        where: { id_user: request.user.id },
        // No leidas primero, y dentro de cada grupo lo mas nuevo arriba. Se apoya
        // en notificaciones_id_user_leida_idx.
        orderBy: [{ leida: 'asc' }, { created_at: 'desc' }],
        take: limit
      }),
      fastify.db.notificacion.count({
        where: { id_user: request.user.id, leida: false }
      })
    ])

    // `no_leidas` es el total real, no cuantas vinieron en `data`: el badge tiene
    // que decir 120 aunque la pagina traiga 20.
    return { data, no_leidas }
  })

  // ── PATCH /leer-todas ─────────────────────────────────────────────────
  // Declarada ANTES de /:id/leida: son rutas de distinta cantidad de segmentos y
  // Fastify no las confunde, pero el orden lo deja explicito para el que lea.
  fastify.patch('/leer-todas', { preHandler: guard }, async (request) => {
    const { count } = await fastify.db.notificacion.updateMany({
      where: { id_user: request.user.id, leida: false },
      data: { leida: true }
    })
    return { ok: true, marcadas: count }
  })

  // ── PATCH /:id/leida ──────────────────────────────────────────────────
  fastify.patch('/:id/leida', { preHandler: guard }, async (request, reply) => {
    // updateMany con id_user en el where: si el aviso es de otro usuario no
    // actualiza nada y se responde 404, sin revelar que existe.
    const { count } = await fastify.db.notificacion.updateMany({
      where: { id: request.params.id, id_user: request.user.id },
      data: { leida: true }
    })
    if (count === 0) return reply.code(404).send({ error: 'Aviso no encontrado' })
    return { ok: true }
  })
}
