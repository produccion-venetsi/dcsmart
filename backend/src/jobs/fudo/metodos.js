// La API de Fudo NO devuelve el campo `kind` que promete su documentacion
// (verificado contra la cuenta de GRIS GRIS: solo vienen name, active, code y
// position). El puente al catalogo de DCSmart es el `code`.
'use strict'

const NOMBRE_POR_CODE = {
  'cash': 'Efectivo',
  'mp': 'Mercado Pago',
  'mp qr': 'Mercado Pago QR',
  'credit-card': 'Credito',
  'debit-card': 'Debito',
  'payway': 'PayWay',
  'house-account': 'Cuenta Cte.',
}

const CODES_EFECTIVO = ['cash']
const CODES_TARJETA = ['credit-card', 'debit-card', 'payway']
// Cta. Cte. no es plata que entra a la caja: es una venta anotada en la cuenta
// del cliente. No genera CajaMovimiento, va como CajaDetalle.
const CODES_CUENTA_CORRIENTE = ['house-account']

export function nombreMetodo(code) {
  return NOMBRE_POR_CODE[code] ?? null
}

export const esEfectivo = (code) => CODES_EFECTIVO.includes(code)
export const esTarjeta = (code) => CODES_TARJETA.includes(code)
export const esCuentaCorriente = (code) => CODES_CUENTA_CORRIENTE.includes(code)

function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Devuelve el id de MetodoPago para cada code, y la lista de los que no se
// pudieron resolver. El job aborta ese local si hay faltantes: crear metodos
// sobre la marcha es lo que lleno la tabla de duplicados con TapTap.
export function resolverMetodos(codes, existentes) {
  const porNombre = new Map(existentes.map((m) => [normalizar(m.nombre), m.id]))
  const porCode = new Map()
  const faltantes = []
  for (const code of new Set(codes)) {
    const nombre = nombreMetodo(code)
    const id = nombre ? porNombre.get(normalizar(nombre)) : undefined
    if (id) porCode.set(code, id)
    else faltantes.push(code)
  }
  return { porCode, faltantes }
}
