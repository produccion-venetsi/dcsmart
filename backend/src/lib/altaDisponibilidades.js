// Con qué disponibilidades arranca un local: las del CATALOGO_INICIAL.
//
// Un local que abre el arqueo con la lista vacía no puede cargar la plata que
// no está en el cajón, y no hay ninguna pista de que eso se configure en la
// ficha del local. Arrancar con Mercado Pago, dólares y transferencia es lo que
// usa casi todo el mundo: el que tenga otra cosa la destilda una vez.
//
// Vive aparte de lib/disponibilidades.js porque ese archivo está espejado en el
// frontend y no puede tocar la base.

import { CATALOGO_INICIAL } from './disponibilidades.js'

// Crea en el grupo los conceptos del catálogo inicial que falten. No pisa los
// que ya están: si alguien renombró u ordenó algo a mano, queda como está.
export async function asegurarCatalogo(db, id_app) {
  const tipos = []
  for (const c of CATALOGO_INICIAL) {
    tipos.push(await db.disponibilidadTipo.upsert({
      where:  { nombre_id_app: { nombre: c.nombre, id_app } },
      create: { id_app, nombre: c.nombre, familia: c.familia, orden: c.orden },
      update: {},
      select: { id: true, nombre: true },
    }))
  }
  return tipos
}

// Activa el catálogo inicial en un local. Suma, nunca saca: un local que ya
// tenía cuentas elegidas (o una heredada de sus arqueos viejos) las conserva.
// Devuelve cuántas quedaron nuevas, para poder loguear el backfill.
export async function activarDefaultEnLocal(db, { id_local, id_app }) {
  const tipos = await asegurarCatalogo(db, id_app)
  const previas = new Set(
    (await db.localDisponibilidad.findMany({ where: { id_local }, select: { id_tipo: true } }))
      .map((d) => d.id_tipo)
  )
  const nuevas = tipos.filter((t) => !previas.has(t.id))
  for (const t of nuevas) {
    await db.localDisponibilidad.upsert({
      where:  { id_local_id_tipo: { id_local, id_tipo: t.id } },
      create: { id_local, id_tipo: t.id },
      update: {},
    })
  }
  return { activadas: nuevas.map((t) => t.nombre), yaTenia: previas.size }
}
