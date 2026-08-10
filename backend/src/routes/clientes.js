// Clientes: a nombre de quién se generó un gasto, y su cuenta corriente.
//
// Un cliente pertenece a un GRUPO, no es global como Proveedor: el scoping es el de
// detalle_tipos.js (`id_app: request.activeAppId` al leer y al crear, y guard por
// id_app en todo lo que toca un cliente puntual). Sin eso, un grupo vería y editaría
// los clientes de otro.
//
// Los movimientos de un cliente son `Pago` con `id_cliente`; no hay entidad propia.
// Ver lib/cuentaCorriente.js para la dirección y el saldo.

import { saldoCuentaCorriente, describirSaldo, whereMovimientosCliente } from '../lib/cuentaCorriente.js'

// Lo que la lista y el detalle necesitan de un cliente.
const CLIENTE_SELECT = {
  id: true, id_app: true, nombre: true, razon_social: true, cuit: true,
  telefono: true, mail: true, observaciones: true, activo: true,
  created_at: true, updated_at: true,
}

export default async function clientesRoutes(fastify) {
  // Módulo de permisos propio: Cliente tiene sus propias pantallas de alta y su
  // estado de cuenta, no es un flag sobre Pago. Mismo criterio que arqueo.
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('clientes', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('clientes', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('clientes', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('clientes', 'delete')]

  // Trae el cliente solo si es del grupo activo. Devolver 404 y no 403 cuando es de
  // otro grupo es deliberado: un 403 confirmaría que ese id existe en otro lado.
  async function clienteDelGrupo(id, request) {
    const cliente = await fastify.db.cliente.findUnique({ where: { id }, select: CLIENTE_SELECT })
    if (!cliente || cliente.id_app !== request.activeAppId) return null
    return cliente
  }

  // ── GET / ── lista los clientes del grupo ───────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { search, activo, page = 1, limit = 50 } = request.query
    const limitNum = Number(limit)
    const take = limitNum > 0 ? limitNum : undefined
    const skip = take ? (Math.max(1, Number(page)) - 1) * take : undefined

    const where = {
      id_app: request.activeAppId,
      ...(activo !== undefined ? { activo: activo === 'true' } : {}),
      ...(search ? {
        OR: [
          { nombre: { contains: search, mode: 'insensitive' } },
          { razon_social: { contains: search, mode: 'insensitive' } },
          { cuit: { contains: search } },
        ],
      } : {}),
    }

    const [data, total] = await Promise.all([
      fastify.db.cliente.findMany({ where, select: CLIENTE_SELECT, orderBy: { nombre: 'asc' }, skip, take }),
      fastify.db.cliente.count({ where }),
    ])
    return { data, total, page: Math.max(1, Number(page)), limit: take ?? total }
  })

  // ── GET /:id ────────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const cliente = await clienteDelGrupo(request.params.id, request)
    if (!cliente) return reply.code(404).send({ error: 'Cliente no encontrado' })
    return cliente
  })

  // ── POST / ──────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { nombre, razon_social, cuit, telefono, mail, observaciones } = request.body ?? {}
    // Con los dos vacíos el cliente no se puede ni nombrar en un listado.
    if (!nombre?.trim() && !razon_social?.trim()) {
      return reply.code(400).send({ error: 'Poné el nombre o la razón social' })
    }
    const cliente = await fastify.db.cliente.create({
      data: {
        // El grupo lo pone el servidor, nunca el body: si viniera del cliente se
        // podría crear en otro grupo.
        id_app: request.activeAppId,
        nombre: nombre?.trim() || null,
        razon_social: razon_social?.trim() || null,
        cuit: cuit?.trim() || null,
        telefono: telefono?.trim() || null,
        mail: mail?.trim() || null,
        observaciones: observaciones?.trim() || null,
      },
      select: CLIENTE_SELECT,
    })
    return reply.code(201).send(cliente)
  })

  // ── PUT /:id ────────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const actual = await clienteDelGrupo(request.params.id, request)
    if (!actual) return reply.code(404).send({ error: 'Cliente no encontrado' })

    const { nombre, razon_social, cuit, telefono, mail, observaciones, activo } = request.body ?? {}
    // No se puede dejar el cliente sin nombre ni razón social por una edición.
    const nuevoNombre = nombre !== undefined ? nombre?.trim() || null : actual.nombre
    const nuevaRazon  = razon_social !== undefined ? razon_social?.trim() || null : actual.razon_social
    if (!nuevoNombre && !nuevaRazon) {
      return reply.code(400).send({ error: 'Poné el nombre o la razón social' })
    }

    const cliente = await fastify.db.cliente.update({
      where: { id: request.params.id },
      data: {
        nombre: nuevoNombre,
        razon_social: nuevaRazon,
        ...(cuit !== undefined ? { cuit: cuit?.trim() || null } : {}),
        ...(telefono !== undefined ? { telefono: telefono?.trim() || null } : {}),
        ...(mail !== undefined ? { mail: mail?.trim() || null } : {}),
        ...(observaciones !== undefined ? { observaciones: observaciones?.trim() || null } : {}),
        ...(typeof activo === 'boolean' ? { activo } : {}),
        // id_app NO se toca: un cliente no cambia de grupo.
      },
      select: CLIENTE_SELECT,
    })
    return cliente
  })

  // ── DELETE /:id ── baja lógica ──────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const actual = await clienteDelGrupo(request.params.id, request)
    if (!actual) return reply.code(404).send({ error: 'Cliente no encontrado' })

    // Nunca hard delete: los pagos que lo referencian son historia y borrarlo
    // dejaría ops sin poder explicar a nombre de quién se hicieron.
    await fastify.db.cliente.update({ where: { id: request.params.id }, data: { activo: false } })
    return { ok: true }
  })

  // ── GET /:id/cuenta-corriente ───────────────────────────────────────────
  //
  // Endpoint propio y no `GET /pagos?id_cliente=X`: ese está acotado por local
  // (allowedLocalIds) y un cliente puede tener ops de cualquier local del grupo, así
  // que daría saldos incompletos. Acá se trae todo el grupo -- las pantallas de
  // Clientes son para los roles que ya alcanzan todos los locales.
  fastify.get('/:id/cuenta-corriente', { preHandler: viewHandler }, async (request, reply) => {
    const cliente = await clienteDelGrupo(request.params.id, request)
    if (!cliente) return reply.code(404).send({ error: 'Cliente no encontrado' })

    const pagos = await fastify.db.pago.findMany({
      where: whereMovimientosCliente(cliente.id),
      select: {
        id: true, nro_ord: true, fecha: true, fecha_pago: true, importe: true,
        ingresa_egreso: true, observaciones: true, pagado: true,
        proveedor: { select: { id: true, nombre: true, razon_social: true } },
        local: { select: { id: true, nombre: true } },
        metodo_pago: { select: { id: true, nombre: true } },
        rubcat: { select: { rubro: { select: { nombre: true } }, categoria: { select: { nombre: true } } } },
      },
      orderBy: [{ fecha: 'desc' }, { created_at: 'desc' }],
    })

    const totales = saldoCuentaCorriente(pagos)
    return {
      cliente,
      pagos,
      ...totales,
      // Se manda interpretado para que la pantalla no tenga que leer el signo.
      resumen: describirSaldo(totales.saldo),
    }
  })
}
