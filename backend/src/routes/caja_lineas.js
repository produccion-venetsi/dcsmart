// Las líneas de una caja: lo que hoy son movimientos Y detalles, en una sola
// lista con categoría. Ver el modelo CajaLinea en schema.prisma.
//
// Permisos: se usan los del módulo `caja`, no los de `caja_movimientos`. Una
// línea puede ser un cobro o un retiro según su categoría, así que partir el
// permiso por tipo de fila obligaría a decidir a qué módulo pertenece cada
// categoría -- que es justamente la distinción artificial que esto elimina.

import { parseMonto, parseEntero } from '../lib/montos.js'

const CATEGORIAS = [
  'COBRO', 'FIADO', 'GASTO', 'INICIAL', 'RETIRO', 'VACIADO', 'INGRESO', 'DIFERENCIA', 'INFORMATIVO',
]

export default async function cajaLineasRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  const incluir = {
    metodo_pago:  { select: { id: true, nombre: true } },
    detalle_tipo: { select: { id: true, nombre: true, clasificacion: true } },
    cliente:      { select: { id: true, nombre: true, razon_social: true } },
  }

  // La caja tiene que existir y ser de un local que el usuario ve.
  async function cajaAccesible(request, reply, id_caja) {
    const caja = await fastify.db.caja.findUnique({
      where: { id: id_caja },
      select: { id: true, id_local: true },
    })
    if (!caja) { reply.code(404).send({ error: 'Caja no encontrada' }); return null }
    if (!request.allowedLocalIds.includes(caja.id_local)) {
      reply.code(403).send({ error: 'Sin acceso a este local' }); return null
    }
    return caja
  }

  function validarCategoria(categoria, reply) {
    if (!categoria) { reply.code(400).send({ error: 'La categoría es obligatoria' }); return false }
    if (!CATEGORIAS.includes(categoria)) {
      reply.code(400).send({ error: `Categoría inválida. Use: ${CATEGORIAS.join(', ')}` }); return false
    }
    return true
  }

  // ── GET /?id_caja= ─────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_caja } = request.query
    if (!id_caja) return reply.code(400).send({ error: 'id_caja es requerido' })
    if (!(await cajaAccesible(request, reply, id_caja))) return

    return fastify.db.cajaLinea.findMany({
      where: { id_caja },
      include: incluir,
      orderBy: { created_at: 'asc' },
    })
  })

  // ── POST / ─────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { id_caja, categoria, monto, id_metodo, id_tipo, nombre, id_cliente, cantidad, observaciones } = request.body
    if (!id_caja) return reply.code(400).send({ error: 'id_caja es requerido' })
    if (!validarCategoria(categoria, reply)) return
    if (!(await cajaAccesible(request, reply, id_caja))) return

    // Positivo siempre: la dirección la da la categoría, no el signo.
    const rMonto = parseMonto(monto, { requerido: true, positivo: true })
    if (!rMonto.ok) return reply.code(400).send({ error: rMonto.error })
    const rCant = parseEntero(cantidad, { campo: 'cantidad' })
    if (!rCant.ok) return reply.code(400).send({ error: rCant.error })

    const linea = await fastify.db.cajaLinea.create({
      data: {
        id_caja,
        categoria,
        monto: rMonto.value,
        id_metodo: id_metodo || null,
        id_tipo: id_tipo || null,
        nombre: nombre || null,
        id_cliente: id_cliente || null,
        cantidad: rCant.value,
        observaciones: observaciones || null,
      },
      include: incluir,
    })
    return reply.code(201).send(linea)
  })

  // ── PUT /:id ───────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existente = await fastify.db.cajaLinea.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } },
    })
    if (!existente) return reply.code(404).send({ error: 'Línea no encontrada' })
    if (!request.allowedLocalIds.includes(existente.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { categoria, monto, id_metodo, id_tipo, nombre, id_cliente, cantidad, observaciones } = request.body
    if (categoria !== undefined && !validarCategoria(categoria, reply)) return

    let montoVal
    if (monto !== undefined) {
      const r = parseMonto(monto, { requerido: true, positivo: true })
      if (!r.ok) return reply.code(400).send({ error: r.error })
      montoVal = r.value
    }
    let cantVal
    if (cantidad !== undefined) {
      const r = parseEntero(cantidad, { campo: 'cantidad' })
      if (!r.ok) return reply.code(400).send({ error: r.error })
      cantVal = r.value
    }

    const linea = await fastify.db.cajaLinea.update({
      where: { id: existente.id },
      data: {
        categoria,
        monto: montoVal,
        // '' significa "sacarlo": va como null, no como FK inválida.
        id_metodo:  id_metodo  !== undefined ? (id_metodo  || null) : undefined,
        id_tipo:    id_tipo    !== undefined ? (id_tipo    || null) : undefined,
        id_cliente: id_cliente !== undefined ? (id_cliente || null) : undefined,
        nombre:        nombre        !== undefined ? (nombre || null) : undefined,
        observaciones: observaciones !== undefined ? (observaciones || null) : undefined,
        cantidad: cantVal,
      },
      include: incluir,
    })
    return linea
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existente = await fastify.db.cajaLinea.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } },
    })
    if (!existente) return reply.code(404).send({ error: 'Línea no encontrada' })
    if (!request.allowedLocalIds.includes(existente.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }
    await fastify.db.cajaLinea.delete({ where: { id: existente.id } })
    return reply.code(204).send()
  })
}
