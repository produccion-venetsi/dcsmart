# App/Local Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantizar que cada usuario solo vea y opere datos de los locales que le corresponden según su app activa, usando el header `X-App-Id` para transmitir el contexto y un middleware central `appContext` para resolver los locales permitidos.

**Architecture:** El frontend inyecta `X-App-Id` en cada request via interceptor Axios. El backend resuelve `request.allowedLocalIds[]` desde la tabla `user_local_access` (sin registros = todos los locales de la app; con registros = solo esos). Las rutas operativas (cajas, movimientos, pagos) aplican cuatro patrones de enforcement que cubren listing, GET por ID, creación y mutación.

**Tech Stack:** Fastify, Prisma (PostgreSQL), React + Zustand + Axios

---

## File Map

| Archivo | Acción |
|---------|--------|
| `backend/prisma/schema.prisma` | Modificar: dos pasos de migración |
| `backend/scripts/migrate-user-local-access.js` | Crear: migra datos de `id_local` existentes |
| `backend/src/plugins/appContext.js` | Crear: middleware que resuelve `allowedLocalIds` |
| `backend/src/plugins/permissions.js` | Modificar: usar `activeAppId` cuando está disponible |
| `backend/src/server.js` | Modificar: registrar `appContext` plugin |
| `backend/src/routes/caja.js` | Modificar: aplicar 4 patrones de enforcement |
| `backend/src/routes/caja_movimientos.js` | Modificar: patrón especial vía caja padre |
| `backend/src/routes/pagos.js` | Modificar: aplicar 4 patrones + fix raw SQL |
| `frontend/src/api/client.js` | Modificar: interceptor `X-App-Id` + handler 403 |

---

## Task 0: Crear rama de trabajo

**Files:** ninguno (operación git)

- [ ] **Step 1: Crear y cambiar a la nueva rama**

```bash
git checkout -b feat/app-local-isolation
```

- [ ] **Step 2: Verificar que estás en la rama correcta**

```bash
git branch
```

Esperado: `* feat/app-local-isolation`

---

## Task 1: Schema — Paso A (agregar `UserLocalAccess`, mantener `id_local` temporalmente)

**Files:**
- Modify: `backend/prisma/schema.prisma`

En este paso se agrega la nueva tabla sin tocar todavía `id_local` en `UserAppRole`. Así la DB tiene ambas cosas a la vez, lo que permite migrar los datos en Task 2.

- [ ] **Step 1: Agregar `UserLocalAccess` al schema y relaciones inversas**

En `backend/prisma/schema.prisma`, aplicar los siguientes cambios:

**En el modelo `App`** — agregar `local_access`:
```prisma
  locales        Local[]
  user_app_roles UserAppRole[]
  detalle_tipos  DetalleTipo[]
  local_access   UserLocalAccess[]
```

**En el modelo `Local`** — agregar `local_access` (mantener `user_app_roles` por ahora, se quita en Paso B):
```prisma
  app            App               @relation(fields: [id_app], references: [id])
  cajas          Caja[]
  pagos          Pago[]
  user_app_roles UserAppRole[]
  local_access   UserLocalAccess[]
```

**En el modelo `User`** — agregar `local_access`:
```prisma
  user_app_roles   UserAppRole[]
  user_permissions UserPermission[]
  cajas_creadas    Caja[]           @relation("CajaCreatedBy")
  pagos_creados    Pago[]           @relation("PagoCreatedBy")
  local_access     UserLocalAccess[]
```

**Agregar nuevo modelo** antes de `RolePermission`:
```prisma
model UserLocalAccess {
  id       String @id @default(uuid())
  id_user  String
  id_app   String
  id_local String

  user  User  @relation(fields: [id_user], references: [id])
  app   App   @relation(fields: [id_app], references: [id])
  local Local @relation(fields: [id_local], references: [id])

  @@unique([id_user, id_app, id_local])
  @@map("user_local_access")
}
```

- [ ] **Step 2: Correr la migración (ejecutar en terminal interactiva)**

```bash
cd backend
npx prisma migrate dev --name add_user_local_access
```

Esperado: migración aplicada, tabla `user_local_access` creada. Prisma Client regenerado.

- [ ] **Step 3: Verificar que la tabla existe**

```bash
node -e "
import('./node_modules/@prisma/client/index.js').then(async ({ PrismaClient }) => {
  const p = new PrismaClient()
  const count = await p.userLocalAccess.count()
  console.log('user_local_access rows:', count)
  await p.\$disconnect()
})
"
```

Esperado: `user_local_access rows: 0`

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: agregar tabla user_local_access (paso A)"
```

---

## Task 2: Migración de datos existentes

**Files:**
- Create: `backend/scripts/migrate-user-local-access.js`

Copia los registros de `user_app_roles` que tienen `id_local` a la nueva tabla `user_local_access`. Usa raw SQL para que funcione con el schema actual.

- [ ] **Step 1: Crear el script**

```javascript
// backend/scripts/migrate-user-local-access.js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT id_user, id_app, id_local
    FROM user_app_roles
    WHERE id_local IS NOT NULL
  `

  console.log(`Encontrados ${rows.length} registros con id_local en user_app_roles`)

  let creados = 0
  for (const row of rows) {
    await prisma.$executeRaw`
      INSERT INTO user_local_access (id, id_user, id_app, id_local)
      VALUES (gen_random_uuid(), ${row.id_user}, ${row.id_app}, ${row.id_local})
      ON CONFLICT (id_user, id_app, id_local) DO NOTHING
    `
    creados++
  }

  console.log(`Migrados: ${creados} registros a user_local_access`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Ejecutar el script**

```bash
cd backend
node scripts/migrate-user-local-access.js
```

Esperado: `Migrados: N registros a user_local_access` (N puede ser 0 si todos los roles actuales tienen `id_local = null`)

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/migrate-user-local-access.js
git commit -m "feat: script migracion datos id_local a user_local_access"
```

---

## Task 3: Schema — Paso B (quitar `id_local` de `UserAppRole`)

**Files:**
- Modify: `backend/prisma/schema.prisma`

Ahora que los datos están migrados, se elimina `id_local` del modelo `UserAppRole` y se agrega la relación inversa `local_access`.

- [ ] **Step 1: Modificar `UserAppRole` y `Local` en el schema**

Reemplazar el bloque de `UserAppRole` (quita `id_local` y la relación `local`):
Reemplazar el bloque de `Local` (quita `user_app_roles` porque ya no hay FK desde `UserAppRole`).

```prisma
model UserAppRole {
  id      String @id @default(uuid())
  id_user String
  id_app  String
  id_role String

  user         User              @relation(fields: [id_user], references: [id])
  app          App               @relation(fields: [id_app], references: [id])
  role         Role              @relation(fields: [id_role], references: [id])
  local_access UserLocalAccess[]

  @@unique([id_user, id_app])
  @@map("user_app_roles")
}

model Local {
  id         String   @id @default(uuid())
  nombre     String
  direccion  String?
  telefono   String?
  activo     Boolean  @default(true)
  id_app     String
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  app          App               @relation(fields: [id_app], references: [id])
  cajas        Caja[]
  pagos        Pago[]
  local_access UserLocalAccess[]

  @@map("locales")
}
```

- [ ] **Step 2: Correr la migración (ejecutar en terminal interactiva)**

```bash
cd backend
npx prisma migrate dev --name remove_id_local_from_user_app_roles
```

Esperado: columna `id_local` eliminada de `user_app_roles`. Prisma Client regenerado.

- [ ] **Step 3: Verificar que el campo ya no existe**

```bash
node -e "
import('./node_modules/@prisma/client/index.js').then(async ({ PrismaClient }) => {
  const p = new PrismaClient()
  const roles = await p.userAppRole.findMany({ take: 1 })
  console.log(JSON.stringify(roles[0], null, 2))
  await p.\$disconnect()
})
"
```

Esperado: el objeto no tiene campo `id_local`.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: eliminar id_local de UserAppRole (paso B)"
```

---

## Task 4: Plugin `appContext`

**Files:**
- Create: `backend/src/plugins/appContext.js`
- Modify: `backend/src/server.js`

- [ ] **Step 1: Crear el plugin**

```javascript
// backend/src/plugins/appContext.js
import fp from 'fastify-plugin'

async function appContextPlugin(fastify) {
  fastify.decorate('appContext', async (request, reply) => {
    const appId = request.headers['x-app-id']
    if (!appId) {
      return reply.code(400).send({ error: 'Header X-App-Id requerido' })
    }

    const userAppRole = await fastify.db.userAppRole.findFirst({
      where: { id_user: request.user.id, id_app: appId },
      include: { role: true }
    })

    if (!userAppRole) {
      return reply.code(403).send({ error: 'Sin acceso a esta app' })
    }

    request.activeAppId = appId
    request.isSuperAdmin = userAppRole.role.nombre === 'super_admin'

    if (request.isSuperAdmin) return

    const localAccess = await fastify.db.userLocalAccess.findMany({
      where: { id_user: request.user.id, id_app: appId },
      select: { id_local: true }
    })

    if (localAccess.length === 0) {
      const locales = await fastify.db.local.findMany({
        where: { id_app: appId, activo: true },
        select: { id: true }
      })
      request.allowedLocalIds = locales.map(l => l.id)
    } else {
      request.allowedLocalIds = localAccess.map(la => la.id_local)
    }
  })
}

export default fp(appContextPlugin)
```

- [ ] **Step 2: Registrar el plugin en `server.js`**

Agregar el import después de `permissionsPlugin`:

```javascript
import appContextPlugin from './plugins/appContext.js'
```

Agregar el registro después de `await app.register(permissionsPlugin)`:

```javascript
await app.register(appContextPlugin)
```

- [ ] **Step 3: Verificar que el servidor inicia sin errores**

```bash
cd backend
node src/server.js
```

Esperado: servidor escuchando en el puerto configurado sin errores de import ni de decoración.

Detener con `Ctrl+C`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/plugins/appContext.js backend/src/server.js
git commit -m "feat: plugin appContext resuelve allowedLocalIds desde X-App-Id"
```

---

## Task 5: Fix `permissions.js` — usar `activeAppId` cuando disponible

**Files:**
- Modify: `backend/src/plugins/permissions.js`

El `findFirst` sin filtro de app hace que cualquier usuario con rol en alguna app tenga permisos en todas. Con `appContext` ya disponible, se puede filtrar por la app activa.

- [ ] **Step 1: Modificar `permissions.js`**

Reemplazar el bloque completo del archivo:

```javascript
import fp from 'fastify-plugin'

async function permissionsPlugin(fastify) {
  fastify.decorate('can', (moduleName, action) => {
    return async (request, reply) => {
      const userId = request.user.id

      const moduleRecord = await fastify.db.module.findUnique({
        where: { nombre: moduleName }
      })

      if (!moduleRecord) {
        return reply.code(403).send({ error: `Módulo '${moduleName}' no encontrado` })
      }

      const userPerm = await fastify.db.userPermission.findUnique({
        where: { id_user_id_module: { id_user: userId, id_module: moduleRecord.id } }
      })

      if (userPerm) {
        if (!userPerm[`can_${action}`]) {
          return reply.code(403).send({ error: 'Acceso denegado' })
        }
        return
      }

      const userAppRole = await fastify.db.userAppRole.findFirst({
        where: {
          id_user: userId,
          ...(request.activeAppId ? { id_app: request.activeAppId } : {})
        }
      })

      if (!userAppRole) {
        return reply.code(403).send({ error: 'Sin rol asignado' })
      }

      const rolePerm = await fastify.db.rolePermission.findUnique({
        where: {
          id_role_id_module: {
            id_role: userAppRole.id_role,
            id_module: moduleRecord.id
          }
        }
      })

      if (!rolePerm || !rolePerm[`can_${action}`]) {
        return reply.code(403).send({ error: 'Acceso denegado' })
      }
    }
  })
}

export default fp(permissionsPlugin)
```

- [ ] **Step 2: Reiniciar el servidor y verificar que no hay errores**

```bash
cd backend
node src/server.js
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/plugins/permissions.js
git commit -m "fix: permissions usa activeAppId cuando esta disponible"
```

---

## Task 6: Rutas `caja.js` — enforcement completo

**Files:**
- Modify: `backend/src/routes/caja.js`

Reemplazar el archivo completo:

- [ ] **Step 1: Reemplazar `caja.js`**

```javascript
export default async function cajaRoutes(fastify) {
  const viewHandler    = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
  const createHandler  = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'create')]
  const editHandler    = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'edit')]
  const deleteHandler  = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta, page = 1, limit = 50 } = request.query
    const skip = (Number(page) - 1) * Number(limit)

    if (id_local && !request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = request.isSuperAdmin
      ? (id_local ? { id_local } : {})
      : { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    const where = {
      ...localFilter,
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
        take: Number(limit)
      }),
      fastify.db.caja.count({ where })
    ])

    return { data: cajas, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /stats ─────────────────────────────────────────────────────────
  fastify.get('/stats', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (id_local && !request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = request.isSuperAdmin
      ? (id_local ? { id_local } : {})
      : { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    const where = {
      ...localFilter,
      ...(desde || hasta ? {
        fecha_inicio: {
          ...(desde && { gte: new Date(desde) }),
          ...(hasta && { lte: new Date(hasta + 'T23:59:59.999') })
        }
      } : {})
    }

    const agg = await fastify.db.caja.aggregate({
      where,
      _sum:   { total: true, efectivo: true, tickets: true, comensales: true },
      _count: { id: true }
    })

    return {
      total_recaudado:  Number(agg._sum.total      ?? 0),
      count_turnos:     agg._count.id,
      total_efectivo:   Number(agg._sum.efectivo   ?? 0),
      total_tickets:    agg._sum.tickets            ?? 0,
      total_comensales: agg._sum.comensales         ?? 0,
    }
  })

  // ── GET /:id ───────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      include: {
        local:      true,
        creador:    { select: { id: true, nombre: true } },
        movimientos: { include: { metodo_pago: true } }
      }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    return caja
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const {
      nro_turno, fecha_inicio, id_local, cajero,
      total, efectivo, fiscal, comensales, tickets, observaciones, foto_url, origin
    } = request.body

    if (!fecha_inicio || !id_local) {
      return reply.code(400).send({ error: 'fecha_inicio e id_local son requeridos' })
    }

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const caja = await fastify.db.caja.create({
      data: {
        nro_turno,
        fecha_inicio: new Date(fecha_inicio),
        id_local, cajero,
        total:        total        ? parseFloat(total)        : null,
        efectivo:     efectivo     ? parseFloat(efectivo)     : null,
        fiscal:       fiscal       ? parseFloat(fiscal)       : null,
        comensales:   comensales   ? parseInt(comensales)     : null,
        tickets:      tickets      ? parseInt(tickets)        : null,
        observaciones, foto_url,
        origin: origin || 'DCSMART',
        created_by: request.user.id
      }
    })
    return reply.code(201).send(caja)
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const {
      nro_turno, fecha_cierre, cajero, total, efectivo, fiscal,
      comensales, tickets, observaciones, foto_url
    } = request.body

    const caja = await fastify.db.caja.update({
      where: { id: request.params.id },
      data: {
        nro_turno,
        fecha_cierre:  fecha_cierre  ? new Date(fecha_cierre)  : undefined,
        cajero,
        total:         total         !== undefined ? parseFloat(total)         : undefined,
        efectivo:      efectivo      !== undefined ? parseFloat(efectivo)      : undefined,
        fiscal:        fiscal        !== undefined ? parseFloat(fiscal)        : undefined,
        comensales:    comensales    !== undefined ? parseInt(comensales)      : undefined,
        tickets:       tickets       !== undefined ? parseInt(tickets)         : undefined,
        observaciones, foto_url
      }
    })
    return caja
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    await fastify.db.caja.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
```

- [ ] **Step 2: Reiniciar el servidor, verificar sin errores**

```bash
cd backend && node src/server.js
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/caja.js
git commit -m "feat: enforcement app/local en rutas de cajas"
```

---

## Task 7: Rutas `caja_movimientos.js` — patrón especial via caja padre

**Files:**
- Modify: `backend/src/routes/caja_movimientos.js`

Los movimientos no tienen `id_local` propio. Se valida via la relación con `Caja`.

- [ ] **Step 1: Reemplazar `caja_movimientos.js`**

```javascript
export default async function cajaMoveRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja_movimientos', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja_movimientos', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('caja_movimientos', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja_movimientos', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_caja } = request.query

    const where = {
      ...(id_caja ? { id_caja } : {}),
      ...(request.isSuperAdmin ? {} : {
        caja: { id_local: { in: request.allowedLocalIds } }
      })
    }

    return fastify.db.cajaMovimiento.findMany({
      where,
      include: { metodo_pago: true },
      orderBy: { id: 'asc' }
    })
  })

  // ── GET /:id ───────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const mov = await fastify.db.cajaMovimiento.findUnique({
      where: { id: request.params.id },
      include: { metodo_pago: true, caja: true }
    })
    if (!mov) return reply.code(404).send({ error: 'Movimiento no encontrado' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(mov.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    return mov
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const { tipo, id_metodo, monto, id_caja, cantidad } = request.body
    if (!tipo || monto === undefined || !id_caja) {
      return reply.code(400).send({ error: 'tipo, monto e id_caja son requeridos' })
    }

    const caja = await fastify.db.caja.findUnique({
      where: { id: id_caja },
      select: { id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const mov = await fastify.db.cajaMovimiento.create({
      data: {
        tipo,
        id_metodo: id_metodo || null,
        monto:     parseFloat(monto),
        id_caja,
        cantidad:  cantidad ? parseInt(cantidad) : null
      },
      include: { metodo_pago: true }
    })
    return reply.code(201).send(mov)
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.cajaMovimiento.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Movimiento no encontrado' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(existing.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const { tipo, id_metodo, monto, cantidad } = request.body
    const mov = await fastify.db.cajaMovimiento.update({
      where: { id: request.params.id },
      data: {
        tipo,
        id_metodo: id_metodo !== undefined ? id_metodo : undefined,
        monto:     monto     !== undefined ? parseFloat(monto) : undefined,
        cantidad:  cantidad  !== undefined ? parseInt(cantidad) : undefined
      },
      include: { metodo_pago: true }
    })
    return mov
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.cajaMovimiento.findUnique({
      where: { id: request.params.id },
      include: { caja: { select: { id_local: true } } }
    })
    if (!existing) return reply.code(404).send({ error: 'Movimiento no encontrado' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(existing.caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    await fastify.db.cajaMovimiento.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/caja_movimientos.js
git commit -m "feat: enforcement app/local en rutas de movimientos"
```

---

## Task 8: Rutas `pagos.js` — enforcement completo + fix raw SQL

**Files:**
- Modify: `backend/src/routes/pagos.js`

- [ ] **Step 1: Reemplazar `pagos.js`**

```javascript
export default async function pagosRoutes(fastify) {
  const viewHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'view')]
  const createHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'create')]
  const editHandler   = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'edit')]
  const deleteHandler = [fastify.authenticate, fastify.appContext, fastify.can('pagos', 'delete')]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request, reply) => {
    const {
      id_local, id_proveedor, pagado, estado_op,
      desde, hasta, page = 1, limit = 50
    } = request.query
    const skip = (Number(page) - 1) * Number(limit)

    if (id_local && !request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = request.isSuperAdmin
      ? (id_local ? { id_local } : {})
      : { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    const where = {
      ...localFilter,
      ...(id_proveedor ? { id_proveedor } : {}),
      ...(pagado !== undefined ? { pagado: pagado === 'true' } : {}),
      ...(estado_op ? { estado_op } : {}),
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta) } : {})
        }
      } : {})
    }

    const [pagos, total] = await Promise.all([
      fastify.db.pago.findMany({
        where,
        include: {
          proveedor:   { select: { id: true, nombre: true } },
          rubcat:      { include: { rubro: true, categoria: true } },
          metodo_pago: true,
          local:       { select: { id: true, nombre: true } },
          creador:     { select: { id: true, nombre: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: Number(limit)
      }),
      fastify.db.pago.count({ where })
    ])

    return { data: pagos, total, page: Number(page), limit: Number(limit) }
  })

  // ── GET /stats ─────────────────────────────────────────────────────────
  fastify.get('/stats', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (id_local && !request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localFilter = request.isSuperAdmin
      ? (id_local ? { id_local } : {})
      : { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

    const where = {
      ...localFilter,
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta + 'T23:59:59.999') } : {})
        }
      } : {})
    }

    const [total, noPagados, pagados] = await Promise.all([
      fastify.db.pago.aggregate({ where, _sum: { importe: true }, _count: { id: true } }),
      fastify.db.pago.aggregate({ where: { ...where, pagado: false }, _sum: { importe: true }, _count: { id: true } }),
      fastify.db.pago.aggregate({ where: { ...where, pagado: true },  _sum: { importe: true }, _count: { id: true } })
    ])

    return {
      importe_total:      Number(total._sum.importe      ?? 0),
      count_total:        total._count.id,
      importe_pendientes: Number(noPagados._sum.importe  ?? 0),
      count_pendientes:   noPagados._count.id,
      importe_pagados:    Number(pagados._sum.importe    ?? 0),
      count_pagados:      pagados._count.id
    }
  })

  // ── GET /chart ─────────────────────────────────────────────────────────
  fastify.get('/chart', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local, desde, hasta } = request.query

    if (id_local && !request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const params = []
    let conditions = `WHERE fecha IS NOT NULL`

    if (id_local) {
      params.push(id_local)
      conditions += ` AND id_local = $${params.length}`
    } else if (!request.isSuperAdmin) {
      // Construir IN clause con los locales permitidos
      const placeholders = request.allowedLocalIds
        .map((_, i) => `$${params.length + i + 1}`)
        .join(', ')
      conditions += ` AND id_local IN (${placeholders})`
      params.push(...request.allowedLocalIds)
    }

    if (desde) {
      params.push(new Date(desde))
      conditions += ` AND fecha >= $${params.length}`
    }
    if (hasta) {
      params.push(new Date(hasta + 'T23:59:59.999'))
      conditions += ` AND fecha <= $${params.length}`
    }

    const rows = await fastify.db.$queryRawUnsafe(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', fecha), 'YYYY-MM') AS mes,
        SUM(CASE WHEN pagado = true  THEN COALESCE(importe, 0) ELSE 0 END) AS pagados,
        SUM(CASE WHEN pagado = false THEN COALESCE(importe, 0) ELSE 0 END) AS pendientes
      FROM pagos
      ${conditions}
      GROUP BY DATE_TRUNC('month', fecha)
      ORDER BY DATE_TRUNC('month', fecha)
    `, ...params)

    return rows.map(r => ({
      mes:        r.mes,
      pagados:    Number(r.pagados    ?? 0),
      pendientes: Number(r.pendientes ?? 0)
    }))
  })

  // ── GET /:id ───────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      include: {
        proveedor:   true,
        rubcat:      { include: { rubro: true, categoria: true } },
        metodo_pago: true,
        local:       true,
        creador:     { select: { id: true, nombre: true } },
        impuestos:   true
      }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    return pago
  })

  // ── POST / ────────────────────────────────────────────────────────────
  fastify.post('/', { preHandler: createHandler }, async (request, reply) => {
    const {
      nro_ord, fecha, id_proveedor, id_rubcat, id_tipo, pv, nro,
      importe_neto, descuento, importe, id_metodo, cashflow,
      observaciones, pagado, fecha_pago, estado_op, foto_url, pdf_url,
      periodo, ingresa_egreso, id_local, impuestos
    } = request.body

    if (id_local && !request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const pago = await fastify.db.pago.create({
      data: {
        nro_ord:        nro_ord        ? parseInt(nro_ord)        : null,
        fecha:          fecha          ? new Date(fecha)          : null,
        id_proveedor:   id_proveedor   || null,
        id_rubcat:      id_rubcat      || null,
        id_tipo:        id_tipo        || null,
        pv:             pv             ? parseInt(pv)             : null,
        nro:            nro            ? BigInt(nro)              : null,
        importe_neto:   importe_neto   ? parseFloat(importe_neto) : null,
        descuento:      descuento      ? parseFloat(descuento)    : null,
        importe:        importe        ? parseFloat(importe)      : null,
        id_metodo:      id_metodo      || null,
        cashflow:       cashflow       ? new Date(cashflow)       : null,
        observaciones,
        pagado:         pagado         ?? false,
        fecha_pago:     fecha_pago     ? new Date(fecha_pago)     : null,
        estado_op:      estado_op      || null,
        foto_url, pdf_url,
        periodo:        periodo        ? new Date(periodo)        : null,
        ingresa_egreso: ingresa_egreso ?? true,
        id_local:       id_local       || null,
        created_by:     request.user.id,
        ...(impuestos && impuestos.length > 0 ? {
          impuestos: {
            create: impuestos.map(imp => ({
              tipo:  imp.tipo,
              monto: parseFloat(imp.monto)
            }))
          }
        } : {})
      },
      include: { impuestos: true }
    })
    return reply.code(201).send(pago)
  })

  // ── PUT /:id ──────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: editHandler }, async (request, reply) => {
    const existing = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const {
      nro_ord, fecha, id_proveedor, id_rubcat, id_tipo, pv, nro,
      importe_neto, descuento, importe, id_metodo, cashflow,
      observaciones, pagado, fecha_pago, estado_op, foto_url, pdf_url,
      periodo, ingresa_egreso, id_local
    } = request.body

    if (id_local && !request.isSuperAdmin && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso al local destino' })
    }

    const pago = await fastify.db.pago.update({
      where: { id: request.params.id },
      data: {
        nro_ord:        nro_ord        !== undefined ? parseInt(nro_ord)          : undefined,
        fecha:          fecha                       ? new Date(fecha)             : undefined,
        id_proveedor:   id_proveedor   !== undefined ? id_proveedor               : undefined,
        id_rubcat:      id_rubcat      !== undefined ? id_rubcat                  : undefined,
        id_tipo:        id_tipo        !== undefined ? id_tipo                    : undefined,
        pv:             pv             !== undefined ? parseInt(pv)               : undefined,
        nro:            nro            !== undefined ? (nro ? BigInt(nro) : null) : undefined,
        importe_neto:   importe_neto   !== undefined ? parseFloat(importe_neto)   : undefined,
        descuento:      descuento      !== undefined ? parseFloat(descuento)      : undefined,
        importe:        importe        !== undefined ? parseFloat(importe)        : undefined,
        id_metodo:      id_metodo      !== undefined ? id_metodo                  : undefined,
        cashflow:       cashflow                    ? new Date(cashflow)          : undefined,
        observaciones,
        pagado,
        fecha_pago:     fecha_pago                  ? new Date(fecha_pago)        : undefined,
        estado_op,
        foto_url, pdf_url,
        periodo:        periodo                     ? new Date(periodo)           : undefined,
        ingresa_egreso,
        id_local
      }
    })
    return pago
  })

  // ── PATCH /:id/audit ───────────────────────────────────────────────────
  fastify.patch('/:id/audit', { preHandler: editHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(pago.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    await fastify.db.audit.create({
      data: {
        id_registro: request.params.id,
        tabla:       'pagos',
        tipo:        'auditoria_pago',
        aprobado:    true,
        id_user:     request.user.email,
        fecha:       new Date()
      }
    })
    return { ok: true }
  })

  // ── DELETE /:id ────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: deleteHandler }, async (request, reply) => {
    const existing = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      select: { id_local: true }
    })
    if (!existing) return reply.code(404).send({ error: 'Pago no encontrado' })

    if (!request.isSuperAdmin && !request.allowedLocalIds.includes(existing.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    await fastify.db.pago.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/pagos.js
git commit -m "feat: enforcement app/local en rutas de pagos"
```

---

## Task 9: Frontend — interceptor `X-App-Id` en `client.js`

**Files:**
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Reemplazar `client.js`**

```javascript
import axios from 'axios'
import { useAppStore } from '../store/appStore'

const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const { activeApp } = useAppStore.getState()
  if (activeApp?.id) config.headers['X-App-Id'] = activeApp.id

  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    if (err.response?.status === 403) {
      const msg = err.response.data?.error || 'Sin acceso a este recurso'
      console.warn('[appContext]', msg)
      // Si el local activo ya no es válido, limpiarlo
      if (msg.includes('local')) {
        useAppStore.getState().setActiveLocal(null)
      }
    }
    return Promise.reject(err)
  }
)

export default client
```

- [ ] **Step 2: Verificar que el frontend compila**

```bash
cd frontend
npm run build
```

Esperado: build sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.js
git commit -m "feat: interceptor X-App-Id y manejo 403 en cliente Axios"
```

---

## Task 10: Smoke test integral

**Files:** ninguno (verificación manual)

- [ ] **Step 1: Iniciar backend y frontend**

En terminal 1:
```bash
cd backend && node src/server.js
```

En terminal 2:
```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Login y verificar header en requests**

Abrir DevTools → Network. Iniciar sesión con un usuario. Navegar a Cajas.
Verificar que cada request a `/api/cajas` lleva el header `X-App-Id: <uuid>`.

- [ ] **Step 3: Verificar que "todos los locales" muestra solo la app activa**

Con `activeLocal = null` en el store: la lista de cajas debe mostrar solo las de la app seleccionada, no de otras apps.

- [ ] **Step 4: Verificar bloqueo por local ajeno**

Con curl, intentar pedir una caja de otra app pasando su UUID:

```bash
TOKEN="<token del usuario>"
APP_ID="<id de la app activa>"
CAJA_OTRA_APP="<uuid de una caja de otra app>"

curl -H "Authorization: Bearer $TOKEN" \
     -H "X-App-Id: $APP_ID" \
     http://localhost:3000/api/cajas/$CAJA_OTRA_APP
```

Esperado: `{"error":"Sin acceso"}`

- [ ] **Step 5: Verificar request sin `X-App-Id`**

```bash
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/cajas
```

Esperado: `{"error":"Header X-App-Id requerido"}`

- [ ] **Step 6: Commit final**

```bash
git add .
git commit -m "test: smoke test app/local isolation completo"
```

---

## Notas de deploy

1. Este branch (`feat/app-local-isolation`) es solo para test local.
2. Las migraciones de Prisma se deben revisar antes de correrlas en producción.
3. El script `migrate-user-local-access.js` debe correrse en producción **antes** de la migración B.
4. El deploy debe seguir el orden: backend primero, luego frontend.
