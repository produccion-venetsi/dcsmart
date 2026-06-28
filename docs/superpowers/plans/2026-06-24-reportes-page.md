# Reportes Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reportes" page inside the existing DCSMART app that shows KPIs, charts, and payment breakdowns for cajas and pagos in a selected date range.

**Architecture:** A single new backend route (`/api/reportes`) aggregates data from `cajas`, `caja_movimientos`, `caja_detalles`, and `pagos` tables. The frontend page uses `recharts` (already installed) for charts and follows the existing dark-theme design system. The page is accessible at `/reportes` inside the existing Layout, protected by the same auth/permissions system.

**Tech Stack:** Fastify + Prisma (backend), React + Zustand + Recharts (frontend), PostgreSQL raw queries for aggregations.

## Global Constraints

- ESModules (`import/export`) everywhere
- `async/await`, never callbacks
- All routes protected by default (`authenticate`, `appContext`, `can()`)
- IDs are UUID v4
- Decimals via `Decimal(12,2)`, currency formatting with `Intl.NumberFormat('es-AR')`
- Design colors: primary `#3FB6BD`, accent `#CEAC81`, success `#5FC98C`, danger `#E0938C`
- Font: Montserrat (already loaded)
- Existing CSS vars in `:root` of `frontend/src/styles/app.css`

---

### Task 1: Backend — Reportes Route

**Files:**
- Create: `backend/src/routes/reportes.js`
- Modify: `backend/src/server.js` (add import + register)

**Interfaces:**
- Consumes: `fastify.db` (Prisma), `request.allowedLocalIds`, `request.activeAppId` from appContext plugin
- Produces: `GET /api/reportes` → JSON response with shape:
  ```
  {
    kpi: { total_ventas, total_z, ticket_promedio, total_adeudado, cubiertos, count_z,
           pct_vs_anterior },
    secondary: [{ label, val, color }],
    weekly: [{ week, label, total }],
    fiscal: { fiscal, no_fiscal, digital },
    payments: [{ name, val, pct, color }],
    pay_total: number
  }
  ```

- [ ] **Step 1: Create the route file**

Create `backend/src/routes/reportes.js`:

```js
export default async function reportesRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]

  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) {
      return { kpi: {}, secondary: [], weekly: [], fiscal: {}, payments: [], pay_total: 0 }
    }

    const desdeDate = new Date(desde)
    const hastaDate = new Date(hasta + 'T23:59:59.999')

    const localFilter = { id_local: { in: localIds } }
    const cajaWhere = {
      ...localFilter,
      fecha_inicio: { gte: desdeDate, lte: hastaDate }
    }

    // Previous period (same length, immediately before) for comparison
    const msRange = hastaDate.getTime() - desdeDate.getTime()
    const prevDesde = new Date(desdeDate.getTime() - msRange - 86400000)
    const prevHasta = new Date(desdeDate.getTime() - 1)
    const prevCajaWhere = {
      ...localFilter,
      fecha_inicio: { gte: prevDesde, lte: prevHasta }
    }

    // ── KPI aggregations ──
    const [cajaAgg, prevCajaAgg, pagoAdeudado] = await Promise.all([
      fastify.db.caja.aggregate({
        where: cajaWhere,
        _sum: { total: true, efectivo: true, fiscal: true, tickets: true, comensales: true },
        _count: { id: true }
      }),
      fastify.db.caja.aggregate({
        where: prevCajaWhere,
        _sum: { total: true }
      }),
      fastify.db.pago.aggregate({
        where: { ...localFilter, pagado: false, fecha: { gte: desdeDate, lte: hastaDate } },
        _sum: { importe: true },
        _count: { id: true }
      })
    ])

    const totalVentas   = Number(cajaAgg._sum.total    ?? 0)
    const totalFiscal   = Number(cajaAgg._sum.fiscal   ?? 0)
    const totalEfectivo = Number(cajaAgg._sum.efectivo ?? 0)
    const totalTickets  = Number(cajaAgg._sum.tickets  ?? 0)
    const totalComens   = Number(cajaAgg._sum.comensales ?? 0)
    const countZ        = cajaAgg._count.id
    const prevVentas    = Number(prevCajaAgg._sum.total ?? 0)
    const totalAdeudado = Number(pagoAdeudado._sum.importe ?? 0)

    const ticketProm = totalTickets > 0 ? Math.round(totalVentas / totalTickets) : 0
    const pctVsAnterior = prevVentas > 0
      ? (((totalVentas - prevVentas) / prevVentas) * 100).toFixed(1)
      : null
    const noFiscal = totalVentas - totalFiscal

    // ── Payment methods from caja_movimientos ──
    const payParams = []
    const localPlaceholders = localIds.map((_, i) => `$${i + 1}`).join(', ')
    payParams.push(...localIds)
    payParams.push(desdeDate)
    payParams.push(hastaDate)

    const payRows = await fastify.db.$queryRawUnsafe(`
      SELECT mp.nombre, SUM(cm.monto) AS total
      FROM caja_movimientos cm
      JOIN cajas c ON cm.id_caja = c.id
      JOIN metodos_pago mp ON cm.id_metodo = mp.id
      WHERE c.id_local IN (${localPlaceholders})
        AND c.fecha_inicio >= $${localIds.length + 1}
        AND c.fecha_inicio <= $${localIds.length + 2}
        AND cm.tipo = 'COBRO'
      GROUP BY mp.nombre
      ORDER BY total DESC
    `, ...payParams)

    const payTotal = payRows.reduce((s, r) => s + Number(r.total), 0)
    const PAY_COLORS = ['#3FA9DE', '#7FD49B', '#EF6F8E', '#4BC4CC', '#F4C152', '#F08A5D', '#B98CD8', '#9b958c']
    const payments = payRows.map((r, i) => ({
      name: r.nombre,
      val: Number(r.total),
      pct: payTotal > 0 ? ((Number(r.total) / payTotal) * 100).toFixed(1) : '0.0',
      color: PAY_COLORS[i % PAY_COLORS.length]
    }))

    // ── Digital total (everything except "Efectivo") ──
    const digital = payments
      .filter(p => !p.name.toLowerCase().includes('efectivo'))
      .reduce((s, p) => s + p.val, 0)

    // ── Weekly sales trend ──
    const weekParams = [...localIds, desdeDate, hastaDate]
    const weekRows = await fastify.db.$queryRawUnsafe(`
      SELECT
        DATE_TRUNC('week', fecha_inicio)::date AS week_start,
        SUM(COALESCE(total, 0)) AS total
      FROM cajas
      WHERE id_local IN (${localPlaceholders})
        AND fecha_inicio >= $${localIds.length + 1}
        AND fecha_inicio <= $${localIds.length + 2}
      GROUP BY DATE_TRUNC('week', fecha_inicio)
      ORDER BY week_start
    `, ...weekParams)

    const weekly = weekRows.map((r, i) => ({
      week: r.week_start,
      label: `Sem ${i + 1}`,
      total: Number(r.total)
    }))

    // ── Desperdicios / Invitaciones from caja_detalles ──
    const detParams = [...localIds, desdeDate, hastaDate, request.activeAppId]
    const detRows = await fastify.db.$queryRawUnsafe(`
      SELECT dt.clasificacion, SUM(cd.monto) AS total
      FROM caja_detalles cd
      JOIN cajas c ON cd.id_caja = c.id
      LEFT JOIN detalle_tipos dt ON cd.id_tipo = dt.id
      WHERE c.id_local IN (${localPlaceholders})
        AND c.fecha_inicio >= $${localIds.length + 1}
        AND c.fecha_inicio <= $${localIds.length + 2}
        AND dt.id_app = $${localIds.length + 3}
      GROUP BY dt.clasificacion
    `, ...detParams)

    const detMap = {}
    for (const r of detRows) detMap[r.clasificacion] = Number(r.total)
    const desperdicios  = detMap['desperdicio']  ?? 0
    const invitaciones  = detMap['invitacion']   ?? 0

    // ── Build response ──
    const pctZ      = totalVentas > 0 ? ((totalFiscal / totalVentas) * 100).toFixed(0) : '0'
    const pctNoFisc = totalVentas > 0 ? ((noFiscal / totalVentas) * 100).toFixed(0) : '0'
    const pctAdeud  = totalVentas > 0 ? ((totalAdeudado / totalVentas) * 100).toFixed(1) : '0.0'

    return {
      kpi: {
        total_ventas: totalVentas,
        total_z: totalFiscal,
        ticket_promedio: ticketProm,
        total_adeudado: totalAdeudado,
        cubiertos: totalComens,
        count_z: countZ,
        total_tickets: totalTickets,
        pct_vs_anterior: pctVsAnterior,
        pct_z: pctZ,
        pct_no_fiscal: pctNoFisc,
        pct_adeudado: pctAdeud
      },
      secondary: [
        { label: 'Porc Z',          val: pctZ + '%',      color: '#EFEDE8' },
        { label: 'Porc No Fiscal',   val: pctNoFisc + '%', color: '#EFEDE8' },
        { label: 'Z Digitales',      val: digital,         color: '#3FB6BD' },
        { label: 'Porc Avión',       val: '0%',            color: 'rgba(255,255,255,.55)' },
        { label: 'Desperdicios',     val: desperdicios,    color: '#E0938C' },
        { label: 'Invitaciones',     val: invitaciones,    color: '#D8B98C' }
      ],
      weekly,
      fiscal: { fiscal: totalFiscal, no_fiscal: noFiscal, digital },
      payments,
      pay_total: payTotal
    }
  })
}
```

- [ ] **Step 2: Register the route in server.js**

Add to `backend/src/server.js` — import at top with the other route imports:

```js
import reportesRoutes from './routes/reportes.js'
```

Register after the other routes (before `app.get('/health', ...)`):

```js
await app.register(reportesRoutes, { prefix: '/api/reportes' })
```

- [ ] **Step 3: Verify backend starts without errors**

Run: `cd backend && node src/server.js`
Expected: Server starts on port 3000 with no import/registration errors. Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/reportes.js backend/src/server.js
git commit -m "feat: add /api/reportes endpoint with KPIs, charts, and payment aggregations"
```

---

### Task 2: Frontend — API Client + Route + Sidebar Entry

**Files:**
- Create: `frontend/src/api/reportes.js`
- Modify: `frontend/src/App.jsx` (add lazy import + route)
- Modify: `frontend/src/components/Sidebar.jsx` (add nav item)

**Interfaces:**
- Consumes: `client` from `api/client.js`, existing `ProtectedRoute`/`Guard` from App.jsx
- Produces: `reportesApi.get(params, signal)` function, `/reportes` route in the app

- [ ] **Step 1: Create the API client module**

Create `frontend/src/api/reportes.js`:

```js
import client from './client.js'

export const reportesApi = {
  get: (params, signal) => client.get('/reportes', { params, signal })
}
```

- [ ] **Step 2: Add route to App.jsx**

Add lazy import at the top with the other lazy imports:

```js
const Reportes    = lazy(() => import('./pages/reportes/Reportes.jsx'))
```

Add route inside the Layout `<Route>` block (after the `dashboard` route, before `cajas`):

```jsx
<Route path="reportes" element={<Guard roles={OPERATIVE}><Reportes /></Guard>} />
```

- [ ] **Step 3: Add nav item to Sidebar.jsx**

Add a chart icon function after the existing icons (e.g. after `IcoProveedor`):

```jsx
function IcoReportes() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
```

Add to the `NAV_MAIN` array (after the `Proveedores` entry):

```js
{ to: '/reportes',  label: 'Reportes',  Icon: IcoReportes, roles: ['super_admin', 'dcsmart', 'admin'] },
```

- [ ] **Step 4: Create empty placeholder page**

Create `frontend/src/pages/reportes/Reportes.jsx` with a minimal placeholder so the app compiles:

```jsx
export default function Reportes() {
  return <div className="page"><h1 className="page-title">Reportes</h1></div>
}
```

- [ ] **Step 5: Verify frontend compiles and route is accessible**

Run: `cd frontend && npm run dev`
Navigate to `/reportes` — should show the placeholder. Check sidebar shows "Reportes" link.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/reportes.js frontend/src/pages/reportes/Reportes.jsx frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat: wire reportes route, API client, and sidebar nav item"
```

---

### Task 3: Frontend — Reportes Page (Filter Bar + KPIs)

**Files:**
- Modify: `frontend/src/pages/reportes/Reportes.jsx` (full implementation — filter bar + KPI cards)
- Create: `frontend/src/pages/reportes/reportes.css`

**Interfaces:**
- Consumes: `reportesApi.get()` from Task 2, `useAppStore` for `activeLocal`, `useAuthStore` for user
- Produces: Fully functional filter bar with date pickers and presets, 4 KPI cards, secondary metrics strip. Data fetched from backend and displayed. Exported as `default` from the module.

- [ ] **Step 1: Create the CSS file**

Create `frontend/src/pages/reportes/reportes.css` with all styles for the reportes page. The design uses the dark theme from the Reportes.html mockup. Key colors: bg `#161514`, card `#1B1A18`, elevated `#211F1D`, primary `#3FB6BD`, accent `#CEAC81`, success `#5FC98C`, danger `#E0938C`.

```css
/* Reportes page — self-contained styles */

.rep-wrap {
  background: #161514;
  border-radius: 14px;
  padding: 28px 30px 32px;
  box-shadow: 0 1px 3px rgba(0,0,0,.18);
  color: #ECEAE6;
}

/* ── header ── */
.rep-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.rep-header-left {
  display: flex;
  align-items: center;
  gap: 22px;
}
.rep-header-badge {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 16px;
  background: #D32F2F;
  transform: skewX(-9deg);
  box-shadow: 0 2px 8px rgba(211,47,47,.35);
}
.rep-header-badge span {
  transform: skewX(9deg);
  font-style: italic;
  font-weight: 800;
  font-size: 18px;
  color: #fff;
  letter-spacing: .02em;
}
.rep-header-titles .rep-supertitle {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .08em;
  color: rgba(255,255,255,.4);
  text-transform: uppercase;
}
.rep-header-titles .rep-title {
  font-size: 20px;
  font-weight: 700;
  color: #F4F2EE;
  margin-top: 2px;
}
.rep-locale-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  border-radius: 9px;
  background: rgba(206,172,129,.12);
  border: 1px solid rgba(206,172,129,.5);
  font-size: 13px;
  font-weight: 600;
  color: #E7CFA6;
}
.rep-locale-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #CEAC81;
}

/* ── filter bar ── */
.rep-filters {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  background: #1B1A18;
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}
.rep-filter-col {
  flex: none;
  width: 230px;
}
.rep-filter-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .1em;
  color: rgba(255,255,255,.4);
  text-transform: uppercase;
  margin-bottom: 7px;
}
.rep-date-input {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px;
  background: #211F1D;
  border: 1px solid rgba(63,182,189,.35);
  border-radius: 10px;
}
.rep-date-input input {
  font-family: 'Montserrat', sans-serif;
  color: #EFEDE8;
  background: transparent;
  border: none;
  outline: none;
  font-size: 15px;
  font-weight: 600;
  width: 100%;
}
.rep-date-input input::-webkit-calendar-picker-indicator {
  filter: invert(.7) sepia(1) saturate(4) hue-rotate(140deg);
  cursor: pointer;
  opacity: .8;
}
.rep-presets {
  display: flex;
  gap: 7px;
  flex: 1;
  align-items: center;
  padding-bottom: 1px;
  flex-wrap: wrap;
}
.rep-preset-btn {
  height: 30px;
  padding: 0 13px;
  border-radius: 8px;
  cursor: pointer;
  font-family: 'Montserrat', sans-serif;
  font-size: 12px;
  font-weight: 600;
  background: transparent;
  color: rgba(255,255,255,.6);
  border: 1px solid rgba(255,255,255,.12);
  transition: all .18s ease;
}
.rep-preset-btn.active {
  background: rgba(63,182,189,.14);
  color: #7FD8DD;
  border-color: rgba(63,182,189,.4);
}
.rep-preset-btn:hover:not(.active) {
  border-color: rgba(255,255,255,.25);
  color: rgba(255,255,255,.8);
}
.rep-generate-btn {
  height: 44px;
  padding: 0 24px;
  border-radius: 10px;
  cursor: pointer;
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: #062b2e;
  background: #3FB6BD;
  border: none;
  display: flex;
  align-items: center;
  gap: 9px;
  box-shadow: 0 4px 14px -4px rgba(63,182,189,.5);
  transition: opacity .18s;
}
.rep-generate-btn:hover { opacity: .88; }

/* ── period chip ── */
.rep-period {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}
.rep-period-label {
  font-size: 12px;
  color: rgba(255,255,255,.45);
}
.rep-period-value {
  font-size: 13px;
  font-weight: 600;
  color: #E7CFA6;
  background: rgba(206,172,129,.12);
  border: 1px solid rgba(206,172,129,.35);
  border-radius: 8px;
  padding: 5px 12px;
}
.rep-period-z {
  font-size: 12px;
  color: rgba(255,255,255,.35);
}

/* ── KPI grid ── */
.rep-kpi-grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr 1fr;
  gap: 18px;
  margin-bottom: 16px;
}
@media (max-width: 1100px) {
  .rep-kpi-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 600px) {
  .rep-kpi-grid { grid-template-columns: 1fr; }
}

.rep-kpi {
  background: #211F1D;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 18px;
  padding: 20px 22px;
  position: relative;
  overflow: hidden;
}
.rep-kpi.hero {
  background: linear-gradient(150deg, rgba(63,182,189,.16), rgba(255,255,255,0) 55%), #211F1D;
  border-color: rgba(63,182,189,.3);
}
.rep-kpi.danger {
  background: linear-gradient(150deg, rgba(196,107,99,.14), rgba(255,255,255,0) 55%), #211F1D;
  border-color: rgba(196,107,99,.28);
}
.rep-kpi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.rep-kpi-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .07em;
  color: rgba(255,255,255,.5);
  text-transform: uppercase;
}
.rep-kpi-icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
}
.rep-kpi-value {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: #F4F2EE;
  line-height: 1;
}
.rep-kpi-value.big { font-size: 42px; letter-spacing: -.02em; }
.rep-kpi-value.med { font-size: 32px; }

.rep-kpi-sub {
  margin-top: 12px;
  font-size: 12px;
  color: rgba(255,255,255,.4);
}
.rep-kpi-sub .up {
  font-size: 13px;
  font-weight: 600;
  color: #5FC98C;
  margin-right: 7px;
}
.rep-kpi-sub .down {
  font-size: 13px;
  font-weight: 600;
  color: #E0938C;
  margin-right: 7px;
}

/* ── secondary strip ── */
.rep-secondary {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0;
  background: #1B1A18;
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 14px;
  padding: 4px;
  margin-bottom: 22px;
}
@media (max-width: 900px) {
  .rep-secondary { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 500px) {
  .rep-secondary { grid-template-columns: repeat(2, 1fr); }
}
.rep-secondary-item {
  padding: 14px 18px;
  border-right: 1px solid rgba(255,255,255,.05);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rep-secondary-item:last-child { border-right: none; }
.rep-secondary-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .07em;
  color: rgba(255,255,255,.4);
  text-transform: uppercase;
}
.rep-secondary-val {
  font-variant-numeric: tabular-nums;
  font-size: 20px;
  font-weight: 700;
}

/* ── chart panels ── */
.rep-charts-row {
  display: grid;
  gap: 18px;
  margin-bottom: 18px;
}
.rep-charts-row.wide { grid-template-columns: 1.85fr 1fr; }
.rep-charts-row.mid  { grid-template-columns: 1.65fr 1fr; }
@media (max-width: 900px) {
  .rep-charts-row.wide,
  .rep-charts-row.mid { grid-template-columns: 1fr; }
}

.rep-chart-card {
  background: #1B1A18;
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 16px;
  padding: 20px 24px;
}
.rep-chart-title {
  font-size: 15px;
  font-weight: 600;
  color: #F0EDE7;
  margin-bottom: 4px;
}
.rep-chart-sub {
  font-size: 11px;
  color: rgba(255,255,255,.4);
  margin-bottom: 14px;
}

/* ── donut ── */
.rep-donut-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 6px 0 18px;
}
.rep-donut-legend {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rep-donut-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rep-donut-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
.rep-donut-name {
  font-size: 13px;
  color: rgba(255,255,255,.74);
  flex: 1;
}
.rep-donut-val {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
  color: #EFEDE8;
}
.rep-donut-sep {
  height: 1px;
  background: rgba(255,255,255,.08);
  margin: 2px 0;
}

/* ── payment detail table ── */
.rep-pay-row {
  display: grid;
  grid-template-columns: 14px 1fr 96px 46px;
  align-items: center;
  gap: 10px;
  height: 36px;
  border-bottom: 1px solid rgba(255,255,255,.04);
}
.rep-pay-dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
}
.rep-pay-name {
  font-size: 13px;
  color: rgba(255,255,255,.78);
}
.rep-pay-amount {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 500;
  color: #EFEDE8;
  text-align: right;
}
.rep-pay-pct {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,.5);
  text-align: right;
}
.rep-pay-total {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  height: 42px;
  margin-top: 4px;
  border-top: 1px solid rgba(255,255,255,.12);
}
.rep-pay-total span:first-child {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}
.rep-pay-total span:last-child {
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

/* ── skeleton ── */
.rep-skel {
  background: rgba(255,255,255,.06);
  border-radius: 8px;
  animation: rep-pulse 1.2s ease-in-out infinite;
}
@keyframes rep-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .4; }
}

/* ── page-level breadcrumb label ── */
.rep-breadcrumb {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #57534e;
  text-transform: uppercase;
  margin-bottom: 14px;
}
```

- [ ] **Step 2: Implement the full Reportes component**

Replace the placeholder `frontend/src/pages/reportes/Reportes.jsx` with the full implementation. This is the largest piece — it includes filter bar, KPI cards, secondary strip, and all charts.

```jsx
import { useState, useCallback, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts'
import { useAppStore } from '../../store/appStore.js'
import { reportesApi } from '../../api/reportes.js'
import './reportes.css'

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})
const fmt = (n) => fmtCurrency.format(n)

function pad(n) { return String(n).padStart(2, '0') }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function prettyDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  const mon = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][+m - 1]
  return `${+d} ${mon} ${y}`
}

function getPresetRange(preset) {
  const now = new Date()
  const hoy = toDateStr(now)
  if (preset === 'hoy') return { desde: hoy, hasta: hoy }
  if (preset === 'semana') {
    const d = new Date(now)
    const day = d.getDay()
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
    return { desde: toDateStr(d), hasta: hoy }
  }
  if (preset === 'mes') {
    return { desde: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: hoy }
  }
  if (preset === 'trimestre') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 3)
    return { desde: toDateStr(d), hasta: hoy }
  }
  return { desde: hoy, hasta: hoy }
}

const PRESETS = [
  { key: 'hoy',       label: 'Hoy' },
  { key: 'semana',    label: 'Semana' },
  { key: 'mes',       label: 'Mes' },
  { key: 'trimestre', label: 'Trimestre' },
]

/* ── Icons ── */
function IcoCalendar() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3FB6BD" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="4.5" width="18" height="17" rx="2.5"/>
      <path d="M3 9h18M8 2.5v4M16 2.5v4"/>
    </svg>
  )
}
function IcoArrowRight() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#062b2e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  )
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
      <rect x="4" y="3" width="16" height="18" rx="2"/>
      <path d="M8 8h8l-8 8h8"/>
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
function IcoTrendDown() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#E0938C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l6 6 4-4 8 8M21 17v-5M21 17h-5"/>
    </svg>
  )
}

/* ── DS Logo ── */
function DsLogo() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M22 2 42 22 22 42 2 22Z" stroke="#3FB6BD" strokeWidth="1.4"/>
      <path d="M22 11 33 22 22 33 11 22Z" stroke="#3FB6BD" strokeWidth="1.1" opacity=".7"/>
      <text x="22" y="26" textAnchor="middle" fontFamily="Montserrat" fontSize="11" fontWeight="700" fill="#CEAC81">DS</text>
    </svg>
  )
}

/* ── Chart tooltip ── */
function SalesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: '#211F1D', border: '1px solid rgba(255,255,255,.12)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#ECEAE6',
      boxShadow: '0 8px 24px rgba(0,0,0,.5)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d?.label}</div>
      <div style={{ color: '#3FB6BD', fontWeight: 600 }}>{fmt(d?.total ?? 0)}</div>
    </div>
  )
}

function PayTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: '#211F1D', border: '1px solid rgba(255,255,255,.12)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#ECEAE6',
      boxShadow: '0 8px 24px rgba(0,0,0,.5)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d?.name}</div>
      <div style={{ fontWeight: 600 }}>{fmt(d?.val ?? 0)}</div>
      <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{d?.pct}%</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
export default function Reportes() {
  const { activeApp, activeLocal } = useAppStore()
  const appName = activeApp?.app?.nombre ?? 'DCSmart'
  const localName = activeLocal?.nombre ?? 'Todos los locales'

  const initial = getPresetRange('mes')
  const [preset,  setPreset]  = useState('mes')
  const [desde,   setDesde]   = useState(initial.desde)
  const [hasta,   setHasta]   = useState(initial.hasta)
  const [applied, setApplied] = useState({ desde: initial.desde, hasta: initial.hasta })
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const handlePreset = useCallback((key) => {
    const r = getPresetRange(key)
    setPreset(key)
    setDesde(r.desde)
    setHasta(r.hasta)
    setApplied({ desde: r.desde, hasta: r.hasta })
  }, [])

  const handleGenerate = useCallback(() => {
    setPreset('')
    setApplied({ desde, hasta })
  }, [desde, hasta])

  useEffect(() => {
    setData(null)
    setLoading(true)
    const ctrl = new AbortController()
    const params = {
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal ? { id_local: activeLocal.id } : {})
    }
    reportesApi.get(params, ctrl.signal)
      .then((res) => setData(res.data))
      .catch((err) => { if (!ctrl.signal.aborted) console.error(err) })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied.desde, applied.hasta, activeLocal?.id])

  const kpi       = data?.kpi ?? {}
  const secondary = data?.secondary ?? []
  const weekly    = data?.weekly ?? []
  const fiscal    = data?.fiscal ?? {}
  const payments  = data?.payments ?? []
  const payTotal  = data?.pay_total ?? 0

  const fiscalPct = kpi.total_ventas > 0
    ? Math.round((fiscal.fiscal / kpi.total_ventas) * 100) : 0
  const noFiscalPct = 100 - fiscalPct

  const donutData = [
    { name: 'Z fiscal',  value: fiscal.fiscal ?? 0,    fill: '#159199' },
    { name: 'No fiscal', value: fiscal.no_fiscal ?? 0, fill: '#CEAC81' },
  ]

  const skel = loading || !data

  return (
    <div className="page">
      <div className="rep-breadcrumb">Reportes — Pagos y cajas por período</div>
      <div className="rep-wrap">

        {/* ── Header ── */}
        <div className="rep-header">
          <div className="rep-header-left">
            <DsLogo />
            <div className="rep-header-badge"><span>{appName}</span></div>
            <div className="rep-header-titles">
              <div className="rep-supertitle">Reportes</div>
              <div className="rep-title">Pagos y cierres de caja</div>
            </div>
          </div>
          <div className="rep-locale-pill">
            <span className="rep-locale-dot" />
            {localName}
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="rep-filters">
          <div className="rep-filter-col">
            <div className="rep-filter-label">Inicio</div>
            <div className="rep-date-input">
              <IcoCalendar />
              <input type="date" value={desde} max={hasta}
                onChange={(e) => { setDesde(e.target.value); setPreset('') }} />
            </div>
          </div>
          <div className="rep-filter-col">
            <div className="rep-filter-label">Fin</div>
            <div className="rep-date-input">
              <IcoCalendar />
              <input type="date" value={hasta} min={desde}
                onChange={(e) => { setHasta(e.target.value); setPreset('') }} />
            </div>
          </div>
          <div className="rep-presets">
            {PRESETS.map((p) => (
              <button key={p.key}
                className={'rep-preset-btn' + (preset === p.key ? ' active' : '')}
                onClick={() => handlePreset(p.key)}
              >{p.label}</button>
            ))}
          </div>
          <button className="rep-generate-btn" onClick={handleGenerate}>
            <IcoArrowRight />
            Generar reporte
          </button>
        </div>

        {/* ── Period chip ── */}
        <div className="rep-period">
          <span className="rep-period-label">Período analizado</span>
          <span className="rep-period-value">{prettyDate(applied.desde)} — {prettyDate(applied.hasta)}</span>
          <span className="rep-period-z">· {kpi.count_z ?? 0} cierres Z registrados</span>
        </div>

        {/* ── KPI cards ── */}
        <div className="rep-kpi-grid">
          <div className="rep-kpi hero">
            <div className="rep-kpi-head">
              <span className="rep-kpi-label">Total de ventas</span>
              <span className="rep-kpi-icon" style={{ background: 'rgba(95,201,140,.18)' }}><IcoTrendUp /></span>
            </div>
            {skel
              ? <div className="rep-skel" style={{ width: '70%', height: 42, marginBottom: 12 }} />
              : <div className="rep-kpi-value big">{fmt(kpi.total_ventas)}</div>}
            <div className="rep-kpi-sub">
              {!skel && kpi.pct_vs_anterior !== null && (
                <span className={Number(kpi.pct_vs_anterior) >= 0 ? 'up' : 'down'}>
                  {Number(kpi.pct_vs_anterior) >= 0 ? '↑' : '↓'} {Math.abs(Number(kpi.pct_vs_anterior))}%
                </span>
              )}
              <span>vs. período anterior</span>
            </div>
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
            <div className="rep-kpi-sub">{kpi.cubiertos ?? 0} cubiertos servidos</div>
          </div>

          <div className="rep-kpi danger">
            <div className="rep-kpi-head">
              <span className="rep-kpi-label">Total adeudado</span>
              <span className="rep-kpi-icon" style={{ background: 'rgba(196,107,99,.2)' }}><IcoTrendDown /></span>
            </div>
            {skel
              ? <div className="rep-skel" style={{ width: '50%', height: 32, marginBottom: 12 }} />
              : <div className="rep-kpi-value med">{fmt(kpi.total_adeudado)}</div>}
            <div className="rep-kpi-sub">{kpi.pct_adeudado ?? 0}% de la facturación</div>
          </div>
        </div>

        {/* ── Secondary strip ── */}
        <div className="rep-secondary">
          {secondary.map((s, i) => (
            <div className="rep-secondary-item" key={i}>
              <span className="rep-secondary-label">{s.label}</span>
              <span className="rep-secondary-val" style={{ color: s.color }}>
                {typeof s.val === 'number' ? fmt(s.val) : s.val}
              </span>
            </div>
          ))}
        </div>

        {/* ── Charts row 1: Sales evolution + Fiscal donut ── */}
        <div className="rep-charts-row wide">
          <div className="rep-chart-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <div className="rep-chart-title">Evolución de ventas</div>
                <div className="rep-chart-sub">Facturación semanal en el período</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                <span style={{ width: 18, height: 3, borderRadius: 2, background: '#3FB6BD', display: 'inline-block' }} />
                Total ventas
              </div>
            </div>
            {skel ? (
              <div className="rep-skel" style={{ width: '100%', height: 230 }} />
            ) : weekly.length === 0 ? (
              <div style={{ height: 230, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.35)', fontSize: 13 }}>
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
                    tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 10, fontFamily: 'Montserrat' }} />
                  <YAxis tickLine={false} axisLine={false} width={60}
                    tick={{ fill: 'rgba(255,255,255,.3)', fontSize: 10, fontFamily: 'Montserrat' }}
                    tickFormatter={(v) => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                  <Tooltip content={<SalesTooltip />} />
                  <Area type="monotone" dataKey="total" stroke="#3FB6BD" strokeWidth={2.5}
                    fill="url(#repAreaGrad)" dot={{ r: 3, fill: '#161514', stroke: '#3FB6BD', strokeWidth: 2 }} />
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
                      width: 104, height: 104, borderRadius: '50%', background: '#1B1A18',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>Fiscal</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 28, fontWeight: 700, color: '#F4F2EE', lineHeight: 1.1 }}>{fiscalPct}%</span>
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

        {/* ── Charts row 2: Payment bar chart + detail table ── */}
        <div className="rep-charts-row mid">
          <div className="rep-chart-card">
            <div className="rep-chart-title">Medios de pago</div>
            <div className="rep-chart-sub">Monto cobrado por medio en el período</div>
            {skel ? (
              <div className="rep-skel" style={{ width: '100%', height: 220 }} />
            ) : payments.length === 0 ? (
              <div style={{ height: 220, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.35)', fontSize: 13 }}>
                Sin datos
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={payments} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false}
                    tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 9, fontFamily: 'Montserrat' }}
                    interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tickLine={false} axisLine={false} width={60}
                    tick={{ fill: 'rgba(255,255,255,.3)', fontSize: 10, fontFamily: 'Montserrat' }}
                    tickFormatter={(v) => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                  <Tooltip content={<PayTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)', radius: 6 }} />
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
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>% del total</span>
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

      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the page renders with the dev server**

Run both `backend` and `frontend` dev servers. Navigate to `/reportes`. Verify:
- Filter bar renders with date pickers and preset buttons
- Presets change the dates and trigger data fetch
- "Generar reporte" button triggers fetch with custom dates
- KPI cards show data or loading skeletons
- Charts render (area chart, donut, bar chart)
- Payment detail table renders with correct columns
- No console errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/reportes/Reportes.jsx frontend/src/pages/reportes/reportes.css
git commit -m "feat: implement Reportes page with KPIs, charts, and payment detail"
```

---
