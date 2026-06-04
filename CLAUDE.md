# DCSmart — Instrucciones para Claude Code

Este archivo guía a Claude Code en la construcción completa del proyecto DCSmart desde cero.

## Stack
- **Frontend**: Vite + React (PWA)
- **Backend**: Node.js + Fastify
- **Base de datos**: PostgreSQL (Google Cloud SQL)
- **ORM**: Prisma
- **Auth**: Google OAuth + Email/Password con JWT

## Estructura del proyecto

```
dcsmart/
├── CLAUDE.md              ← este archivo
├── .env.example           ← variables de entorno necesarias
├── backend/
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma  ← esquema completo de la DB
│   └── src/
│       ├── server.js          ← entry point Fastify
│       ├── plugins/
│       │   ├── db.js          ← conexión Prisma
│       │   ├── auth.js        ← JWT + Google OAuth
│       │   └── cors.js
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
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   └── manifest.json      ← PWA manifest
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── sw.js              ← service worker
        ├── api/               ← llamadas al backend
        ├── components/
        ├── pages/
        └── store/             ← estado global (Zustand)

```

---

## PASO 1 — Inicializar el backend

```bash
cd backend
npm init -y
npm install fastify @fastify/cors @fastify/jwt @fastify/cookie \
  @prisma/client prisma dotenv bcryptjs \
  google-auth-library uuid
npm install -D nodemon
npx prisma init
```

Luego copiar el schema de `prisma/schema.prisma` (ver PASO 3).

---

## PASO 2 — Inicializar el frontend

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install axios zustand react-router-dom @vitejs/plugin-react
npm install -D vite-plugin-pwa
```

---

## PASO 3 — Schema de Prisma (base de datos completa)

Archivo: `backend/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// ESTRUCTURA ORGANIZACIONAL
// ─────────────────────────────────────────

model App {
  id          String   @id @default(uuid())
  nombre      String
  slug        String   @unique
  activo      Boolean  @default(true)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  locales       Local[]
  user_app_roles UserAppRole[]

  @@map("apps")
}

model Local {
  id          String   @id @default(uuid())
  nombre      String
  direccion   String?
  telefono    String?
  activo      Boolean  @default(true)
  id_app      String
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  app           App           @relation(fields: [id_app], references: [id])
  cajas         Caja[]
  pagos         Pago[]
  user_app_roles UserAppRole[]

  @@map("locales")
}

// ─────────────────────────────────────────
// USUARIOS, ROLES Y PERMISOS
// ─────────────────────────────────────────

model User {
  id             String   @id @default(uuid())
  email          String   @unique
  nombre         String
  password_hash  String?  // null si solo usa Google OAuth
  google_id      String?  @unique
  avatar_url     String?
  activo         Boolean  @default(true)
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt

  user_app_roles    UserAppRole[]
  user_permissions  UserPermission[]
  cajas_creadas     Caja[]           @relation("CajaCreatedBy")
  pagos_creados     Pago[]           @relation("PagoCreatedBy")
  pagos_auditados   Pago[]           @relation("PagoAuditBy")

  @@map("users")
}

// Roles base del sistema
model Role {
  id          String  @id @default(uuid())
  nombre      String  @unique // super_admin | admin | cajero
  descripcion String?

  user_app_roles   UserAppRole[]
  role_permissions RolePermission[]

  @@map("roles")
}

// Módulos del sistema (caja, pagos, proveedores, etc.)
model Module {
  id          String  @id @default(uuid())
  nombre      String  @unique // caja | pagos | proveedores | rubros | usuarios
  descripcion String?
  activo      Boolean @default(true)

  role_permissions RolePermission[]
  user_permissions UserPermission[]

  @@map("modules")
}

// Permisos por defecto de cada rol en cada módulo
model RolePermission {
  id        String @id @default(uuid())
  id_role   String
  id_module String
  can_view   Boolean @default(false)
  can_create Boolean @default(false)
  can_edit   Boolean @default(false)
  can_delete Boolean @default(false)

  role   Role   @relation(fields: [id_role], references: [id])
  module Module @relation(fields: [id_module], references: [id])

  @@unique([id_role, id_module])
  @@map("role_permissions")
}

// Asignación de usuario a app, con rol y acceso opcional a local específico
// Si id_local es null, tiene acceso a todos los locales de la app
model UserAppRole {
  id       String  @id @default(uuid())
  id_user  String
  id_app   String
  id_role  String
  id_local String? // null = acceso a todos los locales de la app

  user  User  @relation(fields: [id_user], references: [id])
  app   App   @relation(fields: [id_app], references: [id])
  role  Role  @relation(fields: [id_role], references: [id])
  local Local? @relation(fields: [id_local], references: [id])

  @@unique([id_user, id_app])
  @@map("user_app_roles")
}

// Overrides de permisos por usuario (sobreescribe los del rol)
model UserPermission {
  id        String  @id @default(uuid())
  id_user   String
  id_module String
  can_view   Boolean @default(false)
  can_create Boolean @default(false)
  can_edit   Boolean @default(false)
  can_delete Boolean @default(false)

  user   User   @relation(fields: [id_user], references: [id])
  module Module @relation(fields: [id_module], references: [id])

  @@unique([id_user, id_module])
  @@map("user_permissions")
}

// ─────────────────────────────────────────
// TABLAS GLOBALES (compartidas entre grupos)
// ─────────────────────────────────────────

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
  id             String  @id @default(uuid())
  id_cat         String
  id_rub         String
  cuenta         String?
  tipo           String?
  costo          String?
  clasificacion  String?

  categoria  Categoria    @relation(fields: [id_cat], references: [id])
  rubro      Rubro        @relation(fields: [id_rub], references: [id])
  pagos      Pago[]
  proveedores Proveedor[]

  @@unique([id_cat, id_rub])
  @@map("rubcat")
}

model Proveedor {
  id             String   @id @default(uuid())
  nombre         String
  razon_social   String?
  cuit           String?
  banco          String?
  cbu            String?
  alias          String?
  direccion_url  String?
  detalle_direc  String?
  telefono       String?
  mail_contacto  String?
  mail_envio     String?
  tag            String?
  id_rubcat      String?
  activo         Boolean  @default(true)
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt

  rubcat  RubCat? @relation(fields: [id_rubcat], references: [id])
  pagos   Pago[]

  @@map("proveedores")
}

model MetodoPago {
  id     String @id @default(uuid())
  nombre String @unique
  activo Boolean @default(true)

  caja_movimientos CajaMovimiento[]
  pagos            Pago[]

  @@map("metodos_pago")
}

// ─────────────────────────────────────────
// TABLAS OPERATIVAS
// ─────────────────────────────────────────

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

  local      Local            @relation(fields: [id_local], references: [id])
  creador    User?            @relation("CajaCreatedBy", fields: [created_by], references: [id])
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
  id          String  @id @default(uuid())
  tipo        String
  id_metodo   String?
  monto       Decimal @db.Decimal(12, 2)
  id_caja     String
  cantidad    Int?

  caja        Caja        @relation(fields: [id_caja], references: [id])
  metodo_pago MetodoPago? @relation(fields: [id_metodo], references: [id])

  @@map("caja_movimientos")
}

model Pago {
  id            String    @id @default(uuid())
  nro_ord       Int?
  fecha         DateTime?
  id_proveedor  String?
  id_rubcat     String?
  id_tipo       TipoPago?
  pv            Int?
  nro           Int?
  importe_neto  Decimal?  @db.Decimal(12, 2)
  descuento     Decimal?  @db.Decimal(12, 2)
  importe       Decimal?  @db.Decimal(12, 2)
  id_metodo     String?
  cashflow      DateTime?
  observaciones String?
  audit         Boolean   @default(false)
  user_audit    String?
  audit_date    DateTime?
  pagado        Boolean   @default(false)
  fecha_pago    DateTime?
  estado_op     EstadoOp?
  foto_url      String?
  pdf_url       String?
  periodo       DateTime?
  ingresa_egreso Boolean  @default(true) // true = ingreso, false = egreso
  id_local      String?
  created_by    String?
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt

  // Relaciones futuras (nullable por ahora)
  id_pdp      String?
  id_eventos  String?
  id_cheque   String?
  id_ctacte   String?

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
  id       String      @id @default(uuid())
  id_pago  String
  tipo     TipoImpuesto
  monto    Decimal     @db.Decimal(12, 2)

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

---

## PASO 4 — Variables de entorno

Archivo: `.env` (basado en `.env.example`)

```env
# Base de datos (Google Cloud SQL via Cloud SQL Auth Proxy)
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dcsmart?schema=public"

# JWT
JWT_SECRET=cambiar_por_secreto_seguro
JWT_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=tu_google_client_id
GOOGLE_CLIENT_SECRET=tu_google_client_secret

# App
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

---

## PASO 5 — Servidor Fastify (backend/src/server.js)

```javascript
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import 'dotenv/config'

import dbPlugin from './plugins/db.js'
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

// Plugins
await app.register(cors, {
  origin: process.env.FRONTEND_URL,
  credentials: true
})
await app.register(jwt, { secret: process.env.JWT_SECRET })
await app.register(cookie)
await app.register(dbPlugin)

// Auth decorator — verifica JWT en rutas protegidas
app.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.send(err)
  }
})

// Routes
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(appsRoutes, { prefix: '/api/apps' })
await app.register(localesRoutes, { prefix: '/api/locales' })
await app.register(usersRoutes, { prefix: '/api/users' })
await app.register(cajaRoutes, { prefix: '/api/cajas' })
await app.register(cajaMoveRoutes, { prefix: '/api/caja-movimientos' })
await app.register(pagosRoutes, { prefix: '/api/pagos' })
await app.register(proveedoresRoutes, { prefix: '/api/proveedores' })
await app.register(rubcatRoutes, { prefix: '/api/rubcat' })

// Start
try {
  await app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
```

---

## PASO 6 — Plugin de base de datos (backend/src/plugins/db.js)

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

---

## PASO 7 — Auth (backend/src/routes/auth.js)

Implementar los siguientes endpoints:

- `POST /api/auth/register` — email + password
- `POST /api/auth/login` — email + password → devuelve JWT
- `POST /api/auth/google` — recibe token de Google → verifica con google-auth-library → crea o loguea usuario → devuelve JWT
- `GET  /api/auth/me` — devuelve usuario actual (requiere JWT)
- `POST /api/auth/logout` — limpia cookie

Reglas:
- Passwords hasheados con `bcryptjs` (salt rounds: 12)
- JWT en header Authorization: Bearer + también en cookie httpOnly para PWA
- Al loguear con Google: si el email ya existe en DB sin google_id, asociar la cuenta automáticamente

---

## PASO 8 — Middleware de permisos

Crear `backend/src/plugins/permissions.js`:

```javascript
// Decorator que verifica si el usuario puede realizar una acción en un módulo
// Lógica:
// 1. Buscar UserPermission del usuario para el módulo → si existe, usar esos valores
// 2. Si no existe override, buscar RolePermission del rol del usuario para el módulo
// 3. Si no tiene permiso, responder 403

// Uso en rutas:
// fastify.get('/ruta', {
//   preHandler: [fastify.authenticate, fastify.can('pagos', 'view')]
// }, handler)
```

---

## PASO 9 — Seed inicial (backend/prisma/seed.js)

Crear datos iniciales:

```javascript
// 1. Roles base
//    - super_admin: todos los permisos en todos los módulos
//    - admin: view + create + edit en todos; delete solo en caja y movimientos
//    - cajero: view + create solo en módulos caja

// 2. Módulos
//    - caja, caja_movimientos, pagos, proveedores, rubros, categorias, usuarios, apps, locales

// 3. Métodos de pago iniciales
//    - Efectivo, Tarjeta débito, Tarjeta crédito, Transferencia, Mercado Pago, Cheque

// 4. Usuario super_admin inicial
//    - email: admin@dcsmart.com / password: cambiar en primer login
```

Ejecutar con: `npx prisma db seed`

---

## PASO 10 — Frontend PWA (frontend/vite.config.js)

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'DCSmart',
        short_name: 'DCSmart',
        theme_color: '#ffffff',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache' }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
```

---

## PASO 11 — Estructura de páginas frontend

```
src/pages/
├── Login.jsx          ← email/password + botón Google
├── Dashboard.jsx      ← home por app/local
├── cajas/
│   ├── CajaList.jsx
│   └── CajaDetail.jsx
├── pagos/
│   ├── PagoList.jsx
│   └── PagoForm.jsx
├── proveedores/
│   ├── ProveedorList.jsx
│   └── ProveedorForm.jsx
├── admin/
│   ├── Users.jsx
│   ├── Apps.jsx
│   └── Locales.jsx
└── NotFound.jsx
```

---

## PASO 12 — Estado global (frontend/src/store/)

Usar **Zustand**:

```
store/
├── authStore.js      ← usuario, token, login/logout actions
├── appStore.js       ← app activa, local activo
└── uiStore.js        ← sidebar, modales, notificaciones
```

---

## PASO 13 — Conexión a Cloud SQL (cuando esté lista la instancia)

1. Instalar Cloud SQL Auth Proxy:
   ```bash
   curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.6.1/cloud-sql-proxy.linux.amd64
   chmod +x cloud-sql-proxy
   ```

2. Ejecutar proxy:
   ```bash
   ./cloud-sql-proxy PROJECT:REGION:INSTANCE --port 5432
   ```

3. Actualizar `DATABASE_URL` en `.env` con las credenciales reales.

4. Correr migraciones:
   ```bash
   cd backend
   npx prisma migrate deploy
   npx prisma db seed
   ```

---

## Orden de ejecución para Claude Code

1. Crear estructura de carpetas
2. Inicializar backend (PASO 1)
3. Inicializar frontend (PASO 2)
4. Crear `schema.prisma` completo (PASO 3)
5. Crear `.env.example` (PASO 4)
6. Implementar servidor Fastify (PASO 5)
7. Implementar plugin DB (PASO 6)
8. Implementar rutas auth (PASO 7)
9. Implementar middleware permisos (PASO 8)
10. Implementar todas las rutas CRUD del backend
11. Crear seed (PASO 9)
12. Configurar frontend PWA (PASO 10)
13. Implementar páginas y store (PASOS 11-12)

---

## Convenciones de código

- ESModules (`import/export`) en todo el proyecto
- `async/await` siempre, nunca callbacks
- Rutas protegidas por defecto — las públicas son la excepción
- Errores siempre con código HTTP correcto (400, 401, 403, 404, 500)
- Todos los IDs son UUID v4
- Timestamps en UTC
- Decimales monetarios con 2 decimales (`Decimal(12,2)`)
- Nombres de tablas en plural y snake_case
- Nombres de campos en snake_case
