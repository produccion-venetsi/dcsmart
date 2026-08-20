import { Fragment, useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { reportesApi } from '../../api/reportes.js'
import { multiParam } from '../../lib/filtros.js'
import { agruparInformativos } from '../../lib/gruposInformativos.js'

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})
const fmt = (n) => fmtCurrency.format(n)

// week_start es una fecha de calendario (lunes de la semana, guardada a
// medianoche UTC) -> se formatea forzando timeZone UTC para que no se corra.
function fmtSemana(week) {
  if (!week) return ''
  return new Date(week).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
}

function IcoTrendUp() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#5FC98C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8M21 7v5M21 7h-5"/>
    </svg>
  )
}
function IcoZ() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3FB6BD" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8l-8 8h8"/>
    </svg>
  )
}
function IcoTicket() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D8B98C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M4 12h16M4 17h10"/>
    </svg>
  )
}
function IcoCash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5FC98C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function SalesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: 'var(--bg-menu)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--t1)',
      boxShadow: '0 8px 24px rgba(0,0,0,.25)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Semana del {d?.label}</div>
      <div style={{ color: '#3FB6BD', fontWeight: 600 }}>{fmt(d?.total ?? 0)}</div>
    </div>
  )
}

function PayTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: 'var(--bg-menu)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--t1)',
      boxShadow: '0 8px 24px rgba(0,0,0,.25)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d?.name}</div>
      <div style={{ fontWeight: 600 }}>{fmt(d?.val ?? 0)}</div>
      <div style={{ color: 'rgba(var(--velo-rgb), .5)', fontSize: 11 }}>{d?.pct}%</div>
    </div>
  )
}

export default function ReporteCajas({ applied, activeLocal, tipoTurno }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  // Qué turno tiene abierto su desglose. Uno solo a la vez: abrir varios llena
  // la pantalla de filas y se pierde la comparación entre turnos, que es el
  // punto de la tabla.
  const [turnoAbierto, setTurnoAbierto] = useState(null)

  // tipoTurno es un array: se compara por su CSV, no por identidad de objeto,
  // para no re-disparar el fetch en cada render del padre.
  const tipoTurnoCsv = multiParam(tipoTurno)

  useEffect(() => {
    setData(null)
    setLoading(true)
    const ctrl = new AbortController()
    const params = {
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal ? { id_local: activeLocal.id } : {}),
      ...(tipoTurnoCsv ? { tipo_turno: tipoTurnoCsv } : {})
    }
    reportesApi.cajas(params, ctrl.signal)
      .then((res) => setData(res.data))
      .catch((err) => { if (!ctrl.signal.aborted) console.error(err) })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied.desde, applied.hasta, activeLocal?.id, tipoTurnoCsv])

  const kpi           = data?.kpi ?? {}
  const secondary     = data?.secondary ?? []
  const weekly        = (data?.weekly ?? []).map(w => ({ ...w, label: w.week ? fmtSemana(w.week) : w.label }))
  const fiscal        = data?.fiscal ?? {}
  const payments      = data?.payments ?? []
  const payTotal      = data?.pay_total ?? 0
  // MODELO SIMPLE: el segundo bloque pasa de "todos los detalles" (hoy
  // mezclaria cobros con sus espejos informativos) a GASTOS, que era lo que
  // el reporte no contaba en ningun lado.
  const gastos      = data?.gastos ?? []
  const gastosTotal = data?.gastos_total ?? 0
  // Agrupados en familias con la MISMA lib que el detalle de caja: canales,
  // movimientos del cajon, ajustes del POS, resumenes.
  const gruposInfo  = agruparInformativos(data?.informativos ?? [])
  const descuadre       = data?.descuadre ?? { absoluto: 0, cantidad_cajas: 0, sin_total: 0 }
  // Agrupado por clasificación (Cobros / Gastos / Informativos). Es distinto de
  // `gastos` (plano por nombre): este es el que explica el descuadre, porque
  // los informativos no entran en la diferencia de caja.
  const desgloseDetalles = data?.desglose_detalles ?? []
  const turnos        = data?.turnos ?? []

  const fiscalPct = kpi.total_ventas > 0
    ? Math.round((fiscal.fiscal / kpi.total_ventas) * 100) : 0

  const skel = loading || !data

  const showPagos  = skel || payments.length > 0
  const showGastos = skel || gastos.length > 0

  return (
    <>
      <div className="rep-period">
        <span className="rep-period-z">{kpi.count_z ?? 0} cierres Z registrados</span>
      </div>

      {/* ── KPI cards ── */}
      <div className="rep-kpi-grid cols-4">
        <div className="rep-kpi hero">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Total de ventas</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(95,201,140,.18)' }}><IcoTrendUp /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '70%', height: 42, marginBottom: 12 }} />
            : <div className="rep-kpi-value big">{fmt(kpi.total_ventas)}</div>}
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Total Z</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(63,182,189,.16)' }}><IcoZ /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(kpi.total_z)}</div>}
          <div className="rep-kpi-sub">{kpi.pct_z ?? 0}% del total · fiscal</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Ticket promedio</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(206,172,129,.18)' }}><IcoTicket /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '55%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(kpi.ticket_promedio)}</div>}
          <div className="rep-kpi-sub">ventas / tickets del período</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Efectivo</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(95,201,140,.18)' }}><IcoCash /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '55%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(kpi.efectivo)}</div>}
        </div>
      </div>

      {/* ── Control de caja: cantidad, detalles y descuadre ──
          El descuadre se suma en valor ABSOLUTO: un faltante y un sobrante iguales
          no se cancelan, porque son dos errores de carga y no cero. Sale del mismo
          calcularCuadre que usa el listado de cajas. Ver lib/descuadreAgregado.js. */}
      <div className="rep-kpi-grid cols-4">
        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Total cajas</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(63,182,189,.16)' }}><IcoZ /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '40%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{kpi.count_z ?? 0}</div>}
          <div className="rep-kpi-sub">turnos del período</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Gastos</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(206,172,129,.18)' }}><IcoTicket /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(gastosTotal)}</div>}
          <div className="rep-kpi-sub">plata que salió de la caja; no resta de la venta</div>
        </div>

        <div className={'rep-kpi' + ((descuadre.cantidad_cajas ?? 0) > 0 ? ' danger' : '')} style={{ gridColumn: 'span 2' }}>
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Descuadre</span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '50%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(descuadre.absoluto)}</div>}
          <div className="rep-kpi-sub">
            {descuadre.cantidad_cajas ?? 0} de {kpi.count_z ?? 0} cajas descuadran (desvío sumado en valor absoluto)
            {(descuadre.sin_total ?? 0) > 0 && ` · ${descuadre.sin_total} sin total cargado, no se pueden comparar`}
          </div>
          {!skel && desgloseDetalles.length > 0 && (
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: 10 }}>
              {desgloseDetalles.map((g) => (
                <div key={g.clasificacion}>
                  <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>{g.label} ({g.cantidad})</div>
                  <div className="rep-kpi-value" style={{ fontSize: 16 }}>{fmt(g.total)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Secondary strip ── */}
      <div className="rep-secondary">
        {[{ label: 'Cubiertos', val: String(kpi.cubiertos ?? 0) }, ...secondary].map((s, i) => (
          <div className="rep-secondary-item" key={i}>
            <span className="rep-secondary-label">{s.label}</span>
            <span className="rep-secondary-val" style={{ color: s.color }}>
              {typeof s.val === 'number' ? fmt(s.val) : s.val}
            </span>
          </div>
        ))}
      </div>

      {/* ── Charts row 1 ── */}
      <div className="rep-charts-row wide">
        <div className="rep-chart-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div className="rep-chart-title">Evolución de ventas</div>
              <div className="rep-chart-sub">Facturación semanal en el período</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(var(--velo-rgb), .5)' }}>
              <span style={{ width: 18, height: 3, borderRadius: 2, background: '#3FB6BD', display: 'inline-block' }} />
              Total ventas
            </div>
          </div>
          {skel ? (
            <div className="rep-skel" style={{ width: '100%', height: 230 }} />
          ) : weekly.length === 0 ? (
            <div style={{ height: 230, display: 'grid', placeItems: 'center', color: 'rgba(var(--velo-rgb), .35)', fontSize: 13 }}>
              Sin datos para el período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={weekly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="repAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3FB6BD" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="#3FB6BD" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tickLine={false} axisLine={false}
                  tick={{ fill: 'rgba(var(--velo-rgb), .4)', fontSize: 10, fontFamily: 'Montserrat' }} />
                <YAxis tickLine={false} axisLine={false} width={60}
                  tick={{ fill: 'rgba(var(--velo-rgb), .3)', fontSize: 10, fontFamily: 'Montserrat' }}
                  tickFormatter={(v) => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                <Tooltip content={<SalesTooltip />} />
                {/* El relleno del punto es el fondo de la app (efecto "calado"):
                    #19232f era el --bg-app del tema oscuro fijo y en claro
                    quedaban puntos azul-noche macizos. */}
                <Area type="monotone" dataKey="total" stroke="#3FB6BD" strokeWidth={2.5}
                  fill="url(#repAreaGrad)" dot={{ r: 3, fill: 'var(--bg-app)', stroke: '#3FB6BD', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rep-chart-card">
          <div className="rep-chart-title">Composición fiscal</div>
          <div className="rep-chart-sub">Distribución del total facturado</div>
          {skel ? (
            <div className="rep-skel" style={{ width: 152, height: 152, borderRadius: '50%', margin: '20px auto' }} />
          ) : (
            <>
              <div className="rep-donut-wrap">
                <div style={{
                  width: 152, height: 152, borderRadius: '50%',
                  background: `conic-gradient(#159199 0 ${fiscalPct}%, #CEAC81 ${fiscalPct}% 100%)`,
                  display: 'grid', placeItems: 'center'
                }}>
                  <div style={{
                    width: 104, height: 104, borderRadius: '50%', background: 'var(--bg-app)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'rgba(var(--velo-rgb), .4)', textTransform: 'uppercase' }}>Fiscal</span>
                    {/* var(--t1) y no un color fijo: #F4F2EE era EXACTAMENTE el
                        --bg-app del tema claro y el número desaparecía. */}
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 22, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.1 }}>{fiscalPct}%</span>
                  </div>
                </div>
              </div>
              <div className="rep-donut-legend">
                <div className="rep-donut-row">
                  <span className="rep-donut-dot" style={{ background: '#159199' }} />
                  <span className="rep-donut-name">Z fiscal</span>
                  <span className="rep-donut-val">{fmt(fiscal.fiscal)}</span>
                </div>
                <div className="rep-donut-row">
                  <span className="rep-donut-dot" style={{ background: '#CEAC81' }} />
                  <span className="rep-donut-name">No fiscal</span>
                  <span className="rep-donut-val">{fmt(fiscal.no_fiscal)}</span>
                </div>
                <div className="rep-donut-sep" />
                <div className="rep-donut-row">
                  <span className="rep-donut-dot" style={{ background: '#3FB6BD' }} />
                  <span className="rep-donut-name">Digitales</span>
                  <span className="rep-donut-val">{fmt(fiscal.digital)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Desglose por turno ── */}
      {(skel || turnos.length > 0) && (
        <div className="rep-chart-card" style={{ marginBottom: '1.25rem' }}>
          <div className="rep-chart-title">Desglose por turno</div>
          <div className="rep-chart-sub">
            Tocá un turno para ver cómo te pagaron y sus gastos
          </div>
          {skel ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rep-skel" style={{ width: '100%', height: 38, marginBottom: 4 }} />
            ))
          ) : (
            <div className="table-wrap">
              <table className="data-table rep-turnos-table">
                <thead>
                  <tr>
                    <th style={{ width: 22 }}></th>
                    <th>Turno</th>
                    <th className="num">Total</th>
                    <th className="num">Cub</th>
                    <th className="num">Prom Cub</th>
                    <th className="num">% Fiscal</th>
                    <th className="num">Z</th>
                  </tr>
                </thead>
                <tbody>
                  {turnos.map((t) => {
                    const abierto = turnoAbierto === t.turno
                    const tieneDesglose = t.payments.length > 0 || (t.gastos ?? []).length > 0
                    return (
                      <Fragment key={t.turno}>
                        <tr
                          className={tieneDesglose ? 'row-clickable' : undefined}
                          onClick={() => tieneDesglose && setTurnoAbierto(abierto ? null : t.turno)}
                        >
                          <td className="td-muted">{tieneDesglose ? (abierto ? '▾' : '▸') : ''}</td>
                          <td style={{ fontWeight: 600 }}>{t.turno}</td>
                          <td className="num td-number">{fmt(t.total)}</td>
                          {/* Cubiertos y su promedio quedan en — cuando la caja
                              no los carga: un 0 se leería como dato real. */}
                          <td className="num">{t.cubiertos || '—'}</td>
                          <td className="num">{t.prom_cubierto != null ? fmt(t.prom_cubierto) : '—'}</td>
                          <td className="num">{t.pct_fiscal != null ? `${t.pct_fiscal}%` : '—'}</td>
                          <td className="num td-muted">{t.count_z}</td>
                        </tr>
                        {abierto && (
                          <tr>
                            <td></td>
                            <td colSpan={6}>
                              <div className="rep-turno-desglose">
                                {t.payments.length > 0 && (
                                  <div>
                                    <div className="rep-turno-desglose-tit">Medios de cobro</div>
                                    {t.payments.map((p, i) => (
                                      <div className="rep-pay-row" key={i}>
                                        <span className="rep-pay-dot" style={{ background: p.color }} />
                                        <span className="rep-pay-name">{p.name}</span>
                                        <span className="rep-pay-amount">{fmt(p.val)}</span>
                                        <span className="rep-pay-pct">{p.pct}%</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {(t.gastos ?? []).length > 0 && (
                                  <div>
                                    <div className="rep-turno-desglose-tit">Gastos</div>
                                    {t.gastos.map((d, i) => (
                                      <div className="rep-pay-row" key={i}>
                                        <span className="rep-pay-dot" style={{ background: d.color }} />
                                        <span className="rep-pay-name">{d.name}</span>
                                        <span className="rep-pay-amount">{fmt(d.val)}</span>
                                        <span className="rep-pay-pct">{d.pct}%</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  {/* El total repite los KPI de arriba a propósito: es lo que
                      permite ver de un vistazo que los turnos suman el período
                      y que no falta ninguno. */}
                  <tr className="rep-turnos-total">
                    <td></td>
                    <td>Total</td>
                    <td className="num td-number">{fmt(kpi.total_ventas ?? 0)}</td>
                    <td className="num">{kpi.cubiertos || '—'}</td>
                    <td className="num">
                      {kpi.cubiertos > 0 ? fmt(Math.round((kpi.total_ventas ?? 0) / kpi.cubiertos)) : '—'}
                    </td>
                    <td className="num">{kpi.pct_z != null ? `${kpi.pct_z}%` : '—'}</td>
                    <td className="num td-muted">{kpi.count_z ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Pagos / Gastos: gráfico + tabla emparejados por bloque,
          cada bloque desaparece entero si esa fuente no tiene datos ── */}
      {(showPagos || showGastos) && (
        <div className="rep-charts-row paired"
          style={{ gridTemplateColumns: showPagos && showGastos ? '1fr 1fr' : '1fr' }}>

          {showPagos && (
            <div className="rep-paired-col">
              <div className="rep-chart-card">
                <div className="rep-chart-title">Cómo te pagaron</div>
                <div className="rep-chart-sub">La venta del período por medio de pago; Efectivo es lo contado en caja</div>
                {skel ? (
                  <div className="rep-skel" style={{ width: '100%', height: 220 }} />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={payments} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                      <XAxis dataKey="name" tickLine={false} axisLine={false}
                        tick={{ fill: 'rgba(var(--velo-rgb), .4)', fontSize: 9, fontFamily: 'Montserrat' }}
                        interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tickLine={false} axisLine={false} width={60}
                        tick={{ fill: 'rgba(var(--velo-rgb), .3)', fontSize: 10, fontFamily: 'Montserrat' }}
                        tickFormatter={(v) => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                      <Tooltip content={<PayTooltip />} cursor={{ fill: 'rgba(var(--velo-rgb), .04)', radius: 6 }} />
                      <Bar dataKey="val" radius={[5, 5, 0, 0]}>
                        {payments.map((p, i) => (
                          <Cell key={i} fill={p.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="rep-chart-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span className="rep-chart-title" style={{ marginBottom: 0 }}>Detalle por medio</span>
                  <span style={{ fontSize: 11, color: 'rgba(var(--velo-rgb), .4)' }}>% del total</span>
                </div>
                {skel ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rep-skel" style={{ width: '100%', height: 36, marginBottom: 2 }} />
                  ))
                ) : (
                  <>
                    {payments.map((p, i) => (
                      <div className="rep-pay-row" key={i}>
                        <span className="rep-pay-dot" style={{ background: p.color }} />
                        <span className="rep-pay-name">{p.name}</span>
                        <span className="rep-pay-amount">{fmt(p.val)}</span>
                        <span className="rep-pay-pct">{p.pct}%</span>
                      </div>
                    ))}
                    <div className="rep-pay-total">
                      <span>Total cobrado</span>
                      <span>{fmt(payTotal)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Gastos del período: lo único que faltaba contar. En el modelo
              simple el gasto NO resta de la venta, se informa aparte. */}
          {showGastos && (
            <div className="rep-paired-col">
              <div className="rep-chart-card">
                <div className="rep-chart-title">Gastos</div>
                <div className="rep-chart-sub">Plata que salió de la caja en el período; no resta de la venta</div>
                {skel ? (
                  <div className="rep-skel" style={{ width: '100%', height: 220 }} />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={gastos} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                      <XAxis dataKey="name" tickLine={false} axisLine={false}
                        tick={{ fill: 'rgba(var(--velo-rgb), .4)', fontSize: 9, fontFamily: 'Montserrat' }}
                        interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tickLine={false} axisLine={false} width={60}
                        tick={{ fill: 'rgba(var(--velo-rgb), .3)', fontSize: 10, fontFamily: 'Montserrat' }}
                        tickFormatter={(v) => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                      <Tooltip content={<PayTooltip />} cursor={{ fill: 'rgba(var(--velo-rgb), .04)', radius: 6 }} />
                      <Bar dataKey="val" radius={[5, 5, 0, 0]}>
                        {gastos.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="rep-chart-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span className="rep-chart-title" style={{ marginBottom: 0 }}>Detalle por gasto</span>
                  <span style={{ fontSize: 11, color: 'rgba(var(--velo-rgb), .4)' }}>% del total</span>
                </div>
                {skel ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rep-skel" style={{ width: '100%', height: 36, marginBottom: 2 }} />
                  ))
                ) : (
                  <>
                    {gastos.map((d, i) => (
                      <div className="rep-pay-row" key={i}>
                        <span className="rep-pay-dot" style={{ background: d.color }} />
                        <span className="rep-pay-name">{d.name}</span>
                        <span className="rep-pay-amount">{fmt(d.val)}</span>
                        <span className="rep-pay-pct">{d.pct}%</span>
                      </div>
                    ))}
                    <div className="rep-pay-total">
                      <span>Total gastos</span>
                      <span>{fmt(gastosTotal)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Informativo: el desglose de lo que ya está contado, agrupado por
          familia igual que en el detalle de la caja. No suma en ninguna
          cuenta del reporte. ── */}
      {!skel && gruposInfo.length > 0 && (
        <div className="rep-chart-card" style={{ marginTop: 14 }}>
          <div className="rep-chart-title">Informativo</div>
          <div className="rep-chart-sub">No suma en ninguna cuenta: es el desglose de lo que ya está contado</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px 28px' }}>
            {gruposInfo.map((g) => (
              <div key={g.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: g.color }}>{g.titulo}</span>
                  <strong style={{ fontSize: 12.5 }}>{fmt(g.total)}</strong>
                </div>
                <p style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--t3)', margin: '4px 0 6px' }}>{g.ayuda}</p>
                {g.lineas.map((l) => (
                  <div key={l.nombre}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                      <span style={{ color: 'var(--t2)', fontWeight: 600 }}>
                        {l.nombre}
                        {l.cantidad != null && l.cantidad > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--t4)' }}>x {l.cantidad}</span>
                        )}
                      </span>
                      <strong>{fmt(l.total)}</strong>
                    </div>
                    {l.items.length > 1 && l.items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0 1px 12px', color: 'var(--t3)' }}>
                        <span>{it.nombre}</span><span>{fmt(it.monto)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
