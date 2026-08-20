import { useState, useEffect, useMemo } from 'react'
import { reportesApi } from '../../api/reportes.js'
import { useUiStore } from '../../store/uiStore.js'
import { downloadExcel } from '../../lib/excel.js'
import { esIngreso, conSignoIngreso } from '../../lib/exportPagos.js'
import { fmtDateUTC } from '../../lib/dates.js'

// Reporte de comprobantes fiscales para contabilidad. Los tipos que entran los
// fija el backend (TIPOS_BALANCE en routes/reportes.js), no este componente:
// el reporte se define por ese conjunto.
//
// El orden de las alícuotas sigue el enum TipoImpuesto de schema.prisma, para
// que las columnas salgan siempre iguales entre exports. Es el mismo criterio
// que lib/exportPagos.js usa para el export de pagos.
const ORDEN_IVAS = ['IVA21', 'IVA27', 'IVA10', 'RETENCION', 'PERCEPCION']

function fmt$(n) {
  return n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}
function fmtPV(v)  { return v != null ? String(v).padStart(5, '0') : '' }
function fmtNro(v) { return v != null ? String(v).padStart(8, '0') : '' }

// Suma los impuestos de un comprobante por alícuota.
function ivasDe(row) {
  const acc = {}
  for (const imp of row.impuestos ?? []) {
    acc[imp.tipo] = (acc[imp.tipo] ?? 0) + Number(imp.monto ?? 0)
  }
  return acc
}

export default function ReporteBalance({ applied, activeLocal }) {
  const notify = useUiStore((s) => s.notify)
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!applied?.desde || !applied?.hasta) return
    const ctrl = new AbortController()
    setLoading(true)
    reportesApi.balance({
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal?.id ? { id_local: activeLocal.id } : {}),
    }, ctrl.signal)
      .then(({ data }) => setRows(data.data))
      .catch((err) => {
        if (ctrl.signal.aborted) return
        notify(err.response?.data?.error || 'Error al cargar el balance', 'error')
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied?.desde, applied?.hasta, activeLocal?.id, notify])

  // Solo se muestran las columnas de IVA que aparecen en el período, para que
  // el reporte no arrastre tres columnas en cero.
  const ivasPresentes = useMemo(() => {
    const set = new Set()
    for (const r of rows) for (const imp of r.impuestos ?? []) set.add(imp.tipo)
    const conocidos = ORDEN_IVAS.filter(t => set.has(t))
    const resto = [...set].filter(t => !ORDEN_IVAS.includes(t)).sort()
    return [...conocidos, ...resto]
  }, [rows])

  // En el libro de IVA compras la nota de crédito ACREDITA: resta del neto,
  // del IVA y del total. Mismo criterio que el resto de la app (la dirección,
  // ver lib/exportPagos.js) para que la pantalla, el Excel y los KPI de Pagos
  // den el mismo número.
  const totales = useMemo(() => {
    const t = { neto: 0, total: 0, ivas: {} }
    for (const r of rows) {
      const signo = esIngreso(r) ? -1 : 1
      t.neto  += signo * Number(r.importe_neto ?? 0)
      t.total += signo * Number(r.importe ?? 0)
      const ivas = ivasDe(r)
      for (const [tipo, monto] of Object.entries(ivas)) {
        t.ivas[tipo] = (t.ivas[tipo] ?? 0) + signo * monto
      }
    }
    return t
  }, [rows])

  const exportar = async () => {
    if (!rows.length) { notify('No hay comprobantes en el período', 'info'); return }
    setExporting(true)
    try {
      // conSignoIngreso al final, igual que el export de Pagos: las columnas de
      // adentro traen el valor CRUDO y el signo se pone en un solo lugar.
      const columns = conSignoIngreso([
        { label: 'Proveedor',    get: (r) => r.proveedor?.nombre || '' },
        { label: 'Razón Social', get: (r) => r.proveedor?.razon_social || '' },
        { label: 'CUIT',         get: (r) => r.proveedor?.cuit || '' },
        { label: 'Tipo',         get: (r) => r.id_tipo || '' },
        { label: 'PV',           get: (r) => fmtPV(r.pv) },
        { label: 'Nro',          get: (r) => fmtNro(r.nro) },
        { label: 'Fecha Fact.',  get: (r) => r.fecha ? fmtDateUTC(r.fecha) : '' },
        { label: 'Neto',         get: (r) => r.importe_neto ?? 0, total: true },
        ...ivasPresentes.map(tipo => ({
          label: tipo,
          get: (r) => ivasDe(r)[tipo] ?? 0,
          total: true,
        })),
        { label: 'Total',        get: (r) => r.importe ?? 0, total: true },
        { label: 'FDP',          get: (r) => r.metodo_pago?.nombre || '' },
      ])

      // Misma convención que el export de pagos: TOTAL en la primera celda y
      // vacío en las columnas que no son plata.
      const filaTotal = columns.map((c, i) => {
        if (i === 0) return 'TOTAL'
        if (!c.total) return ''
        const suma = rows.reduce((acc, r) => acc + Number(c.get(r) || 0), 0)
        return Math.round(suma * 100) / 100
      })

      await downloadExcel(
        `balance_${applied.desde}_a_${applied.hasta}.xlsx`,
        rows, columns, 'Balance', filaTotal,
      )
    } catch {
      notify('Error al exportar el balance', 'error')
    } finally { setExporting(false) }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--t2)' }}>
          {rows.length === 0
            ? 'Sin comprobantes fiscales en el período'
            : `${rows.length} comprobante${rows.length === 1 ? '' : 's'} · tipos A, C, M, NDA y NCA · por fecha de factura`}
        </span>
        <button className="btn btn-secondary" onClick={exportar} disabled={exporting || !rows.length}>
          {exporting ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : null} Exportar Excel
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="pdp-empty">No hay comprobantes de tipo A, C, M, NDA o NCA con fecha de factura en el rango elegido.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Proveedor</th>
                <th style={{ minWidth: 160 }}>Razón Social</th>
                <th style={{ minWidth: 110 }}>CUIT</th>
                <th>Tipo</th>
                <th style={{ minWidth: 110 }}>PV / Nro</th>
                <th style={{ minWidth: 95 }}>Fecha Fact.</th>
                <th className="td-number">Neto</th>
                {ivasPresentes.map(t => <th key={t} className="td-number">{t}</th>)}
                <th className="td-number">Total</th>
                <th>FDP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const ivas = ivasDe(r)
                const signo = esIngreso(r) ? -1 : 1
                return (
                  <tr key={r.id}>
                    <td className="td-primary">{r.proveedor?.nombre || <span className="td-muted">—</span>}</td>
                    <td style={{ fontSize: 12 }}>{r.proveedor?.razon_social || <span className="td-muted">—</span>}</td>
                    <td className="td-mono" style={{ fontSize: 12 }}>{r.proveedor?.cuit || <span className="td-muted">—</span>}</td>
                    <td><span className="badge badge-muted">{r.id_tipo}</span></td>
                    <td className="td-mono" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {fmtPV(r.pv)}<span className="td-muted">-</span>{fmtNro(r.nro)}
                    </td>
                    <td>{fmtDateUTC(r.fecha)}</td>
                    {/* Una NC se ve negativa y en verde, igual que en Pagos:
                        esa plata se acredita, no se gasta. */}
                    <td className="td-number">{signo < 0 ? '−' : ''}{fmt$(r.importe_neto)}</td>
                    {ivasPresentes.map(t => (
                      <td key={t} className="td-number">{ivas[t] ? `${signo < 0 ? '−' : ''}${fmt$(ivas[t])}` : <span className="td-muted">—</span>}</td>
                    ))}
                    <td className="td-number" style={{ color: signo < 0 ? 'var(--green)' : 'var(--gold-bright)', fontWeight: 700 }}>
                      {signo < 0 ? '−' : ''}{fmt$(r.importe)}
                    </td>
                    <td style={{ fontSize: 12 }}>{r.metodo_pago?.nombre || <span className="td-muted">—</span>}</td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td>TOTAL</td>
                <td colSpan={5}></td>
                <td className="td-number">{fmt$(totales.neto)}</td>
                {ivasPresentes.map(t => (
                  <td key={t} className="td-number">{fmt$(totales.ivas[t] ?? 0)}</td>
                ))}
                <td className="td-number" style={{ color: 'var(--gold-bright)' }}>{fmt$(totales.total)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
