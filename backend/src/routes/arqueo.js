// Arqueo: conteo físico de efectivo por local (caja fuerte + cofre + adición),
// comparado contra lo acumulado en el sistema desde el arqueo anterior del
// mismo local. Ver docs/superpowers/specs/2026-07-16-arqueo-design.md para
// la fórmula completa.

import { totalContado, calcularComprobacion, describirComprobacion } from '../lib/cuadreArqueo.js'
import { whereCajasCandidatas, sumarEfectivoDelPeriodo, cajaEnPeriodo } from '../lib/periodoArqueo.js'
import { nombreDisponibilidad } from '../lib/disponibilidades.js'

// Busca el arqueo anterior de un local (el más reciente con fecha < la nueva).
// Devuelve null si es el primer arqueo del local.
async function getArqueoAnterior(fastify, id_local, fecha) {
  return fastify.db.arqueo.findFirst({
    where: { id_local, fecha: { lt: fecha } },
    orderBy: { fecha: 'desc' }
  })
}

// Suma Caja.efectivo del local en (fechaDesde, fechaHasta] -- fechaDesde exclusivo, fechaHasta inclusivo.
//
// La caja entra por la fecha en que su plata llegó al cofre: el cierre del
// turno cuando está cargado, la apertura cuando no. Ver lib/periodoArqueo.js
// para por qué no alcanza con filtrar por fecha_cierre.
async function calcularIngresos(fastify, id_local, fechaDesde, fechaHasta) {
  const cajas = await fastify.db.caja.findMany({
    where: whereCajasCandidatas(id_local, fechaDesde, fechaHasta),
    select: { efectivo: true, fecha_inicio: true, fecha_cierre: true }
  })
  return sumarEfectivoDelPeriodo(cajas, fechaDesde, fechaHasta)
}

// Suma Pago.importe del local, pagado=true, en efectivo, egreso real, en (fechaDesde, fechaHasta].
async function calcularGastos(fastify, id_local, fechaDesde, fechaHasta) {
  const metodoEfectivo = await fastify.db.metodoPago.findFirst({
    where: { nombre: { equals: 'Efectivo', mode: 'insensitive' } }
  })
  if (!metodoEfectivo) return 0
  const pagos = await fastify.db.pago.findMany({
    where: {
      id_local,
      pagado: true,
      ingresa_egreso: false,
      id_metodo: metodoEfectivo.id,
      fecha_pago: {
        ...(fechaDesde ? { gt: fechaDesde } : {}),
        lte: fechaHasta
      }
    },
    select: { importe: true }
  })
  return pagos.reduce((acc, p) => acc + Number(p.importe ?? 0), 0)
}

// El estado de auditoría de un arqueo se guarda en la tabla `audits`
// (modelo Audit) con tabla='arqueos' e id_registro=arqueo.id, igual que
// pagos y cajas.
async function getAuditedArqueoSet(fastify, arqueoIds) {
  if (!arqueoIds.length) return new Set()
  try {
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'arqueos', id_registro: { in: arqueoIds }, audit_dc: false, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    return new Set(rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (getAuditedArqueoSet)')
    return new Set()
  }
}

export default async function arqueoRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('arqueo', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('arqueo', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('arqueo', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('arqueo', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local } = request.query
    if (!id_local || !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const arqueos = await fastify.db.arqueo.findMany({
      where: { id_local },
      orderBy: { fecha: 'desc' }
    })
    const auditedSet = await getAuditedArqueoSet(fastify, arqueos.map(a => a.id))
    // La etiqueta viaja calculada: la pantalla no tiene que saber de qué lado
    // está el signo ni cuál es la tolerancia.
    //
    // Vienen ordenados por fecha desc, así que el más antiguo del local es el
    // último. Ese es la línea de base y su comprobación no significa nada (ver
    // describirComprobacion).
    const idPrimero = arqueos.length ? arqueos[arqueos.length - 1].id : null
    const data = arqueos.map(a => ({
      ...a,
      audit: auditedSet.has(a.id),
      es_primero: a.id === idPrimero,
      comprobacion_detalle: describirComprobacion(a.comprobacion, { esPrimero: a.id === idPrimero })
    }))
    return { data }
  })

  // ── GET /:id ──────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const arqueo = await fastify.db.arqueo.findUnique({
      where: { id: request.params.id },
      include: { detalles: { include: { detalle_tipo: true, disponibilidad: true } } }
    })
    if (!arqueo) return reply.code(404).send({ error: 'Arqueo no encontrado' })
    if (!request.allowedLocalIds.includes(arqueo.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }
    const auditRow = await fastify.db.audit.findFirst({
      where: { tabla: 'arqueos', id_registro: arqueo.id, vigente: true, audit_dc: false },
      include: { user: { select: { id: true, nombre: true } } }
    })
    // Si no hay uno anterior, este es la línea de base del local: su
    // comprobación compara contra todo el historial y no significa nada.
    const anterior = await getArqueoAnterior(fastify, arqueo.id_local, arqueo.fecha)
    const esPrimero = !anterior

    return {
      ...arqueo,
      es_primero: esPrimero,
      comprobacion_detalle: describirComprobacion(arqueo.comprobacion, { esPrimero }),
      audit:      auditRow?.accion === 'auditado',
      audit_by:   auditRow?.user?.nombre ?? null,
      audit_date: auditRow?.fecha ?? null,
    }
  })

  // ── PATCH /:id/audit ────────────────────────────────────────────────────
  // Mismo mecanismo de historial append-only que pagos y cajas (ver pagos.js/caja.js).
  fastify.patch('/:id/audit', { preHandler: editHandler }, async (request, reply) => {
    const arqueo = await fastify.db.arqueo.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!arqueo) return reply.code(404).send({ error: 'Arqueo no encontrado' })
    if (!request.allowedLocalIds.includes(arqueo.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { observaciones } = request.body ?? {}

    const nextAccion = await fastify.db.$transaction(async (tx) => {
      const current = await tx.audit.findFirst({
        where: { tabla: 'arqueos', id_registro: request.params.id, audit_dc: false, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'arqueos', id_registro: request.params.id, audit_dc: false, vigente: true },
        data: { vigente: false }
      })

      const accion = current?.accion === 'auditado' ? 'desauditado' : 'auditado'

      await tx.audit.create({
        data: {
          id_registro:   request.params.id,
          tabla:         'arqueos',
          tipo:          'auditoria_arqueo',
          accion,
          aprobado:      accion === 'auditado',
          vigente:       true,
          audit_dc:      false,
          id_user:       request.user.id,
          fecha:         new Date(),
          observaciones: accion === 'desauditado' ? (observaciones || null) : null
        }
      })

      return accion
    })

    return { ok: true, audit: nextAccion === 'auditado' }
  })

  // ── GET /preview ──────────────────────────────────────────────────────
  // Mismo cálculo que POST /, pero sin persistir nada -- para que el
  // frontend muestre la comprobación en vivo antes de confirmar.
  // Devuelve las partes, no la comprobación: el usuario va tipeando los montos y
  // la ve cambiar en vivo, así que pedirla al servidor en cada tecla sería peor.
  // El frontend la calcula con lib/cuadreArqueo.js, que es espejo del de acá, y
  // el POST la recalcula del lado del servidor antes de guardar.
  fastify.get('/preview', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, fecha } = request.query
    if (!id_local || !fecha) {
      return reply.code(400).send({ error: 'id_local y fecha son requeridos' })
    }
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const fechaArqueo = new Date(fecha)
    const anterior = await getArqueoAnterior(fastify, id_local, fechaArqueo)
    const totalUltimoArqueo = anterior ? Number(anterior.total) : 0
    const fechaDesde = anterior ? anterior.fecha : null

    const ingresos = await calcularIngresos(fastify, id_local, fechaDesde, fechaArqueo)
    const gastos = await calcularGastos(fastify, id_local, fechaDesde, fechaArqueo)

    // La fecha va junto al total porque el arqueo mide el período entre el
    // anterior y este: sin saber desde cuándo, el número de arriba no se puede
    // interpretar. Es null en el primer arqueo del local.
    return { total_ultimo_arqueo: totalUltimoArqueo, fecha_ultimo_arqueo: fechaDesde, ingresos, gastos }
  })

  // ── GET /disponibilidades ─────────────────────────────────────────────
  // Las disponibilidades del ULTIMO arqueo de cada local del grupo activo:
  // una fila por local con sus lineas (MP Hoy, BBVA, Amex...) y el total.
  // Los locales sin arqueos tambien van (con ultimo=null): que falte un
  // arqueo es un dato, y esconder el local lo taparia.
  fastify.get('/disponibilidades', { preHandler: viewHandler }, async (request, reply) => {
    const ids = request.allowedLocalIds
    if (!ids.length) return { data: [] }

    const [locales, ultimos] = await Promise.all([
      fastify.db.local.findMany({
        where: { id: { in: ids } },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' }
      }),
      // distinct + orderBy fecha desc = el arqueo mas reciente de cada local
      fastify.db.arqueo.findMany({
        where: { id_local: { in: ids } },
        orderBy: { fecha: 'desc' },
        distinct: ['id_local'],
        include: { detalles: { include: { detalle_tipo: true, disponibilidad: true } } }
      })
    ])

    const porLocal = new Map(ultimos.map(a => [a.id_local, a]))
    const data = locales.map(l => {
      const a = porLocal.get(l.id)
      return {
        id_local: l.id,
        local: l.nombre,
        ultimo: a ? {
          id: a.id,
          fecha: a.fecha,
          total: Number(a.total),
          disponibilidades: a.detalles.map(d => ({
            nombre: nombreDisponibilidad(d),
            monto: Number(d.monto)
          }))
        } : null
      }
    })
    return { data }
  })

  // ── GET /movimientos ──────────────────────────────────────────────────
  // Las filas que componen los ingresos y gastos de un periodo de arqueo:
  // las cajas (su efectivo) y los pagos en efectivo del local.
  //
  //   ?id_local=X            -> desde el ultimo arqueo hasta AHORA (lo que
  //                             deberia haber en la caja para el proximo conteo)
  //   ?id_local=X&id_arqueo= -> el periodo de ESE arqueo (entre el anterior y el)
  //
  // Mismas condiciones que calcularIngresos/calcularGastos: la suma de estas
  // filas ES el numero de la comprobacion, no una version parecida.
  fastify.get('/movimientos', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, id_arqueo } = request.query
    if (!id_local || !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }

    let desde = null, hasta = new Date()
    if (id_arqueo) {
      const arqueo = await fastify.db.arqueo.findUnique({ where: { id: id_arqueo } })
      if (!arqueo || arqueo.id_local !== id_local) {
        return reply.code(404).send({ error: 'Arqueo no encontrado' })
      }
      hasta = arqueo.fecha
      const anterior = await getArqueoAnterior(fastify, id_local, arqueo.fecha)
      desde = anterior ? anterior.fecha : null
    } else {
      const ultimo = await fastify.db.arqueo.findFirst({
        where: { id_local },
        orderBy: { fecha: 'desc' }
      })
      desde = ultimo ? ultimo.fecha : null
    }

    const rangoCaja = { ...(desde ? { gt: desde } : {}), lte: hasta }
    const metodoEfectivo = await fastify.db.metodoPago.findFirst({
      where: { nombre: { equals: 'Efectivo', mode: 'insensitive' } }
    })
    const wherePagos = metodoEfectivo ? {
      id_local, pagado: true, ingresa_egreso: false,
      id_metodo: metodoEfectivo.id, fecha_pago: rangoCaja
    } : null

    // Cap de filas para el primer arqueo (sin `desde` el rango es todo el
    // historial); los totales se calculan sobre el conjunto completo para que
    // sigan siendo los completos aunque la lista este recortada.
    const CAP = 300
    const [candidatas, pagos, aggPagos, totalPagos] = await Promise.all([
      // Las cajas se filtran en JS por su fecha efectiva (mismo criterio que
      // calcularIngresos): Prisma no puede comparar fecha_cierre con
      // fecha_inicio dentro del where.
      fastify.db.caja.findMany({
        where: whereCajasCandidatas(id_local, desde, hasta),
        select: { id: true, fecha_inicio: true, fecha_cierre: true, tipo_turno: true, efectivo: true },
        orderBy: { fecha_inicio: 'desc' }
      }),
      wherePagos ? fastify.db.pago.findMany({
        where: wherePagos,
        select: { id: true, nro_ord: true, fecha_pago: true, importe: true, proveedor: { select: { nombre: true, razon_social: true } } },
        orderBy: { fecha_pago: 'desc' },
        take: CAP
      }) : [],
      wherePagos ? fastify.db.pago.aggregate({ where: wherePagos, _sum: { importe: true } }) : null,
      wherePagos ? fastify.db.pago.count({ where: wherePagos }) : 0,
    ])

    const delPeriodo = candidatas.filter(c => cajaEnPeriodo(c, desde, hasta))
    const totalCajas = delPeriodo.length
    const cajas = delPeriodo.slice(0, CAP)

    return {
      desde, hasta,
      ingresos: sumarEfectivoDelPeriodo(delPeriodo, desde, hasta),
      gastos: Number(aggPagos?._sum.importe ?? 0),
      cajas: cajas.map(c => ({ ...c, efectivo: Number(c.efectivo ?? 0) })),
      pagos: pagos.map(pg => ({
        id: pg.id, nro_ord: pg.nro_ord, fecha_pago: pg.fecha_pago,
        importe: Number(pg.importe ?? 0),
        proveedor: pg.proveedor?.nombre || pg.proveedor?.razon_social || null
      })),
      total_cajas: totalCajas,
      total_pagos: totalPagos,
      truncado: totalCajas > CAP || totalPagos > CAP
    }
  })

  // Las líneas de disponibilidades que se guardan con el arqueo.
  //
  // `id_disponibilidad` es el catálogo nuevo (el que el local tiene activo) e
  // `id_tipo` el viejo de cajas, que se sigue aceptando porque los arqueos ya
  // cargados apuntan ahí y editar uno no tiene por qué reescribirle el
  // concepto. Se copia además el nombre: si mañana alguien borra o renombra la
  // cuenta, el arqueo tiene que seguir diciendo qué se contó ese día.
  async function lineasDetalle(idLocal, detalles) {
    const lineas = (detalles || []).filter((d) => d && (d.id_disponibilidad || d.id_tipo || d.nombre))

    const ids = [...new Set(lineas.map((d) => d.id_disponibilidad).filter(Boolean))]
    let nombrePorId = new Map()
    if (ids.length) {
      // Contra el grupo DEL LOCAL, no contra el que el usuario tenga
      // seleccionado: un super_admin puede estar cargando el arqueo de otro
      // cliente.
      const local = await fastify.db.local.findUnique({ where: { id: idLocal }, select: { id_app: true } })
      const tipos = await fastify.db.disponibilidadTipo.findMany({
        where: { id: { in: ids }, id_app: local?.id_app ?? '' },
        select: { id: true, nombre: true },
      })
      // Sin esto se podría colgar de un arqueo la cuenta bancaria de otro cliente.
      if (tipos.length !== ids.length) {
        throw Object.assign(new Error('Alguna disponibilidad no es del grupo'), { statusCode: 400 })
      }
      nombrePorId = new Map(tipos.map((t) => [t.id, t.nombre]))
    }

    return lineas.map((d) => ({
      id_disponibilidad: d.id_disponibilidad || null,
      id_tipo: d.id_tipo || null,
      nombre: d.nombre || nombrePorId.get(d.id_disponibilidad) || null,
      monto: String(d.monto ?? 0),
    }))
  }

  // ── POST / ────────────────────────────────────────────────────────────
  // body: { id_local, fecha, caja_fuerte, cofre, adicion, detalles?: [{id_disponibilidad?, id_tipo?, nombre?, monto}] }
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { id_local, fecha, caja_fuerte, cofre, adicion, detalles, observaciones } = request.body
    if (!id_local || !fecha || caja_fuerte == null || cofre == null || adicion == null) {
      return reply.code(400).send({ error: 'id_local, fecha, caja_fuerte, cofre y adicion son requeridos' })
    }
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }

    const fechaArqueo = new Date(fecha)
    const anterior = await getArqueoAnterior(fastify, id_local, fechaArqueo)
    const totalUltimoArqueo = anterior ? Number(anterior.total) : 0
    const fechaDesde = anterior ? anterior.fecha : null

    const total = totalContado({ caja_fuerte, cofre, adicion })
    const ingresos = await calcularIngresos(fastify, id_local, fechaDesde, fechaArqueo)
    const gastos = await calcularGastos(fastify, id_local, fechaDesde, fechaArqueo)
    const comprobacion = calcularComprobacion({ ingresos, gastos, contado: total, contadoAnterior: totalUltimoArqueo })

    const arqueo = await fastify.db.arqueo.create({
      data: {
        id_local,
        fecha: fechaArqueo,
        caja_fuerte: String(caja_fuerte),
        cofre: String(cofre),
        adicion: String(adicion),
        total: String(total),
        ingresos: String(ingresos),
        gastos: String(gastos),
        comprobacion: String(comprobacion),
        observaciones: observaciones?.trim() || null,
        created_by: request.user.id,
        detalles: { create: await lineasDetalle(id_local, detalles) }
      },
      include: { detalles: true }
    })
    return reply.code(201).send(arqueo)
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  // body: { fecha, caja_fuerte, cofre, adicion, detalles?: [{id_tipo?, nombre?, monto}] }
  // Recalcula total/ingresos/gastos/comprobacion de ESTE arqueo con la misma
  // lógica del POST. No recalcula otros arqueos del local.
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existente = await fastify.db.arqueo.findUnique({ where: { id: request.params.id } })
    if (!existente) return reply.code(404).send({ error: 'Arqueo no encontrado' })
    if (!request.allowedLocalIds.includes(existente.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { fecha, caja_fuerte, cofre, adicion, detalles, observaciones } = request.body
    if (!fecha || caja_fuerte == null || cofre == null || adicion == null) {
      return reply.code(400).send({ error: 'fecha, caja_fuerte, cofre y adicion son requeridos' })
    }

    const fechaArqueo = new Date(fecha)
    const anterior = await fastify.db.arqueo.findFirst({
      where: { id_local: existente.id_local, fecha: { lt: fechaArqueo }, id: { not: existente.id } },
      orderBy: { fecha: 'desc' }
    })
    const totalUltimoArqueo = anterior ? Number(anterior.total) : 0
    const fechaDesde = anterior ? anterior.fecha : null

    const total = totalContado({ caja_fuerte, cofre, adicion })
    const ingresos = await calcularIngresos(fastify, existente.id_local, fechaDesde, fechaArqueo)
    const gastos = await calcularGastos(fastify, existente.id_local, fechaDesde, fechaArqueo)
    const comprobacion = calcularComprobacion({ ingresos, gastos, contado: total, contadoAnterior: totalUltimoArqueo })

    const arqueo = await fastify.db.arqueo.update({
      where: { id: existente.id },
      data: {
        fecha: fechaArqueo,
        caja_fuerte: String(caja_fuerte),
        cofre: String(cofre),
        adicion: String(adicion),
        total: String(total),
        ingresos: String(ingresos),
        gastos: String(gastos),
        comprobacion: String(comprobacion),
        observaciones: observaciones?.trim() || null,
        detalles: { deleteMany: {}, create: await lineasDetalle(existente.id_local, detalles) }
      },
      include: { detalles: true }
    })
    return arqueo
  })

  // ── DELETE /:id ───────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existente = await fastify.db.arqueo.findUnique({ where: { id: request.params.id } })
    if (!existente) return reply.code(404).send({ error: 'Arqueo no encontrado' })
    if (!request.allowedLocalIds.includes(existente.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }
    await fastify.db.arqueoDetalle.deleteMany({ where: { id_arqueo: existente.id } })
    await fastify.db.arqueo.delete({ where: { id: existente.id } })
    return reply.code(204).send()
  })
}
