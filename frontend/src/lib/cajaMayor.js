// Constantes del módulo Caja Mayor, en un solo lugar.
//
// Existe por un bug concreto: al renombrar el estado ESTUDIO a ENVIADA se
// actualizaron el enum de Prisma y el backend, pero el frontend quedó mandando
// 'ESTUDIO' en cuatro lugares distintos. El backend respondía 400 y la pantalla no
// cargaba -- se veía como "cambio el local y no me deja". Con los valores acá, un
// renombre es un solo cambio y no hay literales sueltos que se desincronicen.
//
// Los valores TIENEN que coincidir con los enums de schema.prisma
// (estado_cm, moneda_cm, origen_cm) y con las listas de validación en
// backend/src/routes/caja_mayor.js.

export const ESTADOS = {
  ENVIADA: 'ENVIADA',
  RECIBIDA: 'RECIBIDA',
}

// Etiquetas para la UI. "Enviada" es desde el punto de vista del local que mandó
// la plata; "Recibida", desde la caja mayor que la confirmó.
export const ESTADO_LABEL = {
  [ESTADOS.ENVIADA]: 'Enviada',
  [ESTADOS.RECIBIDA]: 'Recibida',
}

export const MONEDAS = [
  { valor: 'ARS', label: 'Pesos', simbolo: '$' },
  { valor: 'USD', label: 'Dólares', simbolo: 'US$' },
  { valor: 'EUR', label: 'Euros', simbolo: '€' },
  { valor: 'BRL', label: 'Reales', simbolo: 'R$' },
]

export const simboloDe = (moneda) => MONEDAS.find(m => m.valor === moneda)?.simbolo ?? '$'

// De dónde salió el movimiento. Decide qué se puede editar y si tiene el ciclo
// enviada/recibida.
export const ORIGEN_LABEL = {
  PAGO: 'Gestión',
  PROPIO: 'Manual',
  APERTURA: 'Apertura',
}

// Los que se cargan a mano DENTRO de la caja mayor. Son los mismos que acepta el
// POST del backend (ORIGENES_MANUALES en routes/caja_mayor.js).
export const ORIGENES_MANUALES = ['PROPIO', 'APERTURA']

// ¿El movimiento nace en la caja mayor?
//
// Un movimiento de origen PAGO sale de una op de gestión: el local lo mandó y la caja
// mayor todavía tiene que confirmar que la plata llegó, así que pasa por ENVIADA y
// después RECIBIDA.
//
// Uno cargado a mano en el módulo ya está en la caja mayor: nace RECIBIDA, y ofrecer
// "recibir" no significa nada -- quien lo carga es el que la tiene en la mano.
export const naceEnCajaMayor = (origen) => ORIGENES_MANUALES.includes(origen)

// Al revés: si tiene el ciclo enviada/recibida, la acción de estado tiene sentido.
export const tieneCicloDeRecepcion = (origen) => !naceEnCajaMayor(origen)

// Los importes de la caja mayor llegan a los cientos de millones: sin separador de
// miles la columna es ilegible. Los decimales van siempre, para que no parezca que
// se redondeó.
export function fmtMonto(n, moneda = 'ARS') {
  if (n == null) return '—'
  const abs = Math.abs(Number(n)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${Number(n) < 0 ? '-' : ''}${simboloDe(moneda)}${abs}`
}

// Largos máximos de los campos de texto. Tienen que coincidir con LARGOS en
// backend/src/lib/cajaMayor.js, que es donde se aplican de verdad: si el contador
// dice 500 y el backend corta en 200, el usuario escribe y se come un 400 sin
// entender por qué. Hay un test que compara las dos listas.
export const LARGOS = { observaciones: 500, recibe: 60, extrae: 60 }

// Grupo y local son dos filtros independientes (ver SelectorGrupoLocal). El local
// gana cuando está elegido: es el corte más específico, y mandar los dos al backend
// sería pedirle que resuelva una ambigüedad que acá ya está resuelta.
export function filtroDeSeleccion({ idApp, idLocal }) {
  if (idLocal) return { id_local: idLocal }
  if (idApp) return { id_app: idApp }
  return {}
}
