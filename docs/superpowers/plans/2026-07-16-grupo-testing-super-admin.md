# Grupo de testing visible solo para super_admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una app `TESTING` con un local y datos de ejemplo (pagos y cajas, incluyendo estados para
probar PDP de punta a punta), visible únicamente para usuarios con rol `super_admin` — ni `dcsmart`
(hoy con acceso global igual a `super_admin`), ni `admin`, ni `cajero` deben poder verla ni acceder.

**Architecture:** Se agrega un flag `App.solo_super_admin` al schema, se cierra el hueco de bypass de
`dcsmart` en `appContext.js`, se filtra el listado `GET /apps` para no-super_admin, y se seedea la app
+ local + datos de ejemplo con un script one-off contra la base real (mismo patrón de scripts de
migración ya usado en este proyecto).

**Tech Stack:** Prisma/Postgres, Fastify.

## Global Constraints

- `App.solo_super_admin` default `false` — no debe afectar ninguna app existente.
- Los pagos de ejemplo referencian `Proveedor`/`RubCat`/`MetodoPago` **reales ya existentes** en el
  catálogo compartido (nunca se crean catálogos nuevos para esto).
- Montos siempre positivos, con la dirección aparte del signo (`Pago.ingresa_egreso`,
  `DetalleTipo.clasificacion`), consistente con el resto del proyecto.
- `prisma db push` es el mecanismo de schema en este repo.
- `master` es producción real, no se toca sin confirmación explícita del usuario (no aplica
  directamente acá — esta rama no toca master — pero el seed sí escribe en la base compartida real).

---

## Mapa de archivos

```
dcsmart/backend/
├── prisma/schema.prisma           (modificar: App.solo_super_admin)
├── src/routes/apps.js             (modificar: filtra GET / para no-super_admin)
├── src/plugins/appContext.js      (modificar: cierra el bypass de dcsmart si solo_super_admin)
└── scripts/seed-testing-group.cjs (nuevo: crea App+Local+Pagos+Cajas de ejemplo, one-off)
```

---

### Task 1: Schema — `App.solo_super_admin`

**Files:**
- Modify: `dcsmart/backend/prisma/schema.prisma`

**Interfaces:**
- Produces: campo `App.solo_super_admin Boolean @default(false)`, consumido por Task 2
  (`apps.js`, `appContext.js`) y Task 3 (script de seed, que lo setea en `true` para la app nueva).

- [ ] **Step 1: Agregar el campo**

En `dcsmart/backend/prisma/schema.prisma`, buscar `model App` (línea ~11) y agregar el campo después
de `activo`:

```prisma
model App {
  id         String   @id @default(uuid())
  nombre     String
  slug       String   @unique
  activo     Boolean  @default(true)
  solo_super_admin Boolean @default(false)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
```

- [ ] **Step 2: Aplicar el schema a la base y regenerar el cliente**

Con el túnel `cloud-sql-proxy` activo en el puerto 5433:

```bash
cd dcsmart/backend
npx prisma db push
npx prisma generate
```
Expected: `Your database is now in sync with your Prisma schema.` y `Generated Prisma Client`. Si
falla `generate` por archivo bloqueado, parar cualquier proceso `node`/`nodemon` del backend local
corriendo antes de reintentar.

- [ ] **Step 3: Commit**

```bash
cd dcsmart
git add backend/prisma/schema.prisma
git commit -m "Testing: agrega App.solo_super_admin"
```

---

### Task 2: Backend — cierra el acceso para no-super_admin

**Files:**
- Modify: `dcsmart/backend/src/routes/apps.js`
- Modify: `dcsmart/backend/src/plugins/appContext.js`

**Interfaces:**
- Consumes: `App.solo_super_admin` (Task 1).
- Produces: `GET /apps` ya no lista apps `solo_super_admin: true` a usuarios no-super_admin;
  `appContext` responde 403 al entrar a una app `solo_super_admin: true` con cualquier rol que no sea
  literalmente `super_admin` (incluyendo `dcsmart`) — consumido por Task 3 (verificación manual) y por
  el uso real de la feature.

- [ ] **Step 1: Modificar `GET /apps` en `apps.js`**

En `dcsmart/backend/src/routes/apps.js`, reemplazar el handler `GET /` (líneas 4-6):

```js
  fastify.get('/', { preHandler }, async () => {
    return fastify.db.app.findMany({ orderBy: { nombre: 'asc' } })
  })
```

por:

```js
  fastify.get('/', { preHandler }, async (request) => {
    const superAdminRole = await fastify.db.userAppRole.findFirst({
      where: { id_user: request.user.id, role: { nombre: 'super_admin' } }
    })
    const apps = await fastify.db.app.findMany({ orderBy: { nombre: 'asc' } })
    if (superAdminRole) return apps
    return apps.filter((a) => !a.solo_super_admin)
  })
```

- [ ] **Step 2: Modificar `appContext.js` para cerrar el bypass de `dcsmart`**

En `dcsmart/backend/src/plugins/appContext.js`, después de la línea `const roleName =
effective.role.nombre` (línea 31) y ANTES de `request.activeAppId = appId` (línea 32), insertar:

```js
    const roleName = effective.role.nombre

    const app = await fastify.db.app.findUnique({
      where: { id: appId },
      select: { solo_super_admin: true }
    })
    if (app?.solo_super_admin && roleName !== 'super_admin') {
      return reply.code(403).send({ error: 'Sin acceso a esta app' })
    }

    request.activeAppId   = appId
```

(La línea `const roleName = effective.role.nombre` ya existe — no se duplica, solo se agrega el
bloque nuevo entre esa línea y la siguiente. El resto del archivo, incluyendo el bypass de
`super_admin`/`dcsmart` para `allowedLocalIds` más abajo, queda intacto: para un `super_admin` real,
`app?.solo_super_admin` es `true` pero `roleName === 'super_admin'`, así que la condición del `if` da
`false` y sigue de largo normalmente.)

- [ ] **Step 3: Verificar sintaxis de ambos archivos**

```bash
cd dcsmart/backend
node --check src/routes/apps.js
node --check src/plugins/appContext.js
```
Expected: ambos comandos terminan sin output (sin errores de sintaxis).

- [ ] **Step 4: Reiniciar el backend local y confirmar que levanta**

```bash
cd dcsmart/backend
npm run dev
```
Expected: `Server listening at http://0.0.0.0:3000` sin errores de import.

- [ ] **Step 5: Commit**

```bash
cd dcsmart
git add backend/src/routes/apps.js backend/src/plugins/appContext.js
git commit -m "Testing: cierra el bypass de dcsmart para apps solo_super_admin"
```

---

### Task 3: Datos — app, local, pagos y cajas de ejemplo

**Files:**
- Create: `dcsmart/backend/scripts/seed-testing-group.cjs`

**Interfaces:**
- Consumes: `App.solo_super_admin` (Task 1), catálogo real ya existente (`Proveedor`, `RubCat`,
  `MetodoPago` — IDs concretos usados abajo, confirmados contra la base real en el momento de escribir
  este plan).
- Produces: 1 `App` (`TESTING`), 1 `Local` (`Local Testing`), ~5 `Caja` (con `CajaDetalle` y algunas
  `Audit`), ~8 `Pago` (mezcla de `estado_op`, al menos 3-4 en `PDP`) — no expone ninguna interfaz para
  otras tareas, es la última del plan.

- [ ] **Step 1: Crear el script de seed**

Crear `dcsmart/backend/scripts/seed-testing-group.cjs`:

```js
// Crea un grupo de testing (App + Local + Pagos + Cajas de ejemplo) visible
// solo para super_admin (App.solo_super_admin = true). Script one-off, se
// corre una sola vez a mano contra la base real -- no forma parte del
// arranque normal del backend.
'use strict'
const { PrismaClient } = require('@prisma/client')
const { randomUUID } = require('crypto')
const prisma = new PrismaClient()

// Catálogo real ya existente en la base (confirmado antes de escribir este
// script) -- se reusa tal cual, no se crea nada nuevo acá.
const PROVEEDOR_IDS = ['0011f3f7', '001bfedb', '004093d8-d2c0-422d-9cde-6f62d32c61ae']
const RUBCAT_IDS = ['RC-0001', 'RC-0002', 'RC-0003']
const METODO_PAGO_IDS = {
  payway: '0bb8ad49-7aa5-411b-b0f9-ca2db220cba0',
  peyaEfectivo: '0f1f4dd7-b255-4f21-b34f-3fb9c4d1f89a',
  lapos: '16875562-e329-42db-90bf-77bca7a3eb4d',
  echeque: '1a1fe58b-9928-45a3-997d-588aa405132e',
}

async function main() {
  const app = await prisma.app.upsert({
    where: { slug: 'testing' },
    create: { nombre: 'TESTING', slug: 'testing', activo: true, solo_super_admin: true },
    update: { solo_super_admin: true }
  })
  console.log('App:', app.id, app.nombre)

  const local = await prisma.local.upsert({
    where: { id: 'testing-local-01' },
    create: { id: 'testing-local-01', nombre: 'Local Testing', id_app: app.id, activo: true },
    update: {}
  })
  console.log('Local:', local.id, local.nombre)

  // ── Cajas de ejemplo (5) ──
  const cajasDef = [
    { tipo_turno: 'MANANA',  cajero: 'Test Cajero 1', total: '15000', efectivo: '10000', fiscal: '14500', auditada: true },
    { tipo_turno: 'TARDE',   cajero: 'Test Cajero 2', total: '22000', efectivo: '18000', fiscal: '21000', auditada: false },
    { tipo_turno: 'NOCHE',   cajero: 'Test Cajero 1', total: '31000', efectivo: '25000', fiscal: '30500', auditada: true },
    { tipo_turno: 'EVENTO',  cajero: 'Test Cajero 3', total: '8000',  efectivo: '8000',  fiscal: '8000',  auditada: false },
    { tipo_turno: 'TARDE',   cajero: 'Test Cajero 2', total: '19500', efectivo: '19500', fiscal: '19000', auditada: true },
  ]
  for (const c of cajasDef) {
    const cajaId = randomUUID()
    await prisma.caja.create({
      data: {
        id: cajaId,
        id_local: local.id,
        tipo_turno: c.tipo_turno,
        cajero: c.cajero,
        fecha_inicio: new Date(),
        total: c.total,
        efectivo: c.efectivo,
        fiscal: c.fiscal,
        origin: 'DCSMART'
      }
    })
    await prisma.cajaDetalle.create({
      data: {
        id_caja: cajaId,
        nombre: 'Efectivo',
        monto: c.efectivo
      }
    })
    if (c.auditada) {
      await prisma.audit.create({
        data: {
          id_registro: cajaId, tabla: 'cajas', tipo: 'auditoria_caja', accion: 'auditado',
          aprobado: true, vigente: true, audit_dc: false, fecha: new Date()
        }
      })
    }
  }
  console.log(`Cajas creadas: ${cajasDef.length}`)

  // ── Pagos de ejemplo (8) -- al menos 3-4 en estado PDP para probar el reporte ──
  const pagosDef = [
    { estado_op: 'CUENTA_CTE', importe: '5000',  id_tipo: 'A',  pagado: false },
    { estado_op: 'CUENTA_CTE', importe: '7200',  id_tipo: 'B',  pagado: false },
    { estado_op: 'PDP',        importe: '3400',  id_tipo: 'A',  pagado: false },
    { estado_op: 'PDP',        importe: '9800',  id_tipo: 'C',  pagado: false },
    { estado_op: 'PDP',        importe: '2100',  id_tipo: 'B',  pagado: false },
    { estado_op: 'PDP',        importe: '6600',  id_tipo: 'A',  pagado: false },
    { estado_op: 'CAJA',       importe: '1200',  id_tipo: 'STK', pagado: true, fecha_pago: new Date() },
    { estado_op: 'CAJA',       importe: '4500',  id_tipo: 'M',  pagado: true, fecha_pago: new Date() },
  ]
  const metodoIds = Object.values(METODO_PAGO_IDS)
  for (let i = 0; i < pagosDef.length; i++) {
    const p = pagosDef[i]
    await prisma.pago.create({
      data: {
        id_local: local.id,
        id_proveedor: PROVEEDOR_IDS[i % PROVEEDOR_IDS.length],
        id_rubcat: RUBCAT_IDS[i % RUBCAT_IDS.length],
        id_tipo: p.id_tipo,
        importe: p.importe,
        importe_neto: p.importe,
        id_metodo: metodoIds[i % metodoIds.length],
        estado_op: p.estado_op,
        pagado: p.pagado,
        fecha_pago: p.fecha_pago || null,
        fecha: new Date(),
        ingresa_egreso: false,
        observaciones: 'Pago de testing (seed-testing-group.cjs)'
      }
    })
  }
  console.log(`Pagos creados: ${pagosDef.length}`)

  console.log('\nListo. App id:', app.id, '| Local id:', local.id)
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) }).finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Correr el script contra la base real**

Con el túnel `cloud-sql-proxy` activo en el puerto 5433:

```bash
cd dcsmart/backend
node scripts/seed-testing-group.cjs
```
Expected: `App: <uuid> TESTING`, `Local: testing-local-01 Local Testing`, `Cajas creadas: 5`, `Pagos
creados: 8`, `Listo. App id: ... | Local id: testing-local-01`.

- [ ] **Step 3: Verificar con queries reales**

```bash
cd dcsmart/backend
node -e "
import('@prisma/client').then(async ({PrismaClient}) => {
  const prisma = new PrismaClient();
  const app = await prisma.app.findUnique({ where: { slug: 'testing' } });
  console.log('App solo_super_admin:', app.solo_super_admin);
  const cajas = await prisma.caja.count({ where: { id_local: 'testing-local-01' } });
  const pagos = await prisma.pago.count({ where: { id_local: 'testing-local-01' } });
  const pdp = await prisma.pago.count({ where: { id_local: 'testing-local-01', estado_op: 'PDP' } });
  console.log('cajas:', cajas, '| pagos:', pagos, '| en PDP:', pdp);
  await prisma.\$disconnect();
});
"
```
Expected: `App solo_super_admin: true`, `cajas: 5 | pagos: 8 | en PDP: 4`.

- [ ] **Step 4: No commitear el script a git sin decisión explícita**

Este script es de un solo uso (crea datos de ejemplo una sola vez) y referencia IDs de catálogo real
que podrían no ser estables en el tiempo. Dejarlo en disco sin commitear por ahora (igual que los
scripts de la carpeta `migraciones/`, que tampoco están versionados) — si más adelante hace falta
reutilizarlo o adaptarlo, se decide en ese momento si conviene versionarlo. No correr `git add` sobre
este archivo en este paso.

---

## Self-Review

**Cobertura del spec:**
- `App.solo_super_admin` nuevo campo → Task 1. ✓
- `GET /apps` filtra para no-super_admin → Task 2, Step 1. ✓
- `appContext.js` cierra el bypass de `dcsmart` (y cualquier otro rol) para apps `solo_super_admin` →
  Task 2, Step 2. ✓
- App `TESTING` + Local `Local Testing` con el flag en `true` → Task 3. ✓
- ~5 Cajas variadas (auditadas/no, con detalle) → Task 3. ✓
- ~8 Pagos variados, al menos 3-4 en `PDP` para probar el reporte de punta a punta → Task 3 (4 pagos
  en `PDP` exactos). ✓
- Proveedores/RubCat/MetodoPago reales, sin crear catálogo nuevo → Task 3 (IDs confirmados contra la
  base real antes de escribir el plan). ✓

**Placeholder scan:** sin TBD/TODO. Todo el código de cada step está completo, con IDs reales
confirmados (no inventados) para el catálogo referenciado.

**Consistencia de tipos:** `App.solo_super_admin` es `Boolean` en Task 1, leído como `app?.solo_super_admin`
(booleano) en Task 2 Step 2 y como `app.solo_super_admin` en la verificación de Task 3 Step 3 —
consistente en los tres puntos. `request.isSuperAdmin` (ya existente en `appContext.js`, no se toca)
sigue siendo `true` solo cuando `roleName === 'super_admin'` — el nuevo chequeo de Task 2 Step 2 usa
la misma variable `roleName` ya calculada, no una nueva, evitando cualquier discrepancia entre ambas
comprobaciones.
