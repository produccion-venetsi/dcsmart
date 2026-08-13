// Carpeta de inspecciones. Vive dentro del módulo Documentos (mismos permisos de lectura)
// pero es una planilla de control, no un archivo con nombre.
//
// La "carpeta" es la agrupación por local: no hay tabla de carpetas, hay folios con
// `id_local`. Se pide siempre `?id_local=`.
//
// ── Quién escribe ────────────────────────────────────────────────────────────
//
// Los locales son SOLO LECTURA con descarga de archivos (pedido del usuario): ver la
// planilla y bajarse el certificado sí, tocar el estado no. Escribir es de DC
// (super_admin / dcsmart), igual que los tipos de documento.
//
// ── El historial ─────────────────────────────────────────────────────────────
//
// No hay tabla nueva: se usa `activity_log`, que ya guarda tabla / id_registro / acción /
// usuario / fecha / snapshot. Así el historial del folio y el log general de la app son la
// misma verdad, y la pantalla de Actividad lo muestra sin tocar nada.

import {
  ESTADOS, ETIQUETA_ESTADO, AYUDA_ESTADO,
  normalizarEstado, contarPorEstado, contarAbiertos,
  numerarDesdeOrden, validarOrden, siguienteFolio, validarFolio,
  fechaISO, fechaParaGuardar, periodoISO, periodoParaGuardar,
} from '../lib/inspecciones.js'
import { Storage } from '@google-cloud/storage'
import { parseGsPath, contentTypePorExt } from '../lib/gcsPaths.js'

export default async function inspeccionesRoutes(fastify) {
  const gcs = new Storage()

  const ctx = [fastify.authenticate, fastify.appContext]
  // Leer: cualquiera con acceso al módulo Documentos, acotado a sus locales.
  const viewHandler = [...ctx, fastify.can('documentos', 'view')]
  // Escribir: solo DC. Ver el comentario de arriba.
  const dcHandler = [...ctx, fastify.requireDc]

  // El folio pedido, solo si es de un local que el usuario alcanza.
  const folioAlcanzable = (id, request) => fastify.db.inspeccionFolio.findFirst({
    where: { id, id_app: request.activeAppId, id_local: { in: request.allowedLocalIds } },
  })

  const salida = (f) => f && ({
    ...f,
    // Las fechas viajan como texto y no como Date: son columnas DATE, y `new Date(iso)` en
    // el navegador las corre un día en GMT-3.
    fecha_emision: fechaISO(f.fecha_emision),
    periodo: periodoISO(f.periodo),
    vence: fechaISO(f.vence),
    estado_label: ETIQUETA_ESTADO[f.estado] ?? f.estado,
  })

  async function log(request, folio, accion, motivo) {
    try {
      await fastify.db.activityLog.create({
        data: {
          tabla: 'inspeccion_folios',
          id_registro: folio.id,
          id_local: folio.id_local,
          accion,
          id_user: request.user?.id ?? null,
          snapshot: JSON.parse(JSON.stringify({
            folio: folio.folio, concepto: folio.concepto, estado: folio.estado,
            fecha_emision: fechaISO(folio.fecha_emision), periodo: periodoISO(folio.periodo),
            vence: fechaISO(folio.vence), observaciones: folio.observaciones,
          })),
          motivo: motivo || null,
        },
      })
    } catch (err) {
      // Igual que en pagos: el log no puede tumbar la operación principal.
      fastify.log.error({ err }, `No se pudo registrar activity_log (${accion}) del folio ${folio.id}`)
    }
  }

  // ── Catálogo de estados ────────────────────────────────────────────────────
  // La lista sale del backend para que la pantalla no tenga su propia copia.
  fastify.get('/estados', { preHandler: [fastify.authenticate] }, async () =>
    ESTADOS.map((e) => ({ value: e, label: ETIQUETA_ESTADO[e], ayuda: AYUDA_ESTADO[e] })))

  // ── La carpeta de un local ─────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local } = request.query
    if (!id_local) return reply.code(400).send({ error: 'Falta id_local: la carpeta es por local' })
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }

    const folios = await fastify.db.inspeccionFolio.findMany({
      where: { id_app: request.activeAppId, id_local },
      orderBy: { folio: 'asc' },
      include: {
        archivos: { select: { id: true, tipo: true, nombre_original: true, orden: true }, orderBy: { orden: 'asc' } },
        created_by: { select: { id: true, nombre: true } },
        // Para la columna de ultima actualizacion: `updated_at` dice cuando, esto dice quien.
        updated_by: { select: { id: true, nombre: true } },
      },
    })

    return {
      id_local,
      folios: folios.map(salida),
      // Contadores para la cabecera: entrar a una planilla de 40 folios sin saber cuántos
      // están abiertos obliga a recorrerla entera.
      por_estado: contarPorEstado(folios),
      abiertos: contarAbiertos(folios),
      total: folios.length,
    }
  })

  // ── Alta ───────────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: dcHandler }, async (request, reply) => {
    const { id_local, concepto, estado, fecha_emision, periodo, vence, observaciones } = request.body ?? {}
    if (!id_local) return reply.code(400).send({ error: 'Falta id_local' })
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const err = validarFolio({ concepto, estado })
    if (err) return reply.code(400).send({ error: err })

    const fecha = fechaParaGuardar(vence)
    if (fecha === undefined) return reply.code(400).send({ error: 'La fecha de vencimiento tiene que ser YYYY-MM-DD' })
    const emision = fechaParaGuardar(fecha_emision)
    if (emision === undefined) return reply.code(400).send({ error: 'La fecha de emisión tiene que ser YYYY-MM-DD' })
    const per = periodoParaGuardar(periodo)
    if (per === undefined) return reply.code(400).send({ error: 'El período tiene que ser YYYY-MM' })

    // El folio nuevo va al final de la planilla del local.
    const max = (await fastify.db.inspeccionFolio.aggregate({
      where: { id_local }, _max: { folio: true },
    }))._max.folio

    const creado = await fastify.db.inspeccionFolio.create({
      data: {
        id_app: request.activeAppId,
        id_local,
        folio: siguienteFolio(max),
        concepto: String(concepto).trim(),
        estado: normalizarEstado(estado) ?? 'FALTA',
        fecha_emision: emision,
        periodo: per,
        vence: fecha,
        observaciones: observaciones?.trim() || null,
        id_created_by: request.user?.id ?? null,
        // Quien crea es tambien el ultimo que lo toco: si no, la columna de ultima
        // actualizacion sale vacia hasta la primera edicion.
        id_updated_by: request.user?.id ?? null,
      },
      include: { archivos: true },
    })
    await log(request, creado, 'creado')
    return reply.code(201).send(salida(creado))
  })

  // ── Reordenar ──────────────────────────────────────────────────────────────
  //
  // Llega la lista de ids en el orden nuevo y se renumera de 1 a N. Va antes de
  // `PUT /:id` en el archivo porque `/orden` matchearía como un :id.
  fastify.put('/orden', { preHandler: dcHandler }, async (request, reply) => {
    const { id_local, ids } = request.body ?? {}
    if (!id_local) return reply.code(400).send({ error: 'Falta id_local' })
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }

    const enBase = await fastify.db.inspeccionFolio.findMany({
      where: { id_app: request.activeAppId, id_local },
      select: { id: true },
      orderBy: { folio: 'asc' },
    })
    const err = validarOrden(ids, enBase.map((f) => f.id))
    if (err) return reply.code(409).send({ error: err })

    // Todo o nada: una renumeración a medias deja la planilla con folios repetidos.
    const nuevos = numerarDesdeOrden(ids)
    await fastify.db.$transaction(nuevos.map(({ id, folio }) =>
      fastify.db.inspeccionFolio.update({ where: { id }, data: { folio } })))

    // Un solo evento para el reordenamiento entero: registrar 40 cambios de número por
    // arrastrar una fila haría ilegible el historial.
    await log(request, { id: id_local, id_local, folio: null, concepto: `Orden de la carpeta (${nuevos.length} folios)`, estado: null, vence: null, observaciones: null }, 'editado', 'reordenamiento de la carpeta')

    return { ok: true, folios: nuevos }
  })

  // ── Edición ────────────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: dcHandler }, async (request, reply) => {
    const actual = await folioAlcanzable(request.params.id, request)
    if (!actual) return reply.code(404).send({ error: 'Folio no encontrado' })

    const { concepto, estado, fecha_emision, periodo, vence, observaciones } = request.body ?? {}
    const conceptoFinal = concepto !== undefined ? concepto : actual.concepto
    const err = validarFolio({ concepto: conceptoFinal, estado })
    if (err) return reply.code(400).send({ error: err })

    let fecha
    if (vence !== undefined) {
      fecha = fechaParaGuardar(vence)
      if (fecha === undefined) return reply.code(400).send({ error: 'La fecha de vencimiento tiene que ser YYYY-MM-DD' })
    }
    let emision
    if (fecha_emision !== undefined) {
      emision = fechaParaGuardar(fecha_emision)
      if (emision === undefined) return reply.code(400).send({ error: 'La fecha de emisión tiene que ser YYYY-MM-DD' })
    }
    let per
    if (periodo !== undefined) {
      per = periodoParaGuardar(periodo)
      if (per === undefined) return reply.code(400).send({ error: 'El período tiene que ser YYYY-MM' })
    }

    const actualizado = await fastify.db.inspeccionFolio.update({
      where: { id: actual.id },
      data: {
        ...(concepto !== undefined ? { concepto: String(concepto).trim() } : {}),
        ...(estado !== undefined && estado !== '' ? { estado: normalizarEstado(estado) } : {}),
        ...(fecha_emision !== undefined ? { fecha_emision: emision } : {}),
        ...(periodo !== undefined ? { periodo: per } : {}),
        ...(vence !== undefined ? { vence: fecha } : {}),
        ...(observaciones !== undefined ? { observaciones: observaciones?.trim() || null } : {}),
        id_updated_by: request.user?.id ?? null,
      },
      include: { archivos: { orderBy: { orden: 'asc' } } },
    })

    // El motivo del historial dice QUÉ cambió: "editado" a secas no sirve para reconstruir
    // por qué un folio pasó de FALTA a OK.
    const cambios = []
    if (actualizado.estado !== actual.estado) {
      cambios.push(`estado ${ETIQUETA_ESTADO[actual.estado] ?? actual.estado} -> ${ETIQUETA_ESTADO[actualizado.estado] ?? actualizado.estado}`)
    }
    if (actualizado.concepto !== actual.concepto) cambios.push('concepto')
    if (fechaISO(actualizado.vence) !== fechaISO(actual.vence)) {
      cambios.push(`vence ${fechaISO(actual.vence) ?? 'sin fecha'} -> ${fechaISO(actualizado.vence) ?? 'sin fecha'}`)
    }
    if (fechaISO(actualizado.fecha_emision) !== fechaISO(actual.fecha_emision)) {
      cambios.push(`emisión ${fechaISO(actual.fecha_emision) ?? 'sin fecha'} -> ${fechaISO(actualizado.fecha_emision) ?? 'sin fecha'}`)
    }
    if (periodoISO(actualizado.periodo) !== periodoISO(actual.periodo)) {
      cambios.push(`período ${periodoISO(actual.periodo) ?? 'sin período'} -> ${periodoISO(actualizado.periodo) ?? 'sin período'}`)
    }
    if ((actualizado.observaciones ?? '') !== (actual.observaciones ?? '')) cambios.push('observaciones')
    if (cambios.length) await log(request, actualizado, 'editado', cambios.join(' | '))

    return salida(actualizado)
  })

  // ── Baja ───────────────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: dcHandler }, async (request, reply) => {
    const folio = await folioAlcanzable(request.params.id, request)
    if (!folio) return reply.code(404).send({ error: 'Folio no encontrado' })

    const archivos = await fastify.db.folioArchivo.findMany({
      where: { id_folio: folio.id }, select: { gs_path: true },
    })

    // Se registra ANTES de borrar: después el folio ya no existe y el snapshot es lo único
    // que queda de él.
    await log(request, folio, 'eliminado', request.body?.motivo)
    await fastify.db.inspeccionFolio.delete({ where: { id: folio.id } })

    // Las filas de archivos caen por la cascada; los objetos de GCS hay que borrarlos.
    for (const a of archivos) {
      const p = parseGsPath(a.gs_path)
      if (!p) continue
      try {
        await gcs.bucket(p.bucket).file(p.filePath).delete({ ignoreNotFound: true })
      } catch (err) {
        fastify.log.warn({ err, gs_path: a.gs_path }, 'No se pudo borrar el archivo de GCS')
      }
    }

    // La baja deja un hueco en la numeración. Se renumera para que la planilla no quede
    // con 1, 2, 4, 5: el orden es una lista, no identificadores.
    const resto = await fastify.db.inspeccionFolio.findMany({
      where: { id_local: folio.id_local }, select: { id: true }, orderBy: { folio: 'asc' },
    })
    if (resto.length) {
      await fastify.db.$transaction(numerarDesdeOrden(resto.map((f) => f.id))
        .map(({ id, folio: n }) => fastify.db.inspeccionFolio.update({ where: { id }, data: { folio: n } })))
    }

    return reply.code(204).send()
  })

  // ── Historial ──────────────────────────────────────────────────────────────
  // Lo puede ver cualquiera que vea la carpeta: es el registro de qué pasó con el folio,
  // no un dato interno.
  fastify.get('/:id/historial', { preHandler: viewHandler }, async (request, reply) => {
    const folio = await folioAlcanzable(request.params.id, request)
    if (!folio) return reply.code(404).send({ error: 'Folio no encontrado' })

    const eventos = await fastify.db.activityLog.findMany({
      where: { tabla: 'inspeccion_folios', id_registro: folio.id },
      orderBy: { fecha: 'desc' },
      select: {
        id: true, accion: true, fecha: true, motivo: true, snapshot: true,
        user: { select: { id: true, nombre: true, email: true } },
      },
    })
    return { id_folio: folio.id, eventos }
  })

  // ── Archivos ───────────────────────────────────────────────────────────────
  //
  // La subida al bucket la hace `POST /documentos/upload`, que ya existe y devuelve el
  // gs://. Acá solo se adjunta lo ya subido, igual que hace documentos.
  fastify.post('/:id/archivos', { preHandler: dcHandler }, async (request, reply) => {
    const folio = await folioAlcanzable(request.params.id, request)
    if (!folio) return reply.code(404).send({ error: 'Folio no encontrado' })

    const lista = (Array.isArray(request.body?.archivos) ? request.body.archivos : [])
      .filter((a) => parseGsPath(a?.gs_path))
    if (!lista.length) return reply.code(400).send({ error: 'No se recibió ningún archivo válido' })

    const desde = (await fastify.db.folioArchivo.aggregate({
      where: { id_folio: folio.id }, _max: { orden: true },
    }))._max.orden ?? -1

    await fastify.db.folioArchivo.createMany({
      data: lista.map((a, i) => ({
        id_folio: folio.id,
        gs_path: a.gs_path,
        tipo: a.tipo || 'otro',
        nombre_original: a.nombre_original || null,
        orden: desde + 1 + i,
      })),
    })
    await log(request, folio, 'editado', `se adjuntaron ${lista.length} archivo(s)`)

    const archivos = await fastify.db.folioArchivo.findMany({
      where: { id_folio: folio.id }, orderBy: { orden: 'asc' },
      select: { id: true, tipo: true, nombre_original: true, orden: true },
    })
    return reply.code(201).send({ archivos })
  })

  // Descargar / ver. Es lo único de archivos que un local puede hacer, así que va con
  // permiso de lectura y no de DC.
  fastify.get('/:id/archivos/:idArchivo/ver', { preHandler: viewHandler }, async (request, reply) => {
    const archivo = await fastify.db.folioArchivo.findFirst({
      where: {
        id: request.params.idArchivo,
        id_folio: request.params.id,
        folio: { id_app: request.activeAppId, id_local: { in: request.allowedLocalIds } },
      },
      select: { gs_path: true, nombre_original: true },
    })
    if (!archivo) return reply.code(404).send({ error: 'Archivo no encontrado' })

    const p = parseGsPath(archivo.gs_path)
    if (!p) return reply.code(404).send({ error: 'Archivo no encontrado' })

    reply.header('Content-Type', contentTypePorExt(p.filePath.split('.').pop().toLowerCase()))
    reply.header('Cache-Control', 'private, max-age=300')
    if (request.query.descargar === '1' && archivo.nombre_original) {
      // Sin comillas ni saltos: un nombre con `"` partiría el header.
      reply.header('Content-Disposition', `attachment; filename="${archivo.nombre_original.replace(/["\\\r\n]/g, '')}"`)
    }
    const stream = gcs.bucket(p.bucket).file(p.filePath).createReadStream({
      userProject: process.env.GCS_PROJECT_ID,
    })
    stream.on('error', (err) => {
      reply.log.error({ err, gs_path: archivo.gs_path }, 'GCS stream error')
      if (!reply.sent) reply.code(502).send({ error: 'No se pudo obtener el archivo' })
    })
    return reply.send(stream)
  })

  fastify.delete('/:id/archivos/:idArchivo', { preHandler: dcHandler }, async (request, reply) => {
    const archivo = await fastify.db.folioArchivo.findFirst({
      where: {
        id: request.params.idArchivo,
        id_folio: request.params.id,
        folio: { id_app: request.activeAppId, id_local: { in: request.allowedLocalIds } },
      },
      select: { id: true, gs_path: true, folio: true },
    })
    if (!archivo) return reply.code(404).send({ error: 'Archivo no encontrado' })

    await fastify.db.folioArchivo.delete({ where: { id: archivo.id } })
    const p = parseGsPath(archivo.gs_path)
    if (p) {
      try {
        await gcs.bucket(p.bucket).file(p.filePath).delete({ ignoreNotFound: true })
      } catch (err) {
        fastify.log.warn({ err, gs_path: archivo.gs_path }, 'No se pudo borrar el archivo de GCS')
      }
    }
    await log(request, archivo.folio, 'editado', 'se quitó un archivo')
    return reply.code(204).send()
  })
}
