# Tipificación y normalización de detalles de caja — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una clasificación de 4 categorías a los tipos del catálogo, normalizar el catálogo de detalles, y backfillear los 353 detalles migrados vinculándolos a su tipo.

**Architecture:** La clasificación (`canal`/`medio_pago`/`calculo`/`otro`) vive en `detalle_tipos.clasificacion`. `caja_detalles.tipo` es copia derivada de la clasificación del tipo elegido. Un script Node idempotente con Prisma normaliza los nombres crudos del Excel a un catálogo canónico app-wide y vincula cada detalle.

**Tech Stack:** Node.js (ESM), Prisma 5, Fastify, React + Vite. Base PostgreSQL (Cloud SQL via proxy en localhost:5432). Sin framework de tests — verificación por ejecución de scripts de chequeo con Prisma.

**Spec:** `docs/superpowers/specs/2026-06-12-tipificacion-detalles-caja-design.md`

**Convenciones de ejecución:**
- Working dir base: `C:\Users\agusl\Documents\dcsmart-apps\dcsmart`. El proxy Cloud SQL debe estar activo en `localhost:5432`.
- Comandos Prisma se corren desde `backend/`.
- Scripts de chequeo/backfill se ubican en `backend/` (para resolver `@prisma/client`) y se borran al final.
- Commits: branch actual `feat/app-local-isolation`. Mensajes terminan con la línea `Co-Authored-By` indicada por el proyecto.
- **IMPORTANTE — esquema vía `db push`, no `migrate dev`:** la carpeta `backend/prisma/migrations/` está en `.gitignore` y no existe en este checkout, pero la DB ya tiene migraciones aplicadas (`_prisma_migrations`). Correr `prisma migrate dev` detectaría historial desincronizado y propondría un **reset destructivo**. Por eso los cambios de schema se aplican con `npx prisma db push` (no destructivo para un `ADD COLUMN ... DEFAULT`).

---

## File Structure

- `backend/prisma/schema.prisma` — modelo `DetalleTipo`: nuevo campo `clasificacion`. Se aplica con `db push` (no se genera migración versionada; ver convenciones).
- `backend/src/routes/detalle_tipos.js` — validar `clasificacion` en POST/PUT.
- `backend/src/routes/caja_detalles.js` — derivar `tipo` desde la clasificación del `id_tipo` en POST.
- `frontend/src/pages/admin/DetalleTipos.jsx` — selector de clasificación + columna en tabla.
- `frontend/src/pages/cajas/CajaList.jsx` — derivar `tipo` del `id_tipo` elegido (quitar select manual).
- `backend/_backfill_detalles.mjs` — script de backfill (temporal, se borra tras correr).

---

## Task 1: Agregar campo `clasificacion` a `DetalleTipo` (schema + db push)

**Files:**
- Modify: `backend/prisma/schema.prisma:248-261`

- [ ] **Step 1: Editar el modelo `DetalleTipo`**

En `backend/prisma/schema.prisma`, dentro de `model DetalleTipo`, agregar el campo `clasificacion` después de `nombre`:

```prisma
model DetalleTipo {
  id            String  @id @default(uuid())
  id_app        String
  id_local      String?
  nombre        String
  clasificacion String  @default("otro")
  activo        Boolean @default(true)

  app      App           @relation(fields: [id_app], references: [id])
  local    Local?        @relation(fields: [id_local], references: [id])
  detalles CajaDetalle[]

  @@unique([nombre, id_app])
  @@map("detalle_tipos")
}
```

- [ ] **Step 2: Aplicar el cambio de schema con `db push`**

> NO usar `prisma migrate dev` (ver convenciones — propondría reset destructivo). Usar `db push`, que aplica el `ADD COLUMN ... DEFAULT 'otro'` directamente sin tocar `_prisma_migrations`.

Run (desde `backend/`):
```bash
npx prisma db push
```
Expected: detecta el cambio, aplica `ADD COLUMN "clasificacion"` sin warnings de pérdida de datos, regenera el client. Termina con "Your database is now in sync with your Prisma schema." No crea carpeta de migración.

- [ ] **Step 3: Verificar la columna**

Crear `backend/_check_col.mjs`:
```js
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const t = await p.detalleTipo.findFirst()
console.log('clasificacion presente:', t && 'clasificacion' in t, '→', t?.clasificacion)
await p.$disconnect()
```
Run: `node _check_col.mjs`
Expected: `clasificacion presente: true → otro`

- [ ] **Step 4: Borrar el script de chequeo y commitear**

```bash
rm -f backend/_check_col.mjs
git add backend/prisma/schema.prisma
git commit -m "feat(detalle-tipos): agregar campo clasificacion al catalogo"
```

> Nota: no se commitea `migrations/` (está en `.gitignore` y `db push` no genera archivos).

---

## Task 2: Validar `clasificacion` en la ruta `detalle_tipos`

**Files:**
- Modify: `backend/src/routes/detalle_tipos.js:16-55`

- [ ] **Step 1: Agregar constante de categorías válidas al inicio del archivo**

Al comienzo de `backend/src/routes/detalle_tipos.js`, antes de `export default`, agregar:

```js
const CLASIFICACIONES = ['canal', 'medio_pago', 'calculo', 'otro']
```

- [ ] **Step 2: Validar y persistir `clasificacion` en POST**

Reemplazar el handler POST (`fastify.post('/', ...)`) por:

```js
  // ── POST / — crear tipo nuevo ──────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { nombre, id_local, clasificacion } = request.body
    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })

    const clasif = clasificacion || 'otro'
    if (!CLASIFICACIONES.includes(clasif)) {
      return reply.code(400).send({ error: `clasificacion inválida. Use: ${CLASIFICACIONES.join(', ')}` })
    }

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a ese local' })
    }

    try {
      const tipo = await fastify.db.detalleTipo.create({
        data: {
          nombre,
          clasificacion: clasif,
          id_app: request.activeAppId,
          id_local: id_local || null,
          activo: true
        },
        include: { local: { select: { id: true, nombre: true } } }
      })
      return reply.code(201).send(tipo)
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'Ya existe un tipo con ese nombre en esta app' })
      throw e
    }
  })
```

- [ ] **Step 3: Permitir editar `clasificacion` en PUT**

Reemplazar el cuerpo del handler PUT (`fastify.put('/:id', ...)`) por:

```js
  // ── PUT /:id — editar (nombre, clasificacion y activo) ─────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.detalleTipo.findUnique({ where: { id: request.params.id } })
    if (!existing) return reply.code(404).send({ error: 'Tipo no encontrado' })
    if (existing.id_app !== request.activeAppId) return reply.code(403).send({ error: 'Sin acceso' })

    const { nombre, activo, clasificacion } = request.body
    if (clasificacion !== undefined && !CLASIFICACIONES.includes(clasificacion)) {
      return reply.code(400).send({ error: `clasificacion inválida. Use: ${CLASIFICACIONES.join(', ')}` })
    }

    const tipo = await fastify.db.detalleTipo.update({
      where: { id: request.params.id },
      data: {
        ...(nombre !== undefined ? { nombre } : {}),
        ...(activo !== undefined ? { activo } : {}),
        ...(clasificacion !== undefined ? { clasificacion } : {})
      },
      include: { local: { select: { id: true, nombre: true } } }
    })
    return tipo
  })
```

- [ ] **Step 4: Verificar arranque del backend sin errores de sintaxis**

Run (desde `backend/`): `node --check src/routes/detalle_tipos.js`
Expected: sin salida (exit 0), confirma sintaxis válida.

- [ ] **Step 5: Commitear**

```bash
git add backend/src/routes/detalle_tipos.js
git commit -m "feat(detalle-tipos): validar y persistir clasificacion en API"
```

---

## Task 3: Derivar `tipo` desde la clasificación del `id_tipo` en `caja_detalles`

**Files:**
- Modify: `backend/src/routes/caja_detalles.js:42-73`

- [ ] **Step 1: Reescribir el handler POST para derivar `tipo`**

Reemplazar el handler POST (`fastify.post('/', ...)`) de `backend/src/routes/caja_detalles.js` por:

```js
  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { id_caja, id_tipo, nombre, monto, observaciones } = request.body

    if (!id_caja || monto === undefined) {
      return reply.code(400).send({ error: 'id_caja y monto son requeridos' })
    }

    const caja = await fastify.db.caja.findUnique({
      where: { id: id_caja },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    // tipo y nombre se derivan del tipo del catálogo cuando se elige id_tipo
    let tipo = null
    let nombreFinal = nombre || null
    if (id_tipo) {
      const dt = await fastify.db.detalleTipo.findUnique({
        where: { id: id_tipo },
        select: { clasificacion: true, nombre: true }
      })
      if (!dt) return reply.code(400).send({ error: 'Tipo de detalle inexistente' })
      tipo = dt.clasificacion
      nombreFinal = dt.nombre
    }

    const detalle = await fastify.db.cajaDetalle.create({
      data: {
        id_caja,
        tipo,
        id_tipo:       id_tipo       || null,
        nombre:        nombreFinal,
        monto:         parseFloat(monto),
        observaciones: observaciones || null
      },
      include: {
        detalle_tipo: { select: { id: true, nombre: true } }
      }
    })
    return reply.code(201).send(detalle)
  })
```

- [ ] **Step 2: Verificar sintaxis**

Run (desde `backend/`): `node --check src/routes/caja_detalles.js`
Expected: sin salida (exit 0).

- [ ] **Step 3: Commitear**

```bash
git add backend/src/routes/caja_detalles.js
git commit -m "feat(caja-detalles): derivar tipo y nombre desde el tipo del catalogo"
```

---

## Task 4: Selector de clasificación en el admin de Tipos de Detalle

**Files:**
- Modify: `frontend/src/pages/admin/DetalleTipos.jsx:23,50,59-64,99-130,162-179`

- [ ] **Step 1: Agregar `clasificacion` al estado del form y constante de opciones**

En `frontend/src/pages/admin/DetalleTipos.jsx`, reemplazar la constante `EMPTY` (línea 23) por:

```js
const CLASIFICACIONES = [
  { value: 'canal',      label: 'Canal' },
  { value: 'medio_pago', label: 'Medio de pago' },
  { value: 'calculo',    label: 'Cálculo' },
  { value: 'otro',       label: 'Otro' }
]
const EMPTY = { nombre: '', id_local: '', clasificacion: 'otro', activo: true }
```

- [ ] **Step 2: Cargar `clasificacion` al abrir edición**

Reemplazar la función `openEdit` (línea 50) por:

```js
  const openEdit   = (t) => { setSelected(t); setForm({ nombre: t.nombre, id_local: t.id_local || '', clasificacion: t.clasificacion || 'otro', activo: t.activo }); setPanelOpen(true) }
```

- [ ] **Step 3: Enviar `clasificacion` en create y update**

Reemplazar el bloque `if (selected) { ... } else { ... }` dentro de `handleSubmit` (líneas 58-64) por:

```js
      if (selected) {
        await detalleTiposApi.update(selected.id, { nombre: form.nombre, clasificacion: form.clasificacion, activo: form.activo })
        notify('Tipo actualizado', 'success')
      } else {
        await detalleTiposApi.create({ nombre: form.nombre, id_local: form.id_local || null, clasificacion: form.clasificacion })
        notify('Tipo creado', 'success')
      }
```

- [ ] **Step 4: Agregar columna "Clasificación" en la tabla**

En el `<thead>`, reemplazar la fila de encabezados (líneas 100-105) por:

```jsx
            <tr>
              <th>Nombre</th>
              <th>Clasificación</th>
              <th>Alcance</th>
              <th>Estado</th>
              {isAdmin && <th></th>}
            </tr>
```

En el `<tbody>`, agregar la celda de clasificación inmediatamente después de `<td className="td-primary">{t.nombre}</td>` (línea 124):

```jsx
                    <td className="td-muted">{(CLASIFICACIONES.find(c => c.value === t.clasificacion)?.label) || 'Otro'}</td>
```

Y actualizar el `colSpan` del estado vacío (línea 144) de `isAdmin ? 4 : 3` a `isAdmin ? 5 : 4`. También el skeleton (línea 111) de `length: isAdmin ? 4 : 3` a `length: isAdmin ? 5 : 4`.

- [ ] **Step 5: Agregar el `<select>` de clasificación en el form del drawer**

Inmediatamente después del `form-group` del Nombre (después de la línea 168, el `</div>` que cierra el grupo Nombre), insertar:

```jsx
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Clasificación *</label>
              <div className="form-input-wrap">
                <select value={form.clasificacion} onChange={e => setForm({ ...form, clasificacion: e.target.value })}>
                  {CLASIFICACIONES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
```

- [ ] **Step 6: Verificar build del frontend**

Run (desde `frontend/`): `npm run build`
Expected: build exitoso sin errores de sintaxis/JSX.

- [ ] **Step 7: Commitear**

```bash
git add frontend/src/pages/admin/DetalleTipos.jsx
git commit -m "feat(admin): selector de clasificacion en Tipos de Detalle"
```

---

## Task 5: Derivar clasificación del tipo elegido en el form de detalle de caja

**Files:**
- Modify: `frontend/src/pages/cajas/CajaList.jsx:60,114-121,204-225`

- [ ] **Step 1: Quitar `tipo` del payload de create (lo deriva el backend)**

En `frontend/src/pages/cajas/CajaList.jsx`, reemplazar la llamada `detallesApi.create({ ... })` (líneas 114-121) por:

```js
      await detallesApi.create({
        id_caja:       cajaId,
        id_tipo:       newDet.id_tipo       || null,
        monto:         parseFloat(newDet.monto),
        observaciones: newDet.observaciones || null
      })
```

- [ ] **Step 2: Reemplazar el select manual de "Tipo" por la clasificación derivada (solo lectura)**

Reemplazar el `form-group` del "Tipo" (líneas 206-216, el primer `form-group` dentro del `<form onSubmit={handleAddDet}>`) por un indicador derivado del tipo elegido:

```jsx
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Clasificación</label>
            <div className="form-input-wrap">
              <input
                type="text"
                readOnly
                value={(() => {
                  const t = tipos.find(x => x.id === newDet.id_tipo)
                  const labels = { canal: 'Canal', medio_pago: 'Medio de pago', calculo: 'Cálculo', otro: 'Otro' }
                  return t ? (labels[t.clasificacion] || 'Otro') : '— Según el tipo —'
                })()}
              />
            </div>
          </div>
```

- [ ] **Step 3: Verificar build del frontend**

Run (desde `frontend/`): `npm run build`
Expected: build exitoso sin errores.

- [ ] **Step 4: Commitear**

```bash
git add frontend/src/pages/cajas/CajaList.jsx
git commit -m "feat(cajas): clasificacion derivada del tipo en alta de detalle"
```

---

## Task 6: Backfill de los 353 detalles migrados

**Files:**
- Create: `backend/_backfill_detalles.mjs` (temporal, se borra al final)

- [ ] **Step 1: Escribir el script de backfill**

Crear `backend/_backfill_detalles.mjs`:

```js
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// nombre crudo del Excel → { n: canónico, c: clasificacion }
const MAP = {
  // medio_pago
  'MP POINT DEBITO':    { n: 'MP Point Débito',   c: 'medio_pago' },
  'Mp Point Debito':    { n: 'MP Point Débito',   c: 'medio_pago' },
  'MP POINT CREDITO':   { n: 'MP Point Crédito',  c: 'medio_pago' },
  'Mp Point Credito':   { n: 'MP Point Crédito',  c: 'medio_pago' },
  'MP QR':              { n: 'MP QR',             c: 'medio_pago' },
  'Mp Qr':              { n: 'MP QR',             c: 'medio_pago' },
  'MP LINK':            { n: 'MP Link',           c: 'medio_pago' },
  'PREPAGA':            { n: 'Prepaga',           c: 'medio_pago' },
  'MP Prepaga':         { n: 'Prepaga',           c: 'medio_pago' },
  'LAPOS/PAYWAY':       { n: 'LAPOS/PAYWAY',      c: 'medio_pago' },
  'Tarjeta de credito': { n: 'Tarjeta de Crédito', c: 'medio_pago' },
  'Tarjeta de debito':  { n: 'Tarjeta de Débito',  c: 'medio_pago' },
  'Transferencia':      { n: 'Transferencia',    c: 'medio_pago' },
  'Transferencias':     { n: 'Transferencia',    c: 'medio_pago' },
  'TRANSFERENCIA':      { n: 'Transferencia',    c: 'medio_pago' },
  // canal
  'Rappi':              { n: 'Rappi',            c: 'canal' },
  'Pedidos Ya':         { n: 'Pedidos Ya',       c: 'canal' },
  'App3':               { n: 'App3',             c: 'canal' },
  'Mostrador':          { n: 'Mostrador',        c: 'canal' },
  'Total salon':        { n: 'Salon',            c: 'canal' },
  'Total web':          { n: 'Web',              c: 'canal' },
  'Total takeaway':     { n: 'Takeaway',         c: 'canal' },
  // calculo
  'Total tarjetas':     { n: 'Total Tarjetas',   c: 'calculo' },
  // otro
  'Gastos':             { n: 'Gastos',           c: 'otro' },
  'GASTOS':             { n: 'Gastos',           c: 'otro' },
  'Descuentos':         { n: 'Descuentos',       c: 'otro' },
  'Contraordenes':      { n: 'Contraórdenes',    c: 'otro' },
  'Contingencias':      { n: 'Contingencias',    c: 'otro' }
}

// cache (id_app + nombre canónico) → id del detalle_tipo
const tipoCache = new Map()

async function getTipoId(id_app, canonico, clasif) {
  const key = `${id_app}::${canonico}`
  if (tipoCache.has(key)) return tipoCache.get(key)
  // reusar existente o crear app-wide; completar clasificacion si está vacía/otro
  const existing = await p.detalleTipo.findUnique({
    where: { nombre_id_app: { nombre: canonico, id_app } }
  })
  let tipo
  if (existing) {
    tipo = existing
    if (existing.clasificacion !== clasif) {
      await p.detalleTipo.update({ where: { id: existing.id }, data: { clasificacion: clasif } })
    }
  } else {
    tipo = await p.detalleTipo.create({
      data: { nombre: canonico, clasificacion: clasif, id_app, id_local: null, activo: true }
    })
  }
  tipoCache.set(key, tipo.id)
  return tipo.id
}

const detalles = await p.cajaDetalle.findMany({
  where: { id_tipo: null, nombre: { not: null } },
  select: { id: true, nombre: true, caja: { select: { local: { select: { id_app: true } } } } }
})
console.log('Detalles a procesar:', detalles.length)

let ok = 0
const sinMapa = new Set()
for (const d of detalles) {
  const m = MAP[d.nombre]
  if (!m) { sinMapa.add(d.nombre); continue }
  const id_app = d.caja?.local?.id_app
  if (!id_app) { console.warn('Detalle sin id_app:', d.id); continue }
  const id_tipo = await getTipoId(id_app, m.n, m.c)
  await p.cajaDetalle.update({
    where: { id: d.id },
    data: { id_tipo, tipo: m.c, nombre: m.n }
  })
  ok++
}

// marcar los 5 tipos genéricos preexistentes como canal
const genericos = ['Salon', 'Delivery', 'Barra', 'Mostrador', 'Online']
const upd = await p.detalleTipo.updateMany({
  where: { nombre: { in: genericos } },
  data: { clasificacion: 'canal' }
})

console.log('Detalles vinculados:', ok)
console.log('Genéricos marcados como canal:', upd.count)
if (sinMapa.size) console.log('NOMBRES SIN MAPA (omitidos):', [...sinMapa])
await p.$disconnect()
```

- [ ] **Step 2: Correr el backfill**

Run (desde `backend/`): `node _backfill_detalles.mjs`
Expected: imprime `Detalles a procesar: 353`, `Detalles vinculados: 353`, `Genéricos marcados como canal: <N>`, y **ninguna** línea `NOMBRES SIN MAPA`.

- [ ] **Step 3: Verificar el resultado**

Crear `backend/_verify_backfill.mjs`:
```js
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const sinTipo = await p.cajaDetalle.count({ where: { id_tipo: null, nombre: { not: null } } })
const porClasif = await p.cajaDetalle.groupBy({ by: ['tipo'], _count: true })
const nombresRaw = await p.cajaDetalle.findMany({ where: { nombre: { not: null } }, select: { nombre: true }, distinct: ['nombre'] })
console.log('Detalles con nombre y SIN id_tipo (debe ser 0):', sinTipo)
console.log('Por clasificación:', porClasif.map(c => `${c.tipo}=${c._count}`).join('  '))
console.log('Nombres canónicos distintos:', nombresRaw.map(n => n.nombre).sort().join(' | '))
await p.$disconnect()
```
Run: `node _verify_backfill.mjs`
Expected: `Detalles con nombre y SIN id_tipo (debe ser 0): 0`; clasificaciones solo entre `canal/medio_pago/calculo/otro` (más posibles `null` de los 2 detalles de prueba); nombres distintos = el set canónico (sin variantes de casing/plural).

- [ ] **Step 4: Verificar idempotencia**

Run (desde `backend/`): `node _backfill_detalles.mjs`
Expected: `Detalles a procesar: 0`, `Detalles vinculados: 0` (ya no quedan con `id_tipo = null`); sin duplicados de tipos.

- [ ] **Step 5: Borrar scripts temporales**

```bash
rm -f backend/_backfill_detalles.mjs backend/_verify_backfill.mjs
```

No se commitea nada en esta tarea (es una operación de datos sobre la base; los scripts son efímeros). Dejar registro en el mensaje final.

---

## Task 7: Actualizar el seed para clasificar los tipos demo

**Files:**
- Modify: `backend/prisma/seed.js:143-152`

- [ ] **Step 1: Añadir clasificación a los tipos demo del seed**

Reemplazar el bloque `DETALLE TIPOS POR DEFECTO` (líneas 143-152) por:

```js
  // ─── DETALLE TIPOS POR DEFECTO ────────────────────────────────────────
  const tiposDefault = [
    { nombre: 'Total Digitales', clasificacion: 'calculo' },
    { nombre: 'MP Total',        clasificacion: 'medio_pago' },
    { nombre: 'MP QR',           clasificacion: 'medio_pago' }
  ]
  for (const { nombre, clasificacion } of tiposDefault) {
    await prisma.detalleTipo.upsert({
      where: { nombre_id_app: { nombre, id_app: demoApp.id } },
      create: { nombre, clasificacion, id_app: demoApp.id, id_local: null, activo: true },
      update: { clasificacion }
    })
  }
  console.log('✓ DetalleTipos por defecto creados')
```

- [ ] **Step 2: Verificar sintaxis**

Run (desde `backend/`): `node --check prisma/seed.js`
Expected: sin salida (exit 0).

- [ ] **Step 3: Commitear**

```bash
git add backend/prisma/seed.js
git commit -m "chore(seed): clasificacion en tipos de detalle demo"
```

---

## Verificación final

- [ ] `backend/` arranca: `npm run dev` levanta sin errores (Ctrl-C tras confirmar "Server listening").
- [ ] `frontend/` compila: `npm run build` sin errores.
- [ ] En la base: 0 detalles migrados con `id_tipo = null`; nombres normalizados; `tipo` ∈ las 4 categorías.
- [ ] El admin "Tipos de Detalle" muestra y edita la clasificación.
- [ ] Alta de detalle en una caja muestra la clasificación derivada del tipo elegido.

## Notas / fuera de alcance

- No se vincula `id_metodo` a `metodos_pago` (pendiente del README).
- No se reprocesa `Detalle movimientos` de LUCERO/MAFIA.
- La migración de cajas (`migracion_cajas.sql`) ya fue ejecutada en una sesión previa; este plan opera sobre esos datos.
