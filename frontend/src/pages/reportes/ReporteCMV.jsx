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
      background: 'rgba(30,43,58,.95)', border: '1px solid rgba(201,176,134,.18)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#F0EDE8',
      boxShadow: '0 8px 24px rgba(0,0,0,.5)'
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

function CostTable({ title, dotColor, items, total, gradient }) {
  return (
    <div className="rep-chart-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 'auto' }}>$</span>
      </div>
      {items.map((r, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr 168px', alignItems: 'center',
          height: 33, borderBottom: '1px solid var(--border)'
        }}>
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
      ))}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center',
        height: 40, marginTop: 4, borderTop: '1px solid var(--border-hi)'
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Total</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
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
              tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 9, fontFamily: 'Montserrat' }}
              interval={0} angle={-25} textAnchor="end" height={55} />
            <YAxis tickLine={false} axisLine={false} width={55}
              tick={{ fill: 'rgba(255,255,255,.3)', fontSize: 10, fontFamily: 'Montserrat' }}
              tickFormatter={(v) => v >= 1000 ? Math.round(v / 1000) + 'k' : v} />
            <Tooltip content={<CmvTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
            <Bar dataKey="val" radius={[4, 4, 0, 0]}>
              {items.map((_, i) => <Cell key={i} fill={barColor} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default function ReporteCMV({ applied, activeLocal, prettyDate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setData(null)
    setLoading(true)
    const ctrl = new AbortController()
    const params = {
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal ? { id_local: activeLocal.id } : {})
    }
    reportesApi.cmv(params, ctrl.signal)
      .then((res) => setData(res.data))
      .catch((err) => { if (!ctrl.signal.aborted) console.error(err) })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied.desde, applied.hasta, activeLocal?.id])

  const kpis       = data?.kpis ?? []
  const alimentos  = data?.alimentos ?? []
  const bebidas    = data?.bebidas ?? []
  const movstock   = data?.movstock ?? []
  const ajustes    = data?.ajustes ?? []
  const totAlim    = data?.total_alimentos ?? 0
  const totBeb     = data?.total_bebidas ?? 0
  const totMovstock = data?.total_movstock ?? 0
  const totAjustes = data?.total_ajustes ?? 0

  const skel = loading || !data

  // Ajustes bar heights
  const ajMax = ajustes.length ? Math.max(...ajustes.map(a => Math.abs(a.val))) : 1

  return (
    <>
      {/* ── Period chip ── */}
      <div className="rep-period">
        <span className="rep-period-label">Período analizado</span>
        <span className="rep-period-value">{prettyDate(applied.desde)} — {prettyDate(applied.hasta)}</span>
      </div>

      {/* ── KPI cards ── */}
      {skel ? (
        <div className="rep-kpi-grid cols-5">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="rep-kpi">
              <div className="rep-skel" style={{ width: '50%', height: 14, marginBottom: 14 }} />
              <div className="rep-skel" style={{ width: '65%', height: 28, marginBottom: 12 }} />
              <div className="rep-skel" style={{ width: '40%', height: 12 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rep-kpi-grid cols-5">
          {kpis.map((k, i) => (
            <KpiCard key={i} label={k.label} val={k.val} delta={k.delta} />
          ))}
        </div>
      )}

      {/* ── Tables row: Alimentos / Bebidas / Ajustes ── */}
      {skel ? (
        <div className="rep-4col-grid" style={{ marginBottom: 18 }}>
          {[0,1,2,3].map(i => (
            <div key={i} className="rep-chart-card">
              <div className="rep-skel" style={{ width: '40%', height: 14, marginBottom: 16 }} />
              {[0,1,2,3,4].map(j => (
                <div key={j} className="rep-skel" style={{ width: '100%', height: 33, marginBottom: 2 }} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="rep-4col-grid" style={{ marginBottom: 18 }}>
          <CostTable title="Alimentos" dotColor="var(--green)" items={alimentos}
            total={totAlim} gradient={CAT_COLORS.alimentos.gradient} />
          <CostTable title="Bebidas" dotColor="var(--gold)" items={bebidas}
            total={totBeb} gradient={CAT_COLORS.bebidas.gradient} />
          <CostTable title="MovStock" dotColor="#5FA8D9" items={movstock}
            total={totMovstock} gradient={CAT_COLORS.movstock.gradient} />

          {/* Ajustes */}
          <div className="rep-chart-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--t3)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>Ajustes</span>
              <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 'auto' }}>$</span>
            </div>
            {ajustes.map((r, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 168px', alignItems: 'center',
                height: 33, borderBottom: '1px solid var(--border)'
              }}>
                <span style={{ fontSize: 13, color: 'var(--t2)' }}>{r.name}</span>
                <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', top: 5, bottom: 5, right: 0,
                    width: `${(Math.abs(r.val) / ajMax * 100).toFixed(1)}%`,
                    background: r.negative
                      ? 'linear-gradient(90deg,rgba(224,92,92,.06),rgba(224,92,92,.34))'
                      : 'linear-gradient(90deg,rgba(76,175,125,.06),rgba(76,175,125,.34))',
                    borderRadius: 4
                  }} />
                  <span style={{
                    position: 'relative', fontSize: 13, fontWeight: 500,
                    color: r.negative ? 'var(--red)' : 'var(--t1)',
                    paddingRight: 8, fontVariantNumeric: 'tabular-nums'
                  }}>{r.negative ? '-' : ''}{fmt(r.val)}</span>
                </div>
              </div>
            ))}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center',
              height: 40, marginTop: 4, borderTop: '1px solid var(--border-hi)'
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Total</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(totAjustes)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Charts row ── */}
      {!skel && (
        <div className="rep-4col-grid">
          <CostChart title="Alimentos" items={alimentos} barColor="#4CAF7D" />
          <CostChart title="Bebidas" items={bebidas} barColor="#C9B086" />
          <CostChart title="MovStock" items={movstock} barColor="#5FA8D9" />
          <CostChart title="Ajustes" items={ajustes.map(a => ({
            ...a, val: Math.abs(a.val)
          }))} barColor="#B5A7EA" />
        </div>
      )}
    </>
  )
}
