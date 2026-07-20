// Persistencia de borradores de formulario en sessionStorage.
//
// Existe porque en Android, cuando el usuario sale de la PWA para sacar una
// foto con la cámara nativa (a través de <input type="file" capture>), Chrome
// puede matar el proceso de la pestaña por presión de memoria. Al volver, la
// página se recarga por completo (nuevo bundle, nuevo árbol de React), y todo
// lo que vivía en useState se pierde. Este helper guarda un snapshot del
// formulario (incluyendo archivos, codificados en base64) para poder
// restaurarlo al montar de nuevo el componente.
//
// Los File no son serializables directamente: se guardan como
// { __file: true, name, type, base64 } y se reconstruyen con fileFromDraft().

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function dataUrlToFile(dataUrl, name, type) {
  const [, base64] = dataUrl.split(',')
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name, { type })
}

// Serializa un objeto plano, convirtiendo cualquier File presente (en el
// nivel superior) a su forma persistible. `files` es un mapa { key: File|null }.
export async function saveDraft(key, data, files = {}) {
  try {
    const serializedFiles = {}
    for (const [fkey, file] of Object.entries(files)) {
      if (file instanceof File) {
        serializedFiles[fkey] = { __file: true, name: file.name, type: file.type, base64: await fileToDataUrl(file) }
      }
    }
    sessionStorage.setItem(key, JSON.stringify({ data, files: serializedFiles, savedAt: Date.now() }))
  } catch {
    // sessionStorage lleno (foto muy pesada) o no disponible: no rompemos el flujo normal por esto.
  }
}

// Devuelve { data, files } donde files es { key: File } ya reconstruido, o null si no hay borrador.
export function loadDraft(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const files = {}
    for (const [fkey, f] of Object.entries(parsed.files || {})) {
      if (f?.__file) files[fkey] = dataUrlToFile(f.base64, f.name, f.type)
    }
    return { data: parsed.data, files }
  } catch {
    return null
  }
}

export function clearDraft(key) {
  try { sessionStorage.removeItem(key) } catch { /* noop */ }
}
