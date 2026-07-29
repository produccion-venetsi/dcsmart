// Validacion de los campos de texto libre de la ficha del local.
//
// Vive aca y no en la ruta porque el frontend renderiza maps_url y menu_url
// como <a href>: dejar pasar un "javascript:" seria un XSS almacenado. El
// filtro de esquema es del backend, no cosmetico del formulario.

const ESQUEMAS_OK = new Set(['http:', 'https:'])

export function normalizarUrl(texto) {
  const limpio = String(texto ?? '').trim()
  if (!limpio) return { ok: true, value: null }

  // Sin esquema asumimos https -- es lo que la gente pega desde el navegador.
  const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(limpio) ? limpio : `https://${limpio}`

  let url
  try {
    url = new URL(conEsquema)
  } catch {
    return { ok: false, error: 'No parece una URL valida' }
  }
  if (!ESQUEMAS_OK.has(url.protocol)) {
    return { ok: false, error: 'Solo se aceptan enlaces http o https' }
  }
  // Un host sin punto ("localhost", o el resultado de tipear una frase) no es
  // un enlace publico util para un local.
  if (!url.hostname.includes('.')) {
    return { ok: false, error: 'No parece una URL valida' }
  }
  return { ok: true, value: url.toString() }
}

export function validarMail(texto) {
  const limpio = String(texto ?? '').trim().toLowerCase()
  if (!limpio) return { ok: true, value: null }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    return { ok: false, error: 'No parece un mail valido' }
  }
  return { ok: true, value: limpio }
}
