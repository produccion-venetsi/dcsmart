// Log de actividad CRUD (crear/editar/eliminar) sobre Pagos. Solo accesible
// para super_admin -- ver ActivityLog en schema.prisma y logActivity() en
// routes/pagos.js (el único lugar que escribe acá por ahora).
import { parseNroOrd } from '../lib/nroOrd.js'
import { etiquetarSnapshot } from '../lib/snapshotLabels.js'

export default async function activityLogRoutes(fastify) {
  const guard = [fastify.authenticate, fastify.appContext, fastify.requireSuperAdmin]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: guard }, async (request, reply) => {
    const {
      desde, hasta, tabla, id_user, accion, id_local, nro_ord,
      page = 1, limit = 50
    } = request.query

    if (tabla && tabla !== 'pagos') {
      return reply.code(400).send({ error: 'tabla debe ser "pagos"' })
    }
    if (accion && !['creado', 'editado', 'eliminado'].includes(accion)) {
      return reply.code(400).send({ error: 'accion debe ser "creado", "editado" o "eliminado"' })
    }
    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    let nroOrdFilter = {}
    if (nro_ord != null && String(nro_ord).trim() !== '') {
      const n = parseNroOrd(String(nro_ord))
      if (n == null) {
        return reply.code(400).send({ error: 'El buscador de OP espera un número (ej: 101 u OP-101)' })
      }
      nroOrdFilter = { snapshot: { path: ['nro_ord'], equals: n } }
    }

    const where = {
      id_local: { in: id_local ? [id_local] : request.allowedLocalIds },
      ...nroOrdFilter,
      ...(tabla   ? { tabla }   : {}),
      ...(id_user ? { id_user } : {}),
      ...(accion  ? { accion }  : {}),
      // ActivityLog.fecha es un instante real -- el rango se interpreta en
      // hora de Argentina (offset fijo -03:00), no UTC.
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(`${desde}T00:00:00.000-03:00`) } : {}),
          ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999-03:00`) } : {})
        }
      } : {})
    }

    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    const [rows, total] = await Promise.all([
      fastify.db.activityLog.findMany({
        where,
        include: { user: { select: { id: true, nombre: true } } },
        orderBy: { fecha: 'desc' },
        skip,
        take
      }),
      fastify.db.activityLog.count({ where })
    ])

    const ids = { prov: new Set(), rubcat: new Set(), metodo: new Set(), local: new Set() }
    for (const r of rows) {
      const s = r.snapshot ?? {}
      if (s.id_proveedor) ids.prov.add(s.id_proveedor)
      if (s.id_rubcat)    ids.rubcat.add(s.id_rubcat)
      if (s.id_metodo)    ids.metodo.add(s.id_metodo)
      if (s.id_local)     ids.local.add(s.id_local)
    }

    const [proveedores, rubcats, metodos, locales] = await Promise.all([
      ids.prov.size   ? fastify.db.proveedor.findMany({ where: { id: { in: [...ids.prov] } },   select: { id: true, nombre: true } }) : [],
      ids.rubcat.size ? fastify.db.rubCat.findMany({    where: { id: { in: [...ids.rubcat] } }, include: { rubro: true, categoria: true } }) : [],
      ids.metodo.size ? fastify.db.metodoPago.findMany({ where: { id: { in: [...ids.metodo] } }, select: { id: true, nombre: true } }) : [],
      ids.local.size  ? fastify.db.local.findMany({      where: { id: { in: [...ids.local] } },  select: { id: true, nombre: true } }) : [],
    ])

    const catalogos = {
      proveedores: new Map(proveedores.map(p => [p.id, p.nombre])),
      rubcats:     new Map(rubcats.map(rc => [rc.id, `${rc.rubro?.nombre ?? '—'} / ${rc.categoria?.nombre ?? '—'}`])),
      metodos:     new Map(metodos.map(m => [m.id, m.nombre])),
      locales:     new Map(locales.map(l => [l.id, l.nombre])),
    }

    const data = rows.map(r => ({ ...r, snapshot_labels: etiquetarSnapshot(r.snapshot, catalogos) }))

    return { data, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /usuarios ────────────────────────────────────────────────────
  fastify.get('/usuarios', { preHandler: guard }, async (request, reply) => {
    const rows = await fastify.db.activityLog.findMany({
      where: { id_local: { in: request.allowedLocalIds }, id_user: { not: null } },
      distinct: ['id_user'],
      select: { user: { select: { id: true, nombre: true } } }
    })
    return rows.map(r => r.user).filter(Boolean)
  })
}
