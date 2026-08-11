// Reglas de la pantalla de Documentos: cómo se agrupa, cómo se lee un vencimiento y
// qué se puede hacer con cada archivo.
//
// Los vencimientos están duplicados con `backend/src/lib/documentos.js` a propósito (el
// frontend no importa del backend en este proyecto). El test de contrato de
// `documentos.test.js` lee el archivo del backend y falla si dejan de coincidir.

// ── Vencimientos ─────────────────────────────────────────────────────────────
//
// El backend ya manda `estado_vencimiento` calculado; esto sirve para el formulario
// (donde todavía no hay nada guardado) y para los textos.

export const DIAS_AVISO = 30

// Fecha pura, sin construir un Date: `new Date('2026-09-01')` es medianoche UTC y en
// GMT-3 se lee como el 31 de agosto. Es el bug que corrió 2076 cajas un día atrás.
export const fechaISO = (v) => {
  const s = String(v ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export function fechaTexto(v) {
  const iso = fechaISO(v)
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

// Días hasta el vencimiento, por día calendario. Negativo = ya venció.
export function diasParaVencer(vence, hoy = new Date()) {
  const iso = fechaISO(vence)
  if (!iso) return null
  const [a, m, d] = iso.split('-').map(Number)
  const finVence = Date.UTC(a, m - 1, d)
  const finHoy = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((finVence - finHoy) / 86400000)
}

export function estadoVencimiento(vence, hoy = new Date(), diasAviso = DIAS_AVISO) {
  const dias = diasParaVencer(vence, hoy)
  if (dias === null) return null
  if (dias < 0) return 'vencido'
  if (dias <= diasAviso) return 'por-vencer'
  return 'vigente'
}

export function textoVencimiento(vence, hoy = new Date()) {
  const dias = diasParaVencer(vence, hoy)
  if (dias === null) return ''
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  if (dias === -1) return 'Venció ayer'
  if (dias < 0) return `Venció hace ${Math.abs(dias)} días`
  return `Vence en ${dias} días`
}

// Cómo se pinta cada estado. Rojo para lo vencido, ámbar para lo que se viene: los dos
// colores que el resto de la app ya usa para "mal" y "atención".
export const COLOR_VENCIMIENTO = {
  vencido: 'var(--red)',
  'por-vencer': 'var(--amber)',
  vigente: 'var(--t3)',
}

export const colorVencimiento = (estado) => COLOR_VENCIMIENTO[estado] ?? 'var(--t3)'

// ── Archivos ─────────────────────────────────────────────────────────────────

// Lo que el navegador puede mostrar sin bajarlo.
export const seVeEnPantalla = (tipo) => tipo === 'foto' || tipo === 'pdf'

// Qué dice el botón de cada archivo. Un .docx no se puede mostrar, así que ofrecer
// "Ver" y que se descargue igual es peor que decir "Descargar" de entrada.
export const accionDeArchivo = (tipo) => (seVeEnPantalla(tipo) ? 'ver' : 'descargar')

// El nombre que se muestra. En GCS el archivo es un timestamp, así que sin
// `nombre_original` la lista mostraría "1786445361010-x7f2.pdf".
export function nombreDeArchivo(archivo, i = 0) {
  const n = String(archivo?.nombre_original ?? '').trim()
  if (n) return n
  const tipo = archivo?.tipo === 'foto' ? 'Imagen' : archivo?.tipo === 'pdf' ? 'PDF' : 'Archivo'
  return `${tipo} ${i + 1}`
}

// Extensiones que acepta el input de archivos. Coincide con lo que valida el backend.
export const ACEPTA =
  '.pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv'

// ── Íconos ──────────────────────────────────────────────────────────────────
//
// Las claves. El dibujo de cada una está en components/IconoDocumento.jsx y la
// validación en el backend; los tres se comparan en el test de contrato.
//
// Está acá y no en el componente porque un archivo que exporta un componente Y
// constantes rompe el hot reload de Vite.
export const CLAVES_ICONO = [
  'documento', 'contrato', 'habilitacion', 'reporte', 'certificado', 'plano',
  'foto', 'link', 'factura', 'seguro', 'impuesto', 'carpeta',
]

// ── Agrupación ───────────────────────────────────────────────────────────────
//
// Se pidió "agrupada por grupo y local". El grupo ya lo fija el selector de arriba, así
// que dentro de la pantalla el primer nivel útil es el local, y el segundo el tipo, que
// es como se busca un documento ("las habilitaciones de DOGG").

export const AGRUPACIONES = [
  { valor: 'local-tipo', label: 'Local y tipo' },
  { valor: 'local', label: 'Solo local' },
  { valor: 'tipo', label: 'Solo tipo' },
  { valor: '', label: 'Sin separar' },
]

// Los documentos sin local son del grupo entero. Van PRIMERO y no al final: son los que
// aplican a todos los locales, así que esconderlos abajo invierte su importancia.
export const TODO_EL_GRUPO = 'Todo el grupo'
const SIN_TIPO = 'Sin tipo'

const ordenar = (a, b) => {
  // "Todo el grupo" arriba; el resto alfabético.
  if (a === TODO_EL_GRUPO) return -1
  if (b === TODO_EL_GRUPO) return 1
  if (a === SIN_TIPO) return 1
  if (b === SIN_TIPO) return -1
  return String(a).localeCompare(String(b))
}

// Devuelve siempre [{ titulo, total, sub: [{ titulo, docs }] }], igual que la tabla de
// usuarios, para que la pantalla no tenga que ramificar por modo.
export function agrupar(docs, por = 'local-tipo') {
  const lista = docs ?? []
  if (!por) return [{ titulo: null, total: lista.length, sub: [{ titulo: null, docs: lista }] }]

  const arbol = new Map()
  const push = (n1, n2, d) => {
    if (!arbol.has(n1)) arbol.set(n1, new Map())
    const sub = arbol.get(n1)
    if (!sub.has(n2)) sub.set(n2, [])
    sub.get(n2).push(d)
  }

  for (const d of lista) {
    const local = d.local?.nombre ?? TODO_EL_GRUPO
    const tipo = d.tipo?.nombre ?? SIN_TIPO
    if (por === 'local') push(local, null, d)
    else if (por === 'tipo') push(tipo, null, d)
    else push(local, tipo, d)
  }

  return [...arbol.entries()]
    .sort(([a], [b]) => ordenar(a, b))
    .map(([titulo, sub]) => ({
      titulo,
      total: [...sub.values()].flat().length,
      sub: [...sub.entries()]
        .sort(([a], [b]) => ordenar(a, b))
        .map(([subTitulo, docs]) => ({ titulo: subTitulo, docs })),
    }))
}

// ── Resumen ──────────────────────────────────────────────────────────────────

// Cuántos hay vencidos y por vencer, para el aviso de arriba de la tabla. Sin esto hay
// que recorrer la lista con el ojo para saber si hay algo urgente.
export function resumen(docs) {
  const r = { total: 0, vencidos: 0, porVencer: 0, sinArchivo: 0 }
  for (const d of docs ?? []) {
    r.total++
    if (d.estado_vencimiento === 'vencido') r.vencidos++
    if (d.estado_vencimiento === 'por-vencer') r.porVencer++
    // Un documento sin archivos ni link es una ficha vacía: se cargó el nombre y quedó
    // a medias. Conviene que se vea.
    if (!d.archivos?.length && !d.url) r.sinArchivo++
  }
  return r
}

// ── Formulario ───────────────────────────────────────────────────────────────

export const EMPTY_DOC = {
  id_tipo: '', id_local: '', id_proveedor: '',
  nombre: '', detalle: '', url: '', vence: '', visible_todos: false,
}

// Qué está mal, por campo. Vacío = se puede guardar.
export function erroresDoc(form) {
  const e = {}
  if (!String(form?.nombre ?? '').trim()) e.nombre = 'Requerido'
  if (!form?.id_tipo) e.id_tipo = 'Requerido'

  const url = String(form?.url ?? '').trim()
  if (url && !/^https?:\/\//i.test(url)) {
    e.url = 'Tiene que empezar con http:// o https://'
  }

  const iso = fechaISO(form?.vence)
  if (form?.vence && !iso) e.vence = 'Fecha incompleta'
  // Un vencimiento ya pasado NO es un error: se carga una habilitación vencida para
  // tenerla registrada. Se avisa aparte, en avisosDoc, sin bloquear el guardado.
  return e
}

// Aviso que no bloquea: se puede guardar igual.
export function avisosDoc(form, hoy = new Date()) {
  const avisos = []
  const estado = estadoVencimiento(form?.vence, hoy)
  if (estado === 'vencido') avisos.push(`${textoVencimiento(form.vence, hoy)}. Se guarda igual.`)
  if (!String(form?.url ?? '').trim() && !form?._tieneArchivos) {
    avisos.push('Todavía no tiene archivos ni link: va a quedar como una ficha vacía.')
  }
  return avisos
}
