import { CLASIFICACIONES, normalizarClasificacion } from '../lib/clasificaciones.js'
import { validarClienteDetalle } from '../lib/cuentaCorrienteCaja.js'
import { parseMonto, parseEntero } from '../lib/montos.js'

export default async function cajaDetallesRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  // El CATÁLOGO de nombres es de apoyo a la carga: alcanza con poder crear.
  // data_entry no tiene `view` de caja y abría el alta con el combo vacío y un
  // error en pantalla, aunque la caja después se creara igual.
  const catalogoHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', ['view', 'create'])]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  // Un Cliente pertenece a un grupo (a diferencia de Proveedor, que es catálogo global):
  // sin este chequeo se podría cargar un detalle a la cuenta de un cliente de otro grupo,
  // y el monto aparecería en una ficha ajena. Solo activos: un cliente dado de baja no
  // tiene que poder recibir cargos nuevos, igual que un proveedor de baja no recibe ops.
  const clienteDelGrupo = (id, request) => fastify.db.cliente.findFirst({
    where: { id, id_app: request.activeAppId, activo: true },
    select: { id: true }
  })

  // ── GET /tipos ─────────────────────────────────────────────────────────
  // Acepta id_local opcional y devuelve tipos app-wide + tipos del local específico
  fastify.get('/tipos', { preHandler: catalogoHandler }, async (request) => {
    const { id_local } = request.query
    return fastify.db.detalleTipo.findMany({
      where: {
        id_app: request.activeAppId,
        activo: true,
        OR: [
          { id_local: null },
          ...(id_local ? [{ id_local }] : [])
        ]
      },
      orderBy: { nombre: 'asc' }
    })
  })

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_caja } = request.query

    const where = {
      ...(id_caja ? { id_caja } : {}),
      caja: { id_local: { in: request.allowedLocalIds } }
    }

    return fastify.db.cajaDetalle.findMany({
      where,
      include: {
        detalle_tipo: { select: { id: true, nombre: true, clasificacion: true } },
        cliente:      { select: { id: true, nombre: true, razon_social: true } }
      },
      orderBy: { created_at: 'asc' }
    })
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { id_caja, id_tipo, nombre, monto, cantidad, observaciones, clasificacion, id_cliente } = request.body

    if (!id_caja) {
      return reply.code(400).send({ error: 'id_caja y monto son requeridos' })
    }
    // Positivo por regla del proyecto: la dirección la da la clasificación.
    const rMonto = parseMonto(monto, { requerido: true, positivo: true })
    if (!rMonto.ok) return reply.code(400).send({ error: rMonto.error })
    const rCant = parseEntero(cantidad, { campo: 'cantidad' })
    if (!rCant.ok) return reply.code(400).send({ error: rCant.error })

    const caja = await fastify.db.caja.findUnique({
      where: { id: id_caja },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    // `tipo` guarda la clasificación de ESTE detalle y es la que manda en el
    // cálculo. El usuario la elige al cargar el detalle; la del tipo del
    // catálogo solo se usa como valor propuesto cuando no mandó ninguna.
    let tipo = null
    let nombreFinal = nombre || null
    if (id_tipo) {
      // findFirst con id_app: un tipo de OTRO grupo no es válido acá. Sin este
      // recorte, un id ajeno (cache entre grupos, bug del cliente) quedaba
      // guardado y el combo de edición después aparecía "vacío".
      const dt = await fastify.db.detalleTipo.findFirst({
        where: { id: id_tipo, id_app: request.activeAppId },
        select: { clasificacion: true, nombre: true }
      })
      if (!dt) return reply.code(400).send({ error: 'Tipo de detalle inexistente' })
      tipo = dt.clasificacion
      nombreFinal = dt.nombre
    }
    if (clasificacion !== undefined && clasificacion !== null && clasificacion !== '') {
      const elegida = normalizarClasificacion(clasificacion)
      if (!elegida) {
        return reply.code(400).send({ error: `clasificacion inválida. Use: ${CLASIFICACIONES.join(', ')}` })
      }
      tipo = elegida
    }

    // Cuenta corriente: el detalle se le carga a la cuenta de un cliente. La regla de qué
    // puede llevar cliente vive en lib/cuentaCorrienteCaja.js, junto con la que arma los
    // totales -- si estuvieran en dos lugares se podrían guardar detalles que después
    // ninguna cuenta cuenta.
    const errorCliente = validarClienteDetalle(id_cliente, tipo)
    if (errorCliente) return reply.code(400).send({ error: errorCliente })
    if (id_cliente && !(await clienteDelGrupo(id_cliente, request))) {
      return reply.code(400).send({ error: 'Cliente inexistente o de otro grupo' })
    }

    const detalle = await fastify.db.cajaDetalle.create({
      data: {
        id_caja,
        tipo,
        id_tipo:       id_tipo       || null,
        id_cliente:    id_cliente    || null,
        nombre:        nombreFinal,
        monto:         rMonto.value,
        cantidad:      rCant.value,
        observaciones: observaciones || null
      },
      include: {
        detalle_tipo: { select: { id: true, nombre: true, clasificacion: true } },
        cliente:      { select: { id: true, nombre: true, razon_social: true } }
      }
    })
    return reply.code(201).send(detalle)
  })

  // ── PUT /:id ───────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.cajaDetalle.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Detalle no encontrado' })

    if (!request.allowedLocalIds.includes(existing.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { id_tipo, nombre, monto, cantidad, observaciones, clasificacion, id_cliente } = request.body
    const rMonto = parseMonto(monto, { requerido: true, positivo: true })
    if (!rMonto.ok) return reply.code(400).send({ error: rMonto.error })
    let cantVal
    if (cantidad !== undefined) {
      const r = parseEntero(cantidad, { campo: 'cantidad' })
      if (!r.ok) return reply.code(400).send({ error: r.error })
      cantVal = r.value
    }

    // Cambiar el tipo re-propone su clasificación, igual que en la creación
    // (ver POST /). Si además vino una clasificación explícita, esa gana: es la
    // que el usuario eligió para este detalle.
    let tipo = existing.tipo
    let nombreFinal = nombre !== undefined ? (nombre || null) : existing.nombre
    if (id_tipo !== undefined) {
      if (id_tipo) {
        // Mismo recorte por grupo que en el POST.
        const dt = await fastify.db.detalleTipo.findFirst({
          where: { id: id_tipo, id_app: request.activeAppId },
          select: { clasificacion: true, nombre: true }
        })
        if (!dt) return reply.code(400).send({ error: 'Tipo de detalle inexistente' })
        tipo = dt.clasificacion
        nombreFinal = dt.nombre
      } else {
        tipo = null
      }
    }
    if (clasificacion !== undefined && clasificacion !== null && clasificacion !== '') {
      const elegida = normalizarClasificacion(clasificacion)
      if (!elegida) {
        return reply.code(400).send({ error: `clasificacion inválida. Use: ${CLASIFICACIONES.join(', ')}` })
      }
      tipo = elegida
    }

    // El cliente resultante se valida contra la clasificación resultante, no contra la que
    // vino en el body: cambiar un detalle de cobro a informativo sin tocar el cliente
    // dejaría un cargo que no figura en ninguna cuenta.
    const clienteResultante = id_cliente !== undefined ? (id_cliente || null) : existing.id_cliente
    const errorCliente = validarClienteDetalle(clienteResultante, tipo)
    if (errorCliente) return reply.code(400).send({ error: errorCliente })
    // Solo se verifica el grupo si el cliente CAMBIÓ: uno que ya estaba guardado y
    // después se dio de baja no tiene que bloquear la edición del monto.
    if (clienteResultante && clienteResultante !== existing.id_cliente
        && !(await clienteDelGrupo(clienteResultante, request))) {
      return reply.code(400).send({ error: 'Cliente inexistente o de otro grupo' })
    }

    const detalle = await fastify.db.cajaDetalle.update({
      where: { id: request.params.id },
      data: {
        id_tipo:       id_tipo       !== undefined ? (id_tipo || null) : undefined,
        id_cliente:    clienteResultante,
        tipo,
        nombre:        nombreFinal,
        monto:         rMonto.value,
        cantidad:      cantVal,
        observaciones: observaciones !== undefined ? (observaciones || null) : undefined
      },
      include: {
        detalle_tipo: { select: { id: true, nombre: true, clasificacion: true } },
        cliente:      { select: { id: true, nombre: true, razon_social: true } }
      }
    })
    return detalle
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.cajaDetalle.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Detalle no encontrado' })

    if (!request.allowedLocalIds.includes(existing.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    await fastify.db.cajaDetalle.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
