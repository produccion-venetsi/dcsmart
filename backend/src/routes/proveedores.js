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
