// Datos de la persona detrás de un usuario: departamento, puesto y fecha de
// nacimiento.
//
// No hay equipo: con el departamento y el puesto ya se sabe a qué equipo pertenece
// cada uno, y un tercer campo para deducir lo mismo es un campo más que queda sin
// cargar.
//
// ── Por qué la lista vive acá y no como enum de Postgres ──────────────────────
//
// Los departamentos son los mismos para todos los grupos, así que tienen que ser una
// lista cerrada y no texto libre: con texto libre aparecen "Administración",
// "administracion" y "Admin" como tres departamentos distintos y cualquier agrupación
// miente.
//
// Se eligió una lista en código en vez de un enum de Prisma porque agregar un
// departamento nuevo con enum es una migración contra la base de producción, y esto
// va a cambiar (una empresa suma áreas). Acá el valor se valida igual —el backend
// rechaza cualquier otro— y sumar uno es un deploy normal.
//
// ── Por qué `puesto` y no `rol` ───────────────────────────────────────────────
//
// En pantalla se llama "Rol", que es como lo nombra el negocio. En el código se llama
// `puesto` porque "rol" ya es el rol de permisos (super_admin, admin, cajero...), y
// dos cosas con el mismo nombre obligan a aclarar cuál es cuál en cada consulta.

export const DEPARTAMENTOS = [
  'ADMINISTRACION',
  'OPERACIONES',
  'COMPRAS',
  'FINANZAS',
  'RRHH',
  'SISTEMAS',
  'COMERCIAL',
  'AUDITORIA',
  'MANTENIMIENTO',
  'DIRECCION',
  'COSTOS',
]

// Cómo se muestra cada uno. La clave va en mayúsculas sin acentos para que el valor
// guardado no dependa de la tilde; la etiqueta es la que se lee.
export const DEPARTAMENTO_LABEL = {
  ADMINISTRACION: 'Administración',
  OPERACIONES: 'Operaciones',
  COMPRAS: 'Compras',
  FINANZAS: 'Finanzas',
  RRHH: 'RRHH',
  SISTEMAS: 'Sistemas',
  COMERCIAL: 'Comercial',
  AUDITORIA: 'Auditoría',
  MANTENIMIENTO: 'Mantenimiento',
  DIRECCION: 'Dirección',
  COSTOS: 'Costos',
}

// Largos máximos, iguales a lo que aceptan las columnas.
export const LARGOS = { puesto: 60 }

const texto = (v) => String(v ?? '').trim()

export const esDepartamentoValido = (v) => DEPARTAMENTOS.includes(texto(v))

// Normaliza lo que llega del formulario a lo que se guarda.
//
// Vacío -> null y no '': una cadena vacía se ordena y se agrupa como si fuera un
// valor, así que un usuario "sin departamento" aparecería como un departamento más.
export function normalizarDepartamento(v) {
  const t = texto(v).toUpperCase()
  return DEPARTAMENTOS.includes(t) ? t : null
}

// El puesto es texto libre: es cómo se describe el cargo ("Encargada de salón"), y una
// lista cerrada de cargos no la tiene nadie.
export const normalizarPuesto = (v) => texto(v).slice(0, LARGOS.puesto) || null

// ── Fecha de nacimiento ──────────────────────────────────────────────────────
//
// Se guarda como fecha pura (columna DATE), no como timestamp. Un cumpleaños no tiene
// hora, y guardarlo con hora lo corre un día según la zona: el proyecto ya tuvo ese
// bug con 2076 cajas y 20137 pagos migrados a medianoche UTC (ver lib/dates.js).
//
// Devuelve { valor, error }. `valor` es 'YYYY-MM-DD' o null.
export function normalizarFechaNac(v, hoy = new Date()) {
  const t = texto(v)
  if (!t) return { valor: null, error: null }

  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return { valor: null, error: 'La fecha de nacimiento tiene que ser AAAA-MM-DD' }

  const [, a, mes, dia] = m
  const d = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(dia)))
  // Fecha inexistente (31/02): el Date la corre al mes siguiente, así que se compara
  // contra lo que se pidió.
  if (d.getUTCMonth() !== Number(mes) - 1 || d.getUTCDate() !== Number(dia)) {
    return { valor: null, error: 'Esa fecha no existe' }
  }
  if (d > hoy) return { valor: null, error: 'La fecha de nacimiento no puede ser futura' }
  // 120 años: no es un límite legal, es para atajar un año mal tipeado (1093, 2925).
  const limite = new Date(Date.UTC(hoy.getUTCFullYear() - 120, hoy.getUTCMonth(), hoy.getUTCDate()))
  if (d < limite) return { valor: null, error: 'Revisá el año: la fecha es de hace más de 120 años' }

  return { valor: `${a}-${mes}-${dia}`, error: null }
}

// Arma lo que se le pasa a Prisma a partir del body, y el error si algo no valida.
//
// Solo toca las claves que vinieron en el body. Es la diferencia entre "no me
// mandaron departamento" (no tocarlo) y "me mandaron departamento vacío" (borrarlo):
// si se normalizara todo siempre, un PUT que solo cambia el nombre borraría los tres
// campos.
//
// Devuelve { data, error }.
export function patchDatosPersona(body = {}) {
  const data = {}
  const hay = (k) => Object.prototype.hasOwnProperty.call(body, k)

  if (hay('departamento')) {
    // Si mandaron algo que no está en la lista, es un error y no un null silencioso:
    // el formulario usa un select, así que un valor raro es un bug o alguien pegándole
    // a la API a mano, y en los dos casos conviene enterarse.
    const t = String(body.departamento ?? '').trim()
    if (t && !esDepartamentoValido(t.toUpperCase())) {
      return { data: null, error: `Departamento inválido: ${t}` }
    }
    data.departamento = normalizarDepartamento(body.departamento)
  }
  if (hay('puesto')) data.puesto = normalizarPuesto(body.puesto)
  if (hay('fecha_nac')) {
    const { valor, error } = normalizarFechaNac(body.fecha_nac)
    if (error) return { data: null, error }
    // La columna es DATE. Se le pasa medianoche UTC para que el día que se guarda sea
    // el que se escribió, sin que la zona del servidor lo corra.
    data.fecha_nac = valor ? new Date(`${valor}T00:00:00.000Z`) : null
  }

  return { data, error: null }
}

// Edad cumplida, para mostrar al lado de la fecha. Null si no hay fecha.
export function edad(fechaNac, hoy = new Date()) {
  const t = texto(fechaNac).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const [a, m, d] = t.split('-').map(Number)
  let años = hoy.getUTCFullYear() - a
  // Todavía no cumplió este año.
  const cumplioYa = hoy.getUTCMonth() + 1 > m || (hoy.getUTCMonth() + 1 === m && hoy.getUTCDate() >= d)
  if (!cumplioYa) años--
  return años >= 0 ? años : null
}
