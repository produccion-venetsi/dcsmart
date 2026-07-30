// Lee los datos de una factura desde su foto, para precargar el formulario de
// pagos. NO guarda nada: devuelve los campos y el usuario los revisa y confirma.
//
// Usa Gemini via Vertex AI con las credenciales por defecto del proyecto (las
// mismas que ya usa GCS), asi que no hay API key que administrar: en local sale
// del `gcloud auth` y en Cloud Run de la service account.
//
// La llamada HTTP esta separada de las funciones que interpretan la respuesta,
// para que esas se puedan testear sin red.

import { GoogleAuth } from 'google-auth-library'

const MODELO = process.env.GEMINI_MODELO || 'gemini-2.5-flash'
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1'

// Tipos de comprobante que maneja el sistema (enum TipoPago del schema). Se
// mapean desde lo que diga la factura, que puede escribirlo de varias formas.
const TIPOS_COMPROBANTE = {
  A: 'A', B: 'B', C: 'C', M: 'M',
  NC: 'NCA', NCA: 'NCA', 'NOTA DE CREDITO': 'NCA',
  ND: 'NDA', NDA: 'NDA', 'NOTA DE DEBITO': 'NDA'
}

// Impuestos que acepta el sistema (enum TipoImpuesto).
const TIPOS_IMPUESTO = new Set(['IVA21', 'IVA27', 'IVA10', 'RETENCION', 'PERCEPCION', 'IMP_INTERNOS'])

// Se le pide JSON con esquema fijo en lugar de texto libre: asi no hay que
// parsear prosa y el modelo no puede devolver un formato distinto cada vez.
const ESQUEMA = {
  type: 'object',
  properties: {
    fecha:                { type: 'string', description: 'Fecha de emisión en formato YYYY-MM-DD' },
    tipo_comprobante:     { type: 'string', description: 'A, B, C, M, NC o ND' },
    punto_venta:          { type: 'integer' },
    numero:               { type: 'integer' },
    cuit_emisor:          { type: 'string', description: 'Solo los 11 dígitos, sin guiones' },
    razon_social_emisor:  { type: 'string' },
    importe_neto:         { type: 'number' },
    descuento:            { type: 'number' },
    total:                { type: 'number' },
    impuestos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo:  { type: 'string', description: 'IVA21, IVA27, IVA10, RETENCION, PERCEPCION o IMP_INTERNOS' },
          monto: { type: 'number' }
        }
      }
    },
    legible: { type: 'boolean', description: 'false si la foto no permite leer la factura' }
  }
}

// La regla que mas importa del prompt es la ultima: es preferible un campo vacio
// que el usuario completa, a un numero inventado que se guarda sin que nadie lo
// note.
const PROMPT = `Sos un asistente que lee facturas argentinas para precargar un formulario de carga.

Extraé los datos de la factura de la imagen. Tené en cuenta:

- El CUIT del EMISOR (quien factura), no el del receptor. Devolvé solo los 11 dígitos.
- El tipo de comprobante suele estar en una letra grande (A, B, C, M) en el centro del encabezado.
- "Punto de venta" y "número" salen del campo tipo 0001-00012345: el primero es el punto de venta, el segundo el número.
- El importe neto es el subtotal ANTES de impuestos. El total es el importe final a pagar.
- Los impuestos van discriminados: IVA 21% -> IVA21, IVA 10,5% -> IVA10, IVA 27% -> IVA27. Percepciones -> PERCEPCION, retenciones -> RETENCION, impuestos internos -> IMP_INTERNOS.
- En una factura tipo B o C el IVA no se discrimina: en ese caso importe_neto es igual al total y el array de impuestos va vacío.

REGLA IMPORTANTE: si un dato no se ve con claridad, devolvé null en ese campo. NO lo adivines ni lo calcules. Un campo vacío lo completa la persona; un número inventado se guarda mal y nadie se da cuenta.

Si la imagen no es una factura o no se puede leer, devolvé legible: false.`

// ── Funciones puras (testeadas sin red) ─────────────────────────────────────

// Deja el CUIT en 11 digitos o devuelve null. En la base hay 4458 proveedores
// con CUIT limpio, asi que normalizar bien es lo que hace que el match funcione.
export function normalizarCuit(valor) {
  if (!valor) return null
  const digitos = String(valor).replace(/\D/g, '')
  return digitos.length === 11 ? digitos : null
}

export function normalizarTipoComprobante(valor) {
  if (!valor) return null
  const v = String(valor).trim().toUpperCase()
  return TIPOS_COMPROBANTE[v] ?? null
}

const numeroONull = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Chequea que neto + impuestos - descuento sea el total. Es el control que pesca
// el error mas caro: un total mal leido se guarda y descuadra la contabilidad.
// Tolerancia de $1 por redondeo, igual que en cajas y arqueo.
//
// Acepta `total` (como lo llama la factura) o `importe` (como lo llama el
// formulario), porque se usa en los dos lados de la cadena. Con solo uno de los
// dos nombres, la validacion se saltaba en silencio: pasaba el objeto ya mapeado
// y devolvia verificable:false sin que nada avisara.
export function validarAritmetica(datos, tolerancia = 1) {
  const { importe_neto, impuestos = [], descuento } = datos ?? {}
  const neto = numeroONull(importe_neto)
  const tot = numeroONull(datos?.total ?? datos?.importe)
  if (neto == null || tot == null) return { verificable: false, cuadra: null, esperado: null, diferencia: null }

  const sumaImpuestos = (impuestos ?? []).reduce((acc, i) => acc + (numeroONull(i?.monto) ?? 0), 0)
  const esperado = neto + sumaImpuestos - (numeroONull(descuento) ?? 0)
  const diferencia = tot - esperado
  return {
    verificable: true,
    cuadra: Math.abs(diferencia) <= tolerancia,
    esperado,
    diferencia
  }
}

// Pasa la respuesta del modelo a los campos que espera el formulario. Descarta
// lo que no entra en los enums del sistema en lugar de dejarlo pasar y que
// explote al guardar.
export function aCamposFormulario(crudo) {
  if (!crudo || crudo.legible === false) return null

  const impuestos = (crudo.impuestos ?? [])
    .map((i) => ({ tipo: String(i?.tipo ?? '').toUpperCase(), monto: numeroONull(i?.monto) }))
    .filter((i) => TIPOS_IMPUESTO.has(i.tipo) && i.monto != null && i.monto !== 0)

  return {
    fecha:         /^\d{4}-\d{2}-\d{2}$/.test(String(crudo.fecha ?? '')) ? crudo.fecha : null,
    id_tipo:       normalizarTipoComprobante(crudo.tipo_comprobante),
    pv:            numeroONull(crudo.punto_venta),
    nro:           numeroONull(crudo.numero),
    importe_neto:  numeroONull(crudo.importe_neto),
    descuento:     numeroONull(crudo.descuento),
    importe:       numeroONull(crudo.total),
    impuestos,
    // Para buscar el proveedor, no para guardar
    cuit_emisor:         normalizarCuit(crudo.cuit_emisor),
    razon_social_emisor: crudo.razon_social_emisor?.trim() || null
  }
}

// Devuelve solo los nombres de campo que vinieron con dato, para que la pantalla
// pueda marcar cuales completo la IA y cuales escribio la persona.
export function camposConDato(campos) {
  if (!campos) return []
  const propios = ['fecha', 'id_tipo', 'pv', 'nro', 'importe_neto', 'descuento', 'importe']
  const conDato = propios.filter((k) => campos[k] != null)
  if (campos.impuestos?.length) conDato.push('impuestos')
  return conDato
}

// ── Llamada a Vertex AI ─────────────────────────────────────────────────────

let authCache = null
function getAuth() {
  if (!authCache) {
    authCache = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })
  }
  return authCache
}

// El proyecto sale de la variable que ya usa GCS, asi que no hay que agregar
// ningun secret nuevo ni tocar los workflows. GOOGLE_CLOUD_PROJECT lo setea
// Cloud Run solo, y queda como respaldo.
const proyectoPorDefecto = () => process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT

// Devuelve el JSON crudo del modelo. Lanza si la API falla, para que la ruta
// pueda responder un error claro sin dejar el formulario a medio llenar.
export async function extraerDeImagen(buffer, mimeType, { proyecto = proyectoPorDefecto() } = {}) {
  if (!proyecto) throw new Error('Falta GCS_PROJECT_ID para llamar a Vertex AI')

  const auth = getAuth()
  const token = await auth.getAccessToken()
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${proyecto}/locations/${LOCATION}/publishers/google/models/${MODELO}:generateContent`

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: buffer.toString('base64') } },
          { text: PROMPT }
        ]
      }],
      generationConfig: {
        temperature: 0,             // no queremos creatividad leyendo numeros
        responseMimeType: 'application/json',
        responseSchema: ESQUEMA
      }
    })
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`Vertex AI respondió ${res.status}: ${detalle.slice(0, 300)}`)
  }

  const data = await res.json()
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!texto) throw new Error('Vertex AI no devolvió contenido')
  return JSON.parse(texto)
}

export const _internals = { PROMPT, ESQUEMA, MODELO, LOCATION }
