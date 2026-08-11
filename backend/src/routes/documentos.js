// Documentos: archivos y links ordenados por tipo, por grupo y local.
//
// Las reglas (íconos válidos, vencimientos, quién ve qué) viven en lib/documentos.js y
// se testean sin base. Acá están las consultas y los permisos.
//
// Dos cosas que no son obvias:
//
//   1. El listado NO filtra por `allowedLocalIds` a secas: un documento puede ser del
//      grupo entero (id_local null) y esos los ve cualquiera del grupo. Ver
//      `whereAlcance`.
//   2. Hay UNA ruta sin autenticación —GET /publico/:token— y es a propósito: es el
//      link que se le manda a un inspector. Está al final, aislada y comentada.

import { Storage } from '@google-cloud/storage'
import multipart from '@fastify/multipart'
import { parseGsPath, sanitizeFolderName, contentTypePorExt } from '../lib/gcsPaths.js'
import {
  ICONOS, esIconoValido, normalizarIcono,
  extensionPermitida, tipoDeArchivo, nuevoToken,
  filtroVisibilidad, hayQueAvisar, textoAviso, fechaISO, fechaParaGuardar,
  estadoVencimiento, DIAS_AVISO,
} from '../lib/documentos.js'

// Lo que se devuelve de un documento. El token NO va acá: se pide aparte con
// GET /:id/link, así no viaja en cada listado ni queda en el caché del navegador.
const SELECT_DOC = {
  id: true, nombre: true, detalle: true, url: true,
  visible_todos: true, vence: true, created_at: true, updated_at: true,
  id_app: true, id_local: true, id_proveedor: true, id_tipo: true,
  // Para saber si hay link generado sin exponer el token.
  token_creado_at: true,
  tipo: { select: { id: true, nombre: true, icono: true } },
  app: { select: { id: true, nombre: true } },
  local: { select: { id: true, nombre: true } },
  proveedor: { select: { id: true, nombre: true, razon_social: true } },
  created_by: { select: { id: true, nombre: true } },
  archivos: {
    select: { id: true, tipo: true, nombre_original: true, orden: true, created_at: true },
    orderBy: { orden: 'asc' },
  },
}

// Cómo sale un documento por la API, en TODAS las respuestas.
//
// Existe porque el listado devolvía `vence: '2026-09-01'` y el PUT el timestamp entero
// (`2026-09-01T00:00:00.000Z`) para el mismo campo: el frontend tenía que aguantar dos
// formatos del mismo dato y, en GMT-3, formatear el segundo muestra el día anterior.
const salidaDoc = (doc) => doc && ({
  ...doc,
  icono: normalizarIcono(doc.tipo?.icono),
  vence: fechaISO(doc.vence),
  estado_vencimiento: estadoVencimiento(doc.vence),
  tiene_link: Boolean(doc.token_creado_at),
})

// Qué documentos alcanza este usuario dentro del grupo activo.
//
// Los de local van por allowedLocalIds; los del grupo (sin local) los ve cualquiera que
// entre al grupo, porque son de la sociedad y no de una sucursal. Sin esta segunda
// mitad, un contrato marco no lo vería nadie salvo quien lo cargó.
const whereAlcance = (request) => ({
  id_app: request.activeAppId,
  OR: [
    { id_local: null },
    { id_local: { in: request.allowedLocalIds } },
  ],
})

export default async function documentosRoutes(fastify) {
  // Mismo límite que los adjuntos de pagos. Un contrato escaneado entra de sobra; si
  // alguien manda 20 MB, casi seguro se equivocó de archivo.
  await fastify.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
  const gcs = new Storage()

  // Un POST sin cuerpo es legítimo acá: generar el link o revisar vencimientos no
  // necesita datos. El parser de JSON de Fastify contesta 400 (FST_ERR_CTP_EMPTY_JSON_BODY)
  // si llega Content-Type json con el cuerpo vacío, que es exactamente lo que manda un
  // cliente HTTP cualquiera al hacer POST sin datos. Se tolera y se trata como {}.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || !String(body).trim()) return done(null, {})
    try {
      done(null, JSON.parse(body))
    } catch (err) {
      err.statusCode = 400
      done(err)
    }
  })

  const ctx        = [fastify.authenticate, fastify.appContext]
  const viewHandler   = [...ctx, fastify.can('documentos', 'view')]
  const createHandler = [...ctx, fastify.can('documentos', 'create')]
  const editHandler   = [...ctx, fastify.can('documentos', 'edit')]
  const deleteHandler = [...ctx, fastify.can('documentos', 'delete')]

  // ── Catálogo de íconos ─────────────────────────────────────────────────────
  // El frontend dibuja los íconos, pero la lista de claves sale de acá para que no se
  // desincronicen. Sin permiso de módulo: es una constante, no datos.
  fastify.get('/iconos', { preHandler: [fastify.authenticate] }, async () => ICONOS)

  // ── Tipos ──────────────────────────────────────────────────────────────────
  // Son globales (un contrato es un contrato en todos los grupos) y se administran
  // desde la app. Ver el comentario del modelo en schema.prisma.

  fastify.get('/tipos', { preHandler: viewHandler }, async (request) => {
    const tipos = await fastify.db.tipoDocumento.findMany({
      where: request.query.todos === '1' ? {} : { activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      select: {
        id: true, nombre: true, icono: true, orden: true, activo: true,
        // Cuántos documentos tiene cada tipo: es lo que permite saber si se puede
        // desactivar sin dejar documentos huérfanos de significado.
        _count: { select: { documentos: true } },
      },
    })
    return tipos.map(t => ({ ...t, icono: normalizarIcono(t.icono) }))
  })

  // Crear y editar tipos toca a todos los grupos, así que pide permiso de edición del
  // módulo, no de creación de un documento suelto.
  fastify.post('/tipos', { preHandler: editHandler }, async (request, reply) => {
    const nombre = String(request.body?.nombre ?? '').trim()
    if (!nombre) return reply.code(400).send({ error: 'El nombre es requerido' })
    const icono = request.body?.icono ?? undefined
    if (icono !== undefined && !esIconoValido(icono)) {
      return reply.code(400).send({ error: `Ícono inválido: ${icono}` })
    }

    const existe = await fastify.db.tipoDocumento.findFirst({
      where: { nombre: { equals: nombre, mode: 'insensitive' } },
      select: { id: true, nombre: true, activo: true },
    })
    if (existe) {
      // Nombrar el que ya existe (y si está desactivado, decirlo) es la diferencia
      // entre poder resolverlo y volver a intentar con otro nombre a ciegas.
      return reply.code(409).send({
        error: existe.activo
          ? `Ya existe el tipo "${existe.nombre}"`
          : `Ya existe el tipo "${existe.nombre}", está desactivado`,
        id: existe.id,
      })
    }

    const tipo = await fastify.db.tipoDocumento.create({
      data: {
        nombre,
        icono: icono ?? undefined,
        orden: Number.isInteger(request.body?.orden) ? request.body.orden : 0,
      },
      select: { id: true, nombre: true, icono: true, orden: true, activo: true },
    })
    return reply.code(201).send(tipo)
  })

  fastify.put('/tipos/:id', { preHandler: editHandler }, async (request, reply) => {
    const { nombre, icono, orden, activo } = request.body ?? {}
    if (icono !== undefined && !esIconoValido(icono)) {
      return reply.code(400).send({ error: `Ícono inválido: ${icono}` })
    }
    const data = {}
    if (nombre !== undefined) {
      const limpio = String(nombre).trim()
      if (!limpio) return reply.code(400).send({ error: 'El nombre no puede quedar vacío' })
      data.nombre = limpio
    }
    if (icono !== undefined) data.icono = icono
    if (Number.isInteger(orden)) data.orden = orden
    if (typeof activo === 'boolean') data.activo = activo

    try {
      return await fastify.db.tipoDocumento.update({
        where: { id: request.params.id },
        data,
        select: { id: true, nombre: true, icono: true, orden: true, activo: true },
      })
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Tipo no encontrado' })
      if (err.code === 'P2002') return reply.code(409).send({ error: 'Ya existe un tipo con ese nombre' })
      throw err
    }
  })

  // Los tipos no se borran, se desactivan: borrarlos dejaría documentos sin tipo y el
  // tipo es cómo se encuentra un documento. Con documentos cargados ni se intenta.
  fastify.delete('/tipos/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const tipo = await fastify.db.tipoDocumento.findUnique({
      where: { id: request.params.id },
      select: { id: true, nombre: true, _count: { select: { documentos: true } } },
    })
    if (!tipo) return reply.code(404).send({ error: 'Tipo no encontrado' })
    if (tipo._count.documentos > 0) {
      return reply.code(409).send({
        error: `"${tipo.nombre}" tiene ${tipo._count.documentos} documento(s). Se puede desactivar, no borrar.`,
      })
    }
    await fastify.db.tipoDocumento.delete({ where: { id: tipo.id } })
    return { ok: true }
  })

  // ── Listado ────────────────────────────────────────────────────────────────

  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_local, id_tipo, id_proveedor, texto, vencimiento } = request.query

    const where = {
      ...whereAlcance(request),
      // El rol decide si ve todo o solo lo marcado como visible para todos.
      ...filtroVisibilidad(request.activeRole),
    }

    // Filtrar por local trae los del local Y los del grupo: parado en DOGG, el contrato
    // marco del grupo también aplica a DOGG. Excluirlo escondería documentos que sí
    // rigen para ese local.
    if (id_local) {
      if (!request.allowedLocalIds.includes(id_local)) {
        const err = new Error('Sin acceso a ese local')
        err.statusCode = 403
        throw err
      }
      where.OR = [{ id_local }, { id_local: null }]
    }
    if (id_tipo) where.id_tipo = id_tipo
    if (id_proveedor) where.id_proveedor = id_proveedor
    if (texto?.trim()) {
      const q = texto.trim()
      where.AND = [{
        OR: [
          { nombre: { contains: q, mode: 'insensitive' } },
          { detalle: { contains: q, mode: 'insensitive' } },
        ],
      }]
    }

    const docs = await fastify.db.documento.findMany({
      where,
      select: SELECT_DOC,
      // Lo que vence primero arriba; los que no vencen, al final por fecha de carga.
      orderBy: [{ vence: { sort: 'asc', nulls: 'last' } }, { updated_at: 'desc' }],
      take: 500,
    })

    // El estado de vencimiento se calcula acá y no en el frontend para que la tabla, el
    // aviso y el link público digan lo mismo.
    const conEstado = docs.map(salidaDoc)

    if (vencimiento === 'vencido' || vencimiento === 'por-vencer') {
      return conEstado.filter(d => d.estado_vencimiento === vencimiento)
    }
    return conEstado
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const doc = await fastify.db.documento.findFirst({
      where: {
        id: request.params.id,
        ...whereAlcance(request),
        ...filtroVisibilidad(request.activeRole),
      },
      select: SELECT_DOC,
    })
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado' })
    return salidaDoc(doc)
  })

  // ── Crear / editar / borrar ────────────────────────────────────────────────

  // Valida lo que puede venir del cliente y lo deja listo para Prisma.
  // Devuelve { data, error }.
  async function armarDatos(request, { esNuevo }) {
    const b = request.body ?? {}
    const data = {}

    if (esNuevo || b.nombre !== undefined) {
      const nombre = String(b.nombre ?? '').trim()
      if (!nombre) return { error: 'El nombre es requerido' }
      data.nombre = nombre
    }

    if (esNuevo || b.id_tipo !== undefined) {
      if (!b.id_tipo) return { error: 'El tipo es requerido' }
      const tipo = await fastify.db.tipoDocumento.findUnique({
        where: { id: b.id_tipo }, select: { id: true, activo: true },
      })
      if (!tipo) return { error: 'El tipo no existe' }
      // Un tipo desactivado sirve para leer lo viejo, no para cargar cosas nuevas.
      if (!tipo.activo && esNuevo) return { error: 'Ese tipo está desactivado' }
      data.id_tipo = tipo.id
    }

    if (esNuevo || b.id_local !== undefined) {
      const idLocal = b.id_local || null
      // null es válido y significa "de todo el grupo".
      if (idLocal && !request.allowedLocalIds.includes(idLocal)) {
        return { error: 'Sin acceso a ese local' }
      }
      data.id_local = idLocal
    }

    if (b.id_proveedor !== undefined) data.id_proveedor = b.id_proveedor || null
    if (b.detalle !== undefined) data.detalle = String(b.detalle ?? '').trim() || null
    if (b.visible_todos !== undefined) data.visible_todos = Boolean(b.visible_todos)

    if (b.url !== undefined) {
      const url = String(b.url ?? '').trim()
      if (!url) {
        data.url = null
      } else {
        // Solo http(s): un `javascript:` guardado acá se ejecutaría al hacer clic desde
        // la tabla, y un documento lo puede cargar cualquiera con permiso de create.
        if (!/^https?:\/\//i.test(url)) {
          return { error: 'El link tiene que empezar con http:// o https://' }
        }
        data.url = url
      }
    }

    if (b.vence !== undefined) {
      const iso = fechaISO(b.vence)
      if (b.vence && !iso) return { error: 'La fecha de vencimiento tiene que ser AAAA-MM-DD' }
      data.vence = fechaParaGuardar(b.vence)
      // Cambiar el vencimiento destraba el aviso: el que se mandó era por la fecha
      // vieja. Ver hayQueAvisar en lib/documentos.js.
      data.avisado_hasta = null
    }

    return { data }
  }

  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { data, error } = await armarDatos(request, { esNuevo: true })
    if (error) return reply.code(400).send({ error })

    const doc = await fastify.db.documento.create({
      data: {
        ...data,
        id_app: request.activeAppId,
        id_created_by: request.user.id,
        // Los archivos ya subidos por /upload se adjuntan en la misma operación.
        archivos: archivosDelBody(request.body?.archivos),
      },
      select: SELECT_DOC,
    })
    return reply.code(201).send(salidaDoc(doc))
  })

  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    // Se busca con el alcance puesto: sin esto, con el id a mano se editaría un
    // documento de otro grupo.
    const actual = await fastify.db.documento.findFirst({
      where: { id: request.params.id, ...whereAlcance(request) },
      select: { id: true },
    })
    if (!actual) return reply.code(404).send({ error: 'Documento no encontrado' })

    const { data, error } = await armarDatos(request, { esNuevo: false })
    if (error) return reply.code(400).send({ error })

    const doc = await fastify.db.documento.update({
      where: { id: actual.id },
      data,
      select: SELECT_DOC,
    })
    return salidaDoc(doc)
  })

  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const doc = await fastify.db.documento.findFirst({
      where: { id: request.params.id, ...whereAlcance(request) },
      select: { id: true, archivos: { select: { gs_path: true } } },
    })
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado' })

    // Las filas de archivos caen por la cascada del esquema. Los objetos de GCS se
    // borran acá, uno por uno y sin cortar la operación si alguno falla: un archivo
    // que quedó en el bucket es basura, no poder borrar el documento es un bloqueo.
    for (const a of doc.archivos) {
      const parsed = parseGsPath(a.gs_path)
      if (!parsed) continue
      try {
        await gcs.bucket(parsed.bucket).file(parsed.filePath).delete()
      } catch (err) {
        fastify.log.warn({ err, gs_path: a.gs_path }, 'No se pudo borrar el archivo de GCS')
      }
    }

    await fastify.db.documento.delete({ where: { id: doc.id } })
    return { ok: true }
  })

  // ── Archivos ───────────────────────────────────────────────────────────────

  // Convierte lo que manda el formulario ([{ gs_path, tipo, nombre_original }]) en el
  // create anidado de Prisma. Ignora lo que no tenga una ruta gs:// válida.
  function archivosDelBody(archivos) {
    const lista = (Array.isArray(archivos) ? archivos : [])
      .filter(a => parseGsPath(a?.gs_path))
      .map((a, i) => ({
        gs_path: a.gs_path,
        tipo: a.tipo ?? tipoDeArchivo(a.nombre_original ?? a.gs_path),
        nombre_original: a.nombre_original ?? null,
        orden: Number.isInteger(a.orden) ? a.orden : i,
      }))
    return lista.length ? { create: lista } : undefined
  }

  // Sube un archivo al bucket y devuelve su gs://. No crea el documento: primero se
  // sube y después se guarda, igual que los adjuntos de pagos.
  fastify.post('/upload', { preHandler: createHandler }, async (request, reply) => {
    const { id_local } = request.query
    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'No se recibió archivo' })

    const bucket = process.env.GCS_BUCKET_NAME
    if (!bucket) return reply.code(500).send({ error: 'GCS_BUCKET_NAME no configurado' })

    if (!extensionPermitida(data.filename)) {
      const ext = (data.filename ?? '').split('.').pop()
      return reply.code(400).send({ error: `Tipo de archivo no permitido (.${ext})` })
    }
    const ext = data.filename.split('.').pop().toLowerCase()

    // Carpeta por local, como los adjuntos de pagos, más /documentos para no mezclar.
    let folder = 'general'
    if (id_local) {
      const local = await fastify.db.local.findUnique({
        where: { id: id_local }, select: { nombre: true },
      })
      if (local?.nombre) folder = sanitizeFolderName(local.nombre)
    }

    const filename = `${folder}/documentos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const file = gcs.bucket(bucket).file(filename)
    try {
      await new Promise((resolve, reject) => {
        const stream = file.createWriteStream({ metadata: { contentType: data.mimetype } })
        data.file.pipe(stream).on('error', reject).on('finish', resolve)
      })
    } catch (err) {
      // Pasado el límite de multipart el stream corta acá. Sin este catch salía un 500
      // sin explicación y el usuario no sabía que era el tamaño.
      fastify.log.error({ err }, 'Falló la subida a GCS')
      return reply.code(413).send({ error: 'No se pudo subir el archivo (máximo 20 MB)' })
    }

    return {
      ok: true,
      gs_path: `gs://${bucket}/${filename}`,
      tipo: tipoDeArchivo(data.filename),
      nombre_original: data.filename,
    }
  })

  // Suma archivos a un documento que ya existe.
  fastify.post('/:id/archivos', { preHandler: editHandler }, async (request, reply) => {
    const doc = await fastify.db.documento.findFirst({
      where: { id: request.params.id, ...whereAlcance(request) },
      select: { id: true, archivos: { select: { orden: true } } },
    })
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado' })

    const desde = doc.archivos.reduce((max, a) => Math.max(max, a.orden + 1), 0)
    const nuevos = (Array.isArray(request.body?.archivos) ? request.body.archivos : [])
      .filter(a => parseGsPath(a?.gs_path))
      .map((a, i) => ({
        id_documento: doc.id,
        gs_path: a.gs_path,
        tipo: a.tipo ?? tipoDeArchivo(a.nombre_original ?? a.gs_path),
        nombre_original: a.nombre_original ?? null,
        orden: desde + i,
      }))
    if (!nuevos.length) return reply.code(400).send({ error: 'No se recibió ningún archivo válido' })

    await fastify.db.documentoArchivo.createMany({ data: nuevos })
    return { ok: true, agregados: nuevos.length }
  })

  fastify.delete('/:id/archivos/:idArchivo', { preHandler: editHandler }, async (request, reply) => {
    const archivo = await fastify.db.documentoArchivo.findFirst({
      where: {
        id: request.params.idArchivo,
        id_documento: request.params.id,
        documento: whereAlcance(request),
      },
      select: { id: true, gs_path: true },
    })
    if (!archivo) return reply.code(404).send({ error: 'Archivo no encontrado' })

    const parsed = parseGsPath(archivo.gs_path)
    if (parsed) {
      try {
        await gcs.bucket(parsed.bucket).file(parsed.filePath).delete()
      } catch (err) {
        fastify.log.warn({ err, gs_path: archivo.gs_path }, 'No se pudo borrar el archivo de GCS')
      }
    }
    await fastify.db.documentoArchivo.delete({ where: { id: archivo.id } })
    return { ok: true }
  })

  // Sirve un archivo por el backend, sin exponer la ruta gs://. Igual que el attachment
  // de pagos.
  fastify.get('/:id/archivos/:idArchivo/ver', { preHandler: viewHandler }, async (request, reply) => {
    const archivo = await fastify.db.documentoArchivo.findFirst({
      where: {
        id: request.params.idArchivo,
        id_documento: request.params.id,
        documento: { ...whereAlcance(request), ...filtroVisibilidad(request.activeRole) },
      },
      select: { gs_path: true, nombre_original: true },
    })
    if (!archivo) return reply.code(404).send({ error: 'Archivo no encontrado' })
    return enviarArchivo(reply, archivo, request.query.descargar === '1')
  })

  // El streaming en un solo lugar: lo usan la lectura autenticada y la pública.
  function enviarArchivo(reply, archivo, descargar) {
    const parsed = parseGsPath(archivo.gs_path)
    if (!parsed) return reply.code(404).send({ error: 'Archivo no encontrado' })

    const ext = parsed.filePath.split('.').pop().toLowerCase()
    reply.header('Content-Type', contentTypePorExt(ext))
    reply.header('Cache-Control', 'private, max-age=300')
    if (descargar && archivo.nombre_original) {
      // El nombre entre comillas y sin comillas adentro: un nombre con `"` partiría el
      // header y el navegador guardaría cualquier cosa.
      const limpio = archivo.nombre_original.replace(/["\\\r\n]/g, '')
      reply.header('Content-Disposition', `attachment; filename="${limpio}"`)
    }

    const stream = gcs.bucket(parsed.bucket).file(parsed.filePath).createReadStream({
      userProject: process.env.GCS_PROJECT_ID,
    })
    stream.on('error', (err) => {
      reply.log.error({ err, gs_path: archivo.gs_path }, 'GCS stream error')
      if (!reply.sent) reply.code(502).send({ error: 'No se pudo obtener el archivo' })
    })
    return reply.send(stream)
  }

  // ── Link para compartir sin login ──────────────────────────────────────────

  // Devuelve el token actual o genera uno. Es un POST y no un GET porque crear el link
  // cambia algo: a partir de ahí el documento es alcanzable sin login.
  fastify.post('/:id/link', { preHandler: editHandler }, async (request, reply) => {
    const doc = await fastify.db.documento.findFirst({
      where: { id: request.params.id, ...whereAlcance(request) },
      select: { id: true, token_publico: true },
    })
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado' })

    // Si ya tiene, se devuelve el mismo: regenerarlo en cada clic invalidaría el link
    // que la persona ya mandó por mail.
    if (doc.token_publico) return { token: doc.token_publico, nuevo: false }

    const token = nuevoToken()
    await fastify.db.documento.update({
      where: { id: doc.id },
      data: { token_publico: token, token_creado_at: new Date() },
    })
    return { token, nuevo: true }
  })

  // Revocar: el link deja de funcionar al instante.
  fastify.delete('/:id/link', { preHandler: editHandler }, async (request, reply) => {
    const doc = await fastify.db.documento.findFirst({
      where: { id: request.params.id, ...whereAlcance(request) },
      select: { id: true },
    })
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado' })
    await fastify.db.documento.update({
      where: { id: doc.id },
      data: { token_publico: null, token_creado_at: null },
    })
    return { ok: true }
  })

  // ── Vencimientos ───────────────────────────────────────────────────────────

  // Genera los avisos de los documentos que vencen. Lo llama el frontend cuando abre
  // Documentos y también se puede pegar desde afuera.
  //
  // No hay cron en el proyecto, así que el barrido es a pedido. `avisado_hasta` es lo
  // que hace que sea idempotente: pegarle diez veces no manda diez avisos.
  fastify.post('/revisar-vencimientos', { preHandler: viewHandler }, async (request) => {
    const docs = await fastify.db.documento.findMany({
      where: {
        ...whereAlcance(request),
        vence: { not: null },
        // Solo lo que puede necesitar aviso: hasta DIAS_AVISO adelante, más todo lo ya
        // vencido. Traer la tabla entera para descartarla en memoria no escala.
        AND: [{ vence: { lte: enDias(DIAS_AVISO) } }],
      },
      select: {
        id: true, nombre: true, vence: true, avisado_hasta: true, id_local: true,
        tipo: { select: { nombre: true } },
        local: { select: { nombre: true } },
        app: { select: { nombre: true } },
      },
    })

    let creados = 0
    for (const doc of docs) {
      if (!hayQueAvisar(doc)) continue
      const { titulo, cuerpo } = textoAviso(doc)
      try {
        // Le avisa a quien está mirando. Un aviso por documento y por usuario: el que
        // entra a Documentos es quien puede resolverlo.
        await fastify.db.notificacion.create({
          data: {
            id_user: request.user.id,
            tipo: 'documento_vence',
            titulo,
            cuerpo,
            tabla: 'documentos',
            id_registro: doc.id,
            id_local: doc.id_local,
          },
        })
        await fastify.db.documento.update({
          where: { id: doc.id },
          data: { avisado_hasta: doc.vence },
        })
        creados++
      } catch (err) {
        // Igual que avisarDesauditado: no poder avisar no puede tumbar la pantalla.
        fastify.log.error({ err, id: doc.id }, 'No se pudo crear el aviso de vencimiento')
      }
    }
    return { ok: true, avisos: creados, revisados: docs.length }
  })

  // ── PÚBLICO: la única ruta sin autenticación ───────────────────────────────
  //
  // Quien tiene el token abre el archivo, sin login. Es lo que se pidió: mandarle una
  // habilitación a un inspector sin darle un usuario.
  //
  // Por qué es aceptable:
  //   - el token son 32 bytes de randomBytes, no se adivina;
  //   - existe solo si alguien lo generó a mano para ese documento;
  //   - se revoca con DELETE /:id/link y deja de servir al instante;
  //   - no expone nada más: ni el listado, ni el grupo, ni los otros documentos.
  //
  // Lo que NO hace, a propósito: no acepta el id del documento (solo el token, así no
  // se puede probar con ids), y no devuelve `detalle` ni quién lo cargó.
  fastify.get('/publico/:token', async (request, reply) => {
    const token = String(request.params.token ?? '')
    // Se descarta antes de tocar la base: un token con la pinta equivocada no se busca.
    if (!/^[0-9a-f]{64}$/.test(token)) {
      return reply.code(404).send({ error: 'Link inválido' })
    }

    const doc = await fastify.db.documento.findUnique({
      where: { token_publico: token },
      select: {
        id: true, nombre: true, url: true, vence: true,
        tipo: { select: { nombre: true, icono: true } },
        archivos: {
          select: { id: true, tipo: true, nombre_original: true },
          orderBy: { orden: 'asc' },
        },
      },
    })
    if (!doc) return reply.code(404).send({ error: 'Link inválido' })

    // Con ?archivo=<id> baja el archivo; sin eso, describe qué hay.
    const idArchivo = request.query.archivo
    if (idArchivo) {
      const archivo = await fastify.db.documentoArchivo.findFirst({
        where: { id: String(idArchivo), documento: { token_publico: token } },
        select: { gs_path: true, nombre_original: true },
      })
      if (!archivo) return reply.code(404).send({ error: 'Archivo no encontrado' })
      return enviarArchivo(reply, archivo, request.query.descargar === '1')
    }

    return {
      nombre: doc.nombre,
      tipo: doc.tipo?.nombre ?? null,
      icono: normalizarIcono(doc.tipo?.icono),
      url: doc.url,
      vence: fechaISO(doc.vence),
      archivos: doc.archivos,
    }
  })
}

// Hoy + n días, a medianoche UTC. Para el where del barrido.
function enDias(n) {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n))
}
