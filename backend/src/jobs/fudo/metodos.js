// La API de Fudo NO devuelve el campo `kind` que promete su documentacion
// (verificado contra la cuenta de GRIS GRIS: solo vienen name, active, code y
// position). El primer local tenia codes estandar de Fudo (cash, mp,
// credit-card, house-account), pero el segundo local demostro que cada
// cuenta de Fudo inventa sus propios codes, en espanol y con el nombre que
// se le ocurra (tarjeta, qr, transferencia banco galicia, obra condarco
// 2026, echeq, nota de credito, fudo_payments). Por eso el puente principal
// al catalogo de DCSmart pasa a ser el NOMBRE (igual que TapTap), y el code
// queda como ultimo recurso para los codes estandar que ya conociamos.
'use strict'

// Alias por nombre: nombres que Fudo manda para un local que NO matchean
// solos (normalizados) contra el catalogo de DCSmart. Decidido con el dueno
// del sistema -- respetar tal cual.
const ALIAS_POR_NOMBRE = {
  'Cta. Cte.': 'Cuenta Cte.',
  'Tarj. Débito': 'Tarjeta débito',
  'Echeq': 'E-Cheque',
  'Qr': 'MP QR',
  'Transferencia banco galicia': 'Transferencia',
  'FudoPagos': 'FudoPagos',
}

// Alias por code: los codes estandar de Fudo, que ya estaban resueltos antes
// de que aparecieran los codes inventados por local.
const NOMBRE_POR_CODE = {
  'cash': 'Efectivo',
  'mp': 'Mercado Pago',
  'mp qr': 'Mercado Pago QR',
  'credit-card': 'Credito',
  'debit-card': 'Debito',
  'payway': 'PayWay',
  'house-account': 'Cuenta Cte.',
  'fudo_payments': 'FudoPagos',
}

// Metodo de pago "cajon de sastre" para lo que no matchea nada. Ya existe en
// la base (creado a mano) -- el job NUNCA crea metodos nuevos.
export const METODO_DESCONOCIDO = 'Metodo desconocido'

export function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const ALIAS_POR_NOMBRE_NORM = new Map(
  Object.entries(ALIAS_POR_NOMBRE).map(([k, v]) => [normalizar(k), v])
)

export function nombreMetodo(code) {
  return NOMBRE_POR_CODE[code] ?? null
}

const contiene = (normalizado, sub) => normalizado.includes(sub)

// Cash o efectivo, para las columnas que arma la caja (importa que cuadre,
// asi que mira tanto el code estandar como el nombre inventado por local).
export function esEfectivo(code, name) {
  if (code === 'cash') return true
  return contiene(normalizar(name), 'efectivo')
}

// Tarjeta (credito, debito o PayWay). OJO: "Nota de credito" contiene
// "credito" pero NO es tarjeta -- se excluye explicitamente.
export function esTarjeta(code, name) {
  if (['credit-card', 'debit-card', 'payway'].includes(code)) return true
  const n = normalizar(name)
  if (contiene(n, 'notadecredito')) return false
  return contiene(n, 'tarjeta') || contiene(n, 'credito') || contiene(n, 'debito') || contiene(n, 'payway')
}

// Cuenta corriente: no es plata que entra a la caja, es una venta anotada en
// la cuenta del cliente. No genera CajaMovimiento, va como CajaDetalle.
export function esCuentaCorriente(code, name) {
  if (code === 'house-account') return true
  const n = normalizar(name)
  return contiene(n, 'ctacte') || contiene(n, 'cuentacte')
}

// Resuelve un {code, name} de Fudo contra los MetodoPago existentes, en
// orden: 1) alias por nombre, 2) alias por code (los estandar de Fudo),
// 3) coincidencia normalizada del nombre, 4) "Metodo desconocido".
function resolverUno({ code, name }, porNombreNorm) {
  const candidatos = []
  const aliasPorNombre = ALIAS_POR_NOMBRE_NORM.get(normalizar(name))
  if (aliasPorNombre) candidatos.push(aliasPorNombre)
  const aliasPorCode = nombreMetodo(code)
  if (aliasPorCode) candidatos.push(aliasPorCode)
  candidatos.push(name)

  for (const candidato of candidatos) {
    const id = porNombreNorm.get(normalizar(candidato))
    if (id) return id
  }
  return null
}

// Devuelve el id de MetodoPago para cada code visto en el dia, y la lista de
// los que cayeron en "Metodo desconocido" (solo informativo: el job ya NO
// aborta el local por esto, la plata tiene que entrar igual).
export function resolverMetodos(metodos, existentes) {
  const porNombreNorm = new Map(existentes.map((m) => [normalizar(m.nombre), m.id]))
  const idDesconocido = porNombreNorm.get(normalizar(METODO_DESCONOCIDO))
  if (!idDesconocido) {
    throw new Error(`No existe el metodo de pago "${METODO_DESCONOCIDO}" en la base -- es una precondicion del job, hay que crearlo a mano antes de correrlo.`)
  }

  // Uno por code: dos entradas con el mismo code deberian traer el mismo
  // nombre, y de haber mas de uno solo importa resolverlo una vez.
  const vistos = new Map(metodos.map((m) => [m.code, m]))

  const porCode = new Map()
  const sinResolver = []
  for (const m of vistos.values()) {
    const id = resolverUno(m, porNombreNorm)
    if (id) {
      porCode.set(m.code, id)
    } else {
      porCode.set(m.code, idDesconocido)
      sinResolver.push({ code: m.code, name: m.name })
    }
  }
  return { porCode, sinResolver }
}
