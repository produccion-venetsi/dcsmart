import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { reportesApi } from '../../api/reportes.js'

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})
const fmt = (n) => fmtCurrency.format(n)

const CAT_COLORS = {
  alimentos: { bar: '#4CAF7D', gradient: 'linear-gradient(90deg,rgba(76,175,125,.06),rgba(76,175,125,.34))' },
  bebidas:   { bar: '#C9B086', gradient: 'linear-gradient(90deg,rgba(201,176,134,.06),rgba(201,176,134,.32))' },
  movstock:  { bar: '#5FA8D9', gradient: 'linear-gradient(90deg,rgba(95,168,217,.06),rgba(95,168,217,.32))' },
}

function CmvTooltip({ active, payload }) {
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
    </div>
  )
}

function KpiCard({ label, val }) {
  return (
    <div className="rep-kpi">
      <div className="rep-kpi-head">
        <span className="rep-kpi-label">{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="rep-kpi-value med">{val}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t3)' }}>%</span>
      </div>
    </div>
  )
}

// El detalle de una categoría: qué proveedores la componen. Se pide recién al
// abrir (una categoría puede no interesar nunca) y se cachea por clave para
// que cerrar y reabrir no vuelva a pegar.
function DetalleCategoria({ detalle }) {
  if (detalle === 'cargando') {
    return <div style={{ padding: '8px 12px' }}><span className="skel" style={{ width: '70%', display: 'inline-block' }} /></div>
  }
  if (detalle === 'error') {
    return <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--red)' }}>No se pudo cargar el detalle.</div>
  }
  if (!detalle?.proveedores?.length) {
    return <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--t3)' }}>Sin pagos en el rango.</div>
  }
  return (
    <div style={{ padding: '6px 4px 10px 18px', borderBottom: '1px solid var(--border)' }}>
      {detalle.proveedores.map((pr, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '3px 0' }}>
          <span style={{ color: 'var(--t2)' }}>
            {pr.nombre}
            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--t4)' }}>x {pr.cantidad}</span>
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(pr.total)}</span>
        </div>
      ))}
    </div>
  )
}

function CostTable({ title, dotColor, items, total, gradient, onToggle, abierta, detalles }) {
  return (
    <div className="rep-chart-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 'auto' }}>$</span>
      </div>
      {items.map((r, i) => (
        <div key={i}>
          {/* La fila abre la composición de la categoría: qué proveedores la
              forman y por cuánto. El número deja de ser opaco. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onToggle(r.name)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(r.name) } }}
            title={abierta === r.name ? 'Cerrar el detalle' : `Ver qué compone ${r.name}`}
            style={{
              display: 'grid', gridTemplateColumns: '14px 1fr 168px', alignItems: 'center',
              height: 33, borderBottom: '1px solid var(--border)', cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--t4)' }}>{abierta === r.name ? '▾' : '▸'}</span>
            <span style={{ fontSize: 13, color: 'var(--t2)' }}>{r.name}</span>
            <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: 5, bottom: 5, right: 0,
                width: `${r.h}%`, background: gradient, borderRadius: 4
              }} />
              <span style={{
                position: 'relative', fontSize: 13, fontWeight: 500,
                color: 'var(--t1)', paddingRight: 8, fontVariantNumeric: 'tabular-nums'
              }}>{fmt(r.val)}</span>
            </div>
          </div>
          {abierta === r.name && <DetalleCategoria detalle={detalles[r.name]} />}
        </div>
      ))}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center',
        height: 40, marginTop: 4, borderTop: '1px solid var(--border-hi)'
      }}>
        {/* var(--t1): el #fff fijo dejaba el total del reporte blanco sobre
            fondo claro (ilegible en modo claro). */}
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Total</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
      </div>
    </div>
  )
}

function CostChart({ title, items, barColor }) {
  return (
    <div className="rep-chart-card">
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 16 }}>
        Costo por categoría · {title}
      </div>
      {items.length === 0 ? (
        <div style={{ height: 172, display: 'grid', placeItems: 'center', color: 'var(--t3)', fontSize: 13 }}>
          Sin datos
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={items} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="name" tickLine={false} axisLine={false}
              tick={{ fill: 'rgba(var(--velo-rgb), .4)', fontSize: 9, fontFamily: 'Montserrat' }}
              interval={0} angle={-25} textAnchor="end" height={55} />
            <YAxis tickLine={false} axisLine={false} width={55}
              tick={{ fill: 'rgba(var(--velo-rgb), .3)', fontSize: 10, fontFamily: 'Montserrat' }}
              tickFormatter={(v) => v >= 1000 ? Math.round(v / 1000) + 'k' : v} />
            <Tooltip content={<CmvTooltip />} cursor={{ fill: 'rgba(var(--velo-rgb), .04)' }} />
            <Bar dataKey="val" radius={[4, 4, 0, 0]}>
              {items.map((_, i) => <Cell key={i} fill={barColor} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default function ReporteCMV({ modo, mes, desde, hasta, activeLocal }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  // El CMV se lee por período contable (`pago.periodo`) cuando se pide un mes
  // o meses enteros: una factura de junio cargada en julio pertenece a junio.
  // Un rango de días PARCIAL (una semana) es otra pregunta y va por fecha de
  // carga: la respuesta trae `modo` y esta pantalla lo dice. Ver
  // backend/src/lib/rangoCmv.js.

  useEffect(() => {
    setData(null)
    setLoading(true)
    const ctrl = new AbortController()
    const local = activeLocal ? { id_local: activeLocal.id } : {}
    const params = modo === 'mes' ? { mes, ...local } : { desde, hasta, ...local }
    reportesApi.cmv(params, ctrl.signal)
      .then((res) => setData(res.data))
      .catch((err) => { if (!ctrl.signal.aborted) console.error(err) })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [modo, mes, desde, hasta, activeLocal?.id])

  const kpis        = data?.kpis ?? []
  const alimentos   = data?.alimentos ?? []
  const bebidas     = data?.bebidas ?? []
  const movstock    = data?.movstock ?? []
  const totAlim     = data?.total_alimentos ?? 0
  const totBeb      = data?.total_bebidas ?? 0
  const totMovstock = data?.total_movstock ?? 0
  const ventasTotal = data?.ventas_total ?? 0
  const cmvMonto    = data?.cmv_total_monto ?? 0
  const cmvPct      = data?.cmv_total_pct ?? '0.00'
  const modoCmv     = data?.modo

  // Los KPIs de categoría (Alimentos/Bebidas/MovStock). El CMV Total va en la
  // tarjeta de fórmula de arriba, no como KPI suelto.
  const kpisCat = kpis.filter(k => k.label !== 'CMV Total')


  const skel = loading || !data

  // Drill-down por categoría: una sola abierta por grupo (clave grupo|nombre),
  // detalle cacheado para que reabrir no vuelva a pegar. Cambiar el rango o el
  // local invalida todo: los números tienen que hablar del rango visible.
  const [abiertaKey, setAbiertaKey] = useState(null)
  const [detalles, setDetalles] = useState({})
  useEffect(() => { setAbiertaKey(null); setDetalles({}) }, [modo, mes, desde, hasta, activeLocal?.id])

  const toggleCategoria = (grupo) => (nombre) => {
    const key = `${grupo}|${nombre}`
    if (abiertaKey === key) { setAbiertaKey(null); return }
    setAbiertaKey(key)
    if (detalles[key]) return
    setDetalles(prev => ({ ...prev, [key]: 'cargando' }))
    const local = activeLocal ? { id_local: activeLocal.id } : {}
    const rangoParams = modo === 'mes' ? { mes } : { desde, hasta }
    reportesApi.cmvDetalle({ ...rangoParams, ...local, categoria: nombre, grupo })
      .then((res) => setDetalles(prev => ({ ...prev, [key]: res.data })))
      .catch(() => setDetalles(prev => ({ ...prev, [key]: 'error' })))
  }
  // Cada tabla recibe su vista: la abierta sin el prefijo de grupo, y los
  // detalles reindexados por nombre pelado.
  const vistaGrupo = (grupo) => ({
    abierta: abiertaKey?.startsWith(`${grupo}|`) ? abiertaKey.slice(grupo.length + 1) : null,
    detalles: Object.fromEntries(Object.entries(detalles)
      .filter(([k]) => k.startsWith(`${grupo}|`))
      .map(([k, v]) => [k.slice(grupo.length + 1), v])),
    onToggle: toggleCategoria(grupo),
  })

  return (
    <>
      {/* ── Fórmula del CMV Total: Ventas y CMV ($ de pagos) -> CMV Total % ── */}
      {skel ? (
        <div className="rep-chart-card" style={{ marginBottom: 18 }}>
          <div className="rep-skel" style={{ width: '25%', height: 14, marginBottom: 18 }} />
          <div className="rep-skel" style={{ width: '70%', height: 34 }} />
        </div>
      ) : (
        <div className="rep-chart-card" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>
              CMV Total
            </span>
            {/* Que esta midiendo: contable (por periodo, meses completos) o los
                dias exactos pedidos (por fecha de carga). Antes una semana se
                redondeaba al mes en silencio y el numero no era el del rango. */}
            {modoCmv === 'fecha' ? (
              <span className="badge badge-amber" title="Rango de días parcial: se suma lo CARGADO en esos días (fecha del pago), no el período contable">
                por fecha de carga · {data?.dia_desde} → {data?.dia_hasta}
              </span>
            ) : modoCmv === 'periodo' ? (
              <span className="badge badge-muted" title="Lectura contable: pagos por período (una factura de junio cargada en julio pertenece a junio)">
                período contable · {data?.mes_desde}{data?.mes_hasta !== data?.mes_desde ? ` → ${data?.mes_hasta}` : ''}
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 28 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Ventas</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{fmt(ventasTotal)}</div>
            </div>
            <span style={{ fontSize: 24, color: 'var(--t4)', fontWeight: 300 }}>·</span>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>CMV (pagos)</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{fmt(cmvMonto)}</div>
            </div>
            <span style={{ fontSize: 24, color: 'var(--t4)', fontWeight: 300, marginLeft: 'auto' }}>=</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>CMV Total <span style={{ color: 'var(--t4)' }}>(CMV / Ventas)</span></div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--gold-bright)', fontVariantNumeric: 'tabular-nums' }}>{cmvPct}</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold-bright)' }}>%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI cards por categoría ── */}
      {skel ? (
        <div className="rep-kpi-grid cols-3">
          {[0,1,2].map(i => (
            <div key={i} className="rep-kpi">
              <div className="rep-skel" style={{ width: '50%', height: 14, marginBottom: 14 }} />
              <div className="rep-skel" style={{ width: '65%', height: 28, marginBottom: 12 }} />
              <div className="rep-skel" style={{ width: '40%', height: 12 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rep-kpi-grid cols-3">
          {kpisCat.map((k, i) => (
            <KpiCard key={i} label={k.label} val={k.val} />
          ))}
        </div>
      )}

      {/* ── Tables row: Alimentos / Bebidas / MovStock ── */}
      {skel ? (
        <div className="rep-3col-grid" style={{ marginBottom: 18 }}>
          {[0,1,2].map(i => (
            <div key={i} className="rep-chart-card">
              <div className="rep-skel" style={{ width: '40%', height: 14, marginBottom: 16 }} />
              {[0,1,2,3,4].map(j => (
                <div key={j} className="rep-skel" style={{ width: '100%', height: 33, marginBottom: 2 }} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="rep-3col-grid" style={{ marginBottom: 18 }}>
          <CostTable title="Alimentos" dotColor="var(--green)" items={alimentos}
            total={totAlim} gradient={CAT_COLORS.alimentos.gradient} {...vistaGrupo('alimentos')} />
          <CostTable title="Bebidas" dotColor="var(--gold)" items={bebidas}
            total={totBeb} gradient={CAT_COLORS.bebidas.gradient} {...vistaGrupo('bebidas')} />
          <CostTable title="MovStock" dotColor="#5FA8D9" items={movstock}
            total={totMovstock} gradient={CAT_COLORS.movstock.gradient} {...vistaGrupo('movstock')} />
        </div>
      )}

      {/* ── Charts row ── */}
      {!skel && (
        <div className="rep-3col-grid">
          <CostChart title="Alimentos" items={alimentos} barColor="#4CAF7D" />
          <CostChart title="Bebidas" items={bebidas} barColor="#C9B086" />
          <CostChart title="MovStock" items={movstock} barColor="#5FA8D9" />
        </div>
      )}

    </>
  )
}
