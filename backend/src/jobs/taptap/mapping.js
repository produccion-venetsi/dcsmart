// Transforma UN turno crudo de la API de TapTap en las filas que hay que
// insertar en DCSmart. Función pura -- no toca la base ni hace fetch, para
// poder testearla con fixtures reales sin mockear nada de Prisma/red.

// Tipos de movimiento por caja que sí tienen un TipoMovimiento equivalente
// en el schema (ver enum TipoMovimiento). El resto (ajustes/diffs/alivios/
// transfers/proveedores/empleados/clientes) no son flujo de caja real --
// van como CajaDetalle informativo si tienen datos (ver mapDetallesInformativos).
const TIPO_MOVIMIENTO_POR_ARRAY = {
  inicial: 'INICIAL',
  cobranzas: 'COBRO',
  gastos: 'GASTO',
  retiros: 'RETIRO',
  vaciados: 'VACIADO',
  ingresos: 'INGRESO',
  egresos: 'EGRESO',
}

// Arrays que NO son flujo de caja real (correcciones de auditoría, traspasos
// internos entre cajas del mismo turno, desglose por contraparte) -- se
// guardan como CajaDetalle informativo, solo si tienen algo adentro.
const ARRAYS_INFORMATIVOS = ['ajustes', 'diffs', 'alivios', 'transfers', 'proveedores', 'empleados', 'clientes']

function toDecimalString(n) {
  return String(Math.abs(Number(n) || 0))
}

export function mapTurno(turno) {
  const info = turno.info || {}
  const header = info.header || {}
  const sales = info.sales || {}
  const fiscal = info.fiscal || {}
  const audit = info.audit || {}
  const cash = info.cash || []

  // ── Caja ──
  const obsParts = []
  if (header.note) obsParts.push(header.note)
  if (fiscal.nofiscal) obsParts.push(`No fiscal: ${fiscal.nofiscal}`)
  const descuentos = audit.descuentos?.monto || 0
  const contraordenes = audit.contraordenes?.monto || 0
  const recargos = audit.recargos?.monto || 0
  if (descuentos) obsParts.push(`Descuentos: ${descuentos}`)
  if (contraordenes) obsParts.push(`Contraórdenes: ${contraordenes}`)
  if (recargos) obsParts.push(`Recargos: ${recargos}`)

  const caja = {
    id_externo: String(turno.id),
    nro_turno: header.secuenciador != null ? String(header.secuenciador) : null,
    fecha_inicio: header.desde ? new Date(header.desde) : null,
    fecha_cierre: header.hasta ? new Date(header.hasta) : null,
    cajero: header.autor || null,
    total: toDecimalString(sales.totalmonto),
    efectivo: toDecimalString(sales.cobrosefectivomonto),
    fiscal: toDecimalString(fiscal.totalmonto),
    comensales: sales.ventassaloncantidad != null ? Math.round(sales.ventassaloncantidad) : null,
    observaciones: obsParts.length ? obsParts.join(' | ') : null,
  }

  // ── CajaMovimiento (por cada caja/registradora del turno) ──
  const movimientos = []
  for (const c of cash) {
    for (const [arrayKey, tipo] of Object.entries(TIPO_MOVIMIENTO_POR_ARRAY)) {
      const items = c[arrayKey]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        movimientos.push({
          tipo,
          monedaname: item.monedaname || item.name || 'General',
          monto: Math.abs(Number(item.monto) || 0),
          cantidad: item.groupCount || 1,
        })
      }
    }
  }

  // ── CajaDetalle que siempre se crean (aunque sean 0) ──
  const detallesSiempre = [
    { nombre: 'Delivery', monto: Number(sales.ventasdeliverymonto) || 0 },
    { nombre: 'Takeaway', monto: Number(sales.ventastakeawaymonto) || 0 },
    { nombre: 'Salón', monto: Number(sales.ventassalonmonto) || 0 },
    { nombre: 'Web', monto: Number(sales.ventaswebmonto) || 0 },
    { nombre: 'Tarjetas', monto: Number(sales.cobrostarjetasmonto) || 0 },
    { nombre: 'Cta Cte', monto: Number(sales.cobrosctactemonto) || 0 },
  ]

  // ── CajaDetalle que solo se crean si tienen datos ──
  const detallesSiOcurren = []
  if (Number(sales.abiertasmonto) > 0) {
    detallesSiOcurren.push({ nombre: 'Mesas Abiertas', monto: Number(sales.abiertasmonto) })
  }
  if (Number(sales.cobrarmonto) > 0) {
    detallesSiOcurren.push({ nombre: 'A Cobrar', monto: Number(sales.cobrarmonto) })
  }
  for (const c of cash) {
    for (const arrayKey of ARRAYS_INFORMATIVOS) {
      const items = c[arrayKey]
      if (!Array.isArray(items) || items.length === 0) continue
      for (const item of items) {
        const monto = Math.abs(Number(item.monto) || 0)
        if (!monto) continue
        const metodo = item.monedaname || item.name || 'General'
        detallesSiOcurren.push({
          nombre: `${arrayKey} · ${metodo} · ${c.name || 'Caja ' + c.id}`,
          monto,
        })
      }
    }
  }

  return { caja, movimientos, detallesSiempre, detallesSiOcurren }
}
