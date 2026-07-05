# Reportes / Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aliviana el Dashboard (pantalla de bienvenida sin fetch pesado), fusiona su contenido dentro de Reportes, separa el reporte combinado de Pagos/Cajas en dos pestañas propias, y agrega reportes nuevos de auditoría/efectivo/comprobantes no fiscales en la pestaña Pagos.

**Architecture:** El endpoint `GET /api/reportes` actual (90% datos de Cajas) se renombra a `GET /api/reportes/cajas` sin cambio de lógica salvo remover el único dato de Pagos que traía (`total_adeudado`). Se agrega `GET /api/reportes/pagos`, un endpoint nuevo con datos genuinamente de Pagos. En el frontend, el contenido actual de `ReportePagos.jsx` se traslada (renombrado) a un nuevo `ReporteCajas.jsx`, y `ReportePagos.jsx` se reescribe con los KPIs de Pagos. `Reportes.jsx` pasa de 2 a 3 pestañas. `Dashboard.jsx` se recorta a una pantalla de bienvenida sin fetch de stats.

**Tech Stack:** Fastify + Prisma (backend), React + Vite + recharts (frontend), mismo patrón ya usado en `reportes.js`/`Reportes.jsx`/`ReportePagos.jsx`.

## Global Constraints

- ESModules, `async/await` siempre, nunca callbacks.
- El endpoint `/reportes/pagos` usa el mismo `preHandler` que el resto de `reportes.js`: `viewHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]` — no se agrega un permiso nuevo.
- "No avión" = pagos con `id_tipo = 'C'` (comprobante que en Argentina no discrimina IVA).
- El estado de auditoría de un pago se resuelve igual que en `backend/src/routes/pagos.js` (`getAuditedSet`/`buildAuditFilter`): tabla `audits`, `tabla: 'pagos'`, `vigente: true`, `accion: 'auditado'`.
- No se agregan tests automatizados (el proyecto no tiene suite) — verificación manual vía build + curl/inspección visual, igual que el resto de este backlog.
- No se toca `ReporteCMV.jsx` ni el selector de fecha/local compartido de `Reportes.jsx`.

---

### Task 1: Dashboard — pantalla de bienvenida liviana

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx` (reescritura completa, 608 líneas → mucho más corto)

**Interfaces:**
- Consumes: `useAuthStore` (`user`), `useAppStore` (`activeApp`), `react-router-dom` (`useNavigate`) — ya importados hoy.
- Produces: nada que otras tareas consuman (Dashboard no es consumido por Reportes).

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar todo el contenido de `frontend/src/pages/Dashboard.jsx` por:

```jsx
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'

function IcoCalendar() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IcoSwitch() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}
function IcoMapPin() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function IcoArrow() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  )
}
function IcoCaja() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  )
}
function IcoPagos() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
function IcoProveedor() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}
function IcoAdmin() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}
function IcoReportes() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-4"/>
    </svg>
  )
}

const QUICK_ACTIONS = [
  { to: '/cajas',       label: 'Cajas',       sub: 'Turnos y movimientos',    Icon: IcoCaja,      i: 0 },
  { to: '/pagos',       label: 'Pagos',       sub: 'Facturas y órdenes',      Icon: IcoPagos,     i: 1 },
  { to: '/proveedores', label: 'Proveedores', sub: 'Directorio de cuentas',   Icon: IcoProveedor, i: 2 },
  { to: '/admin/apps',  label: 'Administrar', sub: 'Apps, locales, usuarios', Icon: IcoAdmin,     i: 3 },
]

function fmtDate() {
  const d = new Date()
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function Dashboard() {
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const { activeApp } = useAppStore()

  const appNombre = activeApp?.app?.nombre ?? '—'
  const firstName = user?.nombre?.split(' ')[0] ?? ''

  return (
    <div className="page">
      {/* ── header ── */}
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div className="page-head-left">
          <h1 className="page-title">Bienvenido, {firstName}</h1>
          <p className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoCalendar />
            {fmtDate()}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              useAppStore.getState().clearContext()
              navigate('/select-app')
            }}
          >
            <IcoSwitch />
            {appNombre}
          </button>
        </div>
      </div>

      {/* ── ver reportes ── */}
      <button
        className="btn btn-primary"
        style={{ marginBottom: '2rem', padding: '0.85rem 1.5rem', fontSize: 15 }}
        onClick={() => navigate('/reportes')}
      >
        <IcoReportes />
        Ver Reportes
        <IcoArrow />
      </button>

      {/* ── quick actions ── */}
      <div className="selector-label" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <IcoMapPin />
        Acceso rápido
      </div>
      <div className="quick-actions-grid">
        {QUICK_ACTIONS.map(({ to, label, sub, Icon, i }) => (
          <button
            key={to}
            className="quick-action-card"
            style={{ '--i': i }}
            onClick={() => navigate(to)}
          >
            <div className="qac-icon"><Icon /></div>
            <div>
              <div className="qac-title">{label}</div>
              <div className="qac-sub">{sub}</div>
            </div>
            <div className="qac-arrow"><IcoArrow /></div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

Notas sobre este reemplazo:
- Se eliminan los imports de `recharts`, `cajasApi`, `pagosApi` (ya no se usan) y todo el bloque de estado/`useEffect` que traía `pagosApi.stats`/`cajasApi.stats`/`pagosApi.chart`.
- Se elimina el selector de local propio del Dashboard (antes duplicaba el que ya existe en Reportes) — el Dashboard ya no filtra nada, solo saluda y da accesos rápidos.
- Los íconos (`IcoCalendar`, `IcoSwitch`, `IcoMapPin`, `IcoArrow`, `IcoCaja`, `IcoPagos`, `IcoProveedor`, `IcoAdmin`) y `QUICK_ACTIONS` se conservan igual que en el archivo original — mismo `to`/`label`/`sub`/`Icon`/`i` para no romper el layout `quick-actions-grid` existente (clase CSS ya definida en `app.css`, no se toca).
- `IcoReportes` es el único ícono nuevo, para el botón "Ver Reportes".

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso, sin errores de imports rotos (confirma que ningún otro archivo importaba algo que se quitó de `Dashboard.jsx` — no debería, es un default export de página).

- [ ] **Step 3: Verificación visual**

Levantar el frontend (`npm run dev` en `frontend/`) y entrar a `/dashboard`:
- Confirmar que se ve el saludo, la fecha, el botón "Ver Reportes" y los 4 accesos rápidos.
- Abrir la pestaña Network del navegador y confirmar que NO se dispara ningún request a `/api/pagos/stats`, `/api/cajas/stats` ni `/api/pagos/chart` al cargar la página.
- Clickear "Ver Reportes" y confirmar que navega a `/reportes`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): reducir a pantalla de bienvenida liviana, sin fetch de stats"
```

---

### Task 2: Backend — separar `/reportes` en `/cajas` y `/pagos`

**Files:**
- Modify: `backend/src/routes/reportes.js`

**Interfaces:**
- Produces: `GET /api/reportes/cajas` (mismo shape que el `GET /api/reportes` actual, sin `kpi.total_adeudado`/`kpi.pct_adeudado`). `GET /api/reportes/pagos` (nuevo): `{ total_adeudado: number, count_adeudado: number, count_auditados: number, count_no_auditados: number, total_efectivo: number, count_efectivo: number, total_no_avion: number, count_no_avion: number }`.
- Consumes: nada nuevo — mismo `fastify.db`, `fastify.authenticate`/`appContext`/`can` ya registrados en el server.

- [ ] **Step 1: Renombrar `GET /` a `GET /cajas` y quitar el dato de Pagos**

En `backend/src/routes/reportes.js`, reemplazar el bloque completo desde `fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {` (línea 4) hasta su cierre `})` (línea 152) por:

```javascript
  fastify.get('/cajas', { preHandler: viewHandler }, async (request, reply) => {
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

    const cajaAgg = await fastify.db.caja.aggregate({
      where: cajaWhere,
      _sum: { total: true, efectivo: true, fiscal: true, tickets: true, comensales: true },
      _count: { id: true }
    })

    const totalVentas   = Number(cajaAgg._sum.total    ?? 0)
    const totalFiscal   = Number(cajaAgg._sum.fiscal   ?? 0)
    const totalTickets  = Number(cajaAgg._sum.tickets  ?? 0)
    const totalComens   = Number(cajaAgg._sum.comensales ?? 0)
    const countZ        = cajaAgg._count.id

    const ticketProm = totalTickets > 0 ? Math.round(totalVentas / totalTickets) : 0
    const noFiscal = totalVentas - totalFiscal

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

    const digital = payments
      .filter(p => !p.name.toLowerCase().includes('efectivo'))
      .reduce((s, p) => s + p.val, 0)

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

    const pctZ      = totalVentas > 0 ? ((totalFiscal / totalVentas) * 100).toFixed(0) : '0'
    const pctNoFisc = totalVentas > 0 ? ((noFiscal / totalVentas) * 100).toFixed(0) : '0'

    return {
      kpi: {
        total_ventas: totalVentas,
        total_z: totalFiscal,
        ticket_promedio: ticketProm,
        cubiertos: totalComens,
        count_z: countZ,
        total_tickets: totalTickets,
        pct_z: pctZ,
        pct_no_fiscal: pctNoFisc
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
```

Notas: se removió `pagoAdeudado` del `Promise.all` original (ya no hay un segundo elemento, `cajaAgg` se resuelve solo con `await` directo) y se quitaron `kpi.total_adeudado`/`kpi.pct_adeudado` del payload. El resto del cuerpo es idéntico al endpoint viejo. La fila "Porc Avión" del `secondary` array queda como placeholder `'0%'` igual que antes — no se conecta a la nueva métrica de "no avión" de Pagos, porque ese dato ahora vive en la pestaña Pagos, no en Cajas (fuera de alcance de este spec, ver más abajo).

- [ ] **Step 2: Agregar `GET /pagos`**

Insertar el siguiente bloque nuevo entre el cierre del handler `/cajas` (el `})` que termina el Step 1) y el comentario `// ── GET /cmv ──`:

```javascript
  // ── GET /pagos ──────────────────────────────────────────────────────────
  fastify.get('/pagos', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) {
      return {
        total_adeudado: 0, count_adeudado: 0,
        count_auditados: 0, count_no_auditados: 0,
        total_efectivo: 0, count_efectivo: 0,
        total_no_avion: 0, count_no_avion: 0
      }
    }

    const desdeDate = new Date(desde)
    const hastaDate = new Date(hasta + 'T23:59:59.999')
    const localFilter = { id_local: { in: localIds } }
    const fechaWhere = { fecha: { gte: desdeDate, lte: hastaDate } }

    const [adeudadoAgg, efectivoAgg, noAvionAgg, pagosEnRango] = await Promise.all([
      fastify.db.pago.aggregate({
        where: { ...localFilter, pagado: false, ...fechaWhere },
        _sum: { importe: true },
        _count: { id: true }
      }),
      fastify.db.pago.aggregate({
        where: { ...localFilter, ...fechaWhere, metodo_pago: { nombre: 'Efectivo' } },
        _sum: { importe: true },
        _count: { id: true }
      }),
      fastify.db.pago.aggregate({
        where: { ...localFilter, ...fechaWhere, id_tipo: 'C' },
        _sum: { importe: true },
        _count: { id: true }
      }),
      fastify.db.pago.findMany({
        where: { ...localFilter, ...fechaWhere },
        select: { id: true }
      })
    ])

    const pagoIds = pagosEnRango.map(p => p.id)
    let countAuditados = 0
    if (pagoIds.length) {
      const auditRows = await fastify.db.audit.findMany({
        where: { tabla: 'pagos', id_registro: { in: pagoIds }, vigente: true, accion: 'auditado' },
        select: { id_registro: true }
      })
      countAuditados = new Set(auditRows.map(r => r.id_registro)).size
    }
    const countNoAuditados = pagoIds.length - countAuditados

    return {
      total_adeudado: Number(adeudadoAgg._sum.importe ?? 0),
      count_adeudado: adeudadoAgg._count.id,
      count_auditados: countAuditados,
      count_no_auditados: countNoAuditados,
      total_efectivo: Number(efectivoAgg._sum.importe ?? 0),
      count_efectivo: efectivoAgg._count.id,
      total_no_avion: Number(noAvionAgg._sum.importe ?? 0),
      count_no_avion: noAvionAgg._count.id
    }
  })

```

- [ ] **Step 3: Verificar manualmente contra la base real**

Con el Cloud SQL Auth Proxy activo y el backend corriendo (`cd backend && npm run dev`), y un JWT válido (mismo mecanismo ya usado para verificar Tasks anteriores de este backlog — login vía la app o token de un usuario existente):

```bash
curl -s "http://localhost:3000/api/reportes/cajas?desde=2026-01-01&hasta=2026-12-31" \
  -H "Authorization: Bearer <token>" -H "X-App-Id: <app_id>" | head -c 500
```
Expected: JSON con `kpi.total_ventas`, `kpi.total_z`, etc., SIN `kpi.total_adeudado` ni `kpi.pct_adeudado`.

```bash
curl -s "http://localhost:3000/api/reportes/pagos?desde=2026-01-01&hasta=2026-12-31" \
  -H "Authorization: Bearer <token>" -H "X-App-Id: <app_id>" | head -c 500
```
Expected: JSON con las 8 claves (`total_adeudado`, `count_adeudado`, `count_auditados`, `count_no_auditados`, `total_efectivo`, `count_efectivo`, `total_no_avion`, `count_no_avion`), todos números (0 si no hay datos en el rango).

Si es posible, comparar `count_auditados`/`count_no_auditados` contra el listado de Pagos filtrado por "Auditado"/"No auditado" en el mismo rango de fechas (vía la UI o `GET /api/pagos?audit=true&...`), y `count_no_avion` contra el listado filtrado por Tipo C.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/reportes.js
git commit -m "feat(reportes): separar /reportes en /cajas (renombrado) y /pagos (nuevo, KPIs de auditoria/efectivo/no avion)"
```

---

### Task 3: Frontend — cliente API + `ReporteCajas.jsx`

**Files:**
- Modify: `frontend/src/api/reportes.js`
- Create: `frontend/src/pages/reportes/ReporteCajas.jsx`

**Interfaces:**
- Consumes: `GET /api/reportes/cajas` (Task 2), mismo shape de respuesta que el `GET /api/reportes` viejo menos `kpi.total_adeudado`/`kpi.pct_adeudado`.
- Produces: `reportesApi.cajas(params, signal)`, `reportesApi.pagos(params, signal)` (el segundo se usa en la Task 4). Componente `<ReporteCajas applied={{desde,hasta}} activeLocal={...} prettyDate={fn} />` con la misma firma de props que el `ReportePagos` viejo (consumida por `Reportes.jsx` en la Task 5).

- [ ] **Step 1: Actualizar el cliente API**

Reemplazar el contenido completo de `frontend/src/api/reportes.js`:

```javascript
import client from './client.js'

export const reportesApi = {
  cajas: (params, signal) => client.get('/reportes/cajas', { params, signal }),
  pagos: (params, signal) => client.get('/reportes/pagos', { params, signal }),
  cmv:   (params, signal) => client.get('/reportes/cmv', { params, signal })
}
```

- [ ] **Step 2: Crear `ReporteCajas.jsx`**

Crear `frontend/src/pages/reportes/ReporteCajas.jsx` con el contenido íntegro que hoy tiene `frontend/src/pages/reportes/ReportePagos.jsx` (319 líneas), con estos 2 cambios puntuales:

1. La llamada `reportesApi.get(params, ctrl.signal)` pasa a ser `reportesApi.cajas(params, ctrl.signal)`.
2. Se elimina la card de KPI "Total adeudado" (el bloque `<div className="rep-kpi danger">...Total adeudado...</div>`, líneas 149-158 del archivo original) — el resto de las 3 cards (Total de ventas, Total Z, Ticket promedio) queda igual, así como toda la sección de gráficos (evolución de ventas, composición fiscal, medios de pago, detalle por medio).

Contenido completo del archivo nuevo:

```jsx
import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { reportesApi } from '../../api/reportes.js'

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})
const fmt = (n) => fmtCurrency.format(n)

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

function SalesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: 'rgba(30,43,58,.95)', border: '1px solid rgba(201,176,134,.18)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#F0EDE8',
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
      background: 'rgba(30,43,58,.95)', border: '1px solid rgba(201,176,134,.18)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#F0EDE8',
      boxShadow: '0 8px 24px rgba(0,0,0,.5)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d?.name}</div>
      <div style={{ fontWeight: 600 }}>{fmt(d?.val ?? 0)}</div>
      <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{d?.pct}%</div>
    </div>
  )
}

export default function ReporteCajas({ applied, activeLocal, prettyDate }) {
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
    reportesApi.cajas(params, ctrl.signal)
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

  const skel = loading || !data

  return (
    <>
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

      {/* ── Charts row 1 ── */}
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
                  fill="url(#repAreaGrad)" dot={{ r: 3, fill: '#19232f', stroke: '#3FB6BD', strokeWidth: 2 }} />
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
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>Fiscal</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 22, fontWeight: 700, color: '#F4F2EE', lineHeight: 1.1 }}>{fiscalPct}%</span>
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

      {/* ── Charts row 2 ── */}
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
    </>
  )
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso. `ReporteCajas.jsx` no se usa todavía en ningún lado (eso pasa en la Task 5) — el build no debe fallar por eso, es un componente exportado y no importado, no un error.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/reportes.js frontend/src/pages/reportes/ReporteCajas.jsx
git commit -m "feat(reportes): agregar ReporteCajas.jsx y cliente API para /reportes/cajas y /reportes/pagos"
```

---

### Task 4: Frontend — reescribir `ReportePagos.jsx`

**Files:**
- Modify: `frontend/src/pages/reportes/ReportePagos.jsx` (reescritura completa)
- Modify: `frontend/src/pages/reportes/reportes.css` (agregar modificador `.cols-5`)

**Interfaces:**
- Consumes: `reportesApi.pagos(params, signal)` (Task 3).
- Produces: componente `<ReportePagos applied={{desde,hasta}} activeLocal={...} prettyDate={fn} />` — misma firma de props que la versión vieja, consumida por `Reportes.jsx` en la Task 5.

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar todo el contenido de `frontend/src/pages/reportes/ReportePagos.jsx` por:

```jsx
import { useState, useEffect } from 'react'
import { reportesApi } from '../../api/reportes.js'

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})
const fmt = (n) => fmtCurrency.format(n)

function IcoTrendDown() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#E0938C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l6 6 4-4 8 8M21 17v-5M21 17h-5"/>
    </svg>
  )
}
function IcoCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5FC98C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  )
}
function IcoAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4952A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01"/>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    </svg>
  )
}
function IcoCash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3FB6BD" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
      <path d="M6 6v.01M18 18v-.01"/>
    </svg>
  )
}
function IcoNoAvion() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B98CD8" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-1 0-1.3.4l-.7.7c-.4.4-.2 1.1.3 1.3L9 11l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 2.7 5.9c.2.5.9.7 1.3.3l.7-.7c.4-.3.5-.8.4-1.3z"/>
    </svg>
  )
}

export default function ReportePagos({ applied, activeLocal, prettyDate }) {
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
    reportesApi.pagos(params, ctrl.signal)
      .then((res) => setData(res.data))
      .catch((err) => { if (!ctrl.signal.aborted) console.error(err) })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied.desde, applied.hasta, activeLocal?.id])

  const skel = loading || !data
  const d = data ?? {}

  return (
    <>
      {/* ── Period chip ── */}
      <div className="rep-period">
        <span className="rep-period-label">Período analizado</span>
        <span className="rep-period-value">{prettyDate(applied.desde)} — {prettyDate(applied.hasta)}</span>
      </div>

      {/* ── KPI cards ── */}
      <div className="rep-kpi-grid cols-5">
        <div className="rep-kpi danger">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Total adeudado</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(196,107,99,.2)' }}><IcoTrendDown /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_adeudado)}</div>}
          <div className="rep-kpi-sub">{d.count_adeudado ?? 0} pagos pendientes</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Auditados</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(95,201,140,.18)' }}><IcoCheck /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '40%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{d.count_auditados ?? 0}</div>}
          <div className="rep-kpi-sub">pagos auditados en el período</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">No auditados</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(212,149,42,.18)' }}><IcoAlert /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '40%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{d.count_no_auditados ?? 0}</div>}
          <div className="rep-kpi-sub">pagos sin auditar en el período</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">En efectivo</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(63,182,189,.16)' }}><IcoCash /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '55%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_efectivo)}</div>}
          <div className="rep-kpi-sub">{d.count_efectivo ?? 0} pagos en efectivo</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">No avión (Tipo C)</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(185,140,216,.18)' }}><IcoNoAvion /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '55%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_no_avion)}</div>}
          <div className="rep-kpi-sub">{d.count_no_avion ?? 0} comprobantes Tipo C</div>
        </div>
      </div>
    </>
  )
}
```

Notas: la nueva versión no trae gráficos (los datos de `/reportes/pagos` no incluyen series temporales, solo KPIs puntuales) — solo la fila de 5 cards. `IcoTrendDown` se reutiliza (mismo path que la versión vieja), los otros 4 íconos (`IcoCheck`, `IcoAlert`, `IcoCash`, `IcoNoAvion`) son nuevos.

**Importante:** el JSX usa `className="rep-kpi-grid cols-5"` (no solo `rep-kpi-grid`) — la clase base hoy tiene `grid-template-columns: 1.3fr 1fr 1fr 1fr` (fija en 4 columnas, pensada para el layout "hero + 3" de Cajas), que rompería el layout con 5 cards. El Step 2 agrega el modificador `.cols-5` para este caso.

- [ ] **Step 2: Agregar el modificador CSS `.cols-5`**

En `frontend/src/pages/reportes/reportes.css`, buscar el bloque:

```css
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
```

Y agregar inmediatamente después (sin modificar el bloque existente, que sigue usando `ReporteCajas.jsx`):

```css
.rep-kpi-grid.cols-5 {
  grid-template-columns: repeat(5, 1fr);
}
@media (max-width: 1100px) {
  .rep-kpi-grid.cols-5 { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 600px) {
  .rep-kpi-grid.cols-5 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación visual**

Levantar el frontend, entrar a Reportes → pestaña Pagos, y confirmar que las 5 cards se ven en una sola fila pareja en desktop (sin que ninguna quede más ancha que las demás como el "hero" viejo), 3 por fila en pantallas medianas, 1 por fila en mobile.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/reportes/ReportePagos.jsx frontend/src/pages/reportes/reportes.css
git commit -m "feat(reportes): reescribir ReportePagos.jsx con KPIs de adeudado/auditados/efectivo/no avion"
```

---

### Task 5: Frontend — `Reportes.jsx` con 3 pestañas

**Files:**
- Modify: `frontend/src/pages/reportes/Reportes.jsx`

**Interfaces:**
- Consumes: `<ReporteCajas>` (Task 3), `<ReportePagos>` (Task 4) — ambos con la firma `{ applied, activeLocal, prettyDate }`.

- [ ] **Step 1: Agregar el import de `ReporteCajas`**

En `frontend/src/pages/reportes/Reportes.jsx`, después de la línea `import ReportePagos from './ReportePagos.jsx'` (línea 3), agregar:

```javascript
import ReporteCajas from './ReporteCajas.jsx'
```

- [ ] **Step 2: Actualizar el array `TABS`**

Reemplazar:

```javascript
const TABS = [
  { key: 'pagos', label: 'Pagos y Cajas' },
  { key: 'cmv',   label: 'CMV' },
]
```

por:

```javascript
const TABS = [
  { key: 'pagos', label: 'Pagos' },
  { key: 'cajas', label: 'Cajas' },
  { key: 'cmv',   label: 'CMV' },
]
```

- [ ] **Step 3: Agregar el render de la pestaña Cajas**

Reemplazar:

```jsx
        {/* ── Active report ── */}
        {tab === 'pagos' && (
          <ReportePagos applied={applied} activeLocal={activeLocal} prettyDate={prettyDate} />
        )}
        {tab === 'cmv' && (
          <ReporteCMV applied={applied} activeLocal={activeLocal} prettyDate={prettyDate} />
        )}
```

por:

```jsx
        {/* ── Active report ── */}
        {tab === 'pagos' && (
          <ReportePagos applied={applied} activeLocal={activeLocal} prettyDate={prettyDate} />
        )}
        {tab === 'cajas' && (
          <ReporteCajas applied={applied} activeLocal={activeLocal} prettyDate={prettyDate} />
        )}
        {tab === 'cmv' && (
          <ReporteCMV applied={applied} activeLocal={activeLocal} prettyDate={prettyDate} />
        )}
```

- [ ] **Step 4: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 5: Verificación visual**

Levantar el frontend, entrar a `/reportes` y confirmar:
- Aparecen 3 pestañas: Pagos, Cajas, CMV (en ese orden).
- La pestaña Pagos por defecto (`tab` inicial es `'pagos'`, sin cambios) muestra las 5 cards nuevas.
- La pestaña Cajas muestra los mismos datos que antes mostraba la pestaña combinada (ventas, Z, ticket promedio, gráfico semanal, medios de pago) — comparar contra una captura de pantalla previa si es posible, o contra los KPIs numéricos ya conocidos.
- Cambiar el selector de fecha/local y confirmar que ambas pestañas (Pagos y Cajas) reaccionan.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/reportes/Reportes.jsx
git commit -m "feat(reportes): agregar pestaña Cajas, separada de Pagos"
```

---

## Nota final

Después de completar las 5 tareas, `frontend/src/api/reportes.js` ya no expone el método `get()` (renombrado a `cajas()`/`pagos()` en la Task 3) — confirmar con un grep (`grep -rn "reportesApi.get(" frontend/src`) que ningún archivo fuera de los tocados en este plan sigue llamando al método viejo antes de dar la Task 3 por cerrada.
