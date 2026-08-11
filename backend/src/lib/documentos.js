// Reglas de la tabla de Documentos: íconos válidos, vencimientos y visibilidad.
//
// Todo lo que decide algo vive acá y se testea sin base ni HTTP. Las rutas se quedan
// con las consultas.

import { randomBytes } from 'node:crypto'

// ── Íconos ───────────────────────────────────────────────────────────────────
//
// Los tipos guardan una CLAVE de esta lista, no un emoji ni una clase de CSS. Con
// texto libre el día que se cambie la librería de íconos hay que migrar datos, y un
// tipo con "fa-file-pdf" guardado no se puede dibujar con otra cosa.
//
// El dibujo de cada uno vive en el frontend (components/IconoDocumento.jsx). Acá solo
// están las claves y su nombre, que es lo que el backend necesita para validar.
export const ICONOS = [
  { clave: 'documento',    label: 'Documento' },
  { clave: 'contrato',     label: 'Contrato' },
  { clave: 'habilitacion', label: 'Habilitación' },
  { clave: 'reporte',      label: 'Reporte' },
  { clave: 'certificado',  label: 'Certificado' },
  { clave: 'plano',        label: 'Plano' },
  { clave: 'foto',         label: 'Foto' },
  { clave: 'link',         label: 'Link' },
  { clave: 'factura',      label: 'Factura' },
  { clave: 'seguro',       label: 'Seguro' },
  { clave: 'impuesto',     label: 'Impuesto' },
  { clave: 'carpeta',      label: 'Carpeta' },
]

export const ICONO_DEFAULT = 'documento'

export const CLAVES_ICONO = ICONOS.map(i => i.clave)

export const esIconoValido = (v) => CLAVES_ICONO.includes(String(v ?? '').trim())

// Un ícono desconocido no tumba la pantalla: cae en el default. Se usa al leer datos
// viejos; al escribir se valida y se rechaza (ver rutas).
export const normalizarIcono = (v) => (esIconoValido(v) ? String(v).trim() : ICONO_DEFAULT)

// ── Archivos ─────────────────────────────────────────────────────────────────

// Qué se puede subir. Es más amplio que los adjuntos de pagos (que son solo
// comprobantes): acá entran planillas y documentos de texto porque un contrato llega
// en Word tan seguido como en PDF.
export const EXTENSIONES = new Set([
  'pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic',
  'doc', 'docx', 'xls', 'xlsx', 'csv',
])

const EXT_IMAGEN = new Set(['png', 'jpg', 'jpeg', 'webp', 'heic'])

// 'foto' se muestra en el visor de imágenes; 'pdf' abre el visor de PDF; el resto se
// baja. Se guarda al subir para no tener que adivinar por la extensión en cada lectura.
export function tipoDeArchivo(nombreOExt) {
  const ext = String(nombreOExt ?? '').split('.').pop().toLowerCase()
  if (EXT_IMAGEN.has(ext)) return 'foto'
  if (ext === 'pdf') return 'pdf'
  return 'archivo'
}

export const extensionPermitida = (nombre) =>
  EXTENSIONES.has(String(nombre ?? '').split('.').pop().toLowerCase())

// ── Link público ─────────────────────────────────────────────────────────────

// El token ES el secreto: quien lo tiene abre el archivo sin login. 32 bytes de
// randomBytes son 64 caracteres hex, imposibles de adivinar por fuerza bruta.
//
// No se deriva del id del documento: si se derivara, tener un link daría los demás.
export const nuevoToken = () => randomBytes(32).toString('hex')

// ── Vencimientos ─────────────────────────────────────────────────────────────

// Cuántos días antes se avisa. Un mes es lo que tarda una habilitación en renovarse.
export const DIAS_AVISO = 30

// Días hasta el vencimiento. Negativo = ya venció. null si no vence.
//
// Se compara por día calendario, sin horas: un documento que vence hoy tiene que decir
// "vence hoy" a las 9 de la mañana y a las 11 de la noche.
export function diasParaVencer(vence, hoy = new Date()) {
  const iso = fechaISO(vence)
  if (!iso) return null
  const [a, m, d] = iso.split('-').map(Number)
  const finVence = Date.UTC(a, m - 1, d)
  const finHoy = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.round((finVence - finHoy) / 86400000)
}

// 'vencido' | 'por-vencer' | 'vigente' | null (no vence).
export function estadoVencimiento(vence, hoy = new Date(), diasAviso = DIAS_AVISO) {
  const dias = diasParaVencer(vence, hoy)
  if (dias === null) return null
  if (dias < 0) return 'vencido'
  if (dias <= diasAviso) return 'por-vencer'
  return 'vigente'
}

// Cómo se lee el vencimiento en pantalla. Se escribe una sola vez acá para que la
// tabla, el aviso y el detalle digan lo mismo.
export function textoVencimiento(vence, hoy = new Date()) {
  const dias = diasParaVencer(vence, hoy)
  if (dias === null) return ''
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  if (dias === -1) return 'Venció ayer'
  if (dias < 0) return `Venció hace ${Math.abs(dias)} días`
  return `Vence en ${dias} días`
}

// ¿Hay que avisar de este documento?
//
// `avisado_hasta` guarda el vencimiento por el que ya se avisó, no una fecha de envío:
// así, si alguien renueva la habilitación y corre el vencimiento, el aviso vuelve a
// salir para el vencimiento nuevo sin tener que borrar nada a mano.
export function hayQueAvisar(doc, hoy = new Date(), diasAviso = DIAS_AVISO) {
  const estado = estadoVencimiento(doc?.vence, hoy, diasAviso)
  if (estado !== 'vencido' && estado !== 'por-vencer') return false
  return fechaISO(doc?.avisado_hasta) !== fechaISO(doc?.vence)
}

// El texto del aviso. Dice el nombre y el local, porque llega a alguien que maneja
// varios y "Vence Habilitación" sin más no le dice de dónde.
export function textoAviso(doc, hoy = new Date()) {
  const donde = doc?.local?.nombre ?? doc?.app?.nombre ?? null
  const que = doc?.tipo?.nombre ? `${doc.tipo.nombre}: ${doc.nombre}` : doc?.nombre
  return {
    titulo: `${textoVencimiento(doc?.vence, hoy)} — ${que}`,
    cuerpo: donde ? `Documento de ${donde}` : null,
  }
}

// ── Visibilidad ──────────────────────────────────────────────────────────────

// Roles que ven TODOS los documentos del local, incluidos los no marcados como
// visibles para todos. Espeja la idea de "roles internos" del resto del proyecto: el
// cajero carga plata, no tiene por qué ver un contrato de alquiler.
export const ROLES_VEN_TODO = ['super_admin', 'dcsmart', 'admin', 'externo']

export const veTodosLosDocumentos = (rol) => ROLES_VEN_TODO.includes(rol)

// El filtro de visibilidad que se suma al where del listado. Vacío para los roles
// internos; para el resto, solo los marcados.
export const filtroVisibilidad = (rol) =>
  veTodosLosDocumentos(rol) ? {} : { visible_todos: true }

// ── Helpers ──────────────────────────────────────────────────────────────────

// 'YYYY-MM-DD' de un Date, un ISO o un string ya cortado. null si no es una fecha.
//
// Nunca construye un Date a partir del string: `new Date('2026-08-11')` es medianoche
// UTC y en GMT-3 se lee como el 10. Es el bug que corrió 2076 cajas un día atrás.
export function fechaISO(v) {
  if (!v) return null
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10)
  const s = String(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// Lo que se guarda en la columna DATE: medianoche UTC del día que se escribió.
export function fechaParaGuardar(v) {
  const iso = fechaISO(v)
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null
}
