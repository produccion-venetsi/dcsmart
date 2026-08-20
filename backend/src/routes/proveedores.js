// `sanearTiposAfines` estaba aca; se movio al lib cuando rubcat empezo a necesitar lo
// mismo (las dos tablas tienen `tipos_afines`).
import { partirPorAfinidad, sanearTiposAfines } from '../lib/afinidadProveedor.js'

export default async function proveedoresRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('proveedores', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { activo, search, page = 1, limit = 50, tipo_local } = request.query
    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    // El CUIT se guarda con o sin guiones según cómo lo haya cargado cada
    // usuario (el formulario no fuerza una máscara). Para que la búsqueda
    // encuentre un proveedor sin importar el formato guardado, además del
    // texto tal cual se buscan los dígitos solos y, si son 11 (CUIT
    // completo), el formato canónico XX-XXXXXXXX-X.
    const digits = search ? search.replace(/\D/g, '') : ''
    const cuitVariants = digits
      ? [digits, ...(digits.length === 11 ? [`${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`] : [])]
      : []

    const where = {
      ...(activo !== undefined ? { activo: activo === 'true' } : {}),
      ...(search ? {
        OR: [
          { nombre: { contains: search, mode: 'insensitive' } },
          { razon_social: { contains: search, mode: 'insensitive' } },
          { cuit: { contains: search } },
          ...cuitVariants.map(v => ({ cuit: { contains: v } }))
        ]
      } : {})
    }

    const incluir = { rubcat: { include: { rubro: true, categoria: true } } }

    // Orden por afinidad con el tipo de local: los que aplican a este rubro (y
    // los generales) primero. Se hace con dos consultas y no con un orderBy
    // porque hay que priorizar sobre el total, no sobre la pagina ya traida:
    // ordenar los 60 primeros alfabeticos no sube al proveedor afin que quedo
    // en la pagina 40. Solo se aplica en la primera pagina, que es la que usa
    // el buscador; el listado paginado del admin sigue alfabetico puro.
    const partido = take ? partirPorAfinidad(where, tipo_local) : null
    if (partido && Number(page) === 1) {
      const [afines, total] = await Promise.all([
        fastify.db.proveedor.findMany({
          where: partido.afin, include: incluir, orderBy: { nombre: 'asc' }, take
        }),
        fastify.db.proveedor.count({ where })
      ])
      const faltan = take - afines.length
      const resto = faltan > 0
        ? await fastify.db.proveedor.findMany({
            where: partido.resto, include: incluir, orderBy: { nombre: 'asc' }, take: faltan
          })
        : []
      return { data: [...afines, ...resto], total, page: 1, limit: take }
    }

    const [data, total] = await Promise.all([
      fastify.db.proveedor.findMany({
        where,
        include: incluir,
        orderBy: { nombre: 'asc' },
        skip,
        take
      }),
      fastify.db.proveedor.count({ where })
    ])

    return { data, total, page: Number(page), limit: take }
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const proveedor = await fastify.db.proveedor.findUnique({
      where: { id: request.params.id },
      include: { rubcat: { include: { rubro: true, categoria: true } } }
    })
    if (!proveedor) return reply.code(404).send({ error: 'Proveedor no encontrado' })
    return proveedor
  })

  // ── GET /:id/resumen ──────────────────────────────────────────────────
  // La actividad del proveedor: cuanto se le pago, desde cuando, en que
  // locales y las ultimas ordenes. Es lo que convierte la ficha en algo util
  // -- los campos sueltos (CBU, mail, tag) casi siempre estan vacios.
  //
  // Lleva appContext a proposito, a diferencia del resto de la ruta: el
  // catalogo de proveedores es global, pero SUS PAGOS no. Sin el recorte por
  // allowedLocalIds, un admin de un grupo veria los totales de otro.
  fastify.get('/:id/resumen', {
    preHandler: [fastify.authenticate, fastify.appContext, fastify.can('proveedores', 'view')]
  }, async (request, reply) => {
    const proveedor = await fastify.db.proveedor.findUnique({
      where: { id: request.params.id }, select: { id: true }
    })
    if (!proveedor) return reply.code(404).send({ error: 'Proveedor no encontrado' })

    const where = { id_proveedor: proveedor.id, id_local: { in: request.allowedLocalIds } }
    const [agg, aggIngresos, ultimos, porLocalRaw, porLocalIngresos, sinPagar, sinPagarIngresos] = await Promise.all([
      fastify.db.pago.aggregate({
        where, _count: { _all: true }, _sum: { importe: true },
        _min: { fecha: true }, _max: { fecha: true },
      }),
      // Los ingresos (notas de crédito) para restar de cada total: la ficha
      // mostraba el movimiento bruto y una NC inflaba lo "pagado" al proveedor.
      fastify.db.pago.aggregate({
        where: { ...where, ingresa_egreso: true }, _sum: { importe: true },
      }),
      fastify.db.pago.findMany({
        where, orderBy: { fecha: 'desc' }, take: 5,
        select: {
          id: true, nro_ord: true, fecha: true, importe: true, pagado: true,
          id_tipo: true, local: { select: { nombre: true } },
        },
      }),
      fastify.db.pago.groupBy({
        by: ['id_local'], where, _count: { _all: true }, _sum: { importe: true },
      }),
      fastify.db.pago.groupBy({
        by: ['id_local'], where: { ...where, ingresa_egreso: true }, _sum: { importe: true },
      }),
      fastify.db.pago.aggregate({
        where: { ...where, pagado: false }, _count: { _all: true }, _sum: { importe: true },
      }),
      fastify.db.pago.aggregate({
        where: { ...where, pagado: false, ingresa_egreso: true }, _sum: { importe: true },
      }),
    ])

    // Los nombres de local no vienen en un groupBy: se piden aparte.
    const idsLocal = porLocalRaw.map(g => g.id_local)
    const locales = idsLocal.length
      ? await fastify.db.local.findMany({
        where: { id: { in: idsLocal } },
        select: { id: true, nombre: true, app: { select: { nombre: true } } },
      })
      : []
    const nombreLocal = new Map(locales.map(l => [l.id, l]))

    // Cada total NETO: una nota de crédito (ingreso) resta en vez de inflar lo
    // "pagado" al proveedor. El bruto ya la sumó una vez, así que para que
    // quede restando hay que descontarla dos veces:
    //   neto = egresos − ingresos = (bruto − ingresos) − ingresos = bruto − 2·ingresos
    const neto = (bruto, ingresos) => Number(bruto ?? 0) - 2 * Number(ingresos ?? 0)
    const ingresosPorLocal = new Map(porLocalIngresos.map(g => [g.id_local, Number(g._sum.importe ?? 0)]))

    return {
      pagos: agg._count._all,
      total: neto(agg._sum.importe, aggIngresos._sum.importe),
      primer_pago: agg._min.fecha,
      ultimo_pago: agg._max.fecha,
      pendientes: sinPagar._count._all,
      total_pendiente: neto(sinPagar._sum.importe, sinPagarIngresos._sum.importe),
      por_local: porLocalRaw
        .map(g => ({
          id_local: g.id_local,
          local: nombreLocal.get(g.id_local)?.nombre ?? '—',
          grupo: nombreLocal.get(g.id_local)?.app?.nombre ?? null,
          pagos: g._count._all,
          total: neto(g._sum.importe, ingresosPorLocal.get(g.id_local)),
        }))
        .sort((a, b) => b.total - a.total),
      ultimos: ultimos.map(pg => ({
        id: pg.id, nro_ord: pg.nro_ord, fecha: pg.fecha,
        importe: Number(pg.importe ?? 0), pagado: pg.pagado,
        id_tipo: pg.id_tipo, local: pg.local?.nombre ?? null,
      })),
    }
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('proveedores', 'create')]
  }, async (request, reply) => {
    const {
      nombre, razon_social, cuit, banco, cbu, alias,
      direccion_url, detalle_direc, telefono, mail_contacto,
      mail_envio, tag, cuenta, observaciones, tipo_local, tipo,
      id_rubcat, plazo, activo, tipos_afines, es_general
    } = request.body

    if (!nombre && !razon_social) return reply.code(400).send({ error: 'nombre o razon_social es requerido' })

    const proveedor = await fastify.db.proveedor.create({
      data: {
        nombre, razon_social, cuit, banco, cbu, alias,
        direccion_url, detalle_direc, telefono, mail_contacto,
        mail_envio, tag, cuenta, observaciones, tipo_local, tipo,
        id_rubcat: id_rubcat || null,
        plazo: plazo != null ? parseInt(plazo) : null,
        activo: activo ?? true,
        tipos_afines: sanearTiposAfines(tipos_afines) ?? [],
        es_general: es_general ?? false
      }
    })
    return reply.code(201).send(proveedor)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('proveedores', 'edit')]
  }, async (request, reply) => {
    const {
      nombre, razon_social, cuit, banco, cbu, alias,
      direccion_url, detalle_direc, telefono, mail_contacto,
      mail_envio, tag, cuenta, observaciones, tipo_local, tipo,
      id_rubcat, plazo, activo, tipos_afines, es_general
    } = request.body

    try {
      const proveedor = await fastify.db.proveedor.update({
        where: { id: request.params.id },
        data: {
          nombre, razon_social, cuit, banco, cbu, alias,
          direccion_url, detalle_direc, telefono, mail_contacto,
          mail_envio, tag, cuenta, observaciones, tipo_local, tipo,
          // `|| null` igual que en el create: el formulario manda '' cuando no
          // hay rubro elegido, y '' contra la FK da P2003 (no existe un rubcat
          // con id vacio). Sin esto, editar un proveedor sin rubro --o quitarle
          // el que tenia-- no se podia guardar.
          id_rubcat: id_rubcat || null,
          plazo: plazo != null ? parseInt(plazo) : null,
          activo,
          tipos_afines: sanearTiposAfines(tipos_afines),
          es_general
        }
      })
      return proveedor
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Proveedor no encontrado' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('proveedores', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.proveedor.update({
        where: { id: request.params.id },
        data: { activo: false }
      })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Proveedor no encontrado' })
      throw err
    }
  })
}
