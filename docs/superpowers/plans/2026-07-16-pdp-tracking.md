# Registro de PDP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada vez que se genera un PDP (Planilla de Pago) desde el frontend, queda un registro
persistente en una tabla nueva `Pdp`: quién lo creó, cuándo, el PDF real (subido a GCS) y los pagos
que entraron en ese lote, con una pantalla de historial para redescargar cualquiera más adelante.

**Architecture:** Modelo Prisma nuevo `Pdp` (una fila por cada "Generar reporte"), rutas backend que
reusan el mismo patrón de subida/streaming privado de GCS que ya usa `pagos.js` (`POST /upload`,
`GET /:id/attachment`), y en el frontend se aprovecha el flujo existente de generación del PDF
(`pdpReport.js`/`PdpDashboard.jsx`) agregándole la subida + el registro, más una sección nueva de
historial en la misma pantalla.

**Tech Stack:** Prisma/Postgres, Fastify, `@google-cloud/storage` (ya instalado), React, `jsPDF`
(ya instalado).

## Global Constraints

- Montos siempre positivos con la dirección aparte del signo (no aplica directamente acá, `Pdp.total`
  es un agregado informativo, no un movimiento).
- IDs de modelos nuevos: UUID v4 (`@default(uuid())`), consistente con el resto del schema.
- `prisma db push` es el mecanismo de schema en este repo (no hay `prisma/migrations`).
- Permisos: mismo criterio que el resto del módulo de pagos — `fastify.can('pagos', 'view')` para
  listar/descargar, `fastify.can('pagos', 'create')` para crear un `Pdp` nuevo.
- El PDF que queda guardado es el que se generó en el momento (subido a GCS), nunca se regenera — la
  redescarga sirve ese mismo archivo.
- `master` es producción real, no se toca sin confirmación explícita del usuario.

---

## Mapa de archivos

```
dcsmart/backend/
├── prisma/schema.prisma              (modificar: model Pdp, relaciones en Local/User/Pago)
└── src/
    ├── routes/pdp.js                 (nuevo: POST /pdp, GET /pdp, GET /pdp/:id/attachment)
    └── server.js                     (modificar: registrar pdpRoutes)

dcsmart/frontend/src/
├── lib/pdpReport.js                  (modificar: devuelve blob+filename además de descargar)
├── api/pdp.js                        (nuevo: cliente API de /pdp)
└── pages/pdp/PdpDashboard.jsx        (modificar: sube+registra el PDF, agrega sección Historial)
```

---

### Task 1: Schema — modelo `Pdp` y relaciones

**Files:**
- Modify: `dcsmart/backend/prisma/schema.prisma`

**Interfaces:**
- Produces: modelo `Pdp` con campos `id, id_local, created_by, created_at, ultima_descarga, pdf_url,
  cantidad_pagos, total`, relación `Pago.pdp` (vía `Pago.id_pdp`), consumidos por Task 2 (rutas
  backend).

- [ ] **Step 1: Agregar el modelo `Pdp` al schema**

En `dcsmart/backend/prisma/schema.prisma`, agregar (después del modelo `Pago` y del enum `EstadoOp`,
en cualquier posición del archivo — Prisma no depende del orden):

```prisma
model Pdp {
  id              String    @id @default(uuid())
  id_local        String
  created_by      String?
  created_at      DateTime  @default(now())
  ultima_descarga DateTime?
  pdf_url         String
  cantidad_pagos  Int
  total           Decimal   @db.Decimal(12, 2)

  local   Local  @relation(fields: [id_local], references: [id])
  creador User?  @relation("PdpCreatedBy", fields: [created_by], references: [id])
  pagos   Pago[]

  @@index([id_local, created_at])
  @@map("pdp")
}
```

- [ ] **Step 2: Agregar la relación inversa en `Local`**

Buscar `model Local` (línea ~28) y agregar `pdps Pdp[]` junto a las demás relaciones inversas:

```prisma
  app           App               @relation(fields: [id_app], references: [id])
  proveedor     Proveedor?        @relation(fields: [id_proveedor], references: [id])
  cajas         Caja[]
  pagos         Pago[]
  pdps          Pdp[]
  local_access  UserLocalAccess[]
  detalle_tipos DetalleTipo[]
```

- [ ] **Step 3: Agregar la relación inversa en `User`**

Buscar `model User` (línea ~49) y agregar `pdps_creados Pdp[] @relation("PdpCreatedBy")` junto a
`pagos_creados`:

```prisma
  user_app_roles   UserAppRole[]
  user_permissions UserPermission[]
  cajas_creadas    Caja[]            @relation("CajaCreatedBy")
  pagos_creados    Pago[]            @relation("PagoCreatedBy")
  pdps_creados     Pdp[]             @relation("PdpCreatedBy")
  local_access     UserLocalAccess[]
  audits           Audit[]           @relation("AuditUser")
  app_usage        UserAppUsage[]
```

- [ ] **Step 4: Convertir `Pago.id_pdp` en una relación real**

Buscar el campo `id_pdp` en `model Pago` (línea 380, junto a `id_eventos`/`id_cheque`/`id_ctacte`) —
el campo `id_pdp String?` en sí NO cambia de tipo, pero hay que agregar la relación de Prisma. Buscar
el bloque de relaciones de `Pago` (después de los campos, antes de los índices) y agregar `pdp`:

```prisma
  proveedor   Proveedor?    @relation(fields: [id_proveedor], references: [id])
  rubcat      RubCat?       @relation(fields: [id_rubcat], references: [id])
  metodo_pago MetodoPago?   @relation(fields: [id_metodo], references: [id])
  local       Local?        @relation(fields: [id_local], references: [id])
  creador     User?         @relation("PagoCreatedBy", fields: [created_by], references: [id])
  pdp         Pdp?          @relation(fields: [id_pdp], references: [id])
  impuestos   Impuesto[]
  multimoneda MultiMoneda[]
```

- [ ] **Step 5: Aplicar el schema a la base y regenerar el cliente**

Con el túnel `cloud-sql-proxy` activo en el puerto 5433 y `dcsmart/backend/.env` apuntando ahí:

```bash
cd dcsmart/backend
npx prisma db push
npx prisma generate
```
Expected: `Your database is now in sync with your Prisma schema.` y `Generated Prisma Client`. Si
falla `generate` por archivo bloqueado, parar cualquier proceso `node`/`nodemon` del backend local
corriendo antes de reintentar (el backend local ya está corriendo en este entorno vía `npm run dev`
en background — hay que pararlo primero, `prisma generate` no puede sobrescribir el cliente mientras
un proceso lo tiene cargado en Windows).

- [ ] **Step 6: Commit**

```bash
cd dcsmart
git add backend/prisma/schema.prisma
git commit -m "PDP: agrega modelo Pdp y relaciones (Local, User, Pago.id_pdp)"
```

---

### Task 2: Backend — rutas `/api/pdp`

**Files:**
- Create: `dcsmart/backend/src/routes/pdp.js`
- Modify: `dcsmart/backend/src/server.js`

**Interfaces:**
- Consumes: modelo `Pdp` (Task 1), `fastify.authenticate`, `fastify.appContext`
  (`request.allowedLocalIds`, `request.user.id`), `fastify.can('pagos', ...)` (plugin de permisos ya
  existente), `@google-cloud/storage` (mismo patrón que `pagos.js:698-733`).
- Produces: `POST /api/pdp` (body `{ id_local, pago_ids: string[], pdf_url }` → crea el `Pdp` y
  setea `Pago.id_pdp` en esos ids), `GET /api/pdp?id_local=X` (lista ordenada `created_at desc`),
  `GET /api/pdp/:id/attachment` (stream del PDF, actualiza `ultima_descarga`) — consumidos por
  Task 3/4 (frontend).

- [ ] **Step 1: Crear el archivo de rutas**

Crear `dcsmart/backend/src/routes/pdp.js`:

```js
import { Storage } from '@google-cloud/storage'

export default async function pdpRoutes(fastify) {
  const gcs = new Storage()

  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'create')]

  // ── GET / ─────────────────────────────────────────────────────────────
  // Historial de PDP de un local, más reciente primero.
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local } = request.query
    if (!id_local || !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    const pdps = await fastify.db.pdp.findMany({
      where: { id_local },
      orderBy: { created_at: 'desc' },
      include: { creador: { select: { nombre: true } } }
    })
    return { data: pdps }
  })

  // ── POST / ────────────────────────────────────────────────────────────
  // Registra un PDP recién generado en el frontend: el PDF ya está subido a
  // GCS (vía POST /pagos/upload), acá solo se deja constancia del lote.
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { id_local, pago_ids, pdf_url } = request.body
    if (!id_local || !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }
    if (!Array.isArray(pago_ids) || !pago_ids.length) {
      return reply.code(400).send({ error: 'pago_ids es requerido' })
    }
    if (!pdf_url?.startsWith('gs://')) {
      return reply.code(400).send({ error: 'pdf_url inválido' })
    }

    const pagos = await fastify.db.pago.findMany({
      where: { id: { in: pago_ids } },
      select: { id: true, importe: true }
    })
    const total = pagos.reduce((acc, p) => acc + Number(p.importe ?? 0), 0)

    const pdp = await fastify.db.pdp.create({
      data: {
        id_local,
        created_by: request.user.id,
        pdf_url,
        cantidad_pagos: pagos.length,
        total
      }
    })
    await fastify.db.pago.updateMany({
      where: { id: { in: pago_ids } },
      data: { id_pdp: pdp.id }
    })
    return { ok: true, id: pdp.id }
  })

  // ── GET /:id/attachment ───────────────────────────────────────────────
  // Streams el PDF privado de GCS a través del backend (mismo patrón que
  // pagos.js:698), y deja registrada la fecha de última descarga.
  fastify.get('/:id/attachment', { preHandler: viewHandler }, async (request, reply) => {
    const pdp = await fastify.db.pdp.findUnique({
      where:  { id: request.params.id },
      select: { pdf_url: true, id_local: true }
    })
    if (!pdp) return reply.code(404).send({ error: 'PDP no encontrado' })
    if (!request.allowedLocalIds.includes(pdp.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }
    if (!pdp.pdf_url?.startsWith('gs://')) return reply.code(404).send({ error: 'Sin adjunto' })

    const withoutScheme = pdp.pdf_url.replace('gs://', '')
    const slashIdx       = withoutScheme.indexOf('/')
    const bucketName     = withoutScheme.slice(0, slashIdx)
    const filePath       = withoutScheme.slice(slashIdx + 1)

    reply.header('Content-Type', 'application/pdf')
    reply.header('Cache-Control', 'private, max-age=300')

    const stream = gcs.bucket(bucketName).file(filePath).createReadStream({
      userProject: process.env.GCS_PROJECT_ID,
    })
    stream.on('error', (err) => {
      fastify.log.error({ err, gsPath: pdp.pdf_url }, 'GCS stream error')
      if (!reply.sent) reply.code(502).send({ error: 'No se pudo obtener el archivo' })
    })

    fastify.db.pdp.update({
      where: { id: request.params.id },
      data: { ultima_descarga: new Date() }
    }).catch((err) => fastify.log.error({ err }, 'No se pudo actualizar ultima_descarga del PDP'))

    return reply.send(stream)
  })
}
```

- [ ] **Step 2: Registrar la ruta en `server.js`**

En `dcsmart/backend/src/server.js`, agregar el import junto a `pagosRoutes` (línea 18) y el registro
junto al de pagos (línea 75):

```js
import pdpRoutes from './routes/pdp.js'
```
```js
await app.register(pdpRoutes, { prefix: '/api/pdp' })
```

- [ ] **Step 3: Reiniciar el backend local y probar el flujo con `curl`**

Parar el backend local si está corriendo (`npm run dev` en background) y volver a levantarlo para que
tome el nuevo archivo de rutas:

```bash
cd dcsmart/backend
npm run dev
```
Expected: `Server listening at http://0.0.0.0:3000` sin errores de import.

En otra terminal, loguearse para obtener un JWT válido y probar los 3 endpoints — reemplazar
`<TOKEN>` por el token real obtenido de un login normal (`POST /api/auth/login`), y `<ID_LOCAL>` por
un id de local real (por ejemplo `d77f7288`, ya usado en sesiones anteriores):

```bash
curl -s http://localhost:3000/api/pdp?id_local=<ID_LOCAL> -H "Authorization: Bearer <TOKEN>" -H "X-App-Id: <APP_ID>"
```
Expected: `{"data":[]}` (todavía no hay ningún `Pdp` creado). Si da 403, revisar que el `<ID_LOCAL>`
esté entre los locales permitidos del usuario logueado.

- [ ] **Step 4: Commit**

```bash
cd dcsmart
git add backend/src/routes/pdp.js backend/src/server.js
git commit -m "PDP: rutas backend (crear, listar historial, descargar adjunto)"
```

---

### Task 3: Frontend — el flujo de "Generar reporte" sube y registra el PDP

**Files:**
- Modify: `dcsmart/frontend/src/lib/pdpReport.js`
- Create: `dcsmart/frontend/src/api/pdp.js`
- Modify: `dcsmart/frontend/src/pages/pdp/PdpDashboard.jsx`

**Interfaces:**
- Consumes: `POST /api/pdp`, `pagosApi.upload` (ya existente, `frontend/src/api/pagos.js:19`).
- Produces: `generarReportePdp(...)` ahora devuelve `{ blob, filename }` además de descargar el PDF
  (Task 4 no depende de esto, pero deja documentado el cambio de contrato para cualquier otro
  consumidor futuro); `pdpApi.list(id_local)`, `pdpApi.attachmentUrl(id)` — usados por Task 4 para el
  historial.

- [ ] **Step 1: Hacer que `generarReportePdp` devuelva el blob generado**

En `dcsmart/frontend/src/lib/pdpReport.js`, la última línea de la función es `doc.save(...)`.
Reemplazar el final de la función (después de la sección `DETALLE`/`autoTable`, buscar la línea
`doc.save(\`${nombreReporte}.pdf\`)`) por:

```js
  doc.save(`${nombreReporte}.pdf`)
  return { blob: doc.output('blob'), filename: `${nombreReporte}.pdf` }
}
```

- [ ] **Step 2: Crear el cliente API `pdpApi`**

Crear `dcsmart/frontend/src/api/pdp.js`:

```js
import client from './client.js'

export const pdpApi = {
  list:   (id_local, signal) => client.get('/pdp', { params: { id_local }, signal }),
  create: (data)              => client.post('/pdp', data),
  attachment: (id)             => client.get(`/pdp/${id}/attachment`, { responseType: 'blob' }),
}
```

- [ ] **Step 3: Verificar que ambos archivos cargan sin errores de sintaxis**

```bash
cd dcsmart/frontend
npx esbuild src/lib/pdpReport.js src/api/pdp.js --bundle=false --outdir=/tmp/pdp-check
```
Expected: build sin errores (solo el tamaño de los bundles en la salida).

- [ ] **Step 4: Enganchar la subida+registro en `PdpDashboard.jsx`**

En `dcsmart/frontend/src/pages/pdp/PdpDashboard.jsx`, agregar el import de `pdpApi` junto a los demás
imports (línea 3-9):

```js
import { pdpApi } from '../../api/pdp.js'
```

Reemplazar la función `handleGenerarReporte` (líneas 429-442) por:

```js
  const handleGenerarReporte = async () => {
    setGeneratingReport(true)
    try {
      const { blob, filename } = await generarReportePdp({
        localNombre: activeLocal?.nombre,
        pagosPdp: pagar,
        totalDeuda: sumImporte(deuda),
      })
      try {
        const formData = new FormData()
        formData.append('file', blob, filename)
        const { data: uploadRes } = await pagosApi.upload(formData, activeLocal?.id)
        await pdpApi.create({
          id_local: activeLocal.id,
          pago_ids: pagar.map(p => p.id),
          pdf_url: uploadRes.url,
        })
        loadHistorial()
      } catch {
        // El PDF ya se descargó al navegador -- si falla el registro, se
        // avisa pero no se bloquea nada que el usuario ya haya recibido.
        notify('El reporte se descargó, pero no se pudo guardar el registro del PDP', 'error')
      }
    } catch {
      notify('Error al generar el reporte', 'error')
    } finally {
      setGeneratingReport(false)
    }
  }
```

Nota: `loadHistorial` se define en el Task 4 (carga la lista de PDPs anteriores) — este Step deja la
llamada ya puesta; el Task 4 agrega la función en sí. Si se ejecuta este Task de forma aislada antes
del Task 4, `loadHistorial` no existirá todavía y el build va a fallar — está bien, es esperado, el
Task 4 lo resuelve inmediatamente después (ver Global Constraints: los tasks de este plan son
secuenciales, no independientes entre sí).

- [ ] **Step 5: Commit**

```bash
cd dcsmart
git add frontend/src/lib/pdpReport.js frontend/src/api/pdp.js frontend/src/pages/pdp/PdpDashboard.jsx
git commit -m "PDP: sube el PDF generado a GCS y registra el lote (POST /pdp)"
```

---

### Task 4: Frontend — sección "Historial de PDP"

**Files:**
- Modify: `dcsmart/frontend/src/pages/pdp/PdpDashboard.jsx`

**Interfaces:**
- Consumes: `pdpApi.list`, `pdpApi.attachment` (Task 3).
- Produces: sección visible en `PdpDashboard.jsx` con la lista de PDPs anteriores del local activo y
  botón de descarga — no expone ninguna interfaz nueva para otras tareas (es la última del plan).

- [ ] **Step 1: Agregar el estado y la carga del historial**

En `dcsmart/frontend/src/pages/pdp/PdpDashboard.jsx`, dentro de `export default function
PdpDashboard()`, agregar el estado nuevo junto a los demás `useState` (después de la línea
`const [generatingReport, setGeneratingReport] = useState(false)`, línea 360):

```js
  const [historial, setHistorial] = useState([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [descargandoId, setDescargandoId] = useState(null)
```

Agregar la función `loadHistorial` (usada por `handleGenerarReporte` del Task 3) junto a la función
`load` existente (después de la línea 379, antes del primer `useEffect`):

```js
  const loadHistorial = () => {
    if (!activeLocal?.id) { setHistorial([]); return }
    setLoadingHistorial(true)
    pdpApi.list(activeLocal.id)
      .then(({ data }) => setHistorial(data.data))
      .catch(() => notify('Error al cargar el historial de PDP', 'error'))
      .finally(() => setLoadingHistorial(false))
  }
```

Agregar la carga inicial junto al `useEffect` existente de `load` (después de la línea `useEffect(()
=> { load() }, [activeLocal?.id])`, línea 385):

```js
  useEffect(() => { loadHistorial() }, [activeLocal?.id])
```

- [ ] **Step 2: Agregar el handler de descarga**

Agregar junto a los demás handlers (después de `handlePagar`, antes del `return`, línea ~455):

```js
  function fmtDateTime(d) {
    return d ? new Date(d).toLocaleString('es-AR', { hour12: false }) : '—'
  }

  const handleDescargarPdp = async (pdp) => {
    setDescargandoId(pdp.id)
    try {
      const res = await pdpApi.attachment(pdp.id)
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `PDP_${activeLocal?.nombre || 'local'}_${pdp.id.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      loadHistorial()
    } catch {
      notify('Error al descargar el PDP', 'error')
    } finally {
      setDescargandoId(null)
    }
  }
```

- [ ] **Step 3: Agregar la sección visual "Historial de PDP"**

En el JSX de `return`, agregar la sección nueva justo antes del cierre `</div>` que envuelve
`.pdp-grid` (después del `</div>` de `.pdp-grid`, línea 521, antes del bloque `{pagarOpen && (...)}`):

```jsx
      <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>
        Historial de PDP
      </div>
      {loadingHistorial ? (
        <div style={{ padding: '1rem' }}><span className="spinner" /></div>
      ) : historial.length === 0 ? (
        <div className="pdp-empty">Todavía no se generó ningún PDP para este local.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Creado por</th><th>Cant. pagos</th><th>Total</th>
                <th>Última descarga</th><th></th>
              </tr>
            </thead>
            <tbody>
              {historial.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.created_at)}</td>
                  <td>{p.creador?.nombre || '—'}</td>
                  <td>{p.cantidad_pagos}</td>
                  <td className="td-number">{fmt$(p.total)}</td>
                  <td>{fmtDateTime(p.ultima_descarga)}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleDescargarPdp(p)}
                      disabled={descargandoId === p.id}
                    >
                      {descargandoId === p.id
                        ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                        : 'Descargar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] **Step 4: Verificar sintaxis del archivo completo**

```bash
cd dcsmart/frontend
npx esbuild src/pages/pdp/PdpDashboard.jsx --bundle=false --outfile=/tmp/pdp-dashboard-check.js
```
Expected: build sin errores.

- [ ] **Step 5: Probar el flujo completo en el navegador**

Con el backend y el frontend local corriendo (`npm run dev` en ambos), y logueado en la app:
1. Ir a la pantalla PDP de un local con al menos un pago en estado `PDP` (columna "Pagar PDP").
2. Click en "Reporte" — debe descargar el PDF al navegador como ya hacía antes.
3. Recargar la pantalla (o esperar a que `loadHistorial()` corra después del registro) — la sección
   "Historial de PDP" debe mostrar una fila nueva con la fecha actual, el usuario logueado, la
   cantidad de pagos y el total correctos.
4. Click en "Descargar" de esa fila — debe bajar el mismo PDF, y al recargar la pantalla la columna
   "Última descarga" debe reflejar la hora de ese click.

Si algo de esto no se puede verificar por falta de acceso interactivo al navegador en el entorno de
ejecución, dejarlo documentado explícitamente como pendiente de verificación manual, no asumir que
funciona sin haberlo visto.

- [ ] **Step 6: Commit**

```bash
cd dcsmart
git add frontend/src/pages/pdp/PdpDashboard.jsx
git commit -m "PDP: agrega sección de historial con redescarga"
```

---

## Self-Review

**Cobertura del spec:**
- Modelo `Pdp` con los campos exactos de la spec → Task 1. ✓
- `Pago.id_pdp` deja de ser huérfano, relación real a `Pdp` → Task 1, Step 4. ✓
- `POST /pdp`, `GET /pdp`, `GET /pdp/:id/attachment` (con actualización de `ultima_descarga`) →
  Task 2. ✓
- Subida del PDF generado a GCS reusando `POST /pagos/upload` → Task 3. ✓
- El PDF guardado es el real generado en el momento (no una reconstrucción) → Task 3 (`doc.output
  ('blob')` del mismo `doc` que ya se armó, antes de cualquier cambio de estado de los pagos). ✓
- Historial ordenado por fecha desc (el más reciente es siempre el primero) → Task 2 (`GET /`) y
  Task 4 (se muestra en ese mismo orden, sin resortear en el frontend). ✓
- Sección de historial dentro de la misma pantalla `PdpDashboard.jsx` (no una ruta separada) →
  Task 4. ✓
- Permisos mismos que el módulo de pagos → Task 2 (`fastify.can('pagos', ...)`). ✓
- Un fallo al registrar el `Pdp` no bloquea la descarga que el usuario ya recibió → Task 3
  (`try/catch` separado alrededor de la subida+registro, el PDF ya se descargó antes de ese bloque). ✓

**Placeholder scan:** sin TBD/TODO. Todo el código de cada step es completo. La única nota explícita
sobre una dependencia entre tasks (Task 3 Step 4 menciona que `loadHistorial` se define en Task 4) es
intencional y está documentada, no es un placeholder — es información real para quien ejecute las
tareas en orden.

**Consistencia de tipos:** `pdpApi.list` devuelve `{data: {data: Pdp[]}}` (mismo wrapper `{data:
[...]}` que ya usa `pagosApi.list`), consumido en Task 4 como `.then(({data}) => setHistorial(data
.data))` — consistente. `pdpApi.create` recibe `{id_local, pago_ids, pdf_url}` en Task 3, y el backend
(Task 2) espera exactamente esos 3 campos con esos nombres — consistente. `generarReportePdp` pasa de
devolver `undefined` a devolver `{blob, filename}` (Task 3) — el único call-site existente
(`PdpDashboard.jsx`) se actualiza en el mismo Task para consumir ese valor de retorno nuevo, no queda
ningún otro consumidor desactualizado (confirmado por grep, es la única función en `pdpReport.js` y el
único import en todo el frontend).
