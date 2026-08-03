// Lee los datos de una factura desde su foto o su PDF, para precargar el
// formulario de pagos. NO guarda nada: devuelve los campos y el usuario los
// revisa y confirma.
//
// Gemini acepta el PDF nativo como `inlineData` igual que una imagen, asi que no
// hay que rasterizarlo ni pasarle un OCR antes: se manda el buffer tal cual con
// su mimeType. Con el PDF ademas lee mejor que con una foto, porque el texto es
// texto y no pixeles — que es justamente el caso de las facturas electronicas
// que llegan por mail.
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

// Lo que dice la factura en "Condicion de venta" no coincide con como se llaman
// los metodos de pago en la base: la factura dice "Contado" o "Cuenta Corriente"
// y el catalogo tiene "Efectivo" y "Cuenta Cte.". Estos son los sinonimos que no
// se pueden resolver comparando texto.
//
// Se mapea al NOMBRE del metodo, no a un id: los ids cambian por instalacion y
// los nombres son unicos en la tabla.
const SINONIMOS_METODO = {
  contado: 'Efectivo',
  'pago contado': 'Efectivo',
  efectivo: 'Efectivo',
  cash: 'Efectivo',
  'cuenta corriente': 'Cuenta Cte.',
  'cta corriente': 'Cuenta Cte.',
  'cta cte': 'Cuenta Cte.',
  'cuenta cte': 'Cuenta Cte.',
  'a plazo': 'Cuenta Cte.',
  'cuenta corriente 30 dias': 'Cuenta Cte.',
  transferencia: 'Transferencia',
  'transferencia bancaria': 'Transferencia',
  transf: 'Transferencia',
  deposito: 'Transferencia',
  cheque: 'CHEQUE AL DÍA',
  'cheque al dia': 'CHEQUE AL DÍA',
  'cheque comun': 'CHEQUE AL DÍA',
  'cheque diferido': 'CHEQUE DIFERIDO',
  'cheque de pago diferido': 'CHEQUE DIFERIDO',
  echeq: 'E-Cheque',
  'e cheq': 'E-Cheque',
  'e cheque': 'E-Cheque',
  'cheque electronico': 'E-Cheque',
  tarjeta: 'Tarjeta crédito',
  'tarjeta de credito': 'Tarjeta crédito',
  'tarjeta credito': 'Tarjeta crédito',
  'tarjeta de debito': 'Tarjeta débito',
  'tarjeta debito': 'Tarjeta débito',
  'debito automatico': 'Débito Automático',
  'debito directo': 'Débito Automático',
  'mercado pago': 'Mercado Pago',
  mercadopago: 'Mercado Pago',
  mp: 'Mercado Pago',
  'nota de credito': 'Nota de Crédito'
}

// Saca acentos, puntos y espacios de mas para poder comparar "Cta. Cte." con
// "cta cte" y "Débito Automático" con "debito automatico".
export function normalizarTexto(valor) {
  if (!valor) return ''
  return String(valor)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // saca acentos
    .toLowerCase()
    .replace(/[.,;:_/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Busca a que metodo de pago del catalogo corresponde lo que decia la factura.
// `metodos` son los de la base: [{ id, nombre }].
//
// Devuelve { id, nombre, texto } si encontro, o { id: null, texto } si no —
// asi la pantalla puede mostrar que leyo aunque no lo haya podido mapear, en vez
// de descartarlo en silencio.
export function matchearMetodoPago(textoLeido, metodos = []) {
  const texto = String(textoLeido ?? '').trim()
  if (!texto) return null

  const norm = normalizarTexto(texto)
  const porNombre = new Map(metodos.map((m) => [normalizarTexto(m.nombre), m]))

  // 1. El nombre del catalogo tal cual ("Transferencia", "Mercado Pago")
  const directo = porNombre.get(norm)
  if (directo) return { id: directo.id, nombre: directo.nombre, texto }

  // 2. Sinonimo conocido ("Contado" -> "Efectivo")
  const canonico = SINONIMOS_METODO[norm]
  if (canonico) {
    const porSinonimo = porNombre.get(normalizarTexto(canonico))
    if (porSinonimo) return { id: porSinonimo.id, nombre: porSinonimo.nombre, texto }
  }

  // 3. Sinonimo contenido en el texto: cubre "Cuenta corriente 30 dias F.F." o
  //    "Pago: transferencia bancaria". Se prueban los mas largos primero para que
  //    "cheque diferido" gane sobre "cheque".
  const claves = Object.keys(SINONIMOS_METODO).sort((a, b) => b.length - a.length)
  for (const clave of claves) {
    if (norm.includes(clave)) {
      const m = porNombre.get(normalizarTexto(SINONIMOS_METODO[clave]))
      if (m) return { id: m.id, nombre: m.nombre, texto }
    }
  }

  // Leyo algo pero no se pudo mapear: se informa para que la persona elija.
  return { id: null, nombre: null, texto }
}

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
    condicion_venta:      { type: 'string', description: 'Texto tal cual de la condición de venta / pago / forma de pago' },
    legible: { type: 'boolean', description: 'false si el archivo no permite leer la factura' }
  }
}

// La regla que mas importa del prompt es la ultima: es preferible un campo vacio
// que el usuario completa, a un numero inventado que se guarda sin que nadie lo
// note.
const PROMPT = `Sos un asistente que lee facturas argentinas para precargar un formulario de carga.

Extraé los datos de la factura del archivo adjunto, que puede ser una foto o un PDF. Tené en cuenta:

- Si el archivo tiene VARIAS páginas, los datos salen de la primera factura: el encabezado (tipo, punto de venta, número, fecha, CUIT) está en la primera página, y los totales pueden estar en la última. Leé todas las páginas antes de responder, pero devolvé UNA sola factura, no una por página.
- Si el archivo contiene más de una factura distinta (varios comprobantes escaneados juntos), devolvé los datos de la PRIMERA nada más.

- El CUIT del EMISOR (quien factura), no el del receptor. Devolvé solo los 11 dígitos.
- El tipo de comprobante suele estar en una letra grande (A, B, C, M) en el centro del encabezado.
- "Punto de venta" y "número" salen del campo tipo 0001-00012345: el primero es el punto de venta, el segundo el número.
- El importe neto es el subtotal ANTES de impuestos. El total es el importe final a pagar.
- Los impuestos van discriminados: IVA 21% -> IVA21, IVA 10,5% -> IVA10, IVA 27% -> IVA27. Percepciones -> PERCEPCION, retenciones -> RETENCION, impuestos internos -> IMP_INTERNOS.
- En una factura tipo B o C el IVA no se discrimina: en ese caso importe_neto es igual al total y el array de impuestos va vacío.
- La forma de pago aparece con distintos nombres segun el proveedor: "Condición de venta", "Condición de pago", "Forma de pago" o "Cond. Vta.". Copiá el texto TAL CUAL lo dice la factura (por ejemplo "Contado", "Cuenta Corriente 30 días", "Transferencia"), sin traducirlo ni interpretarlo.

REGLA IMPORTANTE: si un dato no se ve con claridad, devolvé null en ese campo. NO lo adivines ni lo calcules. Un campo vacío lo completa la persona; un número inventado se guarda mal y nadie se da cuenta.

Si el archivo no es una factura o no se puede leer, devolvé legible: false.`

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
    // Texto crudo de la condicion de venta; el match contra el catalogo de
    // metodos se hace en la ruta, que es la que tiene acceso a la base.
    condicion_venta:     crudo.condicion_venta?.trim() || null,
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
//
// `mimeType` es el del archivo tal como lo mandó el navegador: image/jpeg,
// image/png o application/pdf. Gemini los acepta a todos por inlineData.
export async function extraerDeArchivo(buffer, mimeType, { proyecto = proyectoPorDefecto() } = {}) {
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
