// Clientes: a nombre de quién se generó un gasto, y su cuenta corriente.
//
// Un cliente pertenece a un GRUPO, no es global como Proveedor: el scoping es el de
// detalle_tipos.js (`id_app: request.activeAppId` al leer y al crear, y guard por
// id_app en todo lo que toca un cliente puntual). Sin eso, un grupo vería y editaría
// los clientes de otro.
//
// Los movimientos de un cliente vienen de DOS lados y no hay entidad propia para
// ninguno de los dos:
//
//   Pagos  -> los `Pago` con `id_cliente` y estado CTA CTE CLI. Cuatro cuadrantes
//             según dirección y pagado/sin pagar. Ver lib/cuentaCorriente.js.
//   Cajas  -> los `CajaDetalle` con `id_cliente`: consumo que se anotó en su cuenta
//             en vez de cobrarse. Solo cargos. Ver lib/cuentaCorrienteCaja.js.
//
// Son dos mitades de la misma cuenta y se devuelven por separado, cada una con sus
// totales: sumarlas en un número único escondería de dónde viene la deuda, que es lo
// primero que se pregunta cuando un saldo no cierra.

import { totalesCuentaCorriente, totalesPorCliente, whereMovimientosCliente, cuadranteDe } from '../lib/cuentaCorriente.js'
import { totalesCajaCliente, totalesCajaPorCliente, whereDetallesCliente, cargaCuenta } from '../lib/cuentaCorrienteCaja.js'

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

    // Los cuatro totales de cada cliente de la página, para verlos sin entrar a la
    // ficha. Un groupBy y no traer los pagos: sumar en JS sería traerse la tabla.
    // Acotado a los ids de ESTA página -- sin el `in` la consulta crece con el
    // historial del grupo, no con lo que se está mostrando.
    const ids = data.map((c) => c.id)
    const [totales, totalesCaja] = data.length
      ? await Promise.all([
        fastify.db.pago.groupBy({
          by: ['id_cliente', 'ingresa_egreso', 'pagado'],
          where: { id_cliente: { in: ids }, estado_op: 'CTA_CTE_CLI' },
          _sum: { importe: true },
        }).then(totalesPorCliente),
        // La otra mitad: lo cargado desde cajas. Mismo criterio de acotar a los ids de
        // la página -- caja_detalles es la tabla más grande del sistema.
        fastify.db.cajaDetalle.groupBy({
          by: ['id_cliente', 'tipo'],
          where: { id_cliente: { in: ids } },
          _sum: { monto: true },
        }).then(totalesCajaPorCliente),
      ])
      : [{}, {}]

    return {
      // Un cliente sin movimientos no viene en el groupBy: se le pone la cuenta en
      // cero para que la pantalla no tenga que distinguir "sin datos" de "en cero".
      data: data.map((c) => ({
        ...c,
        cuenta: totales[c.id] ?? totalesCuentaCorriente([]),
        cuenta_caja: totalesCaja[c.id] ?? totalesCajaCliente([]),
      })),
      total,
      page: Math.max(1, Number(page)),
      limit: take ?? total,
    }
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

    const [pagos, detalles] = await Promise.all([
      fastify.db.pago.findMany({
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
      }),
      // La otra ventana: lo cargado a la cuenta desde cajas. Se trae la caja para poder
      // mostrar de qué día y de qué local salió, y para poder abrirla desde la fila.
      fastify.db.cajaDetalle.findMany({
        where: whereDetallesCliente(cliente.id),
        select: {
          id: true, tipo: true, nombre: true, monto: true, observaciones: true, created_at: true,
          detalle_tipo: { select: { id: true, nombre: true, clasificacion: true } },
          caja: {
            select: {
              id: true, fecha_inicio: true, fecha_cierre: true, nro_turno: true, tipo_turno: true,
              local: { select: { id: true, nombre: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
    ])

    const totales = totalesCuentaCorriente(pagos)
    const totalesCaja = totalesCajaCliente(detalles.map((d) => ({ ...d, id_cliente: cliente.id })))

    return {
      cliente,
      // Cada movimiento viaja con su cuadrante ya resuelto: la pantalla no vuelve a
      // decidir si algo es "a cobrar" o "gasto pendiente", lo dice el mismo lugar que
      // arma los totales. Si no, los tags y las filas pueden discrepar.
      pagos: pagos.map((p) => ({ ...p, cuadrante: cuadranteDe(p) })),
      ...totales,

      // ── La ventana de cajas ────────────────────────────────────────────────
      //
      // Va anidada y no desparramada en la raíz para no chocar con las claves de los
      // cuadrantes de pagos (`gastos`, `ingresos`), que significan otra cosa.
      //
      // `carga_cuenta` viaja resuelto por el mismo motivo que `cuadrante`: la pantalla no
      // vuelve a decidir si un detalle suma o no.
      caja: {
        detalles: detalles.map((d) => ({
          ...d,
          carga_cuenta: cargaCuenta({ ...d, id_cliente: cliente.id }),
        })),
        ...totalesCaja,
      },
    }
  })
}
