import { Storage } from '@google-cloud/storage'
import multipart from '@fastify/multipart'
import { sanitizeFolderName, parseGsPath, contentTypePorExt } from '../lib/gcsPaths.js'
import { normalizarUrl, validarMail } from '../lib/localFicha.js'
import { validarPorcentaje } from '../lib/descuentoMovstock.js'
import { activarDefaultEnLocal } from '../lib/altaDisponibilidades.js'

// Datos fiscales del local: no se duplican en `locales`, se leen del proveedor
// vinculado. Cada local tiene su proveedor propio dentro de la tabla de
// proveedores, no es una entidad aparte.
const PROVEEDOR_SELECT = {
  id: true, nombre: true, razon_social: true, cuit: true,
  banco: true, cbu: true, alias: true,
}

const TIPOS_LOCAL = new Set([
  'GASTRONOMIA', 'INDUMENTARIA', 'ARQUITECTURA', 'INMOBILIARIO', 'MULTIMEDIA'
])

// El logo se limita mas que los adjuntos de pagos: es una imagen de marca, no
// una factura escaneada. `svg` queda afuera a proposito -- se sirve con su
// propio Content-Type y puede traer script adentro.
const EXT_LOGO = new Set(['png', 'jpg', 'jpeg', 'webp'])
const MAX_LOGO = 2 * 1024 * 1024

// Devuelve { error } o { data } listo para Prisma. `logo_url` se ignora a
// proposito: solo las rutas de logo lo escriben, asi un cliente no puede
// apuntar el logo del local a un gs:// arbitrario.
function parseFicha(body) {
  const data = {}

  for (const campo of ['maps_url', 'menu_url']) {
    if (body[campo] === undefined) continue
    const r = normalizarUrl(body[campo])
    if (!r.ok) return { error: `${campo}: ${r.error}` }
    data[campo] = r.value
  }

  if (body.mail_facturas !== undefined) {
    const r = validarMail(body.mail_facturas)
    if (!r.ok) return { error: `mail_facturas: ${r.error}` }
    data.mail_facturas = r.value
  }

  if (body.tipo_local !== undefined) {
    const tipo = body.tipo_local || null
    if (tipo && !TIPOS_LOCAL.has(tipo)) return { error: `tipo_local invalido: ${tipo}` }
    data.tipo_local = tipo
  }

  if (body.descuento_movstock !== undefined) {
    const r = validarPorcentaje(body.descuento_movstock)
    if (!r.ok) return { error: `descuento_movstock: ${r.error}` }
    data.descuento_movstock = r.value
  }

  if (body.id_proveedor !== undefined) data.id_proveedor = body.id_proveedor || null

  return { data }
}

export default async function localesRoutes(fastify) {
  // multipart usa fastify-plugin, asi que se aplica al scope de quien lo
  // registra. Va aca dentro y no en server.js: cada plugin de rutas registra
  // el suyo (pagos.js y caja.js hacen lo mismo) y son scopes hermanos que no
  // colisionan. Ponerlo en la raiz rompe el arranque con
  // FST_ERR_CTP_ALREADY_PRESENT en cuanto un hijo lo vuelve a registrar.
  await fastify.register(multipart, { limits: { fileSize: MAX_LOGO } })

  const viewHandler = [fastify.authenticate, fastify.can('locales', 'view')]
  const editHandler = [fastify.authenticate, fastify.can('locales', 'edit')]
  const gcs = new Storage()

  async function esSuperAdmin(userId) {
    const role = await fastify.db.userAppRole.findFirst({
      where: { id_user: userId, role: { nombre: 'super_admin' } }
    })
    return !!role
  }

  // Apps solo_super_admin (grupo de testing, etc.) son invisibles para
  // cualquier rol que no sea super_admin -- ni siquiera dcsmart. Se responde
  // 404 y no 403 para no delatar que el local existe.
  async function ocultoParaElUsuario(local, userId) {
    if (!local?.app?.solo_super_admin) return false
    return !(await esSuperAdmin(userId))
  }

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_app, page = 1, limit = 100 } = request.query
    const skip = (Number(page) - 1) * Number(limit)
    const take = Number(limit)
    const superAdmin = await esSuperAdmin(request.user.id)
    const where = {
      ...(id_app ? { id_app } : {}),
      ...(superAdmin ? {} : { app: { solo_super_admin: false } })
    }

    const [data, total] = await Promise.all([
      fastify.db.local.findMany({
        where,
        include: {
          app:       { select: { id: true, nombre: true, slug: true } },
          proveedor: { select: PROVEEDOR_SELECT },
        },
        orderBy: { nombre: 'asc' },
        skip,
        take
      }),
      fastify.db.local.count({ where })
    ])

    return { data, total, page: Number(page), limit: take }
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const local = await fastify.db.local.findUnique({
      where: { id: request.params.id },
      include: { app: true, proveedor: { select: PROVEEDOR_SELECT } }
    })
    if (!local) return reply.code(404).send({ error: 'Local no encontrado' })
    if (await ocultoParaElUsuario(local, request.user.id)) {
      return reply.code(404).send({ error: 'Local no encontrado' })
    }
    return local
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'create')]
  }, async (request, reply) => {
    const { nombre, id_app, direccion, telefono, activo } = request.body
    if (!nombre || !id_app) return reply.code(400).send({ error: 'nombre e id_app son requeridos' })

    const ficha = parseFicha(request.body)
    if (ficha.error) return reply.code(400).send({ error: ficha.error })

    try {
      const local = await fastify.db.local.create({
        data: { nombre, id_app, direccion, telefono, activo: activo ?? true, ...ficha.data },
        include: { proveedor: { select: PROVEEDOR_SELECT } }
      })
      // El local arranca con las disponibilidades de siempre (MP, dólares,
      // transferencia). Si esto falla el local igual queda creado: la lista se
      // corrige con dos clicks en la ficha, perder el alta por esto sería peor.
      try {
        await activarDefaultEnLocal(fastify.db, { id_local: local.id, id_app })
      } catch (err) {
        fastify.log.error({ err, id_local: local.id }, 'no se pudieron sembrar las disponibilidades del local')
      }
      return reply.code(201).send(local)
    } catch (err) {
      if (err.code === 'P2003') return reply.code(400).send({ error: 'App o proveedor no existe' })
      throw err
    }
  })

  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const { nombre, direccion, telefono, activo } = request.body

    const ficha = parseFicha(request.body)
    if (ficha.error) return reply.code(400).send({ error: ficha.error })

    try {
      const local = await fastify.db.local.update({
        where: { id: request.params.id },
        data: { nombre, direccion, telefono, activo, ...ficha.data },
        include: { proveedor: { select: PROVEEDOR_SELECT } }
      })
      return local
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Local no encontrado' })
      if (err.code === 'P2003') return reply.code(400).send({ error: 'App o proveedor no existe' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'delete')]
  }, async (request, reply) => {
    const id = request.params.id
    const [cajas, pagos] = await Promise.all([
      fastify.db.caja.count({ where: { id_local: id } }),
      fastify.db.pago.count({ where: { id_local: id } })
    ])
    if (cajas > 0 || pagos > 0) {
      return reply.code(409).send({ error: `No se puede eliminar: el local tiene ${cajas} caja(s) y ${pagos} pago(s)` })
    }
    try {
      await fastify.db.local.delete({ where: { id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Local no encontrado' })
      throw err
    }
  })

  // ── Logo ───────────────────────────────────────────────────────────────────
  // El bucket es privado, asi que el logo se sube por multipart y se lee por
  // un proxy autenticado, igual que los adjuntos de pagos.

  fastify.post('/:id/logo', { preHandler: editHandler }, async (request, reply) => {
    const local = await fastify.db.local.findUnique({
      where: { id: request.params.id },
      select: { id: true, nombre: true, app: { select: { solo_super_admin: true } } }
    })
    if (!local) return reply.code(404).send({ error: 'Local no encontrado' })
    if (await ocultoParaElUsuario(local, request.user.id)) {
      return reply.code(404).send({ error: 'Local no encontrado' })
    }

    const bucket = process.env.GCS_BUCKET_NAME
    if (!bucket) return reply.code(500).send({ error: 'GCS_BUCKET_NAME no configurado' })

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'No se recibio archivo' })

    const ext = String(data.filename || '').split('.').pop().toLowerCase()
    if (!EXT_LOGO.has(ext)) {
      return reply.code(400).send({ error: `Tipo de archivo no permitido (.${ext}). Usa PNG, JPG o WEBP` })
    }

    const folder   = sanitizeFolderName(local.nombre)
    const filename = `locales/${folder}/logo-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const file     = gcs.bucket(bucket).file(filename)

    try {
      await new Promise((resolve, reject) => {
        const stream = file.createWriteStream({ metadata: { contentType: data.mimetype } })
        data.file.pipe(stream).on('error', reject).on('finish', resolve)
      })
    } catch (err) {
      // Pasado el limite, multipart corta el stream y el pipe falla. Es un
      // error del usuario, no del servidor.
      if (data.file.truncated || err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(400).send({ error: 'El logo supera los 2 MB' })
      }
      fastify.log.error({ err, filename }, 'GCS logo upload error')
      return reply.code(502).send({ error: 'No se pudo subir el logo' })
    }
    if (data.file.truncated) {
      return reply.code(400).send({ error: 'El logo supera los 2 MB' })
    }

    const url = `gs://${bucket}/${filename}`
    await fastify.db.local.update({ where: { id: local.id }, data: { logo_url: url } })
    return { ok: true, url }
  })

  fastify.get('/:id/logo', { preHandler: viewHandler }, async (request, reply) => {
    const local = await fastify.db.local.findUnique({
      where: { id: request.params.id },
      select: { logo_url: true, app: { select: { solo_super_admin: true } } }
    })
    if (!local) return reply.code(404).send({ error: 'Local no encontrado' })
    if (await ocultoParaElUsuario(local, request.user.id)) {
      return reply.code(404).send({ error: 'Local no encontrado' })
    }

    const parsed = parseGsPath(local.logo_url)
    if (!parsed) return reply.code(404).send({ error: 'Sin logo' })

    reply.header('Content-Type', contentTypePorExt(parsed.filePath.split('.').pop()))
    reply.header('Cache-Control', 'private, max-age=300')

    const stream = gcs.bucket(parsed.bucket).file(parsed.filePath).createReadStream({
      userProject: process.env.GCS_PROJECT_ID,
    })
    stream.on('error', (err) => {
      fastify.log.error({ err, logo: local.logo_url }, 'GCS logo stream error')
      if (!reply.sent) reply.code(502).send({ error: 'No se pudo obtener el logo' })
    })
    return reply.send(stream)
  })

  // Limpia la referencia, no borra el objeto en GCS: mismo criterio que los
  // adjuntos de pagos, nada irreversible desde la UI.
  fastify.delete('/:id/logo', { preHandler: editHandler }, async (request, reply) => {
    try {
      await fastify.db.local.update({
        where: { id: request.params.id },
        data:  { logo_url: null }
      })
      return { ok: true }
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Local no encontrado' })
      throw err
    }
  })
}
