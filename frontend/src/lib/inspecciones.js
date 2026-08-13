// Carpeta de inspecciones, para la pantalla.
//
// Espejo de backend/src/lib/inspecciones.js: los estados y el reordenamiento son los
// mismos, y hay un test de contrato que falla si divergen. Acá viven además los colores,
// que el backend no tiene por qué conocer.
//
// LA REGLA: los seis estados se eligen a mano. VENCIDO y PROX_VENC NO se deducen de la
// fecha aunque se podría (documentos.js sí lo hace) -- el criterio de "próximo" lo pone
// quien controla la carpeta. `vence` es informativo.

export const ESTADOS = ['OK', 'VENCIDO', 'EN_ESPERA', 'FALTA', 'REVISAR', 'PROX_VENC']

// El orden de esta lista es el de los chips de arriba: primero lo que pide acción.
export const ORDEN_TABLERO = ['VENCIDO', 'PROX_VENC', 'FALTA', 'REVISAR', 'EN_ESPERA', 'OK']

export const ESTADO_INFO = {
  OK:        { label: 'OK',          badge: 'badge-green',  color: 'var(--green)',  ayuda: 'Presentado y al día.' },
  VENCIDO:   { label: 'Vencido',     badge: 'badge-red',    color: 'var(--red)',    ayuda: 'Se pasó la fecha y hay que renovarlo.' },
  EN_ESPERA: { label: 'En espera',   badge: 'badge-blue',   color: 'var(--blue)',   ayuda: 'Ya se pidió y falta que lo entreguen.' },
  FALTA:     { label: 'Falta',       badge: 'badge-red',    color: 'var(--red)',    ayuda: 'Todavía no se hizo nada.' },
  REVISAR:   { label: 'Revisar',     badge: 'badge-purple', color: 'var(--purple)', ayuda: 'Hay algo para chequear antes de darlo por cerrado.' },
  PROX_VENC: { label: 'Próx. venc.', badge: 'badge-amber',  color: 'var(--amber)',  ayuda: 'Está por vencer.' },
}

// Los que piden acción. Mismo criterio que el backend: EN_ESPERA no está porque ya se
// gestionó, y OK tampoco.
export const ESTADOS_ABIERTOS = ['VENCIDO', 'FALTA', 'REVISAR', 'PROX_VENC']

export const etiquetaEstado = (e) => ESTADO_INFO[e]?.label ?? e ?? '—'
export const badgeEstado    = (e) => ESTADO_INFO[e]?.badge ?? 'badge-muted'
export const colorEstado    = (e) => ESTADO_INFO[e]?.color ?? 'var(--t2)'
export const ayudaEstado    = (e) => ESTADO_INFO[e]?.ayuda ?? ''

export const esEstadoAbierto = (e) => ESTADOS_ABIERTOS.includes(e)

// ── Orden ────────────────────────────────────────────────────────────────────
//
// Copia exacta de moverEnLista/moverUno del backend. Está duplicado a propósito: la
// pantalla necesita mover la fila y pintar el resultado ANTES de que conteste el servidor
// (si no, arrastrar se siente roto), y el servidor necesita la misma regla para validar.

export function moverEnLista(ids, desde, hasta) {
  const l = [...(ids ?? [])]
  if (!Number.isInteger(desde) || !Number.isInteger(hasta)) return l
  if (desde < 0 || desde >= l.length) return l
  const dest = Math.max(0, Math.min(l.length - 1, hasta))
  const [x] = l.splice(desde, 1)
  l.splice(dest, 0, x)
  return l
}

export function moverUno(ids, id, direccion) {
  const l = [...(ids ?? [])]
  const i = l.indexOf(id)
  if (i === -1) return l
  return moverEnLista(l, i, i + (direccion === 'arriba' ? -1 : 1))
}

// Reordena la lista de folios (los objetos, no los ids) y les reescribe el número, para
// pintar el resultado sin esperar al servidor.
export function reordenarFolios(folios, desde, hasta) {
  const ids = moverEnLista((folios ?? []).map((f) => f.id), desde, hasta)
  const porId = new Map((folios ?? []).map((f) => [f.id, f]))
  return ids.map((id, i) => ({ ...porId.get(id), folio: i + 1 }))
}

export function subirBajarFolio(folios, id, direccion) {
  const ids = moverUno((folios ?? []).map((f) => f.id), id, direccion)
  const porId = new Map((folios ?? []).map((f) => [f.id, f]))
  return ids.map((x, i) => ({ ...porId.get(x), folio: i + 1 }))
}

// ── Textos ───────────────────────────────────────────────────────────────────

// Qué decir arriba de la planilla. Un "12 folios" pelado no dice si hay algo para hacer.
export function resumenCarpeta({ total = 0, abiertos = 0 } = {}) {
  if (total === 0) return 'La carpeta está vacía.'
  const f = `${total} ${total === 1 ? 'folio' : 'folios'}`
  if (abiertos === 0) return `${f}, todo al día.`
  return `${f}, ${abiertos} ${abiertos === 1 ? 'pide' : 'piden'} atención.`
}

// Cómo se describe un evento del historial en una línea.
export function textoEvento(ev) {
  const quien = ev?.user?.nombre || ev?.user?.email || 'alguien'
  const accion = ev?.accion === 'creado' ? 'creó el folio'
    : ev?.accion === 'eliminado' ? 'eliminó el folio'
    : 'editó'
  return ev?.motivo ? `${quien} ${accion}: ${ev.motivo}` : `${quien} ${accion}`
}
