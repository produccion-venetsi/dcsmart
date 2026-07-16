# Frontend de Arqueo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla completa de Arqueo: historial por local, formulario de carga con preview en vivo
de la comprobación antes de guardar, y detalle de un arqueo puntual.

**Architecture:** Un endpoint backend nuevo (`GET /api/arqueo/preview`) que reusa la lógica de cálculo
ya existente en `arqueo.js` sin persistir nada. Un archivo frontend único
`frontend/src/pages/arqueo/ArqueoList.jsx` (mismo patrón de "todo en un archivo" ya usado en
`CajaList.jsx`/`PdpDashboard.jsx`) con 3 componentes: la lista/historial, el panel de creación (con
preview + detalles pendientes tipo `CajaCreatePanel`), y el panel de detalle.

**Tech Stack:** Fastify/Prisma (backend), React + `DrawerPanel` (frontend, componentes ya existentes).

## Global Constraints

- El `POST /api/arqueo` ya existente NO cambia — el preview es un endpoint de solo lectura nuevo,
  separado.
- Montos siempre positivos, sin signo (consistente con el resto del proyecto).
- Los `detalles` del arqueo se mandan TODOS JUNTOS en el mismo `POST /api/arqueo` (el backend ya los
  crea de forma atómica anidada) — a diferencia del patrón de `CajaCreatePanel`, acá NO hace falta un
  loop de llamadas separadas por detalle después de crear.
- Ruta `/arqueo`, guard `OperativeGuard` (mismo que `/cajas`/`/pagos` — excluye solo rol `reportes`),
  entrada de sidebar con `roles: ALL` (`['super_admin','dcsmart','admin','cajero']`).
- `master` es producción real, no se toca sin confirmación explícita del usuario (esta rama no toca
  master).

---

## Mapa de archivos

```
dcsmart/backend/src/routes/arqueo.js        (modificar: agrega GET /preview)

dcsmart/frontend/src/
├── api/arqueo.js                            (nuevo: cliente API)
├── App.jsx                                  (modificar: registra ruta /arqueo)
├── components/Sidebar.jsx                   (modificar: agrega entrada de nav)
└── pages/arqueo/ArqueoList.jsx              (nuevo: historial + crear + detalle)
```

---

### Task 1: Backend — endpoint de preview

**Files:**
- Modify: `dcsmart/backend/src/routes/arqueo.js`

**Interfaces:**
- Consumes: `getArqueoAnterior`, `calcularIngresos`, `calcularGastos` (ya definidas en el mismo
  archivo, sin cambios).
- Produces: `GET /api/arqueo/preview?id_local=X&fecha=Y` → `{ total_ultimo_arqueo, ingresos, gastos
  }` — consumido por Task 4 (frontend, panel de creación).

- [ ] **Step 1: Agregar la ruta de preview**

En `dcsmart/backend/src/routes/arqueo.js`, agregar la ruta nueva dentro de `arqueoRoutes`, después de
`GET /:id` (línea 80) y antes de `POST /` (línea 82):

```js
  // ── GET /preview ──────────────────────────────────────────────────────
  // Mismo cálculo que POST /, pero sin persistir nada -- para que el
  // frontend muestre la comprobación en vivo antes de confirmar.
  fastify.get('/preview', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, fecha } = request.query
    if (!id_local || !fecha) {
      return reply.code(400).send({ error: 'id_local y fecha son requeridos' })
    }
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const fechaArqueo = new Date(fecha)
    const anterior = await getArqueoAnterior(fastify, id_local, fechaArqueo)
    const totalUltimoArqueo = anterior ? Number(anterior.total) : 0
    const fechaDesde = anterior ? anterior.fecha : null

    const ingresos = await calcularIngresos(fastify, id_local, fechaDesde, fechaArqueo)
    const gastos = await calcularGastos(fastify, id_local, fechaDesde, fechaArqueo)

    return { total_ultimo_arqueo: totalUltimoArqueo, ingresos, gastos }
  })

```

- [ ] **Step 2: Verificar sintaxis y arranque**

```bash
cd dcsmart/backend
node --check src/routes/arqueo.js
```
Expected: sin output (sin errores). Si el backend local está corriendo (nodemon en background),
debería recargar solo — confirmá que sigue escuchando en el puerto 3000 sin errores después del
cambio.

- [ ] **Step 3: Verificar el cálculo contra datos reales**

Con el túnel `cloud-sql-proxy` activo, usar el local `testing-local-01` (ya tiene datos de una
feature anterior) para confirmar que la lógica de `getArqueoAnterior`/`calcularIngresos`/
`calcularGastos` sigue devolviendo los mismos números ya vistos en la Tarea 2 del plan de backend
(`ingresos: 80500`, `gastos: 0` para ese local, sin ningún arqueo previo creado todavía ahí):

```bash
cd dcsmart/backend
node -e "
import('@prisma/client').then(async ({PrismaClient}) => {
  const prisma = new PrismaClient();
  const cajas = await prisma.caja.findMany({ where: { id_local: 'testing-local-01' }, select: { efectivo: true } });
  console.log('ingresos esperados:', cajas.reduce((a,c)=>a+Number(c.efectivo??0),0));
  await prisma.\$disconnect();
});
"
```
Expected: `ingresos esperados: 80500` (mismo número ya confirmado en el plan de backend) — esto NO
prueba el endpoint HTTP en sí (requiere JWT, sin credenciales de test en este entorno), pero confirma
que los datos subyacentes que `GET /preview` va a leer siguen siendo consistentes.

- [ ] **Step 4: Commit**

```bash
cd dcsmart
git add backend/src/routes/arqueo.js
git commit -m "Arqueo: agrega GET /preview (calculo sin persistir, para el formulario)"
```

---

### Task 2: Frontend — cliente API

**Files:**
- Create: `dcsmart/frontend/src/api/arqueo.js`

**Interfaces:**
- Produces: `arqueoApi.list(id_local, signal)`, `arqueoApi.get(id)`, `arqueoApi.create(data)`,
  `arqueoApi.preview(id_local, fecha)` — consumidos por Task 3/4 (componentes de la página).

- [ ] **Step 1: Crear el cliente**

Crear `dcsmart/frontend/src/api/arqueo.js`:

```js
import client from './client.js'

export const arqueoApi = {
  list:    (id_local, signal) => client.get('/arqueo', { params: { id_local }, signal }),
  get:     (id)                => client.get(`/arqueo/${id}`),
  create:  (data)              => client.post('/arqueo', data),
  preview: (id_local, fecha)   => client.get('/arqueo/preview', { params: { id_local, fecha } }),
}
```

- [ ] **Step 2: Verificar sintaxis**

```bash
cd dcsmart/frontend
npx esbuild src/api/arqueo.js --bundle=false --outfile=/tmp/arqueo-api-check.js
```
Expected: build sin errores.

- [ ] **Step 3: Commit**

```bash
cd dcsmart
git add frontend/src/api/arqueo.js
git commit -m "Arqueo: cliente API frontend"
```

---

### Task 3: Frontend — página `ArqueoList.jsx` (historial + navegación)

**Files:**
- Create: `dcsmart/frontend/src/pages/arqueo/ArqueoList.jsx`
- Modify: `dcsmart/frontend/src/App.jsx`
- Modify: `dcsmart/frontend/src/components/Sidebar.jsx`

**Interfaces:**
- Consumes: `arqueoApi.list` (Task 2), `useAppStore` (`activeLocal`), `useUiStore` (`notify`),
  `DrawerPanel` (componente ya existente).
- Produces: componente `ArqueoList` exportado por default — Task 4 agrega el panel de creación y el
  de detalle DENTRO de este mismo archivo (mismo patrón que `CajaList.jsx`), así que esta tarea deja
  los botones "Nuevo arqueo"/"Ver detalle" ya cableados a estados `panelOpen`/`detailOpen` que Task 4
  va a usar para renderizar sus paneles — sin esos paneles todavía, los botones no van a hacer nada
  visible más allá de cambiar el estado (esperado en este punto del plan).

- [ ] **Step 1: Crear el archivo con la lista/historial**

Crear `dcsmart/frontend/src/pages/arqueo/ArqueoList.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { arqueoApi } from '../../api/arqueo.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'

/* ── helpers ── */
function fmt$(n) {
  return n != null
    ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : '—'
}
function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString('es-AR', { hour12: false }) : '—'
}

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

/* ── página ── */
export default function ArqueoList() {
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify      = useUiStore((s) => s.notify)

  const [arqueos, setArqueos] = useState([])
  const [loading, setLoading] = useState(true)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const load = () => {
    if (!activeLocal?.id) { setArqueos([]); setLoading(false); return }
    setLoading(true)
    arqueoApi.list(activeLocal.id)
      .then(({ data }) => setArqueos(data.data))
      .catch(() => notify('Error al cargar el historial de arqueos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [activeLocal?.id])

  const openDetail = (id) => { setSelectedId(id); setDetailOpen(true) }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Arqueo</h1>
          <p className="page-sub">
            {activeLocal ? activeLocal.nombre : 'Seleccioná un local'}
          </p>
        </div>
        <div className="page-head-right">
          <button
            className="btn btn-primary"
            onClick={() => setPanelOpen(true)}
            disabled={!activeLocal}
          >
            <IcoPlus /> Nuevo arqueo
          </button>
        </div>
      </div>

      {!activeLocal ? (
        <div className="pdp-empty">Seleccioná un local para ver su historial de arqueos.</div>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><span className="spinner" /></div>
      ) : arqueos.length === 0 ? (
        <div className="pdp-empty">Todavía no se cargó ningún arqueo para este local.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Caja fuerte</th><th>Cofre</th><th>Adición</th>
                <th>Total</th><th>Comprobación</th><th></th>
              </tr>
            </thead>
            <tbody>
              {arqueos.map((a) => {
                const cuadra = Math.abs(Number(a.comprobacion)) < 0.01
                return (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.fecha)}</td>
                    <td className="td-number">{fmt$(a.caja_fuerte)}</td>
                    <td className="td-number">{fmt$(a.cofre)}</td>
                    <td className="td-number">{fmt$(a.adicion)}</td>
                    <td className="td-number">{fmt$(a.total)}</td>
                    <td>
                      <span className={`badge ${cuadra ? 'badge-green' : 'badge-red'}`}>
                        {fmt$(a.comprobacion)}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => openDetail(a.id)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <DrawerPanel open={panelOpen} onClose={() => setPanelOpen(false)} title="Nuevo arqueo" width={560}>
        {panelOpen && activeLocal && (
          <div>Formulario pendiente (Task 4)</div>
        )}
      </DrawerPanel>

      <DrawerPanel open={detailOpen} onClose={() => setDetailOpen(false)} title="Detalle de arqueo" width={560}>
        {detailOpen && selectedId && (
          <div>Detalle pendiente (Task 4)</div>
        )}
      </DrawerPanel>
    </div>
  )
}
```

Nota: el placeholder `"Formulario pendiente (Task 4)"`/`"Detalle pendiente (Task 4)"` es intencional y
temporal — la Task 4 reemplaza esos dos `<div>` por los componentes reales `ArqueoCreatePanel`/
`ArqueoDetailPanel`. No es un placeholder del tipo prohibido por la convención de planes (no describe
"qué hacer" sin mostrarlo — es literalmente el estado intermedio correcto entre Task 3 y Task 4 de
este mismo plan, documentado explícitamente).

- [ ] **Step 2: Registrar la ruta en `App.jsx`**

En `dcsmart/frontend/src/App.jsx`, agregar el import junto a los demás lazy (después de la línea de
`DetalleTipos`, línea 26):

```js
const ArqueoList    = lazy(() => import('./pages/arqueo/ArqueoList.jsx'))
```

Y la ruta junto a `pdp`/`proveedores` (después de la línea 107, antes de `auditorias`):

```jsx
          <Route path="arqueo"                      element={<OperativeGuard><ArqueoList /></OperativeGuard>} />
```

- [ ] **Step 3: Agregar la entrada de sidebar**

En `dcsmart/frontend/src/components/Sidebar.jsx`, agregar el ícono nuevo después de `IcoPdp` (línea
49):

```jsx
function IcoArqueo() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="16" r="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}
```

Y la entrada en `NAV_MAIN`, después de `/pdp` (línea 173):

```js
  { to: '/arqueo',      label: 'Arqueo',      Icon: IcoArqueo,    roles: ALL },
```

- [ ] **Step 4: Verificar sintaxis de los 3 archivos**

```bash
cd dcsmart/frontend
npx esbuild src/pages/arqueo/ArqueoList.jsx src/App.jsx src/components/Sidebar.jsx --bundle=false --outdir=/tmp/arqueo-check
```
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
cd dcsmart
git add frontend/src/pages/arqueo/ArqueoList.jsx frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "Arqueo: pagina de historial, ruta y entrada de sidebar"
```

---

### Task 4: Frontend — panel de creación (con preview) y panel de detalle

**Files:**
- Modify: `dcsmart/frontend/src/pages/arqueo/ArqueoList.jsx`

**Interfaces:**
- Consumes: `arqueoApi.preview`, `arqueoApi.create`, `arqueoApi.get` (Task 2), `detallesApi.tipos`
  (ya existente, `frontend/src/api/detalles.js`).
- Produces: componentes `ArqueoCreatePanel`/`ArqueoDetailPanel` (locales al archivo, no exportados) —
  es la última tarea de este plan.

- [ ] **Step 1: Agregar el import de `detallesApi` y los componentes al archivo**

En `dcsmart/frontend/src/pages/arqueo/ArqueoList.jsx`, agregar el import al principio (junto a los
demás):

```js
import { detallesApi } from '../../api/detalles.js'
```

Agregar los dos componentes nuevos ANTES de `export default function ArqueoList()`:

```jsx
/* ── panel de creación (con preview) ── */
function ArqueoCreatePanel({ activeLocal, onCreated }) {
  const notify = useUiStore((s) => s.notify)
  const [saving, setSaving] = useState(false)

  const [cajaFuerte, setCajaFuerte] = useState('')
  const [cofre,      setCofre]      = useState('')
  const [adicion,    setAdicion]    = useState('')

  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(true)

  const [tipos, setTipos] = useState([])
  const [pendingDetalles, setPendingDetalles] = useState([])
  const [detForm, setDetForm] = useState({ id_tipo: '', monto: '' })

  const fechaArqueo = new Date()

  useEffect(() => {
    detallesApi.tipos(activeLocal.id).then(r => setTipos(r.data || [])).catch(() => {})
    setLoadingPreview(true)
    arqueoApi.preview(activeLocal.id, fechaArqueo.toISOString())
      .then(({ data }) => setPreview(data))
      .catch(() => notify('Error al calcular el preview', 'error'))
      .finally(() => setLoadingPreview(false))
  }, [activeLocal.id])

  const total = (Number(cajaFuerte) || 0) + (Number(cofre) || 0) + (Number(adicion) || 0)
  const comprobacion = preview
    ? (total + preview.total_ultimo_arqueo) - (preview.ingresos + preview.gastos)
    : null

  const addPendingDetalle = () => {
    if (!detForm.monto) return
    setPendingDetalles(prev => [...prev, { ...detForm, _key: crypto.randomUUID() }])
    setDetForm({ id_tipo: '', monto: '' })
  }
  const removePendingDetalle = (key) => setPendingDetalles(prev => prev.filter(d => d._key !== key))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await arqueoApi.create({
        id_local: activeLocal.id,
        fecha: fechaArqueo.toISOString(),
        caja_fuerte: parseFloat(cajaFuerte) || 0,
        cofre: parseFloat(cofre) || 0,
        adicion: parseFloat(adicion) || 0,
        detalles: pendingDetalles.map(d => ({
          id_tipo: d.id_tipo || null,
          monto: parseFloat(d.monto) || 0
        }))
      })
      notify('Arqueo creado', 'success')
      onCreated()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear el arqueo', 'error')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Caja fuerte</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cajaFuerte} onChange={e => setCajaFuerte(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Cofre</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={cofre} onChange={e => setCofre(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Adición</label>
        <div className="form-input-wrap">
          <input type="number" step="0.01" required value={adicion} onChange={e => setAdicion(e.target.value)} />
        </div>
      </div>

      <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Detalles (opcional)</div>
      {pendingDetalles.map(d => (
        <div key={d._key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span>{tipos.find(t => t.id === d.id_tipo)?.nombre || 'Sin tipo'}: {fmt$(d.monto)}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => removePendingDetalle(d._key)}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: '0.5rem' }}>
        <select value={detForm.id_tipo} onChange={e => setDetForm({ ...detForm, id_tipo: e.target.value })}>
          <option value="">Tipo…</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <input type="number" step="0.01" placeholder="Monto" value={detForm.monto} onChange={e => setDetForm({ ...detForm, monto: e.target.value })} />
        <button type="button" className="btn btn-sm btn-secondary" onClick={addPendingDetalle}>
          <IcoPlus /> Agregar
        </button>
      </div>

      <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Comprobación</div>
      {loadingPreview ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><span className="spinner" /></div>
      ) : (
        <div className="drawer-detail">
          <div className="drawer-detail-row"><span className="drawer-detail-key">Total contado</span><span className="drawer-detail-val">{fmt$(total)}</span></div>
          <div className="drawer-detail-row"><span className="drawer-detail-key">Total arqueo anterior</span><span className="drawer-detail-val">{fmt$(preview?.total_ultimo_arqueo)}</span></div>
          <div className="drawer-detail-row"><span className="drawer-detail-key">Ingresos</span><span className="drawer-detail-val">{fmt$(preview?.ingresos)}</span></div>
          <div className="drawer-detail-row"><span className="drawer-detail-key">Gastos</span><span className="drawer-detail-val">{fmt$(preview?.gastos)}</span></div>
          <div className="drawer-detail-row">
            <span className="drawer-detail-key">Comprobación</span>
            <span className={`badge ${Math.abs(comprobacion) < 0.01 ? 'badge-green' : 'badge-red'}`}>{fmt$(comprobacion)}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving || loadingPreview}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Confirmar arqueo'}
        </button>
      </div>
    </form>
  )
}

/* ── panel de detalle ── */
function ArqueoDetailPanel({ arqueoId }) {
  const notify = useUiStore((s) => s.notify)
  const [arqueo, setArqueo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    arqueoApi.get(arqueoId)
      .then(({ data }) => setArqueo(data))
      .catch(() => notify('Error al cargar el arqueo', 'error'))
      .finally(() => setLoading(false))
  }, [arqueoId])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><span className="spinner" /></div>
  if (!arqueo) return null

  const cuadra = Math.abs(Number(arqueo.comprobacion)) < 0.01

  return (
    <div>
      <div className="drawer-detail">
        <div className="drawer-detail-row"><span className="drawer-detail-key">Fecha</span><span className="drawer-detail-val">{fmtDateTime(arqueo.fecha)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Caja fuerte</span><span className="drawer-detail-val">{fmt$(arqueo.caja_fuerte)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Cofre</span><span className="drawer-detail-val">{fmt$(arqueo.cofre)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Adición</span><span className="drawer-detail-val">{fmt$(arqueo.adicion)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Total</span><span className="drawer-detail-val">{fmt$(arqueo.total)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Ingresos</span><span className="drawer-detail-val">{fmt$(arqueo.ingresos)}</span></div>
        <div className="drawer-detail-row"><span className="drawer-detail-key">Gastos</span><span className="drawer-detail-val">{fmt$(arqueo.gastos)}</span></div>
        <div className="drawer-detail-row">
          <span className="drawer-detail-key">Comprobación</span>
          <span className={`badge ${cuadra ? 'badge-green' : 'badge-red'}`}>{fmt$(arqueo.comprobacion)}</span>
        </div>
      </div>

      {arqueo.detalles?.length > 0 && (
        <>
          <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Detalles</div>
          {arqueo.detalles.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{d.detalle_tipo?.nombre || d.nombre || 'Sin tipo'}</span>
              <span>{fmt$(d.monto)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Reemplazar los placeholders del `export default function ArqueoList()`**

Reemplazar el contenido de los dos `DrawerPanel` (que hoy tienen `"Formulario pendiente (Task 4)"`/
`"Detalle pendiente (Task 4)"`) por:

```jsx
      <DrawerPanel open={panelOpen} onClose={() => setPanelOpen(false)} title="Nuevo arqueo" width={560}>
        {panelOpen && activeLocal && (
          <ArqueoCreatePanel
            activeLocal={activeLocal}
            onCreated={() => { setPanelOpen(false); load() }}
          />
        )}
      </DrawerPanel>

      <DrawerPanel open={detailOpen} onClose={() => setDetailOpen(false)} title="Detalle de arqueo" width={560}>
        {detailOpen && selectedId && <ArqueoDetailPanel arqueoId={selectedId} />}
      </DrawerPanel>
```

- [ ] **Step 3: Verificar sintaxis**

```bash
cd dcsmart/frontend
npx esbuild src/pages/arqueo/ArqueoList.jsx --bundle=false --outfile=/tmp/arqueo-final-check.js
```
Expected: build sin errores.

- [ ] **Step 4: Probar el flujo completo en el navegador**

Con el backend y el frontend local corriendo, y logueado como super_admin:
1. Ir a la pantalla "Arqueo" del sidebar, con el local `Local Testing` (`testing-local-01`) activo.
2. Click en "Nuevo arqueo" — debe abrir el panel, cargar el preview (loading breve), y mostrar
   `Total arqueo anterior: $0,00`, `Ingresos: $80.500,00`, `Gastos: $0,00` (según los datos ya
   confirmados de ese local).
3. Cargar caja fuerte/cofre/adición — la comprobación debe recalcularse en vivo sin llamadas de red
   adicionales.
4. Confirmar — debe cerrar el panel, mostrar notificación de éxito, y el nuevo arqueo debe aparecer
   en el historial.
5. Click en "Ver detalle" de esa fila — debe mostrar los mismos datos guardados.

Si algo de esto no se puede verificar por falta de acceso interactivo al navegador en el entorno de
ejecución, dejarlo documentado explícitamente como pendiente de verificación manual, no asumir que
funciona sin haberlo visto.

- [ ] **Step 5: Commit**

```bash
cd dcsmart
git add frontend/src/pages/arqueo/ArqueoList.jsx
git commit -m "Arqueo: panel de creacion con preview en vivo y panel de detalle"
```

---

## Self-Review

**Cobertura del spec:**
- Endpoint de preview sin persistir → Task 1. ✓
- Historial por local con indicador visual de comprobación → Task 3. ✓
- Formulario de carga con preview en vivo (sin llamadas de red por cada tecla) → Task 4
  (`arqueoApi.preview` se llama una sola vez al abrir el panel, el resto es cálculo local con
  `total`/`comprobacion` derivados de `preview` + los 3 montos en estado). ✓
- Detalles opcionales (MP/Rappi) acumulados localmente antes de enviar, mandados todos juntos en el
  mismo `POST /api/arqueo` (no un loop de llamadas separadas como `CajaCreatePanel`) → Task 4. ✓
- Ruta `/arqueo` con `OperativeGuard`, entrada de sidebar con `roles: ALL` → Task 3. ✓
- Detalle de un arqueo puntual con sus `ArqueoDetalle` → Task 4 (`ArqueoDetailPanel`). ✓

**Placeholder scan:** el único texto tipo "pendiente" (`"Formulario pendiente (Task 4)"`) es un
placeholder INTENCIONAL de un estado intermedio real entre dos tareas del mismo plan, documentado
explícitamente como tal — no es del tipo prohibido (vago, sin mostrar cómo, referencia a algo no
definido). El resto del plan no tiene TBD/TODO.

**Consistencia de tipos:** `arqueoApi.preview` devuelve `{ total_ultimo_arqueo, ingresos, gastos }`
(Task 1, Task 2), consumido en Task 4 como `preview.total_ultimo_arqueo`/`preview.ingresos`/
`preview.gastos` — nombres exactos consistentes. `arqueoApi.list` devuelve `{data: {data: Arqueo[]}}`
(mismo wrapper que `pdpApi.list`/`pagosApi.list` ya usan), consumido en Task 3 como `.then(({data}) =>
setArqueos(data.data))` — consistente. Los campos de `Arqueo` (`caja_fuerte`, `cofre`, `adicion`,
`total`, `ingresos`, `gastos`, `comprobacion`, `fecha`, `detalles`) se usan con los mismos nombres en
Task 3 (tabla de historial) y Task 4 (`ArqueoDetailPanel`), consistentes con el modelo Prisma ya
definido en el plan de backend.
