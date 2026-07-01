# Historial de Auditoría (Pagos y Cajas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el toggle boolean de "auditado" en un historial append-only reutilizando la tabla `audits`, e implementar el mismo mecanismo desde cero para cajas.

**Architecture:** La tabla `Audit` (Prisma) gana dos columnas — `accion` (`"auditado"`/`"desauditado"`) y `vigente` (boolean) — y una relación a `User`. Cada toggle inserta una fila nueva dentro de una transacción que primero apaga (`vigente:false`) la fila vigente anterior de ese `(tabla, id_registro)`. El "estado actual" de un pago o caja se resuelve siempre con `WHERE tabla=? AND id_registro=? AND vigente=true`. Se agrega un endpoint `GET /:id/audit-history` por módulo (pagos y cajas) que devuelve todo el historial ordenado por fecha. En frontend se agrega un modal de "prompt" reutilizable (para pedir el motivo opcional al desauditar) y una sección de historial en los paneles de detalle.

**Tech Stack:** Fastify + Prisma (Postgres), React (Vite) + Zustand. El proyecto no tiene una suite de tests automatizada (el script `npm test` de `backend/package.json` referencia una carpeta `src/test` que no existe) ni usa `prisma migrate` (no hay carpeta `prisma/migrations`; los cambios de schema se aplican con `prisma db push`, ver `CLAUDE.md`). Por lo tanto la verificación de cada tarea es manual: se corre el backend/frontend en dev y se ejercita el flujo real (curl para el backend, navegador para el frontend), no hay pasos de "correr la suite de tests".

## Global Constraints

- ESModules (`import`/`export`) en todo el proyecto, `async/await` siempre — nunca callbacks (regla del `CLAUDE.md`).
- Los cambios de schema se aplican con `npx prisma db push` (no existe `prisma/migrations`), seguido de `npx prisma generate`.
- No se debe romper el comportamiento actual del filtro `?audit=true|false` en los listados de pagos (regresión).
- El permiso de módulo de cajas en el backend es `'caja'` (singular, ver `backend/src/routes/caja.js:2-5`), no `'cajas'`.
- No commitear si el `db push` no se pudo aplicar contra una base real — cada tarea de backend debe verificarse contra una base de datos corriendo (Cloud SQL Auth Proxy o Postgres local), según `CLAUDE.md` sección "PASO 13".

---

## Task 1: Modelo de datos — columna `vigente`/`accion` y relación a `User`

**Files:**
- Modify: `backend/prisma/schema.prisma:48-66` (modelo `User`)
- Modify: `backend/prisma/schema.prisma:425-439` (modelo `Audit`)

**Interfaces:**
- Produces: campos Prisma `Audit.accion` (`String`, default `"auditado"`), `Audit.vigente` (`Boolean`, default `true`), `Audit.user` (relación opcional a `User`). Las tareas 3 y 4 (backend) dependen de estos tres campos.

- [ ] **Step 1: Agregar el campo de relación inversa en `User`**

En `backend/prisma/schema.prisma`, en el modelo `User` (líneas 48-66), agregar una línea junto a `pagos_creados` (línea 62):

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  nombre        String
  password_hash String?
  google_id     String?  @unique
  avatar_url    String?
  activo        Boolean  @default(true)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  user_app_roles   UserAppRole[]
  user_permissions UserPermission[]
  cajas_creadas    Caja[]            @relation("CajaCreatedBy")
  pagos_creados    Pago[]            @relation("PagoCreatedBy")
  local_access     UserLocalAccess[]
  audits           Audit[]           @relation("AuditUser")

  @@map("users")
}
```

- [ ] **Step 2: Actualizar el modelo `Audit`**

Reemplazar el modelo `Audit` (líneas 425-439) por:

```prisma
model Audit {
  id            String    @id @default(uuid()) @db.Uuid
  id_registro   String
  tabla         String
  tipo          String
  accion        String    @default("auditado")
  aprobado      Boolean?  @default(false)
  vigente       Boolean   @default(true)
  id_user       String?
  fecha         DateTime?
  observaciones String?
  created_at    DateTime? @default(now())
  updated_at    DateTime? @default(now())

  user User? @relation("AuditUser", fields: [id_user], references: [id])

  @@index([tabla, id_registro, vigente])
  @@index([tabla, id_registro, fecha])
  @@map("audits")
}
```

Nota: `id_user` queda como `String?` sin `@db.Uuid` — coincide con el tipo de `User.id` (`String @id @default(uuid())`, sin anotación `@db.Uuid`), igual que `Pago.created_by`/`Caja.created_by`. El `@default("auditado")` en `accion` es lo que permite que `prisma db push` agregue la columna sin fallar sobre las filas existentes: hoy todas las filas de `audits` representan pagos actualmente auditados, así que ese valor por defecto es semánticamente correcto para los datos ya existentes (no requiere backfill manual).

- [ ] **Step 3: Formatear y aplicar el schema**

Run: `cd backend && npx prisma format`
Expected: sin errores, el archivo se reescribe con formato consistente.

Run: `npx prisma db push`
Expected: output indicando que se agregaron las columnas `accion`, `vigente`, el índice `audits_tabla_id_registro_vigente_idx`, el índice `audits_tabla_id_registro_fecha_idx` y la FK de `audits.id_user` → `users.id`. Debe terminar con `Your database is now in sync with your Prisma schema.`

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Verificar la migración de datos existentes**

Crear un script temporal `backend/scripts/verify-audit-migration.mjs`:

```javascript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const total = await prisma.audit.count()
const vigentesAuditados = await prisma.audit.count({ where: { vigente: true, accion: 'auditado' } })
const noVigentes = await prisma.audit.count({ where: { vigente: false } })

console.log({ total, vigentesAuditados, noVigentes })

await prisma.$disconnect()
```

Run: `node backend/scripts/verify-audit-migration.mjs`
Expected: `{ total: N, vigentesAuditados: N, noVigentes: 0 }` — es decir, todas las filas existentes deben haber quedado con `vigente: true` y `accion: 'auditado'` (default aplicado por `db push`), y ninguna en `vigente: false` (porque hasta ahora no existía el concepto de "desauditado" persistido).

Borrar el script una vez verificado:

Run: `rm backend/scripts/verify-audit-migration.mjs`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(audit): agregar accion, vigente y relacion a User en modelo Audit"
```

---

## Task 2: Modal de "prompt" reutilizable (para motivo opcional al desauditar)

**Files:**
- Modify: `frontend/src/store/uiStore.js`
- Modify: `frontend/src/components/Layout.jsx`

**Interfaces:**
- Produces: `useUiStore().showPrompt(message, { title?, placeholder? }) => Promise<string|null>` — resuelve `null` si el usuario cancela, o un string (posiblemente vacío) si confirma. Las tareas 6, 7 y 8 (frontend de pagos y cajas) consumen esta función para pedir el motivo al desauditar.

- [ ] **Step 1: Agregar `showPrompt`/`resolvePrompt` a `uiStore.js`**

En `frontend/src/store/uiStore.js`, agregar `promptModal: null` junto a `confirmModal: null` (línea 6), y las dos acciones nuevas después de `showConfirm`/`dismissConfirm` (después de línea 47):

```javascript
import { create } from 'zustand'

export const useUiStore = create((set, get) => ({
  sidebarOpen: true,
  notifications: [],
  confirmModal: null,
  promptModal: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  addNotification: (notification) =>
    set((s) => ({
      notifications: [
        ...s.notifications,
        { id: Date.now(), ...notification }
      ]
    })),

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id)
    })),

  notify: (message, type = 'info') => {
    const id = Date.now()
    set((s) => ({
      notifications: [...s.notifications, { id, message, type }]
    }))
    setTimeout(() => {
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id)
      }))
    }, 4000)
  },

  // Modal de confirmación — devuelve Promise<boolean>
  showConfirm: (message, title) => {
    return new Promise((resolve) => {
      set({ confirmModal: { message, title: title || 'Confirmar', resolve } })
    })
  },

  dismissConfirm: (value) => {
    const { confirmModal } = get()
    if (confirmModal?.resolve) confirmModal.resolve(value)
    set({ confirmModal: null })
  },

  // Modal de confirmación + texto libre opcional — devuelve Promise<string|null>
  // (null = cancelado, string = confirmado, puede ser vacío)
  showPrompt: (message, opts = {}) => {
    return new Promise((resolve) => {
      set({
        promptModal: {
          message,
          title: opts.title || 'Confirmar',
          placeholder: opts.placeholder || '',
          resolve
        }
      })
    })
  },

  resolvePrompt: (value) => {
    const { promptModal } = get()
    if (promptModal?.resolve) promptModal.resolve(value)
    set({ promptModal: null })
  }
}))
```

- [ ] **Step 2: Agregar el componente `PromptModal` a `Layout.jsx`**

En `frontend/src/components/Layout.jsx`, cambiar el import de React (línea 1 actual es `import { Outlet } from 'react-router-dom'`, sin hooks de React) para agregar `useState` y `useEffect`, y agregar el componente `PromptModal` después de `ConfirmModal` (después de línea 51):

```javascript
import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import { useUiStore } from '../store/uiStore.js'
```

Después de la función `ConfirmModal` (línea 51), agregar:

```javascript
function PromptModal() {
  const promptModal   = useUiStore((s) => s.promptModal)
  const resolvePrompt = useUiStore((s) => s.resolvePrompt)
  const [value, setValue] = useState('')

  useEffect(() => { setValue('') }, [promptModal])

  if (!promptModal) return null

  return (
    <div className="confirm-backdrop" onMouseDown={() => resolvePrompt(null)}>
      <div className="confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <p className="confirm-message">{promptModal.message}</p>
        <div className="form-input-wrap" style={{ margin: '0.75rem 0' }}>
          <textarea
            rows={2}
            autoFocus
            placeholder={promptModal.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="confirm-foot">
          <button className="btn btn-secondary btn-sm" onClick={() => resolvePrompt(null)}>
            Cancelar
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => resolvePrompt(value)}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
```

Y renderizarlo junto a `<ConfirmModal />` (línea 80):

```javascript
      <ConfirmModal />
      <PromptModal />
    </div>
  )
}
```

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run dev`
Expected: el server arranca sin errores de compilación. Como todavía no hay ningún llamado a `showPrompt` en el código (se agrega en la Task 6), no hay forma de disparar el modal aún — este paso solo confirma que no se rompió el build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/uiStore.js frontend/src/components/Layout.jsx
git commit -m "feat(ui): agregar modal de prompt con texto libre opcional (showPrompt)"
```

---

## Task 3: Backend — historial de auditoría en pagos

**Files:**
- Modify: `backend/src/routes/pagos.js:4-46` (helpers `getAuditedSet`/`buildAuditFilter`)
- Modify: `backend/src/routes/pagos.js:273-285` (`GET /:id`)
- Modify: `backend/src/routes/pagos.js:404-442` (`PATCH /:id/audit`) + nuevo `GET /:id/audit-history`
- Modify: `backend/src/routes/pagos.js:636` (`DELETE /:id` — quitar el borrado en cascada de `audits`)

**Interfaces:**
- Consumes: `Audit.accion`, `Audit.vigente`, relación `Audit.user` (Task 1).
- Produces: `PATCH /pagos/:id/audit` acepta body `{ observaciones? }` y devuelve `{ ok: true, audit: boolean }` (sin cambios en el contrato externo). Nuevo endpoint `GET /pagos/:id/audit-history` devuelve `Audit[]` con `user: { id, nombre }` incluido, ordenado por `fecha desc`. La Task 6 (frontend `PagoList.jsx`) consume ambos.

- [ ] **Step 1: Actualizar `getAuditedSet` y `buildAuditFilter`**

Reemplazar las líneas 4-46 de `backend/src/routes/pagos.js` por:

```javascript
// El estado de auditoría de un pago se guarda en la tabla `audits`
// (modelo Audit) con tabla='pagos' e id_registro=pago.id, NO como columna del pago.
// Cada auditar/desauditar inserta una fila nueva (historial append-only);
// el estado actual es la fila con vigente=true de ese id_registro.

// Devuelve un Set con los ids de pago que están auditados (vigente y con
// accion='auditado'), de entre los ids dados.
async function getAuditedSet(fastify, pagoIds) {
  if (!pagoIds.length) return new Set()
  try {
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'pagos', id_registro: { in: pagoIds }, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    return new Set(rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (getAuditedSet)')
    return new Set()
  }
}

// Construye el filtro Prisma { id: { in/notIn } } para auditados/no-auditados.
// Si `audit` es undefined, no filtra (devuelve {}). Ante un error de la tabla
// `audits`, devolvemos {} (sin filtrar) para no romper la consulta de pagos.
async function buildAuditFilter(fastify, audit, allowedLocalIds) {
  if (audit === undefined) return {}
  try {
    const pagosInScope = await fastify.db.pago.findMany({
      where: { id_local: { in: allowedLocalIds } },
      select: { id: true }
    })
    const pagoIds = pagosInScope.map(p => p.id)
    if (!pagoIds.length) return audit === 'true' ? { id: { in: [] } } : {}
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'pagos', id_registro: { in: pagoIds }, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    const auditedIds = [...new Set(rows.map(r => r.id_registro))]
    return audit === 'true' ? { id: { in: auditedIds } } : { id: { notIn: auditedIds } }
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (buildAuditFilter)')
    return {}
  }
}
```

- [ ] **Step 2: Actualizar `GET /:id` para leer el estado vigente**

Reemplazar las líneas 273-284 (dentro del handler `GET /:id`) por:

```javascript
    // Estado de auditoría desde la tabla `audits` (fila vigente, si existe).
    const auditRow = await fastify.db.audit.findFirst({
      where: { tabla: 'pagos', id_registro: pago.id, vigente: true },
      include: { user: { select: { id: true, nombre: true } } }
    })

    return {
      ...pago,
      audit:      auditRow?.accion === 'auditado',
      audit_by:   auditRow?.user?.nombre ?? null,
      audit_date: auditRow?.fecha ?? null,
    }
```

- [ ] **Step 3: Reescribir `PATCH /:id/audit` como append-only y agregar `GET /:id/audit-history`**

Reemplazar el bloque completo de las líneas 404-442 (`// ── PATCH /:id/audit ───` hasta el cierre del handler) por:

```javascript
  // ── PATCH /:id/audit ───────────────────────────────────────────────────
  // Alterna el estado de auditoría creando una fila nueva en `audits`
  // (historial append-only). Nunca se borra: la fila anterior se marca
  // vigente=false y se inserta una nueva vigente=true con la acción inversa.
  fastify.patch('/:id/audit', { preHandler: editHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { observaciones } = request.body ?? {}

    const nextAccion = await fastify.db.$transaction(async (tx) => {
      const current = await tx.audit.findFirst({
        where: { tabla: 'pagos', id_registro: request.params.id, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'pagos', id_registro: request.params.id, vigente: true },
        data: { vigente: false }
      })

      const accion = current?.accion === 'auditado' ? 'desauditado' : 'auditado'

      await tx.audit.create({
        data: {
          id_registro:   request.params.id,
          tabla:         'pagos',
          tipo:          'auditoria_pago',
          accion,
          aprobado:      accion === 'auditado',
          vigente:       true,
          id_user:       request.user.id,
          fecha:         new Date(),
          observaciones: accion === 'desauditado' ? (observaciones || null) : null
        }
      })

      return accion
    })

    return { ok: true, audit: nextAccion === 'auditado' }
  })

  // ── GET /:id/audit-history ─────────────────────────────────────────────
  // Historial completo de eventos de auditoría de un pago, más reciente primero.
  fastify.get('/:id/audit-history', { preHandler: viewHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    if (!request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    return fastify.db.audit.findMany({
      where: { tabla: 'pagos', id_registro: request.params.id },
      orderBy: { fecha: 'desc' },
      include: { user: { select: { id: true, nombre: true } } }
    })
  })
```

- [ ] **Step 4: Quitar el borrado en cascada de `audits` en `DELETE /:id`**

En el handler `DELETE /:id` (alrededor de la línea 636), quitar la línea:

```javascript
    await fastify.db.audit.deleteMany({ where: { tabla: 'pagos', id_registro: request.params.id } })
```

El bloque de borrado en cascada queda:

```javascript
    // Eliminar registros dependientes antes que el pago (FK constraints)
    await fastify.db.impuesto.deleteMany({ where: { id_pago: request.params.id } })
    await fastify.db.multiMoneda.deleteMany({ where: { id_pago: request.params.id } })
    await fastify.db.pago.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
```

- [ ] **Step 5: Verificación manual con curl**

Run: `cd backend && npm run dev` (dejar corriendo en background)

Con un pago existente (`PAGO_ID`) y un JWT válido (`TOKEN`, obtenido vía `POST /api/auth/login`):

```bash
# Auditar
curl -s -X PATCH http://localhost:3000/api/pagos/$PAGO_ID/audit -H "Authorization: Bearer $TOKEN"
# Expected: {"ok":true,"audit":true}

# Desauditar con motivo
curl -s -X PATCH http://localhost:3000/api/pagos/$PAGO_ID/audit -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"observaciones":"faltaba comprobante"}'
# Expected: {"ok":true,"audit":false}

# Auditar de nuevo
curl -s -X PATCH http://localhost:3000/api/pagos/$PAGO_ID/audit -H "Authorization: Bearer $TOKEN"
# Expected: {"ok":true,"audit":true}

# Historial completo
curl -s http://localhost:3000/api/pagos/$PAGO_ID/audit-history -H "Authorization: Bearer $TOKEN"
# Expected: array con 3 elementos, orden desc por fecha, el más nuevo con accion="auditado",
# el del medio con accion="desauditado" y observaciones="faltaba comprobante", el más viejo accion="auditado".
# Solo el primero (más nuevo) debe tener vigente:true.

# Listado sigue filtrando igual que antes
curl -s "http://localhost:3000/api/pagos?audit=true" -H "Authorization: Bearer $TOKEN" | grep -o "\"id\":\"$PAGO_ID\""
# Expected: coincide (el pago está en el listado de auditados)
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/pagos.js
git commit -m "feat(pagos): convertir auditado en historial append-only y agregar audit-history"
```

---

## Task 4: Backend — auditoría de cajas (nuevo)

**Files:**
- Modify: `backend/src/routes/caja.js:1-45` (helpers nuevos + `GET /`)
- Modify: `backend/src/routes/caja.js:83-105` (`GET /:id`)
- Modify: `backend/src/routes/caja.js:141-193` (agregar `PATCH /:id/audit` y `GET /:id/audit-history` entre `PUT /:id` y `DELETE /:id`)

**Interfaces:**
- Consumes: mismo patrón que Task 3 (`Audit.accion`/`vigente`/`user`).
- Produces: `GET /cajas` acepta `?audit=true|false` y cada fila incluye `audit: boolean`. `GET /cajas/:id` incluye `audit`, `audit_by`, `audit_date`. `PATCH /cajas/:id/audit` y `GET /cajas/:id/audit-history` — mismo contrato que los de pagos. La Task 7/8 (frontend cajas) consumen estos cuatro puntos.

- [ ] **Step 1: Agregar los helpers de auditoría al inicio de `caja.js`**

Al principio de `backend/src/routes/caja.js`, antes de `export default async function cajaRoutes(fastify) {` (línea 1), agregar:

```javascript
// El estado de auditoría de una caja se guarda en la tabla `audits`
// (modelo Audit) con tabla='cajas' e id_registro=caja.id, igual que en pagos.
// Ver backend/src/routes/pagos.js para la explicación del historial append-only.

async function getAuditedCajaSet(fastify, cajaIds) {
  if (!cajaIds.length) return new Set()
  try {
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'cajas', id_registro: { in: cajaIds }, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    return new Set(rows.map(r => r.id_registro))
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (getAuditedCajaSet)')
    return new Set()
  }
}

async function buildCajaAuditFilter(fastify, audit, allowedLocalIds) {
  if (audit === undefined) return {}
  try {
    const cajasInScope = await fastify.db.caja.findMany({
      where: { id_local: { in: allowedLocalIds } },
      select: { id: true }
    })
    const cajaIds = cajasInScope.map(c => c.id)
    if (!cajaIds.length) return audit === 'true' ? { id: { in: [] } } : {}
    const rows = await fastify.db.audit.findMany({
      where: { tabla: 'cajas', id_registro: { in: cajaIds }, vigente: true, accion: 'auditado' },
      select: { id_registro: true }
    })
    const auditedIds = [...new Set(rows.map(r => r.id_registro))]
    return audit === 'true' ? { id: { in: auditedIds } } : { id: { notIn: auditedIds } }
  } catch (err) {
    fastify.log.error({ err }, 'No se pudo leer la tabla audits (buildCajaAuditFilter)')
    return {}
  }
}

export default async function cajaRoutes(fastify) {
```

- [ ] **Step 2: Agregar el filtro `?audit=` y el campo `audit` a `GET /`**

Reemplazar el handler `GET /` (líneas 8-45 originales) por:

```javascript
  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta, audit, page = 1, limit = 50 } = request.query
    const limitNum = Number(limit)
    const skip = limitNum > 0 ? (Number(page) - 1) * limitNum : undefined
    const take = limitNum > 0 ? limitNum : undefined

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }
    const auditFilter = await buildCajaAuditFilter(fastify, audit, request.allowedLocalIds)

    const where = {
      ...localFilter,
      ...auditFilter,
      ...(desde || hasta ? {
        fecha_inicio: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta) } : {})
        }
      } : {})
    }

    const [cajas, total] = await Promise.all([
      fastify.db.caja.findMany({
        where,
        include: {
          local:   { select: { id: true, nombre: true } },
          creador: { select: { id: true, nombre: true } }
        },
        orderBy: { fecha_inicio: 'desc' },
        skip,
        take
      }),
      fastify.db.caja.count({ where })
    ])

    const auditedSet = await getAuditedCajaSet(fastify, cajas.map(c => c.id))
    const data = cajas.map(c => ({ ...c, audit: auditedSet.has(c.id) }))

    return { data, total, page: Number(page), limit: Number(limit) }
  })
```

- [ ] **Step 3: Agregar `audit`/`audit_by`/`audit_date` a `GET /:id`**

Reemplazar el handler `GET /:id` (líneas 83-105 originales) por:

```javascript
  // ── GET /:id ───────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      include: {
        local:       true,
        creador:     { select: { id: true, nombre: true } },
        movimientos: { include: { metodo_pago: true } },
        detalles: {
          include: {
            detalle_tipo: { select: { id: true, nombre: true } }
          },
          orderBy: { created_at: 'asc' }
        }
      }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const auditRow = await fastify.db.audit.findFirst({
      where: { tabla: 'cajas', id_registro: caja.id, vigente: true },
      include: { user: { select: { id: true, nombre: true } } }
    })

    return {
      ...caja,
      audit:      auditRow?.accion === 'auditado',
      audit_by:   auditRow?.user?.nombre ?? null,
      audit_date: auditRow?.fecha ?? null,
    }
  })
```

- [ ] **Step 4: Agregar `PATCH /:id/audit` y `GET /:id/audit-history`**

Insertar, entre el handler `PUT /:id` (que termina en la línea 173 original) y el comentario `// ── DELETE /:id ──` (línea 175 original):

```javascript
  // ── PATCH /:id/audit ───────────────────────────────────────────────────
  // Mismo mecanismo de historial append-only que pagos (ver pagos.js).
  fastify.patch('/:id/audit', { preHandler: editHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { observaciones } = request.body ?? {}

    const nextAccion = await fastify.db.$transaction(async (tx) => {
      const current = await tx.audit.findFirst({
        where: { tabla: 'cajas', id_registro: request.params.id, vigente: true }
      })

      await tx.audit.updateMany({
        where: { tabla: 'cajas', id_registro: request.params.id, vigente: true },
        data: { vigente: false }
      })

      const accion = current?.accion === 'auditado' ? 'desauditado' : 'auditado'

      await tx.audit.create({
        data: {
          id_registro:   request.params.id,
          tabla:         'cajas',
          tipo:          'auditoria_caja',
          accion,
          aprobado:      accion === 'auditado',
          vigente:       true,
          id_user:       request.user.id,
          fecha:         new Date(),
          observaciones: accion === 'desauditado' ? (observaciones || null) : null
        }
      })

      return accion
    })

    return { ok: true, audit: nextAccion === 'auditado' }
  })

  // ── GET /:id/audit-history ─────────────────────────────────────────────
  fastify.get('/:id/audit-history', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })
    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    return fastify.db.audit.findMany({
      where: { tabla: 'cajas', id_registro: request.params.id },
      orderBy: { fecha: 'desc' },
      include: { user: { select: { id: true, nombre: true } } }
    })
  })

```

- [ ] **Step 5: Verificación manual con curl**

Run: backend ya corriendo de la Task 3 (o `cd backend && npm run dev`).

Con una caja existente (`CAJA_ID`) y el mismo `TOKEN`:

```bash
curl -s -X PATCH http://localhost:3000/api/cajas/$CAJA_ID/audit -H "Authorization: Bearer $TOKEN"
# Expected: {"ok":true,"audit":true}

curl -s http://localhost:3000/api/cajas/$CAJA_ID -H "Authorization: Bearer $TOKEN" | grep -o '"audit":true'
# Expected: coincide

curl -s -X PATCH http://localhost:3000/api/cajas/$CAJA_ID/audit -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"observaciones":"error de conteo"}'
# Expected: {"ok":true,"audit":false}

curl -s http://localhost:3000/api/cajas/$CAJA_ID/audit-history -H "Authorization: Bearer $TOKEN"
# Expected: 2 elementos, el más nuevo accion="desauditado" con observaciones="error de conteo", vigente:true;
# el más viejo accion="auditado", vigente:false.

curl -s "http://localhost:3000/api/cajas?audit=false" -H "Authorization: Bearer $TOKEN" | grep -o "\"id\":\"$CAJA_ID\""
# Expected: coincide (la caja aparece como no auditada)
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/caja.js
git commit -m "feat(cajas): agregar auditoria (historial append-only), igual que pagos"
```

---

## Task 5: Frontend — clientes API de pagos y cajas

**Files:**
- Modify: `frontend/src/api/pagos.js:11`
- Modify: `frontend/src/api/cajas.js:3-10`

**Interfaces:**
- Consumes: endpoints de Task 3 y Task 4.
- Produces: `pagosApi.audit(id, data?)`, `pagosApi.auditHistory(id)`, `cajasApi.audit(id, data?)`, `cajasApi.auditHistory(id)`. Consumidos por Task 6, 7 y 8.

- [ ] **Step 1: Actualizar `frontend/src/api/pagos.js`**

Reemplazar la línea 11 (`audit: (id) => client.patch(...)`) y agregar `auditHistory`:

```javascript
import client from './client.js'

export const pagosApi = {
  list:       (params, signal) => client.get('/pagos',                     { params, signal }),
  get:        (id,    signal)  => client.get(`/pagos/${id}`,               { signal }),
  stats:      (params, signal) => client.get('/pagos/stats',               { params, signal }),
  chart:      (params, signal) => client.get('/pagos/chart',               { params, signal }),
  create:     (data)           => client.post('/pagos',                     data),
  update:     (id, data)       => client.put(`/pagos/${id}`,                data),
  remove:     (id)             => client.delete(`/pagos/${id}`),
  audit:        (id, data)     => client.patch(`/pagos/${id}/audit`,        data),
  auditHistory: (id)           => client.get(`/pagos/${id}/audit-history`),
  periodico:  (id)             => client.patch(`/pagos/${id}/periodico`),
  mandarPdp:  (ids)            => client.post('/pagos/mandar-pdp',          { ids }),
  revertirPdp:(ids)            => client.post('/pagos/revertir-pdp',        { ids }),
  pagar:      (ids, data)      => client.post('/pagos/pagar',               { ids, ...data }),
  upload:     (formData, idLocal) => client.post(`/pagos/upload${idLocal ? `?id_local=${idLocal}` : ''}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  listMM:     (id)             => client.get(`/pagos/${id}/multimoneda`),
  createMM:   (id, data)       => client.post(`/pagos/${id}/multimoneda`,   data),
  updateMM:   (id, mmId, data) => client.put(`/pagos/${id}/multimoneda/${mmId}`, data),
  deleteMM:   (id, mmId)       => client.delete(`/pagos/${id}/multimoneda/${mmId}`),
}
```

- [ ] **Step 2: Actualizar `frontend/src/api/cajas.js`**

```javascript
import client from './client.js'

export const cajasApi = {
  list:         (params, signal) => client.get('/cajas',        { params, signal }),
  get:          (id,    signal)  => client.get(`/cajas/${id}`,  { signal }),
  stats:        (params, signal) => client.get('/cajas/stats',  { params, signal }),
  create:       (data)           => client.post('/cajas',        data),
  update:       (id, data)       => client.put(`/cajas/${id}`,   data),
  remove:       (id)             => client.delete(`/cajas/${id}`),
  audit:        (id, data)       => client.patch(`/cajas/${id}/audit`, data),
  auditHistory: (id)             => client.get(`/cajas/${id}/audit-history`)
}
```

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run dev`
Expected: compila sin errores (todavía no hay UI que use `auditHistory`/el nuevo `audit` con body — se agrega en la Task 6/7/8).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/pagos.js frontend/src/api/cajas.js
git commit -m "feat(api): agregar auditHistory y motivo opcional en audit (pagos y cajas)"
```

---

## Task 6: Frontend — `PagoList.jsx` (motivo al desauditar + historial)

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx`

**Interfaces:**
- Consumes: `pagosApi.audit(id, data)`, `pagosApi.auditHistory(id)` (Task 5), `useUiStore().showPrompt` (Task 2).

- [ ] **Step 1: Agregar `showPrompt` y estado de historial en `PagoDetailPanel`**

En `frontend/src/pages/pagos/PagoList.jsx`, en `PagoDetailPanel` (línea 101 en adelante):

Reemplazar la línea 103 (`const showConfirm = useUiStore((s) => s.showConfirm)`) por:

```javascript
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)
```

Agregar estado nuevo junto a `audited`/`auditando` (línea 110-111):

```javascript
  const [audited,      setAudited]      = useState(pago.audit)
  const [auditando,    setAuditando]    = useState(false)
  const [auditHistory, setAuditHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
```

- [ ] **Step 2: Cargar el historial junto con impuestos/multimoneda**

Reemplazar la línea 139 (`useEffect(() => { if (pago) { loadImpuestos(); loadMM() } }, [pago?.id])`) por:

```javascript
  const loadAuditHistory = () => {
    setLoadingHistory(true)
    pagosApi.auditHistory(pago.id)
      .then(({ data }) => setAuditHistory(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => { if (pago) { loadImpuestos(); loadMM(); loadAuditHistory() } }, [pago?.id])
```

- [ ] **Step 3: Pedir motivo opcional al desauditar en `handlePanelAudit`**

Reemplazar las líneas 219-229 (`handlePanelAudit`) por:

```javascript
  const handlePanelAudit = async () => {
    let observaciones
    if (audited) {
      observaciones = await showPrompt(
        'Esta orden ya está auditada. ¿Querés desauditarla? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditando(true)
    try {
      const { data } = await pagosApi.audit(pago.id, audited ? { observaciones } : undefined)
      setAudited(data.audit)
      notify(data.audit ? 'Pago auditado' : 'Auditoría revertida', 'success')
      onAudit?.(pago.id, data.audit)
      loadAuditHistory()
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }
```

- [ ] **Step 4: Agregar la sección "Historial de auditoría" al final del panel**

Después del bloque de Impuestos (después de la tabla de impuestos que cierra, antes del cierre del `<div>` principal del componente — el mismo nivel que `<div className="drawer-section-title">Impuestos</div>` en la línea 423), agregar una nueva sección. Ubicarla justo después del `</div>` que cierra el `table-wrap` de impuestos:

```javascript
      <div className="drawer-section-title">Historial de auditoría</div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Observación</th></tr>
          </thead>
          <tbody>
            {loadingHistory ? (
              <tr><td colSpan={4}><span className="skel" style={{ width: '60%' }} /></td></tr>
            ) : auditHistory.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: 'var(--t3)' }}>Sin eventos de auditoría</td></tr>
            ) : (
              auditHistory.map((ev) => (
                <tr key={ev.id}>
                  <td className="td-muted">{new Date(ev.fecha).toLocaleString('es-AR')}</td>
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
```

- [ ] **Step 5: Pedir motivo también en el toggle de la fila de tabla (`handleAudit`)**

Agregar `showPrompt` en el componente principal `PagoList`. Reemplazar la línea 573 (`const showConfirm = useUiStore((s) => s.showConfirm)`) por:

```javascript
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)
```

Reemplazar `handleAudit` (líneas 691-702) por:

```javascript
  const handleAudit = async (id, e) => {
    e.stopPropagation()
    const current = pagos.find(p => p.id === id)
    let observaciones
    if (current?.audit) {
      observaciones = await showPrompt(
        'Esta orden ya está auditada. ¿Querés desauditarla? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditingId(id)
    try {
      const { data } = await pagosApi.audit(id, current?.audit ? { observaciones } : undefined)
      notify(data.audit ? 'Pago auditado' : 'Auditoría revertida', 'success')
      patchPagoAudit(id, data.audit)
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditingId(null) }
  }
```

- [ ] **Step 6: Verificación manual en el navegador**

Run: backend (`cd backend && npm run dev`) y frontend (`cd frontend && npm run dev`) corriendo.

En el navegador, ir a Pagos:
1. Auditar un pago desde la fila de la tabla → debe verse el badge verde "✓ Auditado" sin pedir texto.
2. Click en el badge para desauditar → debe aparecer el modal de prompt con el mensaje y un textarea; escribir un motivo y confirmar.
3. Abrir el detalle del pago (drawer) → la fila "Auditado: No" y la sección "Historial de auditoría" debe listar 2 eventos: el más reciente "Desauditado" con el motivo escrito, y el más viejo "Auditado" sin observación.
4. Auditar de nuevo desde el botón del panel de detalle (sin texto pedido) → el historial debe pasar a 3 eventos.
5. Refrescar la página y confirmar que el filtro "No auditado" / "Auditado" del listado sigue funcionando igual que antes.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "feat(pagos): pedir motivo opcional al desauditar y mostrar historial de auditoria"
```

---

## Task 7: Frontend — `CajaList.jsx` (auditoría nueva, listado + panel de detalle)

**Files:**
- Modify: `frontend/src/pages/cajas/CajaList.jsx`

**Interfaces:**
- Consumes: `cajasApi.audit(id, data)`, `cajasApi.auditHistory(id)` (Task 5), `useUiStore().showPrompt` (Task 2).

- [ ] **Step 1: Agregar estado y carga de historial en `CajaDetailPanel`**

En `frontend/src/pages/cajas/CajaList.jsx`, en `CajaDetailPanel` (línea 68 en adelante), reemplazar las líneas 69-78 por:

```javascript
function CajaDetailPanel({ cajaId, onRefreshList, canEdit, canDelete, onEdit }) {
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)
  const [caja,       setCaja]      = useState(null)
  const [loading,    setLoading]   = useState(true)
  const [metodos,    setMetodos]   = useState([])
  const [tipos,      setTipos]     = useState([])
  const [newMov,     setNewMov]    = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  const [saving,     setSaving]    = useState(false)
  const [newDet,     setNewDet]    = useState({ tipo: '', id_tipo: '', nombre: '', monto: '', observaciones: '' })
  const [savingDet,  setSavingDet] = useState(false)
  const [auditando,  setAuditando] = useState(false)
  const [auditHistory, setAuditHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
```

Después de la función `load` (líneas 80-86 originales), agregar la carga del historial y ejecutarla junto con `load()` en el `useEffect` (líneas 88-94 originales):

```javascript
  const load = () => {
    setLoading(true)
    cajasApi.get(cajaId)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar caja', 'error'))
      .finally(() => setLoading(false))
  }

  const loadAuditHistory = () => {
    setLoadingHistory(true)
    cajasApi.auditHistory(cajaId)
      .then(({ data }) => setAuditHistory(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => {
    if (!cajaId) return
    load()
    loadAuditHistory()
    metodosApi.list()
      .then(r => setMetodos(r.data || []))
      .catch(() => {})
  }, [cajaId])
```

- [ ] **Step 2: Agregar `handleAudit` en `CajaDetailPanel`**

Después de `handleDeleteDet` (líneas 144-148 originales), agregar:

```javascript
  const handleAudit = async () => {
    let observaciones
    if (caja.audit) {
      observaciones = await showPrompt(
        'Esta caja ya está auditada. ¿Querés desauditarla? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditando(true)
    try {
      const { data } = await cajasApi.audit(cajaId, caja.audit ? { observaciones } : undefined)
      notify(data.audit ? 'Caja auditada' : 'Auditoría revertida', 'success')
      setCaja(prev => ({ ...prev, audit: data.audit }))
      onRefreshList?.()
      loadAuditHistory()
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }
```

- [ ] **Step 3: Agregar la fila "Auditado" y el botón de toggle**

Agregar `['Auditado', caja.audit ? 'Sí' : 'No']` al array `rows` (líneas 156-168 originales), después de `['Origen', ...]`:

```javascript
  const rows = [
    ['Turno',      caja.nro_turno ? `TRN ${caja.nro_turno}` : '—'],
    ['Local',      caja.local?.nombre ?? '—'],
    ['Inicio',     fmtDT(caja.fecha_inicio)],
    ['Cierre',     fmtDT(caja.fecha_cierre)],
    ['Cajero',     caja.cajero ?? '—'],
    ['Total',      fmt$(caja.total)],
    ['Efectivo',   fmt$(caja.efectivo)],
    ['Fiscal',     fmt$(caja.fiscal)],
    ['Comensales', caja.comensales ?? '—'],
    ['Tickets',    caja.tickets ?? '—'],
    ['Origen',     caja.origin ?? '—'],
    ['Auditado',   caja.audit ? 'Sí' : 'No'],
  ]
```

Reemplazar el bloque de botones del inicio del render (líneas 172-178 originales) por:

```javascript
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {canEdit && (
          <button
            className={`btn btn-sm ${caja.audit ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleAudit}
            disabled={auditando}
          >
            {auditando
              ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              : caja.audit ? '✓ Auditado' : 'Auditar'
            }
          </button>
        )}
        {canEdit && (
          <button className="btn btn-secondary btn-sm" onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoEdit /> Editar
          </button>
        )}
      </div>
```

- [ ] **Step 4: Agregar la sección de historial al final del panel**

Después de la tabla de "Detalles" (bloque que termina en la línea 238 originales, `</div>` que cierra `table-wrap`), y antes de lo que le siga (movimientos u otra sección), agregar:

```javascript
      <div className="drawer-section-title">Historial de auditoría</div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Observación</th></tr>
          </thead>
          <tbody>
            {loadingHistory ? (
              <tr><td colSpan={4}><span className="skel" style={{ width: '60%' }} /></td></tr>
            ) : auditHistory.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: 'var(--t3)' }}>Sin eventos de auditoría</td></tr>
            ) : (
              auditHistory.map((ev) => (
                <tr key={ev.id}>
                  <td className="td-muted">{new Date(ev.fecha).toLocaleString('es-AR')}</td>
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
```

- [ ] **Step 5: Agregar filtro, columna y toggle en el listado principal (`CajaList`)**

En el componente `CajaList` (línea 619 en adelante), agregar `showPrompt` y estado de filtro/toggle. Reemplazar las líneas 622-635 por:

```javascript
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)
  const role        = activeApp?.role
  const canCreate = ['super_admin', 'dcsmart', 'admin'].includes(role)
  const canEdit   = ['super_admin', 'dcsmart', 'admin'].includes(role)
  const canDelete = ['super_admin', 'dcsmart', 'admin'].includes(role)

  const [cajas,      setCajas]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [panelMode,  setPanelMode]  = useState('create')
  const [selectedId, setSelectedId] = useState(null)
  const [sortField,  setSortField]  = useState('fecha_inicio')
  const [sortDir,    setSortDir]    = useState('desc')
  const [auditFilter, setAuditFilter] = useState('')
  const [auditingId,  setAuditingId]  = useState(null)
```

Reemplazar los dos `useEffect` de carga (líneas 640-656 originales, la función `load` con `useCallback` y el `useEffect` con `AbortController`) por:

```javascript
  const load = useCallback(() => {
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, limit: 0, ...(auditFilter !== '' ? { audit: auditFilter } : {}) })
      .then(({ data }) => setCajas(data.data))
      .catch(() => notify('Error al cargar cajas', 'error'))
      .finally(() => setLoading(false))
  }, [activeLocal?.id, auditFilter])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, limit: 0, ...(auditFilter !== '' ? { audit: auditFilter } : {}) }, ctrl.signal)
      .then(({ data }) => setCajas(data.data))
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar cajas', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [activeLocal?.id, auditFilter])
```

Agregar `patchCajaAudit` y `handleAudit` después de `handleDelete` (líneas 693-702 originales):

```javascript
  const patchCajaAudit = (id, audit) => {
    setCajas(prev => prev.map(c => c.id === id ? { ...c, audit } : c))
  }

  const handleAudit = async (id, e) => {
    e.stopPropagation()
    const current = cajas.find(c => c.id === id)
    let observaciones
    if (current?.audit) {
      observaciones = await showPrompt(
        'Esta caja ya está auditada. ¿Querés desauditarla? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditingId(id)
    try {
      const { data } = await cajasApi.audit(id, current?.audit ? { observaciones } : undefined)
      notify(data.audit ? 'Caja auditada' : 'Auditoría revertida', 'success')
      patchCajaAudit(id, data.audit)
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditingId(null) }
  }
```

Agregar el filtro en el header de la página. Reemplazar el bloque `page-actions` (líneas 737-743 originales) por:

```javascript
        <div className="page-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select className="filter-select" value={auditFilter} onChange={e => setAuditFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="false">No auditado</option>
            <option value="true">Auditado</option>
          </select>
          {canCreate && (
            <button className="btn btn-primary" onClick={openCreate}>
              <IcoPlus /> Nueva Caja
            </button>
          )}
        </div>
```

Actualizar `COL_COUNT` (línea 617 original) de `13` a `14`, y agregar la columna en el `<thead>` (después de `<th>Local</th>`, línea 761 original) y en cada fila (después de `<td className="td-muted">{c.local?.nombre ?? '—'}</td>`, línea 807 original):

```javascript
const COL_COUNT = 14
```

```javascript
              <th>Local</th>
              <th>Auditado</th>
              <th></th>
```

```javascript
                    <td className="td-muted">{c.local?.nombre ?? '—'}</td>
                    <td>
                      {auditingId === c.id
                        ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        : c.audit
                          ? <span className="badge badge-green" style={{ cursor: 'pointer' }} onClick={(e) => handleAudit(c.id, e)} title="Click para revertir">✓ Auditado</span>
                          : <button className="btn btn-sm btn-secondary" onClick={(e) => handleAudit(c.id, e)}>Auditar</button>
                      }
                    </td>
                    <td>
```

- [ ] **Step 6: Verificación manual en el navegador**

Run: backend y frontend corriendo.

1. Ir a Cajas → confirmar que aparece la columna "Auditado" y el select de filtro "Todos / No auditado / Auditado" junto al botón "Nueva Caja".
2. Auditar una caja desde la tabla → badge verde sin pedir texto.
3. Click en el badge para desauditar → aparece el prompt, escribir motivo, confirmar.
4. Abrir el detalle (drawer) → botón "✓ Auditado"/"Auditar" arriba, fila "Auditado: No" en los datos, y sección "Historial de auditoría" con 2 eventos.
5. Filtrar por "Auditado" y "No auditado" y confirmar que el listado se actualiza según corresponda.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/cajas/CajaList.jsx
git commit -m "feat(cajas): agregar UI de auditoria en listado y panel de detalle"
```

---

## Task 8: Frontend — `CajaDetail.jsx` (página standalone de caja)

**Files:**
- Modify: `frontend/src/pages/cajas/CajaDetail.jsx`

**Interfaces:**
- Consumes: `cajasApi.audit(id, data)`, `cajasApi.auditHistory(id)` (Task 5), `useUiStore().showPrompt` (Task 2).

- [ ] **Step 1: Agregar estado y carga de historial**

Reemplazar las líneas 43-59 de `frontend/src/pages/cajas/CajaDetail.jsx` por:

```javascript
  const notify      = useUiStore((s) => s.notify)
  const showConfirm = useUiStore((s) => s.showConfirm)
  const showPrompt  = useUiStore((s) => s.showPrompt)

  const [caja,    setCaja]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [newMov,  setNewMov]  = useState({ tipo: 'INGRESO', monto: '', id_metodo: '' })
  const [saving,  setSaving]  = useState(false)
  const [auditando, setAuditando] = useState(false)
  const [auditHistory, setAuditHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const load = () => {
    setLoading(true)
    cajasApi.get(id)
      .then(({ data }) => setCaja(data))
      .catch(() => notify('Error al cargar la caja', 'error'))
      .finally(() => setLoading(false))
  }

  const loadAuditHistory = () => {
    setLoadingHistory(true)
    cajasApi.auditHistory(id)
      .then(({ data }) => setAuditHistory(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => { load(); loadAuditHistory() }, [id])
```

- [ ] **Step 2: Agregar `handleAudit`**

Después de `handleDeleteMov` (líneas 73-80 originales), agregar:

```javascript
  const handleAudit = async () => {
    let observaciones
    if (caja.audit) {
      observaciones = await showPrompt(
        'Esta caja ya está auditada. ¿Querés desauditarla? Podés dejar un motivo.',
        { placeholder: 'Motivo (opcional)' }
      )
      if (observaciones === null) return
    }
    setAuditando(true)
    try {
      const { data } = await cajasApi.audit(id, caja.audit ? { observaciones } : undefined)
      notify(data.audit ? 'Caja auditada' : 'Auditoría revertida', 'success')
      setCaja(prev => ({ ...prev, audit: data.audit }))
      loadAuditHistory()
    } catch { notify('Error al auditar', 'error') }
    finally { setAuditando(false) }
  }
```

- [ ] **Step 3: Agregar fila "Auditado", botón de toggle y sección de historial**

Agregar `['Auditado', caja.audit ? 'Sí' : 'No']` al array `infoRows` (líneas 87-98 originales), después de `['Origen', ...]`:

```javascript
  const infoRows = [
    ['Local',        caja.local?.nombre ?? '—'],
    ['Inicio',       fmtDT(caja.fecha_inicio)],
    ['Cierre',       fmtDT(caja.fecha_cierre)],
    ['Cajero',       caja.cajero ?? '—'],
    ['Total',        fmt$(caja.total),   true],
    ['Efectivo',     fmt$(caja.efectivo)],
    ['Fiscal',       fmt$(caja.fiscal)],
    ['Comensales',   caja.comensales ?? '—'],
    ['Tickets',      caja.tickets ?? '—'],
    ['Origen',       caja.origin ?? '—'],
    ['Auditado',     caja.audit ? 'Sí' : 'No'],
  ]
```

Agregar el botón de auditar en el `page-head` (después del bloque `page-head-left`, líneas 107-112 originales):

```javascript
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">
            {caja.nro_turno ? `Turno ${caja.nro_turno}` : `Caja #${caja.id.slice(0, 8)}`}
          </h1>
          <p className="page-sub">{caja.local?.nombre} · {new Date(caja.fecha_inicio).toLocaleDateString('es-AR')}</p>
        </div>
        <div className="page-actions">
          <button
            className={`btn ${caja.audit ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleAudit}
            disabled={auditando}
          >
            {auditando
              ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              : caja.audit ? '✓ Auditado' : 'Auditar'
            }
          </button>
        </div>
      </div>
```

Agregar la sección de historial al final del layout, después del `</div>` que cierra el `<div style={{ display: 'flex', gap: '1.5rem', ...}}>` (línea 214 original, justo antes del `</div>` de cierre del componente en la línea 215-216):

```javascript
      <div className="table-wrap" style={{ marginTop: '1.25rem' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <span className="card-title" style={{ margin: 0 }}>Historial de auditoría</span>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Observación</th></tr>
          </thead>
          <tbody>
            {loadingHistory ? (
              <tr><td colSpan={4}><span className="skel" style={{ width: '60%' }} /></td></tr>
            ) : auditHistory.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: 'var(--t3)' }}>Sin eventos de auditoría</td></tr>
            ) : (
              auditHistory.map((ev) => (
                <tr key={ev.id}>
                  <td className="td-muted">{new Date(ev.fecha).toLocaleString('es-AR')}</td>
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
```

- [ ] **Step 4: Verificación manual en el navegador**

Navegar directamente a la URL `/cajas/:id` de una caja existente:
1. Confirmar que aparece el botón "Auditar"/"✓ Auditado" en el header.
2. Auditar y desauditar (con motivo) y confirmar que la fila "Auditado" y la tabla de historial se actualizan sin recargar la página.
3. Confirmar que el comportamiento coincide con el del panel de detalle en `CajaList.jsx` (misma caja, mismo historial) — abrir la misma caja desde el listado y verificar que ambos muestran el mismo historial.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/cajas/CajaDetail.jsx
git commit -m "feat(cajas): agregar auditoria e historial a la pagina standalone de detalle"
```
