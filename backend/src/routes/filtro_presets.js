// "Mis filtros": combinaciones de filtros que un usuario guarda para reusar en
// las pantallas de listado. Son privados — cada usuario ve solo los propios,
// incluso siendo super_admin: son preferencias, no datos compartidos.
//
// Solo DC y super_admin (fastify.requireDc), que son los roles que usan los
// filtros complejos de pagos.

const MAX_PRESETS = 5
const MODULOS_VALIDOS = ['pagos', 'cajas']
const NOMBRE_MAX = 40

function moduloValido(modulo) {
  return MODULOS_VALIDOS.includes(modulo)
}

export default async function filtroPresetsRoutes(fastify) {
  const guard = [fastify.authenticate, fastify.appContext, fastify.requireDc]

  // ── GET / ─────────────────────────────────────────────────────────────
  // Presets del usuario autenticado para un módulo, más viejo primero para que
  // el orden en pantalla no cambie al editar uno.
  fastify.get('/', { preHandler: guard }, async (request, reply) => {
    const { modulo = 'pagos' } = request.query
    if (!moduloValido(modulo)) {
      return reply.code(400).send({ error: `modulo debe ser uno de: ${MODULOS_VALIDOS.join(', ')}` })
    }

    const presets = await fastify.db.filtroPreset.findMany({
      where:   { id_user: request.user.id, modulo },
      orderBy: { created_at: 'asc' },
      select:  { id: true, nombre: true, filtros: true, updated_at: true }
    })
    return { data: presets, max: MAX_PRESETS }
  })

  // ── POST / ────────────────────────────────────────────────────────────
  // body: { modulo?, nombre, filtros }
  fastify.post('/', { preHandler: guard }, async (request, reply) => {
    const { modulo = 'pagos', nombre, filtros } = request.body ?? {}

    if (!moduloValido(modulo)) {
      return reply.code(400).send({ error: `modulo debe ser uno de: ${MODULOS_VALIDOS.join(', ')}` })
    }
    const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : ''
    if (!nombreLimpio) {
      return reply.code(400).send({ error: 'El filtro necesita un nombre' })
    }
    if (nombreLimpio.length > NOMBRE_MAX) {
      return reply.code(400).send({ error: `El nombre no puede pasar de ${NOMBRE_MAX} caracteres` })
    }
    // Se acepta cualquier forma de objeto: el shape de los filtros es del
    // frontend y va a cambiar cuando se agreguen filtros nuevos. Lo único que
    // se valida es que sea un objeto, para no guardar un string o un array.
    if (filtros == null || typeof filtros !== 'object' || Array.isArray(filtros)) {
      return reply.code(400).send({ error: 'filtros debe ser un objeto' })
    }

    // El tope se cuenta y se inserta en la misma transacción: sin eso, dos
    // pedidos simultáneos podrían pasar el count con 4 y dejar 6 guardados.
    try {
      const creado = await fastify.db.$transaction(async (tx) => {
        const usados = await tx.filtroPreset.count({
          where: { id_user: request.user.id, modulo }
        })
        if (usados >= MAX_PRESETS) {
          const err = new Error('LIMITE')
          err.code = 'LIMITE'
          throw err
        }
        return tx.filtroPreset.create({
          data: { id_user: request.user.id, modulo, nombre: nombreLimpio, filtros },
          select: { id: true, nombre: true, filtros: true, updated_at: true }
        })
      })
      return reply.code(201).send(creado)
    } catch (err) {
      if (err.code === 'LIMITE') {
        return reply.code(400).send({
          error: `Llegaste al máximo de ${MAX_PRESETS} filtros guardados. Borrá uno para guardar otro.`
        })
      }
      // P2002: choque del @@unique([id_user, modulo, nombre]).
      if (err.code === 'P2002') {
        return reply.code(409).send({ error: 'Ya tenés un filtro guardado con ese nombre' })
      }
      throw err
    }
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  // Sobrescribe un preset existente (renombrar y/o pisar los filtros con los
  // que están aplicados ahora). No cambia de módulo ni de dueño.
  fastify.put('/:id', { preHandler: guard }, async (request, reply) => {
    const { nombre, filtros } = request.body ?? {}

    const existente = await fastify.db.filtroPreset.findUnique({
      where:  { id: request.params.id },
      select: { id_user: true }
    })
    if (!existente) return reply.code(404).send({ error: 'Filtro no encontrado' })
    if (existente.id_user !== request.user.id) {
      return reply.code(403).send({ error: 'Ese filtro no es tuyo' })
    }

    const data = {}
    if (nombre !== undefined) {
      const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : ''
      if (!nombreLimpio) return reply.code(400).send({ error: 'El filtro necesita un nombre' })
      if (nombreLimpio.length > NOMBRE_MAX) {
        return reply.code(400).send({ error: `El nombre no puede pasar de ${NOMBRE_MAX} caracteres` })
      }
      data.nombre = nombreLimpio
    }
    if (filtros !== undefined) {
      if (filtros == null || typeof filtros !== 'object' || Array.isArray(filtros)) {
        return reply.code(400).send({ error: 'filtros debe ser un objeto' })
      }
      data.filtros = filtros
    }
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'Nada para actualizar' })
    }

    try {
      return await fastify.db.filtroPreset.update({
        where:  { id: request.params.id },
        data,
        select: { id: true, nombre: true, filtros: true, updated_at: true }
      })
    } catch (err) {
      if (err.code === 'P2002') {
        return reply.code(409).send({ error: 'Ya tenés un filtro guardado con ese nombre' })
      }
      throw err
    }
  })

  // ── DELETE /:id ───────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: guard }, async (request, reply) => {
    const existente = await fastify.db.filtroPreset.findUnique({
      where:  { id: request.params.id },
      select: { id_user: true }
    })
    if (!existente) return reply.code(404).send({ error: 'Filtro no encontrado' })
    if (existente.id_user !== request.user.id) {
      return reply.code(403).send({ error: 'Ese filtro no es tuyo' })
    }

    await fastify.db.filtroPreset.delete({ where: { id: request.params.id } })
    return { ok: true }
  })
}
