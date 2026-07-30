// Como participa el detalle en la diferencia de caja (ver lib/cuadreCaja.js).
// Antes eran canal/medio_pago/calculo/otro, que describian el dato pero no su
// efecto en el calculo: no habia forma de marcar un tipo como "no suma", y
// tampoco de crear uno que restara (el codigo buscaba 'egreso', que no estaba
// en esta lista, asi que ningun gasto restaba nunca).
const CLASIFICACIONES = ['cobro', 'gasto', 'informativo']

// Valores anteriores: se siguen aceptando en el PUT para no romper integraciones
// ni el sync de TapTap, y se traducen al vigente antes de guardar.
const EQUIVALENCIAS = {
  ingreso: 'cobro',
  medio_pago: 'cobro',
  egreso: 'gasto',
  canal: 'informativo',
  otro: 'informativo',
  calculo: 'informativo'
}

const normalizarClasificacion = (valor) => {
  if (!valor) return null
  const v = String(valor).toLowerCase()
  if (CLASIFICACIONES.includes(v)) return v
  return EQUIVALENCIAS[v] ?? null
}

export default async function detalleTiposRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  // ── GET / — lista todos los tipos de la app activa ─────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    return fastify.db.detalleTipo.findMany({
      where: { id_app: request.activeAppId },
      include: { local: { select: { id: true, nombre: true } } },
      orderBy: [{ id_local: 'asc' }, { nombre: 'asc' }]
    })
  })

  // ── POST / — crear tipo nuevo ──────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { nombre, id_local, clasificacion } = request.body
    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })

    // Default cobro: es como se carga la mayoria de los detalles. Si un tipo no
    // tiene que entrar en la diferencia, se marca como informativo a mano.
    const clasif = normalizarClasificacion(clasificacion) ?? (clasificacion ? null : 'cobro')
    if (!clasif) {
      return reply.code(400).send({ error: `clasificacion inválida. Use: ${CLASIFICACIONES.join(', ')}` })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }

    try {
      const tipo = await fastify.db.detalleTipo.create({
        data: {
          nombre,
          clasificacion: clasif,
          id_app: request.activeAppId,
          id_local: id_local || null,
          activo: true
        },
        include: { local: { select: { id: true, nombre: true } } }
      })
      return reply.code(201).send(tipo)
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'Ya existe un tipo con ese nombre en esta app' })
      throw e
    }
  })

  // ── PUT /:id — editar (nombre, clasificacion y activo) ─────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.detalleTipo.findUnique({ where: { id: request.params.id } })
    if (!existing) return reply.code(404).send({ error: 'Tipo no encontrado' })
    if (existing.id_app !== request.activeAppId) return reply.code(403).send({ error: 'Sin acceso' })

    const { nombre, activo, clasificacion } = request.body
    let clasifNueva
    if (clasificacion !== undefined) {
      clasifNueva = normalizarClasificacion(clasificacion)
      if (!clasifNueva) {
        return reply.code(400).send({ error: `clasificacion inválida. Use: ${CLASIFICACIONES.join(', ')}` })
      }
    }

    const tipo = await fastify.db.detalleTipo.update({
      where: { id: request.params.id },
      data: {
        ...(nombre !== undefined ? { nombre } : {}),
        ...(activo !== undefined ? { activo } : {}),
        ...(clasifNueva !== undefined ? { clasificacion: clasifNueva } : {})
      },
      include: { local: { select: { id: true, nombre: true } } }
    })
    return tipo
  })

  // ── DELETE /:id — soft delete si tiene detalles, hard delete si no ─────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.detalleTipo.findUnique({
      where: { id: request.params.id },
      include: { _count: { select: { detalles: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Tipo no encontrado' })
    if (existing.id_app !== request.activeAppId) return reply.code(403).send({ error: 'Sin acceso' })

    if (existing._count.detalles > 0) {
      await fastify.db.detalleTipo.update({ where: { id: request.params.id }, data: { activo: false } })
    } else {
      await fastify.db.detalleTipo.delete({ where: { id: request.params.id } })
    }
    return reply.code(204).send()
  })
}
