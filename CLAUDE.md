# DCSmart — Instrucciones para Claude Code

Este archivo guía a Claude Code en la construcción completa del proyecto DCSmart desde cero.

## Stack
- **Frontend**: Vite + React (PWA)
- **Backend**: Node.js + Fastify
- **Base de datos**: PostgreSQL (Google Cloud SQL)
- **ORM**: Prisma
- **Auth**: Google OAuth + Email/Password con JWT

## Deploy y CI/CD

- **Branches**: `DEV-XX` desde `dev` → PR a `dev` → (cuando se decide hacer un release) merge de `dev` a `master`. **Verificar siempre el base branch de un PR antes de mergear** (`gh pr view <N> --json baseRefName`); hubo un caso donde un PR terminó apuntando a `master` por error.
- **`master` = producción real.** No pushear ni mergear ahí sin confirmación explícita del usuario.
- **Un solo backend en Cloud Run**: tanto `.github/workflows/deploy-dev.yml` (branch `dev`) como `deploy.yml` (branch `master`) despliegan al **mismo** servicio `dcsmart-backend` en Cloud Run, proyecto `dc-smart-mvp`. No hay backend separado para dev — un push a `dev` redeploya el backend de producción también. Solo el frontend tiene canales separados (Firebase Hosting: canal `dev` preview vs canal `live`).
- **Firebase Hosting CI usa cuenta de servicio**, no `--token` (deprecado y con bug real: causaba 400 "is the current active version" al liberar versiones en canales preview). Autenticación vía `google-github-actions/auth@v2` + `GOOGLE_APPLICATION_CREDENTIALS`, con la cuenta `github-actions-deploy@dc-smart-mvp.iam.gserviceaccount.com` (tiene rol `roles/firebasehosting.admin`).
- **Canales preview cambian de URL** al recrearse (sufijo aleatorio tipo `dev-telejp8n`). Por eso: (1) el backend acepta CORS de cualquier `*.web.app` vía regex, no un origen fijo; (2) el build de `dev` inyecta `VITE_API_URL` apuntando directo al backend de Cloud Run, porque el rewrite `/api/**` de `firebase.json` solo funciona en el canal `live`, no en canales preview.
- **`prisma db push` pendiente** — el modelo `MultiMoneda` (agregado en DEV-05) existe en `schema.prisma` pero puede no estar aplicado en la base real. Verificar antes de asumir que las rutas `fastify.db.multiMoneda.*` funcionan en producción.

## Estructura del proyecto

```
dcsmart/
├── CLAUDE.md              ← este archivo
├── .env.example           ← variables de entorno necesarias
├── backend/
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma  ← esquema completo de la DB (fuente autoritativa)
│   │   └── seed.js        ← seed de roles, módulos, métodos de pago, usuarios de prueba
│   └── src/
│       ├── server.js          ← entry point Fastify
│       ├── plugins/
│       │   ├── db.js          ← conexión Prisma
│       │   ├── permissions.js ← middleware can() y requireSuperAdmin
│       │   └── appContext.js  ← middleware X-App-Id, rol efectivo, locales permitidos
│       └── routes/
│           ├── auth.js
│           ├── apps.js
│           ├── locales.js
│           ├── users.js
│           ├── roles.js
│           ├── caja.js
│           ├── caja_movimientos.js
│           ├── caja_detalles.js
│           ├── detalle_tipos.js
│           ├── pagos.js
│           ├── proveedores.js
│           ├── rubcat.js
│           ├── metodos_pago.js
│           └── impuestos.js
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   └── manifest.json      ← PWA manifest
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/               ← llamadas al backend
        ├── lib/               ← utilidades (clasificaciones, etc.)
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

Ver archivo autoritativo: `backend/prisma/schema.prisma`

Resumen de modelos:
- **Estructura:** App, Local
- **Auth/Permisos:** User, Role, Module, UserAppRole, UserLocalAccess, RolePermission, UserPermission
- **Globales:** Rubro, Categoria, RubCat, Proveedor, MetodoPago
- **Caja:** Caja, CajaMovimiento, DetalleTipo, CajaDetalle
- **Pagos:** Pago, Impuesto, Audit

Enums:
- `Origin`: DCSMART, TAPTAP, FFUDO
- `TipoMovimiento`: INICIAL, INGRESO, GASTO, COBRO, RETIRO, VACIADO
- `TipoPago`: A, B, C, CM, DC_1, DC_2, DDJJ, M, NCA, NDA, STK
- `EstadoOp`: CAJA, CUENTA_CTE, MP_PDP, PDP
- `TipoImpuesto`: IVA21, IVA27, IVA10, RETENCION, PERCEPCION

Roles: super_admin (global), dcsmart (global), admin (scoped a app), cajero (scoped a app+local)

Auditoría de pagos: se gestiona en la tabla `audits` (genérica), no como columna del pago.

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
