# Pantalla de Auditorías Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una pantalla nueva, solo para `super_admin`, que liste todos los eventos de auditoría (pagos + cajas) en una tabla con filtros por fecha, módulo, usuario y acción.

**Architecture:** Nuevo endpoint backend `GET /api/auditorias` que consulta la tabla `Audit` directamente (sin pasar por `pagos.js`/`caja.js`), resolviendo la referencia legible del registro (`registro_label`) con dos queries acotadas a la página actual. Nuevo endpoint `GET /api/auditorias/usuarios` para poblar el filtro de usuario. Frontend: cliente API, página nueva con filtros + tabla + paginación (mismo patrón que `PagoList.jsx`/`CajaList.jsx`), ruta protegida por rol y entrada de menú visible solo para superadmin.

**Tech Stack:** Fastify + Prisma (Postgres), React (Vite) + Zustand + react-router-dom.

## Global Constraints

- ESModules (`import`/`export`), `async/await` siempre — nunca callbacks.
- El decorator `fastify.requireSuperAdmin` ya existe (`backend/src/plugins/permissions.js:6-14`) y no requiere `appContext` — usarlo tal cual, sin agregar `fastify.appContext` al preHandler de las rutas nuevas (esta pantalla es una vista global, no por-app/local).
- No existe suite de tests automatizada en este proyecto — la verificación es manual (curl para el backend, navegador para el frontend).
- Los cambios de schema (si hicieran falta, no es el caso en este plan) se aplican con `npx prisma db push`, no `prisma migrate` — no aplica a este plan, no se toca `schema.prisma`.
- Los IDs de módulo de permisos existentes son `'caja'` (singular) y `'pagos'` — este plan no usa el sistema `fastify.can()` en absoluto, usa `requireSuperAdmin` en su lugar, así que no aplica.

---

## Task 1: Backend — endpoints de auditorías

**Files:**
- Create: `backend/src/routes/auditorias.js`
- Modify: `backend/src/server.js` (agregar import + registro de la ruta)

**Interfaces:**
- Consumes: `fastify.authenticate`, `fastify.requireSuperAdmin` (ya existen en `backend/src/plugins/permissions.js`), `fastify.db.audit`, `fastify.db.pago`, `fastify.db.caja` (Prisma Client).
- Produces:
  - `GET /api/auditorias?desde&hasta&tabla&id_user&accion&page&limit` → `{ data: AuditoriaRow[], total, page, limit }`, donde `AuditoriaRow = { id, fecha, tabla, id_registro, accion, observaciones, user: {id, nombre} | null, registro_label }`.
  - `GET /api/auditorias/usuarios` → `{ id, nombre }[]`.
  - Task 2 (cliente API) y Task 3 (página frontend) consumen estos dos endpoints con esta forma exacta.

- [ ] **Step 1: Crear `backend/src/routes/auditorias.js`**

```javascript
export default async function auditoriasRoutes(fastify) {
  const guard = [fastify.authenticate, fastify.requireSuperAdmin]

  // ── GET / ─────────────────────────────────────────────────────────────
  // Lista todos los eventos de auditoría (pagos + cajas), con filtros.
  // Vista global — no depende de appContext ni de locales permitidos,
  // solo accesible para super_admin.
  fastify.get('/', { preHandler: guard }, async (request, reply) => {
    const {
      desde, hasta, tabla, id_user, accion,
      page = 1, limit = 50
    } = request.query

    if (tabla && !['pagos', 'cajas'].includes(tabla)) {
      return reply.code(400).send({ error: 'tabla debe ser "pagos" o "cajas"' })
    }
    if (accion && !['auditado', 'desauditado'].includes(accion)) {
      return reply.code(400).send({ error: 'accion debe ser "auditado" o "desauditado"' })
    }

    const where = {
      ...(tabla   ? { tabla }   : {}),
      ...(id_user ? { id_user } : {}),
      ...(accion  ? { accion }  : {}),
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta + 'T23:59:59.999') } : {})
        }
      } : {})
    }

    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    const [rows, total] = await Promise.all([
      fastify.db.audit.findMany({
        where,
        include: { user: { select: { id: true, nombre: true } } },
        orderBy: { fecha: 'desc' },
        skip,
        take
      }),
      fastify.db.audit.count({ where })
    ])

    // Resolver registro_label: Audit es polimórfica (tabla + id_registro),
    // sin relación Prisma a Pago/Caja. Se resuelve con dos queries acotadas
    // a los ids presentes en esta página (no a toda la tabla).
    const pagoIds = rows.filter(r => r.tabla === 'pagos').map(r => r.id_registro)
    const cajaIds = rows.filter(r => r.tabla === 'cajas').map(r => r.id_registro)

    const [pagos, cajas] = await Promise.all([
      pagoIds.length
        ? fastify.db.pago.findMany({ where: { id: { in: pagoIds } }, select: { id: true, nro_ord: true } })
        : [],
      cajaIds.length
        ? fastify.db.caja.findMany({ where: { id: { in: cajaIds } }, select: { id: true, nro_turno: true } })
        : []
    ])

    const labelMap = new Map()
    pagos.forEach(p => labelMap.set(p.id, p.nro_ord != null ? `OP-${p.nro_ord}` : '—'))
    cajas.forEach(c => labelMap.set(c.id, c.nro_turno ? `TRN ${c.nro_turno}` : '—'))

    const data = rows.map(r => ({
      id: r.id,
      fecha: r.fecha,
      tabla: r.tabla,
      id_registro: r.id_registro,
      accion: r.accion,
      observaciones: r.observaciones,
      user: r.user,
      registro_label: labelMap.get(r.id_registro) ?? '—'
    }))

    return { data, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /usuarios ────────────────────────────────────────────────────
  // Lista de usuarios distintos que aparecen como autor de algún evento
  // de auditoría, para poblar el filtro de usuario en el frontend.
  fastify.get('/usuarios', { preHandler: guard }, async (request, reply) => {
    const rows = await fastify.db.audit.findMany({
      where: { id_user: { not: null } },
      distinct: ['id_user'],
      select: { user: { select: { id: true, nombre: true } } }
    })
    return rows.map(r => r.user).filter(Boolean)
  })
}
```

- [ ] **Step 2: Registrar la ruta en `backend/src/server.js`**

Agregar el import junto a los demás (después de la línea `import reportesRoutes from './routes/reportes.js'`):

```javascript
import reportesRoutes from './routes/reportes.js'
import auditoriasRoutes from './routes/auditorias.js'
```

Agregar el registro junto a los demás `app.register(...Routes, ...)` (después de `await app.register(reportesRoutes, { prefix: '/api/reportes' })`):

```javascript
await app.register(reportesRoutes, { prefix: '/api/reportes' })
await app.register(auditoriasRoutes, { prefix: '/api/auditorias' })
```

- [ ] **Step 3: Verificación manual con curl**

Run: `cd backend && npm run dev` (dejar corriendo en background; requiere el Cloud SQL Auth Proxy activo, ver `README.md`).

Con un usuario `super_admin` (`super1@dcsmart.com` / `Dcsmart2026!`, obtener `TOKEN` vía `POST /api/auth/login`):

```bash
# Listado sin filtros — debe traer eventos de pagos Y cajas mezclados, orden fecha desc
curl -s "http://localhost:3000/api/auditorias?limit=5" -H "Authorization: Bearer $TOKEN"
# Expected: { data: [...5 filas con registro_label resuelto...], total: N, page: 1, limit: 5 }

# Filtro por módulo
curl -s "http://localhost:3000/api/auditorias?tabla=cajas&limit=5" -H "Authorization: Bearer $TOKEN"
# Expected: todas las filas de data tienen "tabla":"cajas"

# Filtro por acción
curl -s "http://localhost:3000/api/auditorias?accion=desauditado&limit=5" -H "Authorization: Bearer $TOKEN"
# Expected: todas las filas tienen "accion":"desauditado"

# Filtro por rango de fechas
curl -s "http://localhost:3000/api/auditorias?desde=2026-07-01&hasta=2026-07-02" -H "Authorization: Bearer $TOKEN"
# Expected: solo filas con fecha dentro del rango

# Lista de usuarios para el filtro
curl -s "http://localhost:3000/api/auditorias/usuarios" -H "Authorization: Bearer $TOKEN"
# Expected: array de { id, nombre } sin duplicados

# Filtro por ese usuario
curl -s "http://localhost:3000/api/auditorias?id_user=<uno-de-los-ids-anteriores>" -H "Authorization: Bearer $TOKEN"
# Expected: todas las filas tienen ese user.id

# Un usuario NO superadmin debe recibir 403 (usar un token de un usuario con rol admin/cajero, si hay uno de prueba)
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/auditorias" -H "Authorization: Bearer $TOKEN_NO_SUPERADMIN"
# Expected: 403
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/auditorias.js backend/src/server.js
git commit -m "feat(auditorias): agregar endpoints de listado agregado de auditorias (solo superadmin)"
```

---

## Task 2: Frontend — cliente API

**Files:**
- Create: `frontend/src/api/auditorias.js`

**Interfaces:**
- Consumes: endpoints de Task 1 (`GET /auditorias`, `GET /auditorias/usuarios`).
- Produces: `auditoriasApi.list(params, signal)`, `auditoriasApi.usuarios(signal)`. La Task 3 (página frontend) consume ambos.

- [ ] **Step 1: Crear `frontend/src/api/auditorias.js`**

```javascript
import client from './client.js'

export const auditoriasApi = {
  list:     (params, signal) => client.get('/auditorias', { params, signal }),
  usuarios: (signal)         => client.get('/auditorias/usuarios', { signal }),
}
```

- [ ] **Step 2: Verificación manual**

Run: `cd frontend && npm run build`
Expected: compila sin errores (todavía no hay ningún caller — se agrega en la Task 3).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/auditorias.js
git commit -m "feat(api): agregar cliente auditoriasApi (list, usuarios)"
```

---

## Task 3: Frontend — página, ruta y menú

**Files:**
- Create: `frontend/src/pages/auditorias/Auditorias.jsx`
- Modify: `frontend/src/App.jsx` (import lazy + ruta protegida)
- Modify: `frontend/src/components/Sidebar.jsx` (ícono + entrada de menú)

**Interfaces:**
- Consumes: `auditoriasApi.list`/`auditoriasApi.usuarios` (Task 2), componente `Guard` y constante `SUPER` ya existentes en `App.jsx` (`const SUPER = ['super_admin']`, línea 34 de `App.jsx` actual), `useUiStore().notify`.
- Produces: ruta `/auditorias`, entrada de menú "Auditorías" visible solo para `super_admin`.

- [ ] **Step 1: Crear `frontend/src/pages/auditorias/Auditorias.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { auditoriasApi } from '../../api/auditorias.js'
import { useUiStore } from '../../store/uiStore.js'

const LIMIT = 50

function fmtDT(d) { return d ? new Date(d).toLocaleString('es-AR') : '—' }

const MODULO_LABEL = { pagos: 'Pagos', cajas: 'Cajas' }
const MODULO_BADGE = { pagos: 'badge-blue', cajas: 'badge-muted' }

const FILTER_INIT = { desde: '', hasta: '', tabla: '', id_user: '', accion: '' }

export default function Auditorias() {
  const notify = useUiStore((s) => s.notify)

  const [rows,     setRows]     = useState([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [page,     setPage]     = useState(1)
  const [usuarios, setUsuarios] = useState([])
  const [filters,  setFilters]  = useState(FILTER_INIT)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  useEffect(() => {
    auditoriasApi.usuarios()
      .then(({ data }) => setUsuarios(data))
      .catch(() => {})
  }, [])

  const buildParams = useCallback((pageNum) => ({
    page: pageNum,
    limit: LIMIT,
    ...(filters.desde   ? { desde: filters.desde }     : {}),
    ...(filters.hasta   ? { hasta: filters.hasta }     : {}),
    ...(filters.tabla   ? { tabla: filters.tabla }     : {}),
    ...(filters.id_user ? { id_user: filters.id_user } : {}),
    ...(filters.accion  ? { accion: filters.accion }   : {}),
  }), [filters])

  useEffect(() => { setPage(1) }, [filters])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    auditoriasApi.list(buildParams(page), ctrl.signal)
      .then(({ data }) => { setRows(data.data); setTotal(data.total) })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar auditorías', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [buildParams, page])

  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages))
  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value }))

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Auditorías</h1>
          <p className="page-sub">Historial completo de auditorías de pagos y cajas</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Desde</label>
          <div className="form-input-wrap">
            <input type="date" value={filters.desde} onChange={e => setFilter('desde', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Hasta</label>
          <div className="form-input-wrap">
            <input type="date" value={filters.hasta} onChange={e => setFilter('hasta', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Módulo</label>
          <select className="filter-select" value={filters.tabla} onChange={e => setFilter('tabla', e.target.value)}>
            <option value="">Todos</option>
            <option value="pagos">Pagos</option>
            <option value="cajas">Cajas</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Usuario</label>
          <select className="filter-select" value={filters.id_user} onChange={e => setFilter('id_user', e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Acción</label>
          <select className="filter-select" value={filters.accion} onChange={e => setFilter('accion', e.target.value)}>
            <option value="">Todas</option>
            <option value="auditado">Auditado</option>
            <option value="desauditado">Desauditado</option>
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Módulo</th>
              <th>Registro</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Observación</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: 6 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 13 + i * 9) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="table-empty">
                    <p>Sin eventos de auditoría para los filtros aplicados.</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map(ev => (
                <tr key={ev.id}>
                  <td className="td-muted">{fmtDT(ev.fecha)}</td>
                  <td><span className={`badge ${MODULO_BADGE[ev.tabla] ?? 'badge-muted'}`}>{MODULO_LABEL[ev.tabla] ?? ev.tabla}</span></td>
                  <td>
                    <Link to={ev.tabla === 'pagos' ? '/pagos' : '/cajas'}>{ev.registro_label}</Link>
                  </td>
                  <td>{ev.user?.nombre ?? '—'}</td>
                  <td>
                    <span className={`badge ${ev.accion === 'auditado' ? 'badge-green' : 'badge-amber'}`}>
                      {ev.accion === 'auditado' ? 'Auditado' : 'Desauditado'}
                    </span>
                  </td>
                  <td className="td-muted">{ev.observaciones || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span className="pagination-info">
            {`${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} de ${total} eventos`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(1)} disabled={page <= 1} title="Primera página">«</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Anterior</button>
            <span style={{ fontSize: 13, color: 'var(--t2)', padding: '0 0.5rem', whiteSpace: 'nowrap' }}>
              Página {page} de {totalPages}
            </span>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>Siguiente ›</button>
            <button className="btn btn-sm btn-secondary" onClick={() => goToPage(totalPages)} disabled={page >= totalPages} title="Última página">»</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Agregar la ruta protegida en `frontend/src/App.jsx`**

Agregar el import lazy junto a los demás (después de `const Reportes = lazy(() => import('./pages/reportes/Reportes.jsx'))`):

```javascript
const Reportes      = lazy(() => import('./pages/reportes/Reportes.jsx'))
const Auditorias    = lazy(() => import('./pages/auditorias/Auditorias.jsx'))
```

Agregar la ruta dentro del `<Route path="/" ...>` (después de `<Route path="reportes" ... />`, usando el mismo patrón `Guard roles={SUPER}` que ya usan `admin/users` y `admin/rubcat`):

```jsx
          <Route path="reportes"                    element={<Guard roles={OPERATIVE}><Reportes /></Guard>} />
          <Route path="auditorias"                  element={<Guard roles={SUPER}><Auditorias /></Guard>} />
```

- [ ] **Step 3: Agregar el ícono y la entrada de menú en `frontend/src/components/Sidebar.jsx`**

Agregar la función de ícono junto a las demás (después de `IcoImpuestos`, antes de `IcoTag`):

```javascript
function IcoAuditorias() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}
```

Agregar la entrada al array `NAV_ADMIN` (después de la línea de `roles`):

```javascript
const NAV_ADMIN = [
  { to: '/admin/locales',       label: 'Locales',       Icon: IcoLocales,     roles: ['super_admin'] },
  { to: '/admin/users',         label: 'Usuarios',      Icon: IcoUsers,       roles: ['super_admin'] },
  { to: '/admin/roles',         label: 'Roles',         Icon: IcoRoles,       roles: ['super_admin'] },
  { to: '/admin/rubcat',        label: 'Rubros/Cats',   Icon: IcoRubCat,      roles: ['super_admin'] },
  { to: '/admin/metodos-pago',  label: 'Métodos Pago',  Icon: IcoMetodos,     roles: ['super_admin', 'dcsmart'] },
  { to: '/admin/detalle-tipos', label: 'Tipos Detalle', Icon: IcoTag,         roles: ['super_admin', 'dcsmart'] },
  { to: '/auditorias',          label: 'Auditorías',    Icon: IcoAuditorias,  roles: ['super_admin'] },
]
```

- [ ] **Step 4: Verificación manual**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

Run: backend y frontend corriendo (`npm run dev` en ambos), login como `super1@dcsmart.com` (superadmin):
1. Confirmar que aparece "Auditorías" en el menú, dentro de la sección Admin.
2. Entrar a `/auditorias` — debe listar eventos de pagos y cajas mezclados, ordenados por fecha descendente.
3. Probar cada filtro (fecha, módulo, usuario, acción) individualmente y combinados — la tabla debe actualizarse y la paginación debe resetear a la página 1 al cambiar un filtro.
4. Click en la columna "Registro" de una fila de pago → navega a `/pagos`; de una fila de caja → navega a `/cajas`.
5. Loguear con un usuario que NO sea `super_admin` (ej. `admin` o `cajero`) y confirmar que "Auditorías" no aparece en el menú, y que navegar manualmente a `/auditorias` no permite ver la página (el `Guard` debe redirigir/bloquear, igual que el resto de rutas `SUPER`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/auditorias/Auditorias.jsx frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(auditorias): agregar pantalla de auditorias con filtros (solo superadmin)"
```
