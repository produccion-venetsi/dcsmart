// Parseo central de montos y enteros que llegan por la API.
//
// El problema que resuelve: las rutas usaban `x ? parseFloat(x) : null`, que
// tiene dos fallas reales en prod -- un 0 legítimo se guardaba como null
// (turnos que cierran en cero) y un valor no numérico pasaba como NaN hasta
// explotar en Prisma con un 500 sin mensaje. Acá el contrato es explícito:
// vacío es null (o error si es requerido), inválido es SIEMPRE error 400.

// Tope de sanidad: nada en este sistema mueve billones. Un monto más grande
// es un dedo de más o un payload malicioso, no un dato.
const MAX_ABS = 1e12

function esVacio(v) {
  return v === undefined || v === null || v === ''
}

// parseMonto(v, { requerido, positivo }) -> { ok: true, value } | { ok: false, error }
export function parseMonto(v, { requerido = false, positivo = false, campo = 'monto' } = {}) {
  if (esVacio(v)) {
    if (requerido) return { ok: false, error: `${campo} es requerido` }
    return { ok: true, value: null }
  }
  if (typeof v !== 'number' && typeof v !== 'string') {
    return { ok: false, error: `${campo} debe ser numérico` }
  }
  // Number() y no parseFloat(): '12abc' tiene que ser error, no 12.
  const n = Number(v)
  if (!Number.isFinite(n)) return { ok: false, error: `${campo} debe ser numérico` }
  if (Math.abs(n) > MAX_ABS) return { ok: false, error: `${campo} está fuera de rango` }
  if (positivo && n < 0) return { ok: false, error: `${campo} no puede ser negativo` }
  return { ok: true, value: n }
}

// parseEntero(v, { requerido }) -> { ok: true, value } | { ok: false, error }
export function parseEntero(v, { requerido = false, campo = 'valor' } = {}) {
  if (esVacio(v)) {
    if (requerido) return { ok: false, error: `${campo} es requerido` }
    return { ok: true, value: null }
  }
  if (typeof v !== 'number' && typeof v !== 'string') {
    return { ok: false, error: `${campo} debe ser un número entero` }
  }
  const num = Number(v)
  if (!Number.isFinite(num)) return { ok: false, error: `${campo} debe ser un número entero` }
  const n = Math.trunc(num)
  if (Math.abs(n) > MAX_ABS) return { ok: false, error: `${campo} está fuera de rango` }
  return { ok: true, value: n }
}
