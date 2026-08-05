// A quien hay que avisarle cuando se revierte una auditoria.
//
// El estado de auditoria es un historial append-only en la tabla `audits`: cada
// auditar/desauditar inserta una fila nueva. "El auditor" es quien hizo el evento
// `auditado` mas reciente, que por como funciona el toggle es exactamente la
// auditoria que se acaba de revertir (un `desauditado` solo puede seguir a un
// `auditado`).
//
// IMPORTANTE — se llama DESPUES del commit, con el `desauditado` nuevo ya en el
// historial. Por eso NO alcanza con mirar el ultimo evento: el ultimo es siempre
// el desauditado recien creado. Hay que buscar el ultimo `auditado`.
//
// Funcion pura: no lee ni escribe la base. El llamador le pasa el historial (ver
// lib/avisos.js, que es el que tiene el efecto de lado).

export function destinatarioDeAviso({ historial, quienDesaudita } = {}) {
  const auditados = (historial ?? [])
    // Sin fecha no se puede ordenar, y una fila asi no deberia poder decidir quien
    // es el auditor: se descarta en vez de romper el orden.
    .filter(e => e?.fecha != null && e.accion === 'auditado')
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  const ultimoAuditado = auditados[0]
  if (!ultimoAuditado?.id_user) return null
  // Avisarle a alguien de su propia accion es ruido.
  if (ultimoAuditado.id_user === quienDesaudita) return null
  return ultimoAuditado.id_user
}
