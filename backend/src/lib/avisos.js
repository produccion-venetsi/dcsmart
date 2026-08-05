// Escritura de avisos. La decision de A QUIEN avisarle es pura y vive en
// notificacionDesauditado.js; aca esta el efecto de lado.
//
// Un fallo NUNCA puede hacer fallar la operacion que lo dispara: mismo criterio
// que logActivity en routes/pagos.js. Si no se puede avisar, se loguea y sigue --
// perder un aviso es molesto, no poder desauditar es un bloqueo.

import { destinatarioDeAviso } from './notificacionDesauditado.js'

// IMPORTANTE: llamar DESPUES de que la transaccion del desauditar hizo commit.
// Este helper lee el historial de `audits` y necesita ver el evento nuevo para
// decidir bien, sobre todo en la cascada de audit-dc.
export async function avisarDesauditado(fastify, { tabla, id_registro, id_local, quienDesaudita, etiqueta }) {
  try {
    // Solo el circuito normal (audit_dc: false): el circuito DC es interno de
    // DCSmart y no genera avisos hacia el auditor del local.
    const historial = await fastify.db.audit.findMany({
      where: { tabla, id_registro, audit_dc: false },
      select: { accion: true, id_user: true, fecha: true }
    })

    const id_user = destinatarioDeAviso({ historial, quienDesaudita })
    if (!id_user) return

    await fastify.db.notificacion.create({
      data: {
        id_user,
        tipo: 'desauditado',
        titulo: `Se revirtió una auditoría: ${etiqueta}`,
        cuerpo: null,
        tabla,
        id_registro,
        id_local
      }
    })
  } catch (err) {
    fastify.log.error({ err, tabla, id_registro }, 'No se pudo crear el aviso de desauditado')
  }
}
