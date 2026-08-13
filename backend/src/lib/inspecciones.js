// Carpeta de inspecciones: los estados y el orden de los folios.
//
// Vive dentro del módulo Documentos pero no es un Documento: un documento es un archivo
// con nombre y vencimiento, esto es una planilla de control. La "carpeta" no es una fila
// en ninguna tabla, es la agrupación por local.
//
// ── Los estados se eligen a mano ─────────────────────────────────────────────
//
// Seis estados, y NINGUNO se deduce de la fecha, aunque VENCIDO y PROX_VENC se podrían
// calcular (`lib/documentos.js` ya hace eso para los documentos). Es una decisión del
// usuario: el criterio de "próximo a vencer" lo pone quien controla la carpeta y no
// siempre son los mismos días. Un folio puede tener fecha y estar EN_ESPERA porque
// todavía no llegó el certificado, o estar OK sin fecha porque no vence nunca.
//
// `vence` queda como dato informativo de la columna, no como fuente del estado.

export const ESTADOS = ['OK', 'VENCIDO', 'EN_ESPERA', 'FALTA', 'REVISAR', 'PROX_VENC']

// Cómo se escribe cada uno en pantalla. El enum de Postgres guarda EN_ESPERA y PROX_VENC
// con guion bajo porque un enum no lleva espacios; la etiqueta es la que se lee.
export const ETIQUETA_ESTADO = {
  OK: 'OK',
  VENCIDO: 'Vencido',
  EN_ESPERA: 'En espera',
  FALTA: 'Falta',
  REVISAR: 'Revisar',
  PROX_VENC: 'Próx. venc.',
}

// Qué significa cada uno, para el title de la pantalla. Un estado de una palabra sin
// explicación se usa distinto en cada local.
export const AYUDA_ESTADO = {
  OK: 'Presentado y al día.',
  VENCIDO: 'Se pasó la fecha y hay que renovarlo.',
  EN_ESPERA: 'Ya se pidió y falta que lo entreguen.',
  FALTA: 'Todavía no se hizo nada.',
  REVISAR: 'Hay algo para chequear antes de darlo por cerrado.',
  PROX_VENC: 'Está por vencer.',
}

// Los que piden acción. Sirve para el contador de la carpeta: entrar a una planilla de 40
// folios sin saber cuántos están abiertos obliga a recorrerla entera.
export const ESTADOS_ABIERTOS = ['VENCIDO', 'FALTA', 'REVISAR', 'PROX_VENC']

export const esEstadoValido = (v) => ESTADOS.includes(v)

// El estado que llega por API, normalizado. Se aceptan las formas que escribiría una
// persona ("prox venc", "En Espera", "PROX-VENC") porque el enum es feo de tipear y esto
// también lo consume la carga por API.
export function normalizarEstado(valor) {
  if (!valor) return null
  const v = String(valor).trim().toUpperCase().replace(/[\s.-]+/g, '_').replace(/_+$/, '')
  if (ESTADOS.includes(v)) return v
  // "PROXIMO_VENCIMIENTO", "PROX_VENCIMIENTO" y variantes.
  if (/^PROX/.test(v)) return 'PROX_VENC'
  if (/^EN_?ESPERA$/.test(v)) return 'EN_ESPERA'
  return null
}

export function contarPorEstado(folios) {
  const out = {}
  for (const e of ESTADOS) out[e] = 0
  for (const f of folios ?? []) {
    const e = normalizarEstado(f?.estado)
    if (e) out[e] += 1
  }
  return out
}

export const contarAbiertos = (folios) =>
  (folios ?? []).filter((f) => ESTADOS_ABIERTOS.includes(normalizarEstado(f?.estado))).length

// ── El orden ─────────────────────────────────────────────────────────────────
//
// El número de folio lo maneja la persona: en la pantalla se arrastra la fila. Lo que
// llega del navegador es la lista de ids en el orden nuevo, y acá se traduce a los
// números que hay que guardar.
//
// Se renumera SIEMPRE de 1 a N, en vez de intercambiar los dos números involucrados. Es
// más escrituras pero deja la planilla sin huecos ni repetidos después de cualquier
// movimiento, borrado o alta; el intercambio conserva los huecos que ya había y termina
// en una lista con 1, 2, 4, 7 que nadie sabe por qué.

// Los números que corresponden a una lista de ids ya ordenada.
// Devuelve [{ id, folio }] con folio de 1 a N.
export function numerarDesdeOrden(idsOrdenados) {
  return (idsOrdenados ?? []).map((id, i) => ({ id, folio: i + 1 }))
}

// Mover un folio de una posición a otra, dentro de la lista de ids actual.
// `desde` y `hasta` son índices base 0. Devuelve la lista reordenada.
export function moverEnLista(ids, desde, hasta) {
  const l = [...(ids ?? [])]
  if (!Number.isInteger(desde) || !Number.isInteger(hasta)) return l
  if (desde < 0 || desde >= l.length) return l
  // Un destino fuera de rango se pega al extremo en vez de perder el elemento.
  const dest = Math.max(0, Math.min(l.length - 1, hasta))
  const [x] = l.splice(desde, 1)
  l.splice(dest, 0, x)
  return l
}

// Sube o baja un folio una posición. Es el equivalente por teclado del arrastre: sin
// esto la planilla solo se puede ordenar con el mouse.
export function moverUno(ids, id, direccion) {
  const l = [...(ids ?? [])]
  const i = l.indexOf(id)
  if (i === -1) return l
  return moverEnLista(l, i, i + (direccion === 'arriba' ? -1 : 1))
}

// Valida la lista de ids que manda el navegador contra la que hay en la base.
//
// Tiene que ser una permutación exacta: mismos ids, sin faltantes ni agregados. Si el
// navegador tenía la planilla vieja (alguien agregó un folio desde otra pantalla) y se
// aceptara la lista igual, el folio nuevo quedaría sin número o se borraría del orden.
//
// Devuelve el mensaje de error, o null si está bien.
export function validarOrden(idsRecibidos, idsEnBase) {
  const rec = idsRecibidos ?? []
  const base = idsEnBase ?? []
  if (!Array.isArray(idsRecibidos)) return 'Hay que mandar la lista de folios en el orden nuevo'
  if (new Set(rec).size !== rec.length) return 'La lista trae folios repetidos'
  if (rec.length !== base.length) {
    return `La planilla cambió mientras la ordenabas: tiene ${base.length} folios y llegaron ${rec.length}. Recargá y volvé a intentar.`
  }
  const enBase = new Set(base)
  const ajeno = rec.find((id) => !enBase.has(id))
  if (ajeno) return `El folio ${ajeno} no es de esta carpeta`
  return null
}

// ── Alta ─────────────────────────────────────────────────────────────────────

// El número del folio nuevo: al final de la planilla. `max` es el mayor que ya existe.
export const siguienteFolio = (max) => (Number.isFinite(Number(max)) ? Number(max) : 0) + 1

// Devuelve el mensaje de error, o null.
export function validarFolio({ concepto, estado }) {
  if (!String(concepto ?? '').trim()) return 'El concepto es obligatorio'
  if (estado != null && estado !== '' && !normalizarEstado(estado)) {
    return `Estado inválido. Use: ${ESTADOS.join(', ')}`
  }
  return null
}

// ── Fecha ────────────────────────────────────────────────────────────────────
// Mismo criterio que documentos.js: `vence` es una columna DATE, así que se guarda y se
// devuelve como 'YYYY-MM-DD' y nunca se construye un Date desde el string en el
// navegador (corre el día en GMT-3).
export const fechaISO = (d) => {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

// ── Período ──────────────────────────────────────────────────────────────────
//
// El período es un mes, no un día. Se guarda el día 1 (igual que Pago.periodo) y en la API
// viaja como 'YYYY-MM', que es lo que entiende un <input type="month">.
export const periodoISO = (d) => {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 7)
  return d.toISOString().slice(0, 7)
}

// Acepta 'YYYY-MM' (lo que manda el input month) y 'YYYY-MM-DD' (por si llega una fecha
// completa desde una carga por API). Devuelve el día 1 del mes.
export function periodoParaGuardar(valor) {
  if (valor === null || valor === '' || valor === undefined) return null
  const s = String(valor).trim()
  const m = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (!m) return undefined // undefined = invalido, lo rechaza la ruta
  const mes = Number(m[2])
  if (mes < 1 || mes > 12) return undefined
  return new Date(Date.UTC(Number(m[1]), mes - 1, 1))
}

export function fechaParaGuardar(valor) {
  if (valor === null || valor === '' || valor === undefined) return null
  const s = String(valor).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined // undefined = invalido, lo rechaza la ruta
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
