# DCSmart — Backoffice

Super app para gestión de restaurantes y administración de grupos gastronómicos.

**Última actualización:** 19 de junio de 2026 — sesión de desarrollo activa

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Vite + React (PWA) |
| Backend | Node.js + Fastify |
| Base de datos | PostgreSQL (Google Cloud SQL) |
| ORM | Prisma |
| Auth | Google OAuth + Email/Password + JWT |
| Estado (FE) | Zustand (con persistencia localStorage) |
| Diseño | Glassmorphism dark slate + gold — Montserrat font |

---

## Arrancar el proyecto

### Requisitos previos
- Node.js 20+
- Cloud SQL Auth Proxy corriendo (ver abajo)

### 1. Cloud SQL Auth Proxy (PRIMERO)

```bash
# Windows — debe estar corriendo antes de levantar el backend
.\cloud-sql-proxy.exe dc-smart-mvp:us-central1:dcsmart-mvp-insta --port 5432
```

### 2. Backend

```bash
cd backend
npm install
npm run dev        # http://localhost:3000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

---

## Usuarios de prueba

Todos usan la contraseña: **`admin1234`**

| Email | Nombre | Rol | Grupos |
|-------|--------|-----|--------|
| `superadmin@dcsmart.com` | Super Admin | Admin | 5 grupos (todos) |
| `admin.aldos@dcsmart.com` | Martina Torres | Admin | Grupo Aldos — todos los locales |
| `cajero.palermo@aldos.com` | Rodrigo Sánchez | Cajero | Grupo Aldos — solo Palermo |
| `cajero.recoleta@aldos.com` | Valentina Pérez | Cajero | Grupo Aldos — solo Recoleta |
| `admin.parrilla@dcsmart.com` | Lucas Fernández | Admin | La Parrilla del Sur — todos |
| `cajero.lomas@parrilla.com` | Sofía Gómez | Cajero | La Parrilla del Sur — solo Lomas |
| `admin.berlin@dcsmart.com` | Federico Álvarez | Admin | Café Berlín — todos |
| `admin.sushi@dcsmart.com` | Camila Rodríguez | Admin | Sushi Express — todos |
| `cajero.belgrano@sushi.com` | Mateo López | Cajero | Sushi Express — solo Belgrano |
| `admin.napoli@dcsmart.com` | Agustina Morales | Admin | Pizzería Napoli — todos |

**Casos útiles para testear:**
- `superadmin` → App Selector muestra grid con 5 cards
- `admin.aldos` → 1 solo grupo → auto-selecciona y va directo al dashboard
- `cajero.palermo` → 1 grupo, 1 local → todo auto-seleccionado

---

## Grupos y locales en la BD

| Grupo | Locales |
|-------|---------|
| Grupo Aldos | Palermo, Recoleta, Belgrano |
| La Parrilla del Sur | Lomas de Zamora, Quilmes |
| Café Berlín | San Telmo, Villa Crespo |
| Sushi Express | Belgrano, Microcentro |
| Pizzería Napoli | Caballito, Almagro |

---

## Estructura de permisos

| Rol | Ver | Crear | Editar | Eliminar |
|-----|-----|-------|--------|----------|
| admin | ✅ todo | ✅ todo | ✅ todo | ❌ |
| cajero | ✅ cajas/pagos | ✅ cajas | ❌ | ❌ |

Los permisos se almacenan en `role_permissions` (por rol) y se pueden sobreescribir individualmente en `user_permissions`.

---

## Lo que está hecho ✅

### Infraestructura
- [x] Cloud SQL (PostgreSQL 15) en `dc-smart-mvp:us-central1:dcsmart-mvp-insta`
- [x] Prisma ORM con schema completo (apps, locales, users, roles, cajas, pagos, proveedores, impuestos, etc.)
- [x] Migración inicial aplicada (`20260604193022_init`)
- [x] Seed de datos completo aplicado (`seed_dcsmart.sql`) con 5 grupos, 10 locales, 10 usuarios, pagos, cajas, proveedores, rubros, categorías

### Backend (Fastify)
- [x] Auth: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout`
- [x] **NUEVO** `GET /api/auth/my-apps` — retorna los grupos/apps del usuario con rol y locales disponibles
- [x] Cajas: CRUD completo (`GET /api/cajas`, `GET /api/cajas/:id`, `POST`, `PUT`, `DELETE`)
- [x] Pagos: CRUD completo
- [x] Proveedores: CRUD completo
- [x] Apps: CRUD (requiere permiso `apps.view`)
- [x] Locales: CRUD
- [x] Usuarios: CRUD admin
- [x] Sistema de permisos: `fastify.can(module, action)` decorator + `role_permissions` + `user_permissions`
- [x] JWT en header + cookie httpOnly

### Frontend (React + Vite)
- [x] Routing con React Router v6 y `ProtectedRoute`
- [x] **NUEVO** `ProtectedRoute` acepta prop `requireApp` — verifica token Y contexto de app activo
- [x] Zustand stores: `authStore` (user/token), `appStore` (activeApp/activeLocal), `uiStore` (notificaciones/sidebar)
- [x] **NUEVO** `authStore.logout()` limpia el contexto de app automáticamente

### Diseño — Auth flow (glassmorphism dark slate + gold)
- [x] **Página Login** (`/login`) — glassmorphism completo, animaciones fadeUp/shake, campo email+password, toggle contraseña, error banner, soporte Google OAuth opcional
- [x] **App Selector** (`/select-app`) — grid de cards con gradientes por grupo, badge de rol coloreado, contador de locales, animación staggered, auto-selección si 1 solo grupo
- [x] `auth.css` con sistema de tokens CSS completo (variables de color, blur, transiciones, animaciones)

### Flujo de navegación implementado
```
/login → autenticación exitosa
  └→ /select-app  (si el usuario tiene 2+ grupos)
      └→ /dashboard  (al seleccionar un grupo)
  └→ /dashboard   (si tiene 1 solo grupo → auto-selección)

/dashboard → sidebar muestra grupo activo + selector de local
  └→ "Cambiar grupo" → limpia contexto → /select-app
```

### Sidebar funcional
- [x] Muestra el nombre del grupo activo
- [x] Selector de local (dropdown) si hay múltiples locales en el grupo
- [x] Botón "Cambiar grupo" que vuelve al App Selector
- [x] Logout con limpieza de contexto

---

## Lo que falta / próximos pasos 🔲

### Diseño — vistas internas (sin diseño aún)
Las vistas internas del dashboard todavía usan estilos placeholder (fondo blanco, tablas básicas). Falta aplicar el design system glassmorphism a:

- [ ] **Layout / Sidebar** — rediseño completo con el sistema dark slate + gold (actualmente es azul básico)
- [ ] **Dashboard home** — métricas, gráficos, resumen del período
- [ ] **Cajas** — listado con filtros, detalle de turno, movimientos
- [ ] **Pagos** — listado con filtros por estado/período/proveedor, formulario de carga
- [ ] **Proveedores** — listado, formulario, vista detalle
- [ ] **Admin: Usuarios** — tabla de usuarios, asignación de roles
- [ ] **Admin: Apps/Grupos** — gestión de grupos y locales

### Funcionalidades pendientes
- [ ] **Filtrado por local activo** — todas las queries de cajas/pagos deben filtrar por `activeLocal.id` cuando hay un local seleccionado (actualmente muestran todo)
- [ ] **Dashboard métricas reales** — conectar con datos de cajas y pagos de la BD
- [ ] **Formulario de caja** — apertura/cierre de turno, carga de movimientos
- [ ] **Formulario de pagos** — carga completa con impuestos, adjuntos (foto/PDF)
- [ ] **Google OAuth** — configurar `VITE_GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_ID` en .env para activarlo
- [ ] **Paginación** — todas las listas grandes necesitan paginación o scroll infinito
- [ ] **Búsqueda y filtros** — buscar proveedores, filtrar pagos por fecha/estado/proveedor
- [ ] **Upload de archivos** — fotos de cajas y PDFs de pagos (falta storage en GCS o similar)
- [ ] **Responsive / mobile** — el layout del dashboard no está adaptado a pantallas chicas
- [ ] **PWA** — service worker y manifest para instalación offline (Vite PWA plugin está incluido pero sin configurar)
- [ ] **Tests** — no hay tests unitarios ni e2e

### Deuda técnica
- [ ] El sidebar usa estilos inline hardcodeados (azul `#1e40af`) — necesita ser refactorizado con el design system
- [ ] No hay manejo de errores global en el frontend (solo notificaciones básicas por store)
- [ ] Las queries de Prisma en el backend no tienen paginación implementada
- [ ] Falta validación de inputs con Zod o similar en el backend

---

## Estructura de archivos relevante

```
dcsmart/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js          # Login, Google OAuth, /me, /my-apps
│   │   │   ├── apps.js          # CRUD grupos
│   │   │   ├── locales.js       # CRUD locales
│   │   │   ├── cajas.js         # CRUD cajas + movimientos
│   │   │   ├── pagos.js         # CRUD pagos + impuestos
│   │   │   ├── proveedores.js   # CRUD proveedores
│   │   │   └── users.js         # CRUD usuarios (admin)
│   │   ├── plugins/
│   │   │   ├── db.js            # Prisma client
│   │   │   └── auth.js          # JWT + permisos decorator
│   │   └── index.js
│   └── prisma/
│       └── schema.prisma
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── auth.css         # Design system auth + selector
│       │   ├── Login.jsx        # Página de login glassmorphism
│       │   ├── AppSelector.jsx  # Selector de grupo glassmorphism ← NUEVO
│       │   ├── Dashboard.jsx    # Home (placeholder)
│       │   ├── cajas/           # CajaList, CajaDetail
│       │   ├── pagos/           # PagoList, PagoForm
│       │   ├── proveedores/     # ProveedorList, ProveedorForm
│       │   └── admin/           # Users, Apps, Locales
│       ├── components/
│       │   ├── ProtectedRoute.jsx  # Guard con requireApp prop ← ACTUALIZADO
│       │   ├── Layout.jsx
│       │   └── Sidebar.jsx         # Con selector de local ← ACTUALIZADO
│       ├── store/
│       │   ├── authStore.js     # user/token + logout limpia app context
│       │   ├── appStore.js      # activeApp/activeLocal
│       │   └── uiStore.js
│       └── api/
│           ├── auth.js          # myApps() ← NUEVO
│           ├── client.js        # Axios con JWT interceptor
│           └── ...
└── seed_dcsmart.sql             # Datos de prueba completos
```

---

## Arrancar Cloud SQL Proxy (Windows)

```powershell
# Desde la raíz del proyecto o donde tengas el ejecutable
.\cloud-sql-proxy.exe dc-smart-mvp:us-central1:dcsmart-mvp-insta --port 5432
```

El proxy debe estar corriendo antes de iniciar el backend. Sin él, Prisma no puede conectarse a la BD.
