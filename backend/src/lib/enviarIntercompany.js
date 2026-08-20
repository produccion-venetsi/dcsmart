// Crear el espejo de una op en otro local. Vive acá y no en la ruta porque hay
// DOS caminos que lo hacen y tienen que comportarse igual:
//
//   - Al CARGAR el pago: el formulario marca "es un envío a otro local" y elige
//     el destino, y la copia nace junto con la op.
//   - Desde la pantalla de Intercompany: para las ops que ya estaban cargadas.
//
// Recibe el cliente de Prisma (o el `tx` de una transacción) para no atarse a
// fastify: las reglas puras siguen en lib/intercompany.js.

import { motivoNoEnviable, motivoDestinoInvalido, datosCopiaIntercompany } from './intercompany.js'

// Lanza un Error con `.statusCode` para que la ruta lo traduzca sin adivinar.
function rechazar(status, mensaje) {
  const err = new Error(mensaje)
  err.statusCode = status
  return err
}

// `locales` son los del grupo activo a los que llega quien pide:
// [{ id, nombre, id_app }]. Es contra esa lista que se valida el destino.
export async function crearCopiaIntercompany(db, { pago, idDestino, locales, userId }) {
  if (!locales.some((l) => l.id === pago.id_local)) {
    throw rechazar(403, 'Sin acceso al local que envía')
  }
  const motivo = motivoNoEnviable(pago)
  if (motivo) throw rechazar(400, motivo)

  const motivoDestino = motivoDestinoInvalido(pago, idDestino, locales)
  if (motivoDestino) throw rechazar(400, motivoDestino)

  const yaEnviada = await db.pago.findFirst({
    where: { id_pago_origen: pago.id },
    select: { id: true },
  })
  if (yaEnviada) {
    throw rechazar(409, 'Esta op ya se envió. Revertí el envío si querés cambiar el destino.')
  }

  const nombreOrigen = locales.find((l) => l.id === pago.id_local)?.nombre ?? 'otro local'

  // La numeración del local que recibe y la copia van juntas: dos envíos
  // simultáneos al mismo local no pueden quedarse con el mismo nro_ord.
  return db.$transaction(async (tx) => {
    const ultimo = await tx.pago.findFirst({
      where: { id_local: idDestino, nro_ord: { not: null } },
      orderBy: { nro_ord: 'desc' },
      select: { nro_ord: true },
    })
    return tx.pago.create({
      data: {
        ...datosCopiaIntercompany(pago, {
          idDestino,
          nombreOrigen,
          nroOrd: (ultimo?.nro_ord ?? 0) + 1,
        }),
        created_by: userId,
      },
      select: {
        id: true, nro_ord: true, id_local: true, importe: true,
        local: { select: { id: true, nombre: true } },
      },
    })
  })
}

// Los locales del grupo activo a los que llega quien pregunta. Misma consulta
// para las dos vías: si un local no está acá, o no es del grupo o el usuario no
// tiene acceso, y en los dos casos no se puede enviar.
export function localesDelGrupo(db, request) {
  return db.local.findMany({
    where: { id: { in: request.allowedLocalIds }, id_app: request.activeAppId },
    select: { id: true, nombre: true, id_app: true },
    orderBy: { nombre: 'asc' },
  })
}
