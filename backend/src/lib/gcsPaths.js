// Helpers de rutas de Google Cloud Storage.
//
// Estaban dentro de routes/pagos.js; se extrajeron cuando los locales
// necesitaron subir el logo con el mismo criterio de carpetas y el mismo
// proxy de lectura.
//
// sanitizeFolderName se mantiene byte por byte como estaba: los adjuntos ya
// subidos viven en carpetas calculadas con esta funcion, asi que cambiarla
// (aunque sea para "mejorarla" a minusculas) mandaria los archivos nuevos a
// una carpeta distinta de los viejos.

// El nombre del local se usa como carpeta en GCS -- se sanitiza para evitar
// que caracteres raros (o un intento de path traversal via "../") rompan
// la ruta del archivo dentro del bucket.
export function sanitizeFolderName(nombre) {
  const limpio = String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  return limpio || 'general'
}

// "gs://bucket/carpeta/archivo.png" -> { bucket, filePath }. null si no es una
// ruta gs:// completa (sin bucket, sin archivo, u otro esquema).
export function parseGsPath(gsPath) {
  if (typeof gsPath !== 'string' || !gsPath.startsWith('gs://')) return null
  const sinEsquema = gsPath.slice('gs://'.length)
  const corte      = sinEsquema.indexOf('/')
  if (corte <= 0 || corte === sinEsquema.length - 1) return null
  return { bucket: sinEsquema.slice(0, corte), filePath: sinEsquema.slice(corte + 1) }
}

const CONTENT_TYPES = {
  png:  'image/png',
  webp: 'image/webp',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  pdf:  'application/pdf',
}

export function contentTypePorExt(ext) {
  return CONTENT_TYPES[String(ext || '').toLowerCase()] || 'application/octet-stream'
}
