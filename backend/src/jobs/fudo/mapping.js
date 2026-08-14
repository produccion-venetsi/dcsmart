// Transforma UN dia comercial de Fudo en las filas que hay que insertar en
// DCSmart. Funcion pura -- no toca la base ni hace fetch, para poder testearla
// con fixtures reales sin mockear nada.
'use strict'
import { ventanaDia } from './dias.js'
import { nombreMetodo, esEfectivo, esTarjeta, esCuentaCorriente } from './metodos.js'

// saleType de Fudo -> detalle, con los mismos nombres que ya usa GRIS GRIS.
const DETALLE_POR_TIPO_VENTA = { 'EAT-IN': 'Salon', 'TAKEAWAY': 'Mostrador', 'DELIVERY': 'Delivery' }

// Igual que TapTap: estos se crean siempre, aunque den cero, para poder
// comparar dia contra dia y local contra local.
export const DETALLES_SIEMPRE = ['Salon', 'Mostrador', 'Delivery', 'Online', 'Tarjetas', 'Cta Cte']

// Los tipos que escribe el job. INICIAL/RETIRO/VACIADO son del encargado y el
// job no los toca nunca: Fudo no los expone (viven en su arqueo).
const TIPOS_DEL_JOB = ['COBRO', 'GASTO']
export const esMovimientoDelJob = (tipo) => TIPOS_DEL_JOB.includes(tipo)

const decimal = (n) => (Number(n) || 0).toFixed(2)

export function mapDia({ ventas, incluidos, gastos = [], fecha, horaCorte = 6 }) {
  const cerradas = ventas.filter((v) => v.attributes.saleState === 'CLOSED')
  if (!cerradas.length) return null

  const idx = {}
  for (const i of incluidos) idx[`${i.type}:${i.id}`] = i

  const { desde, hasta } = ventanaDia(fecha, horaCorte)
  const anuladas = ventas.length - cerradas.length

  let total = 0, efectivo = 0, fiscal = 0, comensales = 0, tarjetas = 0, ctaCte = 0
  const porCode = new Map()
  const porDetalle = new Map(DETALLES_SIEMPRE.map((n) => [n, 0]))
  const cierres = new Map()

  for (const v of cerradas) {
    const a = v.attributes
    total += Number(a.total || 0)
    comensales += Number(a.people || 0)
    if ((v.relationships?.commercialDocuments?.data || []).length) fiscal += Number(a.total || 0)

    const quien = idx[`User:${v.relationships?.closedBy?.data?.id}`]?.attributes?.name
    if (quien) cierres.set(quien, (cierres.get(quien) || 0) + 1)

    const detalle = DETALLE_POR_TIPO_VENTA[a.saleType]
    if (detalle) porDetalle.set(detalle, porDetalle.get(detalle) + Number(a.total || 0))

    for (const ref of v.relationships?.payments?.data || []) {
      const pago = idx[`Payment:${ref.id}`]
      if (!pago || pago.attributes.canceled) continue
      const code = idx[`PaymentMethod:${pago.relationships?.paymentMethod?.data?.id}`]?.attributes?.code
      // `amount` es lo imputado a la venta, que es lo que queda en la caja.
      // `receivedAmount` incluiria el vuelto, y ademas no se puede pedir desde
      // /sales (fields[payment] devuelve 400 ahi).
      const monto = Number(pago.attributes.amount || 0)
      if (esEfectivo(code)) efectivo += monto
      if (esTarjeta(code)) tarjetas += monto
      if (esCuentaCorriente(code)) { ctaCte += monto; continue }
      const acc = porCode.get(code) || { monto: 0, cantidad: 0 }
      acc.monto += monto
      acc.cantidad++
      porCode.set(code, acc)
    }
  }
  porDetalle.set('Tarjetas', tarjetas)
  porDetalle.set('Cta Cte', ctaCte)

  const movimientos = [...porCode.entries()].map(([code, v]) => ({
    tipo: 'COBRO', code, monto: decimal(v.monto), cantidad: v.cantidad,
  }))
  for (const g of gastos) {
    if (!g.attributes.useInCashCount) continue // el resto no salio de la caja
    movimientos.push({ tipo: 'GASTO', code: 'cash', monto: decimal(g.attributes.amount), cantidad: 1 })
  }

  const observaciones = [`Fudo · día comercial ${fecha}`]
  if (anuladas) observaciones.push(`${anuladas} venta(s) anulada(s) excluida(s)`)

  return {
    caja: {
      id_externo: fecha,
      origin: 'FFUDO',
      nro_turno: null,
      tipo_turno: null,
      fecha_inicio: desde,
      fecha_cierre: hasta,
      cajero: [...cierres.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      total: decimal(total),
      efectivo: decimal(efectivo),
      fiscal: decimal(fiscal),
      comensales,
      tickets: cerradas.length,
      observaciones: observaciones.join(' · '),
    },
    movimientos,
    detalles: [...porDetalle.entries()].map(([nombre, monto]) => ({ nombre, monto: decimal(monto) })),
    codes: new Set([...porCode.keys(), ...(movimientos.some((m) => m.tipo === 'GASTO') ? ['cash'] : [])]),
  }
}
