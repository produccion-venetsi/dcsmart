# DCSmart Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una API REST con Fastify + PostgreSQL (Prisma) que provea auth JWT/Google OAuth y CRUD completo para todas las entidades del negocio.

**Architecture:** Servidor Fastify con arquitectura de plugins. Auth usa JWT en header Bearer + cookie httpOnly. Prisma ORM para PostgreSQL. Permisos basados en roles con overrides por usuario.

**Tech Stack:** Node.js 20 (ESM), Fastify v4, Prisma v5, @fastify/jwt, @fastify/cors, @fastify/cookie, fastify-plugin, bcryptjs, google-auth-library, uuid

---

## Estructura de archivos

```
dcsmart/
├── .gitignore
├── .env                          ← copiar de .env.example
├── backend/
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   └── src/
│       ├── server.js
│       ├── plugins/
│       │   ├── db.js
│       │   └── permissions.js
│       └── routes/
│           ├── auth.js
│           ├── apps.js
│           ├── locales.js
│           ├── users.js
│           ├── caja.js
│           ├── caja_movimientos.js
│           ├── pagos.js
│           ├── proveedores.js
│           └── rubcat.js
```

---

### Task 1: Git init & estructura de directorios

**Files:**
- Create: `.gitignore`
- Create: `backend/` (estructura de directorios)

- [ ] **Step 1: Inicializar git y crear estructura**

```bash
cd C:\Users\agusl\Documents\dcsmart-apps\dcsmart
git init
mkdir -p backend/prisma backend/src/plugins backend/src/routes
```

- [ ] **Step 2: Crear .gitignore raíz**

```gitignore
# Env
.env
.env.local
.env.*.local

# Node
node_modules/
dist/
build/

# Prisma
backend/prisma/migrations/

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Copiar .env.example a .env**

```bash
Copy-Item .env.example .env
```

Editar `.env` con valores reales de DB, JWT_SECRET y Google OAuth antes de continuar.

- [ ] **Step 4: Commit inicial**

```bash
git add .gitignore .env.example CLAUDE.md README.md
git commit -m "chore: initial project structure"
```

---

### Task 2: Inicializar backend y dependencias

**Files:**
- Create: `backend/package.json`

- [ ] **Step 1: Crear package.json del backend**

```bash
cd backend
```

```json
{
  "name": "dcsmart-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "test": "node --test src/test/**/*.test.js",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "node prisma/seed.js",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@fastify/cookie": "^9.4.0",
    "@fastify/cors": "^9.0.1",
    "@fastify/jwt": "^8.0.1",
    "@prisma/client": "^5.22.0",
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.4.5",
    "fastify": "^4.28.1",
    "fastify-plugin": "^4.5.1",
    "google-auth-library": "^9.14.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.7",
    "prisma": "^5.22.0"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

```bash
npm install
```

Resultado esperado: `node_modules/` creado, sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add backend dependencies"
```

---

### Task 3: Schema de Prisma

**Files:**
- Create: `backend/prisma/schema.prisma`

- [ ] **Step 1: Crear schema.prisma completo**

Archivo `backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model App {
  id         String   @id @default(uuid())
  nombre     String
  slug       String   @unique
  activo     Boolean  @default(true)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  locales        Local[]
  user_app_roles UserAppRole[]

  @@map("apps")
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

  app            App           @relation(fields: [id_app], references: [id])
  cajas          Caja[]
  pagos          Pago[]
  user_app_roles UserAppRole[]

  @@map("locales")
}

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
  cajas_creadas    Caja[]           @relation("CajaCreatedBy")
  pagos_creados    Pago[]           @relation("PagoCreatedBy")
  pagos_auditados  Pago[]           @relation("PagoAuditBy")

  @@map("users")
}

model Role {
  id          String  @id @default(uuid())
  nombre      String  @unique
  descripcion String?

  user_app_roles   UserAppRole[]
  role_permissions RolePermission[]

  @@map("roles")
}

model Module {
  id          String  @id @default(uuid())
  nombre      String  @unique
  descripcion String?
  activo      Boolean @default(true)

  role_permissions RolePermission[]
  user_permissions UserPermission[]

  @@map("modules")
}

model RolePermission {
  id         String  @id @default(uuid())
  id_role    String
  id_module  String
  can_view   Boolean @default(false)
  can_create Boolean @default(false)
  can_edit   Boolean @default(false)
  can_delete Boolean @default(false)

  role   Role   @relation(fields: [id_role], references: [id])
  module Module @relation(fields: [id_module], references: [id])

  @@unique([id_role, id_module])
  @@map("role_permissions")
}

model UserAppRole {
  id       String  @id @default(uuid())
  id_user  String
  id_app   String
  id_role  String
  id_local String?

  user  User   @relation(fields: [id_user], references: [id])
  app   App    @relation(fields: [id_app], references: [id])
  role  Role   @relation(fields: [id_role], references: [id])
  local Local? @relation(fields: [id_local], references: [id])

  @@unique([id_user, id_app])
  @@map("user_app_roles")
}

model UserPermission {
  id         String  @id @default(uuid())
  id_user    String
  id_module  String
  can_view   Boolean @default(false)
  can_create Boolean @default(false)
  can_edit   Boolean @default(false)
  can_delete Boolean @default(false)

  user   User   @relation(fields: [id_user], references: [id])
  module Module @relation(fields: [id_module], references: [id])

  @@unique([id_user, id_module])
  @@map("user_permissions")
}

model Rubro {
  id     String @id @default(uuid())
  nombre String @unique

  rubcats RubCat[]

  @@map("rubros")
}

model Categoria {
  id     String @id @default(uuid())
  nombre String @unique

  rubcats RubCat[]

  @@map("categorias")
}

model RubCat {
  id            String  @id @default(uuid())
  id_cat        String
  id_rub        String
  cuenta        String?
  tipo          String?
  costo         String?
  clasificacion String?

  categoria   Categoria   @relation(fields: [id_cat], references: [id])
  rubro       Rubro       @relation(fields: [id_rub], references: [id])
  pagos       Pago[]
  proveedores Proveedor[]

  @@unique([id_cat, id_rub])
  @@map("rubcat")
}

model Proveedor {
  id            String   @id @default(uuid())
  nombre        String
  razon_social  String?
  cuit          String?
  banco         String?
  cbu           String?
  alias         String?
  direccion_url String?
  detalle_direc String?
  telefono      String?
  mail_contacto String?
  mail_envio    String?
  tag           String?
  id_rubcat     String?
  activo        Boolean  @default(true)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  rubcat RubCat? @relation(fields: [id_rubcat], references: [id])
  pagos  Pago[]

  @@map("proveedores")
}

model MetodoPago {
  id     String  @id @default(uuid())
  nombre String  @unique
  activo Boolean @default(true)

  caja_movimientos CajaMovimiento[]
  pagos            Pago[]

  @@map("metodos_pago")
}

model Caja {
  id            String    @id @default(uuid())
  nro_turno     String?
  fecha_inicio  DateTime
  fecha_cierre  DateTime?
  id_local      String
  cajero        String?
  total         Decimal?  @db.Decimal(12, 2)
  efectivo      Decimal?  @db.Decimal(12, 2)
  fiscal        Decimal?  @db.Decimal(12, 2)
  comensales    Int?
  tickets       Int?
  observaciones String?
  foto_url      String?
  origin        Origin    @default(DCSMART)
  created_by    String?
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt

  local       Local            @relation(fields: [id_local], references: [id])
  creador     User?            @relation("CajaCreatedBy", fields: [created_by], references: [id])
  movimientos CajaMovimiento[]

  @@map("cajas")
}

enum Origin {
  DCSMART
  TAPTAP
  FFUDO

  @@map("origin")
}

model CajaMovimiento {
  id        String  @id @default(uuid())
  tipo      String
  id_metodo String?
  monto     Decimal @db.Decimal(12, 2)
  id_caja   String
  cantidad  Int?

  caja        Caja        @relation(fields: [id_caja], references: [id])
  metodo_pago MetodoPago? @relation(fields: [id_metodo], references: [id])

  @@map("caja_movimientos")
}

model Pago {
  id             String    @id @default(uuid())
  nro_ord        Int?
  fecha          DateTime?
  id_proveedor   String?
  id_rubcat      String?
  id_tipo        TipoPago?
  pv             Int?
  nro            Int?
  importe_neto   Decimal?  @db.Decimal(12, 2)
  descuento      Decimal?  @db.Decimal(12, 2)
  importe        Decimal?  @db.Decimal(12, 2)
  id_metodo      String?
  cashflow       DateTime?
  observaciones  String?
  audit          Boolean   @default(false)
  user_audit     String?
  audit_date     DateTime?
  pagado         Boolean   @default(false)
  fecha_pago     DateTime?
  estado_op      EstadoOp?
  foto_url       String?
  pdf_url        String?
  periodo        DateTime?
  ingresa_egreso Boolean   @default(true)
  id_local       String?
  created_by     String?
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt

  id_pdp     String?
  id_eventos String?
  id_cheque  String?
  id_ctacte  String?

  proveedor   Proveedor?  @relation(fields: [id_proveedor], references: [id])
  rubcat      RubCat?     @relation(fields: [id_rubcat], references: [id])
  metodo_pago MetodoPago? @relation(fields: [id_metodo], references: [id])
  local       Local?      @relation(fields: [id_local], references: [id])
  creador     User?       @relation("PagoCreatedBy", fields: [created_by], references: [id])
  auditor     User?       @relation("PagoAuditBy", fields: [user_audit], references: [id])
  impuestos   Impuesto[]

  @@map("pagos")
}

enum TipoPago {
  A
  B
  C
  CM
  INTERCOMPANY

  @@map("tipo_pago")
}

enum EstadoOp {
  PENDIENTE
  APROBADO
  RECHAZADO
  PAGADO

  @@map("estado_op")
}

model Impuesto {
  id      String       @id @default(uuid())
  id_pago String
  tipo    TipoImpuesto
  monto   Decimal      @db.Decimal(12, 2)

  pago Pago @relation(fields: [id_pago], references: [id])

  @@map("impuestos")
}

enum TipoImpuesto {
  IVA21
  IVA10
  RETENCION
  PERCEPCION

  @@map("tipo_impuesto")
}
```

- [ ] **Step 2: Validar schema**

```bash
cd backend
npx prisma validate
```

Resultado esperado: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 3: Generar cliente Prisma**

```bash
npx prisma generate
```

Resultado esperado: `Generated Prisma Client` sin errores.

- [ ] **Step 4: Crear migración inicial**

Asegurate que `DATABASE_URL` en `.env` apunte a una DB PostgreSQL vacía y accesible.

```bash
npx prisma migrate dev --name init
```

Resultado esperado: `Your database is now in sync with your schema.`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat: add prisma schema with full data model"
```

---

### Task 4: Plugin de base de datos

**Files:**
- Create: `backend/src/plugins/db.js`

- [ ] **Step 1: Crear plugin db.js**

Archivo `backend/src/plugins/db.js`:

```javascript
import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function dbPlugin(fastify) {
  await prisma.$connect()
  fastify.decorate('db', prisma)
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
}

export default fp(dbPlugin)
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/plugins/db.js
git commit -m "feat: add prisma database plugin"
```

---

### Task 5: Servidor Fastify (entry point)

**Files:**
- Create: `backend/src/server.js`

- [ ] **Step 1: Crear server.js**

Archivo `backend/src/server.js`:

```javascript
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import 'dotenv/config'

import dbPlugin from './plugins/db.js'
import permissionsPlugin from './plugins/permissions.js'
import authRoutes from './routes/auth.js'
import appsRoutes from './routes/apps.js'
import localesRoutes from './routes/locales.js'
import usersRoutes from './routes/users.js'
import cajaRoutes from './routes/caja.js'
import cajaMoveRoutes from './routes/caja_movimientos.js'
import pagosRoutes from './routes/pagos.js'
import proveedoresRoutes from './routes/proveedores.js'
import rubcatRoutes from './routes/rubcat.js'

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET,
  cookie: { cookieName: 'token', signed: false }
})

await app.register(cookie)
await app.register(dbPlugin)
await app.register(permissionsPlugin)

app.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(appsRoutes, { prefix: '/api/apps' })
await app.register(localesRoutes, { prefix: '/api/locales' })
await app.register(usersRoutes, { prefix: '/api/users' })
await app.register(cajaRoutes, { prefix: '/api/cajas' })
await app.register(cajaMoveRoutes, { prefix: '/api/caja-movimientos' })
await app.register(pagosRoutes, { prefix: '/api/pagos' })
await app.register(proveedoresRoutes, { prefix: '/api/proveedores' })
await app.register(rubcatRoutes, { prefix: '/api/rubcat' })

app.get('/health', async () => ({ status: 'ok' }))

try {
  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
```

- [ ] **Step 2: Verificar arranque (sin rutas implementadas aún)**

Crear archivos temporales vacíos para que no falle la importación:

```bash
# PowerShell
@('auth','apps','locales','users','caja','caja_movimientos','pagos','proveedores','rubcat') | ForEach-Object {
  Set-Content "backend/src/routes/$_.js" "export default async function(f){}"
}
Set-Content "backend/src/plugins/permissions.js" "import fp from 'fastify-plugin'; export default fp(async function(){})"
```

```bash
cd backend && node src/server.js
```

Resultado esperado: `Server listening at http://0.0.0.0:3000`

Ctrl+C para detener.

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.js backend/src/plugins/permissions.js backend/src/routes/
git commit -m "feat: add fastify server entry point"
```

---

### Task 6: Plugin de permisos

**Files:**
- Modify: `backend/src/plugins/permissions.js`

- [ ] **Step 1: Implementar permissions.js**

Archivo `backend/src/plugins/permissions.js`:

```javascript
import fp from 'fastify-plugin'

async function permissionsPlugin(fastify) {
  fastify.decorate('can', (moduleName, action) => {
    return async (request, reply) => {
      const userId = request.user.id

      // 1. Buscar override de permisos del usuario
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
        const permKey = `can_${action}`
        if (!userPerm[permKey]) {
          return reply.code(403).send({ error: 'Acceso denegado' })
        }
        return
      }

      // 2. Buscar permiso por rol del usuario
      const userAppRole = await fastify.db.userAppRole.findFirst({
        where: { id_user: userId }
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

- [ ] **Step 2: Commit**

```bash
git add backend/src/plugins/permissions.js
git commit -m "feat: add role-based permissions plugin"
```

---

### Task 7: Rutas de autenticación

**Files:**
- Modify: `backend/src/routes/auth.js`

- [ ] **Step 1: Implementar auth.js**

Archivo `backend/src/routes/auth.js`:

```javascript
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export default async function authRoutes(fastify) {
  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const { email, nombre, password } = request.body

    if (!email || !nombre || !password) {
      return reply.code(400).send({ error: 'email, nombre y password son requeridos' })
    }

    const existing = await fastify.db.user.findUnique({ where: { email } })
    if (existing) {
      return reply.code(409).send({ error: 'El email ya está registrado' })
    }

    const password_hash = await bcrypt.hash(password, 12)

    const user = await fastify.db.user.create({
      data: { email, nombre, password_hash },
      select: { id: true, email: true, nombre: true, avatar_url: true, created_at: true }
    })

    const token = fastify.jwt.sign({ id: user.id, email: user.email })
    reply.setCookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })

    return reply.code(201).send({ user, token })
  })

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'email y password son requeridos' })
    }

    const user = await fastify.db.user.findUnique({ where: { email } })
    if (!user || !user.password_hash) {
      return reply.code(401).send({ error: 'Credenciales inválidas' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return reply.code(401).send({ error: 'Credenciales inválidas' })
    }

    if (!user.activo) {
      return reply.code(403).send({ error: 'Usuario inactivo' })
    }

    const token = fastify.jwt.sign({ id: user.id, email: user.email })
    reply.setCookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })

    const { password_hash, ...safeUser } = user
    return { user: safeUser, token }
  })

  // POST /api/auth/google
  fastify.post('/google', async (request, reply) => {
    const { credential } = request.body

    if (!credential) {
      return reply.code(400).send({ error: 'credential de Google es requerido' })
    }

    let payload
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      })
      payload = ticket.getPayload()
    } catch {
      return reply.code(401).send({ error: 'Token de Google inválido' })
    }

    const { sub: google_id, email, name: nombre, picture: avatar_url } = payload

    let user = await fastify.db.user.findUnique({ where: { google_id } })

    if (!user) {
      // Buscar por email (cuenta existente sin Google)
      const existingByEmail = await fastify.db.user.findUnique({ where: { email } })
      if (existingByEmail) {
        user = await fastify.db.user.update({
          where: { email },
          data: { google_id, avatar_url: avatar_url || existingByEmail.avatar_url }
        })
      } else {
        user = await fastify.db.user.create({
          data: { email, nombre, google_id, avatar_url }
        })
      }
    }

    if (!user.activo) {
      return reply.code(403).send({ error: 'Usuario inactivo' })
    }

    const token = fastify.jwt.sign({ id: user.id, email: user.email })
    reply.setCookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })

    const { password_hash, ...safeUser } = user
    return { user: safeUser, token }
  })

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await fastify.db.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true, email: true, nombre: true, avatar_url: true, activo: true, created_at: true,
        user_app_roles: {
          include: { app: true, role: true, local: true }
        }
      }
    })
    if (!user) return { error: 'Usuario no encontrado' }
    return user
  })

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' })
    return { message: 'Sesión cerrada' }
  })
}
```

- [ ] **Step 2: Verificar que el server arranca con las rutas de auth**

```bash
cd backend && node src/server.js
```

En otra terminal, probar registro:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","nombre":"Test","password":"test123"}'
```

Resultado esperado: `{"user":{...},"token":"..."}` con status 201.

Ctrl+C para detener.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/auth.js
git commit -m "feat: add auth routes (register, login, google, me, logout)"
```

---

### Task 8: Rutas de Apps

**Files:**
- Modify: `backend/src/routes/apps.js`

- [ ] **Step 1: Implementar apps.js**

Archivo `backend/src/routes/apps.js`:

```javascript
export default async function appsRoutes(fastify) {
  const preHandler = [fastify.authenticate, fastify.can('apps', 'view')]

  // GET /api/apps
  fastify.get('/', { preHandler }, async (request) => {
    return fastify.db.app.findMany({
      orderBy: { nombre: 'asc' }
    })
  })

  // GET /api/apps/:id
  fastify.get('/:id', { preHandler }, async (request, reply) => {
    const app = await fastify.db.app.findUnique({
      where: { id: request.params.id },
      include: { locales: true }
    })
    if (!app) return reply.code(404).send({ error: 'App no encontrada' })
    return app
  })

  // POST /api/apps
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('apps', 'create')]
  }, async (request, reply) => {
    const { nombre, slug, activo } = request.body
    if (!nombre || !slug) return reply.code(400).send({ error: 'nombre y slug son requeridos' })

    try {
      const app = await fastify.db.app.create({
        data: { nombre, slug, activo: activo ?? true }
      })
      return reply.code(201).send(app)
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'El slug ya existe' })
      throw err
    }
  })

  // PUT /api/apps/:id
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('apps', 'edit')]
  }, async (request, reply) => {
    const { nombre, slug, activo } = request.body
    try {
      const app = await fastify.db.app.update({
        where: { id: request.params.id },
        data: { nombre, slug, activo }
      })
      return app
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'App no encontrada' })
      if (err.code === 'P2002') return reply.code(409).send({ error: 'El slug ya existe' })
      throw err
    }
  })

  // DELETE /api/apps/:id
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('apps', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.app.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'App no encontrada' })
      throw err
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/apps.js
git commit -m "feat: add apps CRUD routes"
```

---

### Task 9: Rutas de Locales

**Files:**
- Modify: `backend/src/routes/locales.js`

- [ ] **Step 1: Implementar locales.js**

Archivo `backend/src/routes/locales.js`:

```javascript
export default async function localesRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('locales', 'view')]

  // GET /api/locales
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_app } = request.query
    return fastify.db.local.findMany({
      where: id_app ? { id_app } : undefined,
      include: { app: { select: { id: true, nombre: true, slug: true } } },
      orderBy: { nombre: 'asc' }
    })
  })

  // GET /api/locales/:id
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const local = await fastify.db.local.findUnique({
      where: { id: request.params.id },
      include: { app: true }
    })
    if (!local) return reply.code(404).send({ error: 'Local no encontrado' })
    return local
  })

  // POST /api/locales
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'create')]
  }, async (request, reply) => {
    const { nombre, id_app, direccion, telefono, activo } = request.body
    if (!nombre || !id_app) return reply.code(400).send({ error: 'nombre e id_app son requeridos' })

    try {
      const local = await fastify.db.local.create({
        data: { nombre, id_app, direccion, telefono, activo: activo ?? true }
      })
      return reply.code(201).send(local)
    } catch (err) {
      if (err.code === 'P2003') return reply.code(400).send({ error: 'App no existe' })
      throw err
    }
  })

  // PUT /api/locales/:id
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'edit')]
  }, async (request, reply) => {
    const { nombre, direccion, telefono, activo } = request.body
    try {
      const local = await fastify.db.local.update({
        where: { id: request.params.id },
        data: { nombre, direccion, telefono, activo }
      })
      return local
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Local no encontrado' })
      throw err
    }
  })

  // DELETE /api/locales/:id
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.local.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Local no encontrado' })
      throw err
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/locales.js
git commit -m "feat: add locales CRUD routes"
```

---

### Task 10: Rutas de Usuarios

**Files:**
- Modify: `backend/src/routes/users.js`

- [ ] **Step 1: Implementar users.js**

Archivo `backend/src/routes/users.js`:

```javascript
import bcrypt from 'bcryptjs'

export default async function usersRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('usuarios', 'view')]

  // GET /api/users
  fastify.get('/', { preHandler: viewHandler }, async () => {
    return fastify.db.user.findMany({
      select: {
        id: true, email: true, nombre: true, avatar_url: true,
        activo: true, created_at: true,
        user_app_roles: { include: { app: true, role: true, local: true } }
      },
      orderBy: { nombre: 'asc' }
    })
  })

  // GET /api/users/:id
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const user = await fastify.db.user.findUnique({
      where: { id: request.params.id },
      select: {
        id: true, email: true, nombre: true, avatar_url: true,
        activo: true, created_at: true, updated_at: true,
        user_app_roles: { include: { app: true, role: true, local: true } },
        user_permissions: { include: { module: true } }
      }
    })
    if (!user) return reply.code(404).send({ error: 'Usuario no encontrado' })
    return user
  })

  // POST /api/users
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('usuarios', 'create')]
  }, async (request, reply) => {
    const { email, nombre, password, activo } = request.body
    if (!email || !nombre) return reply.code(400).send({ error: 'email y nombre son requeridos' })

    const existing = await fastify.db.user.findUnique({ where: { email } })
    if (existing) return reply.code(409).send({ error: 'El email ya existe' })

    const data = {
      email, nombre, activo: activo ?? true,
      ...(password ? { password_hash: await bcrypt.hash(password, 12) } : {})
    }

    const user = await fastify.db.user.create({
      data,
      select: { id: true, email: true, nombre: true, activo: true, created_at: true }
    })
    return reply.code(201).send(user)
  })

  // PUT /api/users/:id
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('usuarios', 'edit')]
  }, async (request, reply) => {
    const { nombre, avatar_url, activo, password } = request.body
    const data = {
      nombre, avatar_url, activo,
      ...(password ? { password_hash: await bcrypt.hash(password, 12) } : {})
    }
    // Eliminar undefined
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k])

    try {
      const user = await fastify.db.user.update({
        where: { id: request.params.id },
        data,
        select: { id: true, email: true, nombre: true, avatar_url: true, activo: true, updated_at: true }
      })
      return user
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Usuario no encontrado' })
      throw err
    }
  })

  // DELETE /api/users/:id  (soft delete — desactiva)
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('usuarios', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.user.update({
        where: { id: request.params.id },
        data: { activo: false }
      })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Usuario no encontrado' })
      throw err
    }
  })

  // POST /api/users/:id/roles — asignar rol a usuario en una app
  fastify.post('/:id/roles', {
    preHandler: [fastify.authenticate, fastify.can('usuarios', 'edit')]
  }, async (request, reply) => {
    const { id_app, id_role, id_local } = request.body
    if (!id_app || !id_role) return reply.code(400).send({ error: 'id_app e id_role son requeridos' })

    const userAppRole = await fastify.db.userAppRole.upsert({
      where: { id_user_id_app: { id_user: request.params.id, id_app } },
      create: { id_user: request.params.id, id_app, id_role, id_local },
      update: { id_role, id_local }
    })
    return userAppRole
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/users.js
git commit -m "feat: add users CRUD routes with role assignment"
```

---

### Task 11: Rutas de Caja

**Files:**
- Modify: `backend/src/routes/caja.js`

- [ ] **Step 1: Implementar caja.js**

Archivo `backend/src/routes/caja.js`:

```javascript
export default async function cajaRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('caja', 'view')]

  // GET /api/cajas
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_local, desde, hasta, page = 1, limit = 50 } = request.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      ...(id_local ? { id_local } : {}),
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
          local: { select: { id: true, nombre: true } },
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

  // GET /api/cajas/:id
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      include: {
        local: true,
        creador: { select: { id: true, nombre: true } },
        movimientos: { include: { metodo_pago: true } }
      }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })
    return caja
  })

  // POST /api/cajas
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('caja', 'create')]
  }, async (request, reply) => {
    const {
      nro_turno, fecha_inicio, id_local, cajero,
      total, efectivo, fiscal, comensales, tickets, observaciones, foto_url, origin
    } = request.body

    if (!fecha_inicio || !id_local) {
      return reply.code(400).send({ error: 'fecha_inicio e id_local son requeridos' })
    }

    const caja = await fastify.db.caja.create({
      data: {
        nro_turno, fecha_inicio: new Date(fecha_inicio), id_local, cajero,
        total: total ? parseFloat(total) : null,
        efectivo: efectivo ? parseFloat(efectivo) : null,
        fiscal: fiscal ? parseFloat(fiscal) : null,
        comensales: comensales ? parseInt(comensales) : null,
        tickets: tickets ? parseInt(tickets) : null,
        observaciones, foto_url,
        origin: origin || 'DCSMART',
        created_by: request.user.id
      }
    })
    return reply.code(201).send(caja)
  })

  // PUT /api/cajas/:id
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('caja', 'edit')]
  }, async (request, reply) => {
    const {
      nro_turno, fecha_cierre, cajero, total, efectivo, fiscal,
      comensales, tickets, observaciones, foto_url
    } = request.body

    try {
      const caja = await fastify.db.caja.update({
        where: { id: request.params.id },
        data: {
          nro_turno,
          fecha_cierre: fecha_cierre ? new Date(fecha_cierre) : undefined,
          cajero,
          total: total !== undefined ? parseFloat(total) : undefined,
          efectivo: efectivo !== undefined ? parseFloat(efectivo) : undefined,
          fiscal: fiscal !== undefined ? parseFloat(fiscal) : undefined,
          comensales: comensales !== undefined ? parseInt(comensales) : undefined,
          tickets: tickets !== undefined ? parseInt(tickets) : undefined,
          observaciones, foto_url
        }
      })
      return caja
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Caja no encontrada' })
      throw err
    }
  })

  // DELETE /api/cajas/:id
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('caja', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.caja.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Caja no encontrada' })
      throw err
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/caja.js
git commit -m "feat: add caja CRUD routes with pagination and filters"
```

---

### Task 12: Rutas de Movimientos de Caja

**Files:**
- Modify: `backend/src/routes/caja_movimientos.js`

- [ ] **Step 1: Implementar caja_movimientos.js**

Archivo `backend/src/routes/caja_movimientos.js`:

```javascript
export default async function cajaMoveRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('caja_movimientos', 'view')]

  // GET /api/caja-movimientos?id_caja=...
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { id_caja } = request.query
    return fastify.db.cajaMovimiento.findMany({
      where: id_caja ? { id_caja } : undefined,
      include: { metodo_pago: true },
      orderBy: { id: 'asc' }
    })
  })

  // GET /api/caja-movimientos/:id
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const mov = await fastify.db.cajaMovimiento.findUnique({
      where: { id: request.params.id },
      include: { metodo_pago: true, caja: true }
    })
    if (!mov) return reply.code(404).send({ error: 'Movimiento no encontrado' })
    return mov
  })

  // POST /api/caja-movimientos
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('caja_movimientos', 'create')]
  }, async (request, reply) => {
    const { tipo, id_metodo, monto, id_caja, cantidad } = request.body
    if (!tipo || monto === undefined || !id_caja) {
      return reply.code(400).send({ error: 'tipo, monto e id_caja son requeridos' })
    }

    const mov = await fastify.db.cajaMovimiento.create({
      data: {
        tipo,
        id_metodo: id_metodo || null,
        monto: parseFloat(monto),
        id_caja,
        cantidad: cantidad ? parseInt(cantidad) : null
      },
      include: { metodo_pago: true }
    })
    return reply.code(201).send(mov)
  })

  // PUT /api/caja-movimientos/:id
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('caja_movimientos', 'edit')]
  }, async (request, reply) => {
    const { tipo, id_metodo, monto, cantidad } = request.body
    try {
      const mov = await fastify.db.cajaMovimiento.update({
        where: { id: request.params.id },
        data: {
          tipo,
          id_metodo: id_metodo !== undefined ? id_metodo : undefined,
          monto: monto !== undefined ? parseFloat(monto) : undefined,
          cantidad: cantidad !== undefined ? parseInt(cantidad) : undefined
        },
        include: { metodo_pago: true }
      })
      return mov
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Movimiento no encontrado' })
      throw err
    }
  })

  // DELETE /api/caja-movimientos/:id
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('caja_movimientos', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.cajaMovimiento.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Movimiento no encontrado' })
      throw err
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/caja_movimientos.js
git commit -m "feat: add caja_movimientos CRUD routes"
```

---

### Task 13: Rutas de Pagos

**Files:**
- Modify: `backend/src/routes/pagos.js`

- [ ] **Step 1: Implementar pagos.js**

Archivo `backend/src/routes/pagos.js`:

```javascript
export default async function pagosRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('pagos', 'view')]

  // GET /api/pagos
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const {
      id_local, id_proveedor, pagado, estado_op,
      desde, hasta, page = 1, limit = 50
    } = request.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      ...(id_local ? { id_local } : {}),
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
          proveedor: { select: { id: true, nombre: true } },
          rubcat: { include: { rubro: true, categoria: true } },
          metodo_pago: true,
          creador: { select: { id: true, nombre: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: Number(limit)
      }),
      fastify.db.pago.count({ where })
    ])

    return { data: pagos, total, page: Number(page), limit: Number(limit) }
  })

  // GET /api/pagos/:id
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const pago = await fastify.db.pago.findUnique({
      where: { id: request.params.id },
      include: {
        proveedor: true,
        rubcat: { include: { rubro: true, categoria: true } },
        metodo_pago: true,
        local: true,
        creador: { select: { id: true, nombre: true } },
        auditor: { select: { id: true, nombre: true } },
        impuestos: true
      }
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    return pago
  })

  // POST /api/pagos
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'create')]
  }, async (request, reply) => {
    const {
      nro_ord, fecha, id_proveedor, id_rubcat, id_tipo, pv, nro,
      importe_neto, descuento, importe, id_metodo, cashflow,
      observaciones, pagado, fecha_pago, estado_op, foto_url, pdf_url,
      periodo, ingresa_egreso, id_local, impuestos
    } = request.body

    const pago = await fastify.db.pago.create({
      data: {
        nro_ord: nro_ord ? parseInt(nro_ord) : null,
        fecha: fecha ? new Date(fecha) : null,
        id_proveedor: id_proveedor || null,
        id_rubcat: id_rubcat || null,
        id_tipo: id_tipo || null,
        pv: pv ? parseInt(pv) : null,
        nro: nro ? parseInt(nro) : null,
        importe_neto: importe_neto ? parseFloat(importe_neto) : null,
        descuento: descuento ? parseFloat(descuento) : null,
        importe: importe ? parseFloat(importe) : null,
        id_metodo: id_metodo || null,
        cashflow: cashflow ? new Date(cashflow) : null,
        observaciones,
        pagado: pagado ?? false,
        fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
        estado_op: estado_op || null,
        foto_url, pdf_url,
        periodo: periodo ? new Date(periodo) : null,
        ingresa_egreso: ingresa_egreso ?? true,
        id_local: id_local || null,
        created_by: request.user.id,
        ...(impuestos && impuestos.length > 0 ? {
          impuestos: {
            create: impuestos.map(imp => ({
              tipo: imp.tipo,
              monto: parseFloat(imp.monto)
            }))
          }
        } : {})
      },
      include: { impuestos: true }
    })
    return reply.code(201).send(pago)
  })

  // PUT /api/pagos/:id
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'edit')]
  }, async (request, reply) => {
    const {
      nro_ord, fecha, id_proveedor, id_rubcat, id_tipo, pv, nro,
      importe_neto, descuento, importe, id_metodo, cashflow,
      observaciones, pagado, fecha_pago, estado_op, foto_url, pdf_url,
      periodo, ingresa_egreso, id_local
    } = request.body

    try {
      const pago = await fastify.db.pago.update({
        where: { id: request.params.id },
        data: {
          nro_ord: nro_ord !== undefined ? parseInt(nro_ord) : undefined,
          fecha: fecha ? new Date(fecha) : undefined,
          id_proveedor: id_proveedor !== undefined ? id_proveedor : undefined,
          id_rubcat: id_rubcat !== undefined ? id_rubcat : undefined,
          id_tipo: id_tipo !== undefined ? id_tipo : undefined,
          pv: pv !== undefined ? parseInt(pv) : undefined,
          nro: nro !== undefined ? parseInt(nro) : undefined,
          importe_neto: importe_neto !== undefined ? parseFloat(importe_neto) : undefined,
          descuento: descuento !== undefined ? parseFloat(descuento) : undefined,
          importe: importe !== undefined ? parseFloat(importe) : undefined,
          id_metodo: id_metodo !== undefined ? id_metodo : undefined,
          cashflow: cashflow ? new Date(cashflow) : undefined,
          observaciones,
          pagado,
          fecha_pago: fecha_pago ? new Date(fecha_pago) : undefined,
          estado_op,
          foto_url, pdf_url,
          periodo: periodo ? new Date(periodo) : undefined,
          ingresa_egreso,
          id_local
        }
      })
      return pago
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
      throw err
    }
  })

  // PATCH /api/pagos/:id/audit — marcar como auditado
  fastify.patch('/:id/audit', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'edit')]
  }, async (request, reply) => {
    try {
      const pago = await fastify.db.pago.update({
        where: { id: request.params.id },
        data: {
          audit: true,
          user_audit: request.user.id,
          audit_date: new Date()
        }
      })
      return pago
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
      throw err
    }
  })

  // DELETE /api/pagos/:id
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('pagos', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.pago.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
      throw err
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/pagos.js
git commit -m "feat: add pagos CRUD routes with filters, pagination and audit endpoint"
```

---

### Task 14: Rutas de Proveedores

**Files:**
- Modify: `backend/src/routes/proveedores.js`

- [ ] **Step 1: Implementar proveedores.js**

Archivo `backend/src/routes/proveedores.js`:

```javascript
export default async function proveedoresRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('proveedores', 'view')]

  // GET /api/proveedores
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { activo, search } = request.query
    return fastify.db.proveedor.findMany({
      where: {
        ...(activo !== undefined ? { activo: activo === 'true' } : {}),
        ...(search ? {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' } },
            { razon_social: { contains: search, mode: 'insensitive' } },
            { cuit: { contains: search } }
          ]
        } : {})
      },
      include: { rubcat: { include: { rubro: true, categoria: true } } },
      orderBy: { nombre: 'asc' }
    })
  })

  // GET /api/proveedores/:id
  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const proveedor = await fastify.db.proveedor.findUnique({
      where: { id: request.params.id },
      include: { rubcat: { include: { rubro: true, categoria: true } } }
    })
    if (!proveedor) return reply.code(404).send({ error: 'Proveedor no encontrado' })
    return proveedor
  })

  // POST /api/proveedores
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('proveedores', 'create')]
  }, async (request, reply) => {
    const {
      nombre, razon_social, cuit, banco, cbu, alias,
      direccion_url, detalle_direc, telefono, mail_contacto,
      mail_envio, tag, id_rubcat, activo
    } = request.body

    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })

    const proveedor = await fastify.db.proveedor.create({
      data: {
        nombre, razon_social, cuit, banco, cbu, alias,
        direccion_url, detalle_direc, telefono, mail_contacto,
        mail_envio, tag, id_rubcat: id_rubcat || null,
        activo: activo ?? true
      }
    })
    return reply.code(201).send(proveedor)
  })

  // PUT /api/proveedores/:id
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('proveedores', 'edit')]
  }, async (request, reply) => {
    const {
      nombre, razon_social, cuit, banco, cbu, alias,
      direccion_url, detalle_direc, telefono, mail_contacto,
      mail_envio, tag, id_rubcat, activo
    } = request.body

    try {
      const proveedor = await fastify.db.proveedor.update({
        where: { id: request.params.id },
        data: {
          nombre, razon_social, cuit, banco, cbu, alias,
          direccion_url, detalle_direc, telefono, mail_contacto,
          mail_envio, tag, id_rubcat, activo
        }
      })
      return proveedor
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Proveedor no encontrado' })
      throw err
    }
  })

  // DELETE /api/proveedores/:id  (soft delete)
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('proveedores', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.proveedor.update({
        where: { id: request.params.id },
        data: { activo: false }
      })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Proveedor no encontrado' })
      throw err
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/proveedores.js
git commit -m "feat: add proveedores CRUD routes with search"
```

---

### Task 15: Rutas de RubCat (Rubros, Categorías y su combinación)

**Files:**
- Modify: `backend/src/routes/rubcat.js`

- [ ] **Step 1: Implementar rubcat.js**

Archivo `backend/src/routes/rubcat.js`:

```javascript
export default async function rubcatRoutes(fastify) {
  const viewHandler = [fastify.authenticate, fastify.can('rubros', 'view')]

  // ─── RUBROS ───────────────────────────────────────
  fastify.get('/rubros', { preHandler: viewHandler }, async () => {
    return fastify.db.rubro.findMany({ orderBy: { nombre: 'asc' } })
  })

  fastify.post('/rubros', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'create')]
  }, async (request, reply) => {
    const { nombre } = request.body
    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })
    try {
      const rubro = await fastify.db.rubro.create({ data: { nombre } })
      return reply.code(201).send(rubro)
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'El rubro ya existe' })
      throw err
    }
  })

  fastify.put('/rubros/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'edit')]
  }, async (request, reply) => {
    try {
      const rubro = await fastify.db.rubro.update({
        where: { id: request.params.id },
        data: { nombre: request.body.nombre }
      })
      return rubro
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Rubro no encontrado' })
      throw err
    }
  })

  fastify.delete('/rubros/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.rubro.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Rubro no encontrado' })
      throw err
    }
  })

  // ─── CATEGORÍAS ───────────────────────────────────
  fastify.get('/categorias', { preHandler: viewHandler }, async () => {
    return fastify.db.categoria.findMany({ orderBy: { nombre: 'asc' } })
  })

  fastify.post('/categorias', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'create')]
  }, async (request, reply) => {
    const { nombre } = request.body
    if (!nombre) return reply.code(400).send({ error: 'nombre es requerido' })
    try {
      const cat = await fastify.db.categoria.create({ data: { nombre } })
      return reply.code(201).send(cat)
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'La categoría ya existe' })
      throw err
    }
  })

  fastify.put('/categorias/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'edit')]
  }, async (request, reply) => {
    try {
      const cat = await fastify.db.categoria.update({
        where: { id: request.params.id },
        data: { nombre: request.body.nombre }
      })
      return cat
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Categoría no encontrada' })
      throw err
    }
  })

  fastify.delete('/categorias/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.categoria.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Categoría no encontrada' })
      throw err
    }
  })

  // ─── RUBCAT ───────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async () => {
    return fastify.db.rubCat.findMany({
      include: { rubro: true, categoria: true },
      orderBy: [{ rubro: { nombre: 'asc' } }, { categoria: { nombre: 'asc' } }]
    })
  })

  fastify.get('/:id', { preHandler: viewHandler }, async (request, reply) => {
    const rubcat = await fastify.db.rubCat.findUnique({
      where: { id: request.params.id },
      include: { rubro: true, categoria: true }
    })
    if (!rubcat) return reply.code(404).send({ error: 'RubCat no encontrado' })
    return rubcat
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'create')]
  }, async (request, reply) => {
    const { id_cat, id_rub, cuenta, tipo, costo, clasificacion } = request.body
    if (!id_cat || !id_rub) return reply.code(400).send({ error: 'id_cat e id_rub son requeridos' })
    try {
      const rubcat = await fastify.db.rubCat.create({
        data: { id_cat, id_rub, cuenta, tipo, costo, clasificacion },
        include: { rubro: true, categoria: true }
      })
      return reply.code(201).send(rubcat)
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'La combinación rubro-categoría ya existe' })
      throw err
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'edit')]
  }, async (request, reply) => {
    const { cuenta, tipo, costo, clasificacion } = request.body
    try {
      const rubcat = await fastify.db.rubCat.update({
        where: { id: request.params.id },
        data: { cuenta, tipo, costo, clasificacion },
        include: { rubro: true, categoria: true }
      })
      return rubcat
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'RubCat no encontrado' })
      throw err
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.can('rubros', 'delete')]
  }, async (request, reply) => {
    try {
      await fastify.db.rubCat.delete({ where: { id: request.params.id } })
      return reply.code(204).send()
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'RubCat no encontrado' })
      throw err
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/rubcat.js
git commit -m "feat: add rubros, categorias and rubcat CRUD routes"
```

---

### Task 16: Seed de datos iniciales

**Files:**
- Create: `backend/prisma/seed.js`

- [ ] **Step 1: Crear seed.js**

Archivo `backend/prisma/seed.js`:

```javascript
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // ─── MÓDULOS ─────────────────────────────────────────────────────────
  const moduleNames = [
    'caja', 'caja_movimientos', 'pagos', 'proveedores',
    'rubros', 'categorias', 'usuarios', 'apps', 'locales'
  ]

  const modules = {}
  for (const nombre of moduleNames) {
    const m = await prisma.module.upsert({
      where: { nombre },
      update: {},
      create: { nombre }
    })
    modules[nombre] = m
  }
  console.log('✓ Módulos creados')

  // ─── ROLES ───────────────────────────────────────────────────────────
  const superAdminRole = await prisma.role.upsert({
    where: { nombre: 'super_admin' },
    update: {},
    create: { nombre: 'super_admin', descripcion: 'Acceso total al sistema' }
  })

  const adminRole = await prisma.role.upsert({
    where: { nombre: 'admin' },
    update: {},
    create: { nombre: 'admin', descripcion: 'Administrador de app y local' }
  })

  const cajeroRole = await prisma.role.upsert({
    where: { nombre: 'cajero' },
    update: {},
    create: { nombre: 'cajero', descripcion: 'Operador de caja' }
  })
  console.log('✓ Roles creados')

  // ─── PERMISOS POR ROL ─────────────────────────────────────────────────
  // super_admin: todo en todos los módulos
  for (const m of Object.values(modules)) {
    await prisma.rolePermission.upsert({
      where: { id_role_id_module: { id_role: superAdminRole.id, id_module: m.id } },
      update: {},
      create: {
        id_role: superAdminRole.id,
        id_module: m.id,
        can_view: true, can_create: true, can_edit: true, can_delete: true
      }
    })
  }

  // admin: view+create+edit en todo, delete solo en caja y movimientos
  const adminDeleteModules = ['caja', 'caja_movimientos']
  for (const [name, m] of Object.entries(modules)) {
    await prisma.rolePermission.upsert({
      where: { id_role_id_module: { id_role: adminRole.id, id_module: m.id } },
      update: {},
      create: {
        id_role: adminRole.id,
        id_module: m.id,
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: adminDeleteModules.includes(name)
      }
    })
  }

  // cajero: solo view+create en caja y movimientos
  const cajeroModules = ['caja', 'caja_movimientos']
  for (const [name, m] of Object.entries(modules)) {
    const isCajero = cajeroModules.includes(name)
    await prisma.rolePermission.upsert({
      where: { id_role_id_module: { id_role: cajeroRole.id, id_module: m.id } },
      update: {},
      create: {
        id_role: cajeroRole.id,
        id_module: m.id,
        can_view: isCajero,
        can_create: isCajero,
        can_edit: false,
        can_delete: false
      }
    })
  }
  console.log('✓ Permisos de roles creados')

  // ─── MÉTODOS DE PAGO ──────────────────────────────────────────────────
  const metodos = [
    'Efectivo', 'Tarjeta débito', 'Tarjeta crédito',
    'Transferencia', 'Mercado Pago', 'Cheque'
  ]
  for (const nombre of metodos) {
    await prisma.metodoPago.upsert({
      where: { nombre },
      update: {},
      create: { nombre }
    })
  }
  console.log('✓ Métodos de pago creados')

  // ─── USUARIO SUPER ADMIN ──────────────────────────────────────────────
  const password_hash = await bcrypt.hash('Admin2024!', 12)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@dcsmart.com' },
    update: {},
    create: {
      email: 'admin@dcsmart.com',
      nombre: 'Super Admin',
      password_hash
    }
  })

  // ─── APP Y LOCAL DE DEMOSTRACIÓN ──────────────────────────────────────
  const demoApp = await prisma.app.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { nombre: 'DCSmart Demo', slug: 'demo' }
  })

  let demoLocal = await prisma.local.findFirst({
    where: { nombre: 'Local Central', id_app: demoApp.id }
  })
  if (!demoLocal) {
    demoLocal = await prisma.local.create({
      data: { nombre: 'Local Central', id_app: demoApp.id }
    })
  }

  // Asignar super_admin a la app demo
  await prisma.userAppRole.upsert({
    where: { id_user_id_app: { id_user: adminUser.id, id_app: demoApp.id } },
    update: {},
    create: {
      id_user: adminUser.id,
      id_app: demoApp.id,
      id_role: superAdminRole.id
    }
  })

  console.log('✓ Usuario admin@dcsmart.com creado (password: Admin2024!)')
  console.log('✓ App y Local demo creados')
  console.log('\nSeed completado exitosamente.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Agregar script de seed en package.json**

En `backend/package.json` agregar bajo `"scripts"`:

```json
"db:seed": "node prisma/seed.js"
```

Y agregar al final del JSON (antes del `}`):

```json
"prisma": {
  "seed": "node prisma/seed.js"
}
```

- [ ] **Step 3: Ejecutar seed**

```bash
cd backend && node prisma/seed.js
```

Resultado esperado:
```
✓ Módulos creados
✓ Roles creados
✓ Permisos de roles creados
✓ Métodos de pago creados
✓ Usuario admin@dcsmart.com creado (password: Admin2024!)
✓ App y Local demo creados

Seed completado exitosamente.
```

- [ ] **Step 4: Verificar login con el usuario seed**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dcsmart.com","password":"Admin2024!"}'
```

Resultado esperado: `{"user":{...},"token":"eyJ..."}` con status 200.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/seed.js backend/package.json
git commit -m "feat: add seed data with roles, modules, metodos_pago and admin user"
```

---

### Task 17: Smoke test final del backend

- [ ] **Step 1: Iniciar el servidor**

```bash
cd backend && npm run dev
```

- [ ] **Step 2: Probar health endpoint**

```bash
curl http://localhost:3000/health
```

Resultado esperado: `{"status":"ok"}`

- [ ] **Step 3: Probar flujo completo de auth**

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dcsmart.com","password":"Admin2024!"}' | python -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Obtener perfil
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"

# Listar apps
curl http://localhost:3000/api/apps -H "Authorization: Bearer $TOKEN"

# Listar locales
curl http://localhost:3000/api/locales -H "Authorization: Bearer $TOKEN"
```

Resultado esperado: respuestas JSON válidas en todos los endpoints.

- [ ] **Step 4: Commit final de backend**

```bash
git add -A
git commit -m "feat: complete backend API implementation"
```

---

**Backend completo.** Continuar con `2026-06-04-dcsmart-frontend.md`.
