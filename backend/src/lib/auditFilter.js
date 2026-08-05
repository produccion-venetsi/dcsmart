// Filtro de pantalla "Auditado / No auditado", compartido por pagos y cajas.
//
// El estado de auditoría no es una columna del registro: vive en la tabla
// `audits` (tabla + id_registro, sin FK, porque la misma tabla sirve a pagos,
// cajas y arqueos). Al no haber relación, Prisma no puede expresarlo como un
// filtro anidado y hay que traer los ids auditados y armar un IN / NOT IN.
//
// ── Por qué la lista se recorta al scope de locales ──────────────────────────
//
// Podría parecer redundante (el `where` final ya filtra por `id_local`, así que
// un id auditado de otro local no cambiaría el resultado), pero NO lo es: el
// recorte es lo que mantiene la lista por debajo del techo de bind variables de
// Postgres. Sin recortar son 49.486 ids, y Prisma los expande a un parámetro por
// id: la consulta muere con P2035 "too many bind variables in prepared
// statement" / P2029 "query parameter limit exceeded". Con el recorte son los de
// un local (cada app tiene uno), que sí entra.
//
// Lo que sí era desperdicio es CÓMO se recortaba: la versión anterior traía
// todos los ids de pagos del scope a Node y los devolvía a la base dentro de un
// IN — 53.561 uuids ida y vuelta, ~2,4 s medidos, para algo que la base resuelve
// sola con un EXISTS. Eso es lo que se cambió acá.

// `audit` llega del query string: 'true', 'false' o undefined (sin filtrar).
export function filtroPorAuditoria(audit, auditedIds) {
  if (audit === undefined) return {}
  // El historial es append-only: un mismo registro puede tener varias filas en
  // `audits`, así que la lista viene con repetidos.
  const ids = [...new Set(auditedIds)]
  if (audit === 'true') return { id: { in: ids } }
  // Sin nada auditado, "no auditado" es todo: se devuelve {} en vez de
  // `notIn: []`, que dejaría que Prisma decida qué hacer con una lista vacía.
  if (!ids.length) return {}
  return { id: { notIn: ids } }
}

// Trae los ids auditados de la tabla pedida, ya recortados a los locales del
// usuario, en UNA consulta y sin mandar ids desde Node. El EXISTS se apoya en
// audits_tabla_id_registro_vigente_idx y en pagos_id_local_fecha_idx /
// cajas_id_local_fecha_inicio_idx.
//
// El nombre de la tabla nunca se interpola: son dos consultas literales
// separadas, elegidas por un switch.
async function consultarIdsAuditados(fastify, tabla, localIds) {
  if (tabla === 'pagos') {
    return fastify.db.$queryRaw`
      SELECT a.id_registro FROM audits a
      WHERE a.tabla = 'pagos' AND a.audit_dc = false AND a.vigente = true
        AND a.accion = 'auditado'
        AND EXISTS (
          SELECT 1 FROM pagos p
          WHERE p.id = a.id_registro AND p.id_local = ANY(${localIds}::text[])
        )`
  }
  if (tabla === 'cajas') {
    return fastify.db.$queryRaw`
      SELECT a.id_registro FROM audits a
      WHERE a.tabla = 'cajas' AND a.audit_dc = false AND a.vigente = true
        AND a.accion = 'auditado'
        AND EXISTS (
          SELECT 1 FROM cajas c
          WHERE c.id = a.id_registro AND c.id_local = ANY(${localIds}::text[])
        )`
  }
  throw new Error(`tabla no soportada en el filtro de auditoría: ${tabla}`)
}

// Ante un error de la tabla `audits` devuelve {} (sin filtrar) en vez de romper
// el listado entero, igual que hacía la versión anterior.
export async function buildAuditFilter(fastify, audit, tabla, allowedLocalIds) {
  if (audit === undefined) return {}
  if (!allowedLocalIds?.length) return filtroPorAuditoria(audit, [])
  try {
    const rows = await consultarIdsAuditados(fastify, tabla, allowedLocalIds)
    return filtroPorAuditoria(audit, rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err, tabla }, 'No se pudo leer la tabla audits (buildAuditFilter)')
    return {}
  }
}
