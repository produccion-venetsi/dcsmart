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

    const [data, no_leidas, pendientes] = await Promise.all([
      fastify.db.notificacion.findMany({
        where: { id_user: request.user.id },
        // No leidas primero, y dentro de cada grupo lo mas nuevo arriba. Se apoya
        // en notificaciones_id_user_leida_idx.
        orderBy: [{ leida: 'asc' }, { created_at: 'desc' }],
        take: limit
      }),
      fastify.db.notificacion.count({
        where: { id_user: request.user.id, leida: false }
      }),
      // Los que faltan HACER. Es distinto de no_leidas: leida se marca sola al abrir
      // el aviso, asi que no dice si la tarea se resolvio. Se apoya en el indice
      // (id_user, hecha).
      fastify.db.notificacion.count({
        where: { id_user: request.user.id, hecha: false }
      })
    ])

    // El nombre del local y su grupo, para que la pantalla pueda decir de dónde es
    // el aviso y llevar al usuario ahí. `Notificacion` guarda `id_local` sin
    // relación (no hay FK), así que se resuelven aparte y en una sola consulta.
    //
    // Se piden sin filtrar por acceso a propósito: si el aviso es de un local que el
    // usuario ya no maneja, el mensaje tiene que poder nombrarlo en vez de decir
    // "sin acceso" a secas.
    const idsLocal = [...new Set(data.map(n => n.id_local).filter(Boolean))]
    const locales = idsLocal.length
      ? await fastify.db.local.findMany({
        where: { id: { in: idsLocal } },
        select: { id: true, nombre: true, id_app: true, app: { select: { id: true, nombre: true } } },
      })
      : []
    const porId = new Map(locales.map(l => [l.id, l]))

    // `no_leidas` es el total real, no cuantas vinieron en `data`: el badge tiene
    // que decir 120 aunque la pagina traiga 20.
    return {
      data: data.map(n => {
        const l = n.id_local ? porId.get(n.id_local) : null
        return {
          ...n,
          local: l ? { id: l.id, nombre: l.nombre } : null,
          grupo: l?.app ? { id: l.app.id, nombre: l.app.nombre } : null,
        }
      }),
      no_leidas,
      pendientes,
    }
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

  // ── PATCH /:id/hecha ──────────────────────────────────────────────────
  //
  // Marcar hecho o deshacerlo. `hecha` es distinto de `leida`: leida se marca sola al
  // abrir el aviso, y un aviso de desauditoria es alguien pidiendo que revises algo --
  // eso se cierra cuando lo hiciste, no cuando lo miraste.
  //
  // Se puede desmarcar: alguien que apreto de mas tiene que poder volver, y si no
  // quedaria un aviso cerrado sin que nadie haya hecho nada.
  fastify.patch('/:id/hecha', { preHandler: guard }, async (request, reply) => {
    // `hecha` en el body, no dos endpoints: la pantalla manda el valor del checkbox y
    // el servidor no tiene que adivinar el estado anterior.
    const hecha = request.body?.hecha !== false

    // updateMany con id_user en el where, igual que /leida: si el aviso es de otro
    // usuario no actualiza nada y se responde 404, sin revelar que existe.
    const { count } = await fastify.db.notificacion.updateMany({
      where: { id: request.params.id, id_user: request.user.id },
      data: {
        hecha,
        // Cuando se marca queda la fecha; al desmarcar se limpia, si no queda un
        // "hecho el 5 de agosto" en un aviso que esta pendiente.
        hecha_at: hecha ? new Date() : null,
        // Marcar hecho implica haberlo visto: dejarlo sin leer haria que el otro
        // contador siguiera contandolo.
        ...(hecha ? { leida: true } : {}),
      }
    })
    if (count === 0) return reply.code(404).send({ error: 'Aviso no encontrado' })
    return { ok: true, hecha }
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
