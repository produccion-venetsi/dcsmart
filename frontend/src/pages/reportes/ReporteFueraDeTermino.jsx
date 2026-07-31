import { useState, useEffect, useMemo } from 'react'
import { reportesApi } from '../../api/reportes.js'
import { useUiStore } from '../../store/uiStore.js'
import { downloadExcel } from '../../lib/excel.js'
import { fmtDateUTC, fmtMonthUTC } from '../../lib/dates.js'

// Facturas cargadas dentro del rango pero cuyo período es de un mes anterior al
// de la carga: son las que cambian los números de un informe ya enviado al
// cliente. El criterio lo define el backend (lib/fueraDeTermino.js).
//
// Las dos columnas del medio -- Período y Cargado el -- son el punto del
// reporte: verlas una al lado de la otra es lo que hace visible el desfasaje.

function fmt$(n) {
  return n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}

// created_at es un instante real: se muestra en hora de Argentina, con la hora
// incluida, porque el caso borde de este reporte es justamente lo cargado de
// noche el último día del mes.
function fmtFechaHora(v) {
  if (!v) return ''
  return new Date(v).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

export default function ReporteFueraDeTermino({ applied, activeLocal }) {
  const notify = useUiStore((s) => s.notify)
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!applied?.desde || !applied?.hasta) return
    const ctrl = new AbortController()
    setLoading(true)
    reportesApi.fueraDeTermino({
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal?.id ? { id_local: activeLocal.id } : {}),
    }, ctrl.signal)
      .then(({ data }) => setRows(data.data))
      .catch((err) => {
        if (ctrl.signal.aborted) return
        notify(err.response?.data?.error || 'Error al cargar el reporte', 'error')
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied?.desde, applied?.hasta, activeLocal?.id, notify])

  const total = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.importe ?? 0), 0),
    [rows]
  )

  const exportar = async () => {
    if (!rows.length) { notify('No hay facturas fuera de término en el período', 'info'); return }
    setExporting(true)
    try {
      const columns = [
        { label: 'Nro OP',        get: (r) => r.nro_ord ?? '' },
        { label: 'Local',         get: (r) => r.local || '' },
        { label: 'Proveedor',     get: (r) => r.proveedor || '' },
        { label: 'Tipo',          get: (r) => r.id_tipo || '' },
        { label: 'Fecha Fact.',   get: (r) => r.fecha ? fmtDateUTC(r.fecha) : '' },
        { label: 'Período',       get: (r) => r.periodo ? fmtMonthUTC(r.periodo) : '' },
        { label: 'Cargado el',    get: (r) => fmtFechaHora(r.created_at) },
        { label: 'Importe',       get: (r) => r.importe ?? 0, total: true },
        { label: 'Pagado',        get: (r) => r.pagado ? 'Sí' : 'No' },
        { label: 'Cargado por',   get: (r) => r.cargado_por || '' },
      ]

      // Misma convención que los otros exports: TOTAL en la primera celda y
      // vacío en las columnas que no son plata.
      const filaTotal = columns.map((c, i) => {
        if (i === 0) return 'TOTAL'
        if (!c.total) return ''
        const suma = rows.reduce((acc, r) => acc + Number(c.get(r) || 0), 0)
        return Math.round(suma * 100) / 100
      })

      await downloadExcel(
        `fuera_de_termino_${applied.desde}_a_${applied.hasta}.xlsx`,
        rows, columns, 'Fuera de término', filaTotal,
      )
    } catch {
      notify('Error al exportar el reporte', 'error')
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
            ? 'Sin facturas fuera de término en el período'
            : `${rows.length} factura${rows.length === 1 ? '' : 's'} de un período anterior al mes en que se cargaron · por fecha de carga`}
        </span>
        <button className="btn btn-secondary" onClick={exportar} disabled={exporting || !rows.length}>
          {exporting ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : null} Exportar Excel
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="pdp-empty">
          Ninguna factura cargada en el rango elegido pertenece a un período anterior. Los informes de esos meses no cambiaron.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nro OP</th>
                <th style={{ minWidth: 120 }}>Local</th>
                <th style={{ minWidth: 140 }}>Proveedor</th>
                <th>Tipo</th>
                <th style={{ minWidth: 95 }}>Fecha Fact.</th>
                <th style={{ minWidth: 95 }}>Período</th>
                <th style={{ minWidth: 130 }}>Cargado el</th>
                <th className="td-number">Importe</th>
                <th>Pagado</th>
                <th style={{ minWidth: 120 }}>Cargado por</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="td-mono">{r.nro_ord ?? <span className="td-muted">—</span>}</td>
                  <td style={{ fontSize: 12 }}>{r.local || <span className="td-muted">—</span>}</td>
                  <td className="td-primary">{r.proveedor || <span className="td-muted">—</span>}</td>
                  <td>{r.id_tipo ? <span className="badge badge-muted">{r.id_tipo}</span> : <span className="td-muted">—</span>}</td>
                  <td>{r.fecha ? fmtDateUTC(r.fecha) : <span className="td-muted">—</span>}</td>
                  <td style={{ color: 'var(--gold-bright)', fontWeight: 600 }}>{fmtMonthUTC(r.periodo)}</td>
                  <td style={{ fontSize: 12 }}>{fmtFechaHora(r.created_at)}</td>
                  <td className="td-number">{fmt$(r.importe)}</td>
                  <td>{r.pagado ? 'Sí' : <span className="td-muted">No</span>}</td>
                  <td style={{ fontSize: 12 }}>{r.cargado_por || <span className="td-muted">—</span>}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td>TOTAL</td>
                <td colSpan={6}></td>
                <td className="td-number" style={{ color: 'var(--gold-bright)' }}>{fmt$(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
