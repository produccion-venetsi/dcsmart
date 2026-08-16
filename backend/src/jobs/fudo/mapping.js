// Transforma UN dia comercial de Fudo en las filas que hay que insertar en
// DCSmart. Funcion pura -- no toca la base ni hace fetch, para poder testearla
// con fixtures reales sin mockear nada.
'use strict'
import { ventanaDia } from './dias.js'
import { esEfectivo, esTarjeta, esCuentaCorriente } from './metodos.js'

// saleType de Fudo -> detalle. Los nombres tienen que coincidir EXACTO con el
// catalogo estandar (lib/detalleTiposEstandar.js): la unicidad es por texto y
// los reportes agrupan por nombre exacto, asi que un nombre distinto (aunque
// sea solo la tilde) aparece como una columna aparte en vez de sumarse.
const DETALLE_POR_TIPO_VENTA = { 'EAT-IN': 'Salón', 'TAKEAWAY': 'Mostrador', 'DELIVERY': 'Delivery' }

// Igual que TapTap: estos se crean siempre, aunque den cero, para poder
// comparar dia contra dia y local contra local. 'Tarjetas' no esta en el
// catalogo estandar -- se deja como valor propio del job.
export const DETALLES_SIEMPRE = ['Salón', 'Mostrador', 'Delivery', 'Online', 'Tarjetas', 'Cta Cte']

// Los tipos que escribe el job. INICIAL/RETIRO/VACIADO son del encargado y el
// job no los toca nunca: Fudo no los expone (viven en su arqueo).
const TIPOS_DEL_JOB = ['COBRO', 'GASTO']
export const esMovimientoDelJob = (tipo) => TIPOS_DEL_JOB.includes(tipo)

const decimal = (n) => (Number(n) || 0).toFixed(2)

export function mapDia({ ventas, incluidos, gastos = [], gastosIncluidos = [], fecha, horaCorte = 6 }) {
  const cerradas = ventas.filter((v) => v.attributes.saleState === 'CLOSED')
  if (!cerradas.length) return null

  // Los included de /expenses van al mismo índice: los ids de PaymentMethod
  // son los mismos objetos en las dos respuestas de la misma cuenta.
  const idx = {}
  for (const i of [...incluidos, ...gastosIncluidos]) idx[`${i.type}:${i.id}`] = i

  const { desde, hasta } = ventanaDia(fecha, horaCorte)
  const anuladas = ventas.length - cerradas.length

  let total = 0, efectivo = 0, fiscal = 0, comensales = 0, tarjetas = 0, ctaCte = 0
  const porCode = new Map() // code -> { monto, cantidad, name }
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
      const metodo = idx[`PaymentMethod:${pago.relationships?.paymentMethod?.data?.id}`]?.attributes
      const code = metodo?.code
      const name = metodo?.name
      // `amount` es lo imputado a la venta, que es lo que queda en la caja.
      // `receivedAmount` incluiria el vuelto, y ademas no se puede pedir desde
      // /sales (fields[payment] devuelve 400 ahi).
      const monto = Number(pago.attributes.amount || 0)
      if (esEfectivo(code, name)) efectivo += monto
      if (esTarjeta(code, name)) tarjetas += monto
      if (esCuentaCorriente(code, name)) { ctaCte += monto; continue }
      const acc = porCode.get(code) || { monto: 0, cantidad: 0, name }
      acc.monto += monto
      acc.cantidad++
      porCode.set(code, acc)
    }
  }
  porDetalle.set('Tarjetas', tarjetas)
  porDetalle.set('Cta Cte', ctaCte)

  const movimientos = [...porCode.entries()].map(([code, v]) => ({
    tipo: 'COBRO', code, name: v.name, monto: decimal(v.monto), cantidad: v.cantidad,
  }))
  for (const g of gastos) {
    if (g.attributes.canceled) continue // anulado: nunca salio de la caja
    if (!g.attributes.useInCashCount) continue // el resto no salio de la caja
    // El metodo real del gasto viene por relationships.paymentMethod (pedirlo
    // en fields[expense], ver api.js). Antes se cargaba todo como Efectivo
    // fijo. Si la relacion no vino, Efectivo sigue siendo el fallback: es lo
    // que significa useInCashCount.
    const metodo = idx[`PaymentMethod:${g.relationships?.paymentMethod?.data?.id}`]?.attributes
    movimientos.push({
      tipo: 'GASTO',
      code: metodo?.code ?? 'cash',
      name: metodo?.name ?? 'Efectivo',
      monto: decimal(g.attributes.amount),
      cantidad: 1,
    })
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
    // Metodos completos (code + name) vistos en el dia, para que se
    // resuelvan por nombre contra el catalogo -- ver jobs/fudo/metodos.js.
    metodos: (() => {
      const vistos = new Map([...porCode.entries()].map(([code, v]) => [code, { code, name: v.name }]))
      // Los gastos aportan su propio metodo (ya no es siempre Efectivo).
      for (const m of movimientos) {
        if (m.tipo === 'GASTO' && !vistos.has(m.code)) vistos.set(m.code, { code: m.code, name: m.name })
      }
      return [...vistos.values()]
    })(),
  }
}
