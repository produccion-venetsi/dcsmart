# Zonas separadas: Admin global + permiso de Reportes independiente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar "Administrar" en una zona global (sin depender de elegir un grupo/local) y hacer que el acceso a Reportes dependa de un permiso real e independiente del de Cajas, asignable por usuario — sin que ningún rol existente pierda el acceso que ya tiene hoy (salvo el cambio explícito: `admin` deja de ver Reportes automático).

**Architecture:** Backend: un módulo `reportes` nuevo en el sistema de permisos ya existente (`Module`/`RolePermission`/`UserPermission`), con dos endpoints nuevos para gestionar el permiso individual, y `GET /my-apps` exponiendo el permiso ya resuelto (`can_reportes`) para que el frontend no reimplemente la lógica. Frontend: `ProtectedRoute` gana tres formas nuevas de evaluar acceso (por rol global, por permiso de reportes, excluyendo un rol) además de las que ya tenía, y una pantalla nueva de elección post-login para usuarios con rol global.

**Tech Stack:** Fastify + Prisma (backend), React + React Router (frontend).

## Global Constraints

- ESModules, `async/await` siempre, nunca callbacks.
- **Ningún rol existente pierde el acceso que ya tiene hoy**, salvo el único cambio explícito: el rol `admin` deja de tener `reportes: view` automático (pasa a ser un permiso individual, otorgable por usuario).
- `super_admin` y `dcsmart` mantienen acceso automático a Reportes.
- Cambiar la matriz de permisos (`backend/prisma/seed.js`) y correr `node prisma/seed.js` contra la base real requiere confirmación explícita del usuario, en el momento — no asumida de la aprobación del spec. El propio `seed.js` es idempotente (usa `upsert` en todo), así que correrlo no destruye datos existentes, pero de todas formas es un cambio de datos de producción y requiere el mismo cuidado que cualquier otro en este proyecto.
- No se agregan tests automatizados (el proyecto no tiene suite) — verificación manual vía build + curl contra la base real + inspección visual.
- No se crea un editor de permisos genérico — el alcance de la UI nueva es únicamente el toggle "Puede ver Reportes".

---

### Task 1: Backend — módulo y rol `reportes` en la matriz de permisos

**Files:**
- Modify: `backend/prisma/seed.js`

**Interfaces:**
- Produces: fila `reportes` en la tabla `modules`; rol `reportes` en la tabla `roles`; `RolePermission` actualizado para `super_admin`, `dcsmart`, `admin`, `cajero`, `reportes` — consumido por la Task 2 (que empieza a validar contra el módulo `reportes`) y por cualquier asignación futura de este rol vía Admin → Usuarios (ya existente, sin cambios de código ahí).

- [ ] **Step 1: Agregar el módulo `reportes` a la lista de módulos**

En `backend/prisma/seed.js`, buscar:

```javascript
const MODULES = [
  'caja', 'caja_movimientos', 'pagos', 'proveedores',
  'rubros', 'categorias', 'metodos_pago', 'usuarios', 'apps', 'locales'
]
```

Reemplazar por:

```javascript
const MODULES = [
  'caja', 'caja_movimientos', 'pagos', 'proveedores',
  'rubros', 'categorias', 'metodos_pago', 'usuarios', 'apps', 'locales', 'reportes'
]
```

- [ ] **Step 2: Actualizar la matriz — preservar acceso actual + agregar el rol `reportes`**

Buscar el objeto `MATRIX` completo:

```javascript
const MATRIX = {
  super_admin: {
    caja: [T,T,T,T], caja_movimientos: [T,T,T,T], pagos: [T,T,T,T],
    proveedores: [T,T,T,T], rubros: [T,T,T,T], categorias: [T,T,T,T],
    metodos_pago: [T,T,T,T], usuarios: [T,T,T,T], apps: [T,T,T,T], locales: [T,T,T,T],
  },
  dcsmart: {
    // Operación total — gestiona datos de todos los grupos pero NO administra la estructura
    // (no crea/edita/borra apps ni locales, eso es responsabilidad del super_admin)
    caja: [T,T,T,T], caja_movimientos: [T,T,T,T], pagos: [T,T,T,T],
    proveedores: [T,T,T,T], rubros: [T,F,F,F], categorias: [T,F,F,F],
    metodos_pago: [T,T,T,T], usuarios: [F,F,F,F], apps: [T,F,F,F], locales: [T,F,F,F],
  },
  admin: {
    caja: [T,T,T,F], caja_movimientos: [T,T,T,F], pagos: [T,T,T,F],
    proveedores: [T,T,T,F], rubros: [T,F,F,F], categorias: [T,F,F,F],
    metodos_pago: [T,F,F,F], usuarios: [F,F,F,F], apps: [F,F,F,F], locales: [F,F,F,F],
  },
  cajero: {
    caja: [T,T,F,F], caja_movimientos: [T,T,F,F], pagos: [T,T,F,F],
    proveedores: [T,F,F,F], rubros: [T,F,F,F], categorias: [T,F,F,F],
    metodos_pago: [T,F,F,F], usuarios: [F,F,F,F], apps: [F,F,F,F], locales: [F,F,F,F],
  },
}
```

Reemplazar por (agrega `reportes: [...]` a los 4 roles existentes — `dcsmart` en `[T,F,F,F]` para preservar su acceso automático, `admin`/`cajero` en `[F,F,F,F]` porque `admin` pasa a depender del permiso individual y `cajero` nunca tuvo Reportes — y agrega el rol nuevo `reportes`, sin acceso a ningún otro módulo):

```javascript
const MATRIX = {
  super_admin: {
    caja: [T,T,T,T], caja_movimientos: [T,T,T,T], pagos: [T,T,T,T],
    proveedores: [T,T,T,T], rubros: [T,T,T,T], categorias: [T,T,T,T],
    metodos_pago: [T,T,T,T], usuarios: [T,T,T,T], apps: [T,T,T,T], locales: [T,T,T,T],
    reportes: [T,T,T,T],
  },
  dcsmart: {
    // Operación total — gestiona datos de todos los grupos pero NO administra la estructura
    // (no crea/edita/borra apps ni locales, eso es responsabilidad del super_admin)
    caja: [T,T,T,T], caja_movimientos: [T,T,T,T], pagos: [T,T,T,T],
    proveedores: [T,T,T,T], rubros: [T,F,F,F], categorias: [T,F,F,F],
    metodos_pago: [T,T,T,T], usuarios: [F,F,F,F], apps: [T,F,F,F], locales: [T,F,F,F],
    reportes: [T,F,F,F],
  },
  admin: {
    caja: [T,T,T,F], caja_movimientos: [T,T,T,F], pagos: [T,T,T,F],
    proveedores: [T,T,T,F], rubros: [T,F,F,F], categorias: [T,F,F,F],
    metodos_pago: [T,F,F,F], usuarios: [F,F,F,F], apps: [F,F,F,F], locales: [F,F,F,F],
    // Reportes deja de ser automático para admin: pasa a ser un permiso
    // individual, otorgable por usuario desde Admin → Usuarios (Task 7).
    reportes: [F,F,F,F],
  },
  cajero: {
    caja: [T,T,F,F], caja_movimientos: [T,T,F,F], pagos: [T,T,F,F],
    proveedores: [T,F,F,F], rubros: [T,F,F,F], categorias: [T,F,F,F],
    metodos_pago: [T,F,F,F], usuarios: [F,F,F,F], apps: [F,F,F,F], locales: [F,F,F,F],
    reportes: [F,F,F,F],
  },
  reportes: {
    // Rol restringido: solo ve Reportes, nada más.
    caja: [F,F,F,F], caja_movimientos: [F,F,F,F], pagos: [F,F,F,F],
    proveedores: [F,F,F,F], rubros: [F,F,F,F], categorias: [F,F,F,F],
    metodos_pago: [F,F,F,F], usuarios: [F,F,F,F], apps: [F,F,F,F], locales: [F,F,F,F],
    reportes: [T,F,F,F],
  },
}
```

- [ ] **Step 3: Agregar la descripción del rol nuevo**

Buscar:

```javascript
const ROLE_DESC = {
  super_admin: 'Acceso total al sistema',
  dcsmart:     'Operación total salvo gestión de usuarios y tabla rubcat',
  admin:       'Crea y edita datos operativos (sin borrar) de su app/locales',
  cajero:      'Ve y crea cajas y pagos de un local',
}
```

Reemplazar por:

```javascript
const ROLE_DESC = {
  super_admin: 'Acceso total al sistema',
  dcsmart:     'Operación total salvo gestión de usuarios y tabla rubcat',
  admin:       'Crea y edita datos operativos (sin borrar) de su app/locales',
  cajero:      'Ve y crea cajas y pagos de un local',
  reportes:    'Solo ve Reportes, sin acceso a Cajas/Pagos/Proveedores',
}
```

- [ ] **Step 4: DETENERSE — pedir confirmación antes de correr el seed contra la base real**

Este paso NO se ejecuta automáticamente. Reportar el estado con status `NEEDS_CONTEXT` y este mensaje exacto para que el controlador se lo traslade al usuario antes de continuar:

> "Necesito correr `node prisma/seed.js` contra la base real para agregar el módulo `reportes`, el rol `reportes`, y actualizar la matriz de permisos (el único cambio de comportamiento es que el rol `admin` deja de ver Reportes automático — el resto de los roles no pierde nada). El script es idempotente (usa upsert en todo). ¿Confirmás que lo corra contra la base de producción?"

Solo continuar con el Step 5 si el controlador confirma que el usuario dio el OK explícito en este momento de la ejecución.

- [ ] **Step 5: Correr el seed (solo tras la confirmación del Step 4)**

Run (desde `backend/`, con el Cloud SQL Auth Proxy corriendo): `node prisma/seed.js`
Expected: en la salida, la línea `✓ Módulos:` debe incluir `reportes`, y la línea `✓ Roles y permisos aplicados` debe mencionar los 5 roles (o seguir diciendo los 4 de siempre — no imprime la lista real, solo confirmar que no tira error).

- [ ] **Step 6: Verificar en vivo contra la base real**

```bash
cd backend
cat > check_matrix_tmp.mjs << 'EOF'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const modules = await db.module.findMany({ where: { nombre: 'reportes' } })
console.log('Módulo reportes existe:', modules.length === 1)
const roles = await db.role.findMany({
  include: { role_permissions: { include: { module: true } } },
  orderBy: { nombre: 'asc' }
})
for (const r of roles) {
  const rp = r.role_permissions.find(x => x.module.nombre === 'reportes')
  console.log(`${r.nombre}: reportes.can_view = ${rp?.can_view ?? '(sin fila)'}`)
}
await db.$disconnect()
EOF
node check_matrix_tmp.mjs
rm check_matrix_tmp.mjs
```
Expected: `Módulo reportes existe: true`; `super_admin: reportes.can_view = true`; `dcsmart: reportes.can_view = true`; `admin: reportes.can_view = false`; `cajero: reportes.can_view = false`; `reportes: reportes.can_view = true`.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/seed.js
git commit -m "feat(permisos): modulo y rol reportes, admin deja de verlo automatico"
```

---

### Task 2: Backend — Reportes valida su propio módulo

**Files:**
- Modify: `backend/src/routes/reportes.js`

**Interfaces:**
- Consumes: módulo `reportes` (Task 1, ya aplicado a la base real).

- [ ] **Step 1: Cambiar el módulo validado**

En `backend/src/routes/reportes.js`, buscar:

```javascript
  const viewHandler = [fastify.authenticate, fastify.appContext, fastify.can('caja', 'view')]
```

Reemplazar por:

```javascript
  const viewHandler = [fastify.authenticate, fastify.appContext, fastify.can('reportes', 'view')]
```

- [ ] **Step 2: Verificar en vivo contra la base real**

Con el backend corriendo y un token de un usuario `dcsmart` o `super_admin` (que sí tienen `reportes: view` según la Task 1):

```bash
curl -s "http://localhost:3000/api/reportes/cajas?desde=2020-01-01&hasta=2027-12-31" \
  -H "Authorization: Bearer <token>" -H "X-App-Id: <app_id>" -o /dev/null -w "status: %{http_code}\n"
```
Expected: `status: 200`.

Con un token de un usuario `admin` (que ahora NO tiene `reportes: view` por defecto, tras la Task 1):

```bash
curl -s "http://localhost:3000/api/reportes/cajas?desde=2020-01-01&hasta=2027-12-31" \
  -H "Authorization: Bearer <token_admin>" -H "X-App-Id: <app_id>" -o /dev/null -w "status: %{http_code}\n"
```
Expected: `status: 403` (antes de este cambio hubiera dado 200, porque validaba contra `caja` — este es el cambio de comportamiento esperado y buscado).

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/reportes.js
git commit -m "feat(reportes): validar el modulo reportes propio en vez de caja"
```

---

### Task 3: Backend — permisos individuales por usuario + `my-apps` expone `can_reportes`

**Files:**
- Modify: `backend/src/routes/users.js`
- Modify: `backend/src/routes/auth.js`

**Interfaces:**
- Produces: `PUT /api/users/:id/permissions/:moduleName`, `DELETE /api/users/:id/permissions/:moduleName`. `GET /api/auth/my-apps` — cada entrada del array gana `can_reportes: boolean`. Consumido por la Task 7 (frontend, toggle de usuario) y la Task 6 (frontend, nav/redirects basados en `activeApp.can_reportes`).

- [ ] **Step 1: Agregar los endpoints de permisos individuales**

En `backend/src/routes/users.js`, buscar el final del archivo:

```javascript
  // Quitar acceso a un local puntual
  fastify.delete('/:id/local-access', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id_app, id_local } = request.body
    if (!id_app || !id_local) return reply.code(400).send({ error: 'id_app e id_local son requeridos' })

    await fastify.db.userLocalAccess.deleteMany({
      where: { id_user: request.params.id, id_app, id_local }
    })
    return reply.code(204).send()
  })
}
```

Insertar el bloque nuevo entre el cierre de ese handler y el `}` final del archivo:

```javascript
  // Quitar acceso a un local puntual
  fastify.delete('/:id/local-access', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id_app, id_local } = request.body
    if (!id_app || !id_local) return reply.code(400).send({ error: 'id_app e id_local son requeridos' })

    await fastify.db.userLocalAccess.deleteMany({
      where: { id_user: request.params.id, id_app, id_local }
    })
    return reply.code(204).send()
  })

  // ─── Permisos individuales por usuario (override sobre el permiso del rol) ─
  fastify.put('/:id/permissions/:moduleName', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { moduleName } = request.params
    const moduleRecord = await fastify.db.module.findUnique({ where: { nombre: moduleName } })
    if (!moduleRecord) return reply.code(404).send({ error: `Módulo '${moduleName}' no encontrado` })

    const { can_view, can_create, can_edit, can_delete } = request.body ?? {}
    const data = {
      can_view: !!can_view, can_create: !!can_create,
      can_edit: !!can_edit, can_delete: !!can_delete
    }

    const perm = await fastify.db.userPermission.upsert({
      where: { id_user_id_module: { id_user: request.params.id, id_module: moduleRecord.id } },
      create: { id_user: request.params.id, id_module: moduleRecord.id, ...data },
      update: data
    })
    return perm
  })

  fastify.delete('/:id/permissions/:moduleName', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { moduleName } = request.params
    const moduleRecord = await fastify.db.module.findUnique({ where: { nombre: moduleName } })
    if (!moduleRecord) return reply.code(404).send({ error: `Módulo '${moduleName}' no encontrado` })

    await fastify.db.userPermission.deleteMany({
      where: { id_user: request.params.id, id_module: moduleRecord.id }
    })
    return reply.code(204).send()
  })
}
```

- [ ] **Step 2: `GET /my-apps` expone `can_reportes` resuelto**

En `backend/src/routes/auth.js`, buscar el bloque final del handler `GET /my-apps` (justo antes de `return result`, después del ordenamiento por uso agregado en el Bloque 6):

```javascript
    result.sort((a, b) => {
      const ta = lastUsedByApp[a.app.id]
      const tb = lastUsedByApp[b.app.id]
      if (ta && tb) return new Date(tb) - new Date(ta)
      if (ta) return -1
      if (tb) return 1
      return 0
    })

    return result
  })
```

Reemplazar por (agrega el cálculo de `can_reportes` para cada entrada, ANTES del sort — el orden de las operaciones no importa entre sí, pero mantener el sort al final preserva el comportamiento ya probado del Bloque 6):

```javascript
    result.sort((a, b) => {
      const ta = lastUsedByApp[a.app.id]
      const tb = lastUsedByApp[b.app.id]
      if (ta && tb) return new Date(tb) - new Date(ta)
      if (ta) return -1
      if (tb) return 1
      return 0
    })

    // Resolver si el usuario puede ver Reportes — misma lógica de precedencia
    // que fastify.can(): override individual (UserPermission) manda si existe;
    // si no, el permiso del rol (super_admin bypasea todo).
    const isSuperAdmin = userRoles.some(r => r.role.nombre === 'super_admin')
    const reportesModule = await fastify.db.module.findUnique({ where: { nombre: 'reportes' } })
    const userReportesPerm = reportesModule
      ? await fastify.db.userPermission.findUnique({
          where: { id_user_id_module: { id_user: request.user.id, id_module: reportesModule.id } }
        })
      : null

    let reportesRolePermByRole = {}
    if (reportesModule && !isSuperAdmin) {
      const roleIds = [...new Set(result.map(r => {
        const match = userRoles.find(ur => ur.app?.id === r.app.id)
          ?? userRoles.find(ur => ur.id_app === null)
        return match?.id_role
      }).filter(Boolean))]
      const rolePerms = await fastify.db.rolePermission.findMany({
        where: { id_role: { in: roleIds }, id_module: reportesModule.id }
      })
      reportesRolePermByRole = Object.fromEntries(rolePerms.map(rp => [rp.id_role, rp.can_view]))
    }

    for (const entry of result) {
      if (isSuperAdmin) { entry.can_reportes = true; continue }
      if (userReportesPerm) { entry.can_reportes = !!userReportesPerm.can_view; continue }
      const roleMatch = userRoles.find(ur => ur.app?.id === entry.app.id) ?? userRoles.find(ur => ur.id_app === null)
      entry.can_reportes = !!reportesRolePermByRole[roleMatch?.id_role]
    }

    return result
  })
```

Nota: este cálculo reutiliza `userRoles` (ya obtenido al principio del handler, con `include: { role: true }` pero SIN `id_app`/`id_role` planos — confirmar que `userRoles` (el `findMany` inicial de `userAppRole`) sí expone `id_role`/`id_app`/`app` directamente en cada fila, ya que Prisma devuelve las columnas propias del modelo junto con los `include`; no hace falta un `select` explícito para acceder a `ur.id_role`/`ur.id_app`).

- [ ] **Step 3: Verificar en vivo contra la base real**

```bash
curl -s "http://localhost:3000/api/auth/my-apps" -H "Authorization: Bearer <token_admin>" | head -c 400
```
Expected: cada objeto del array tiene `"can_reportes":false` (para un usuario `admin` sin override).

```bash
curl -s -X PUT "http://localhost:3000/api/users/<id_del_admin>/permissions/reportes" \
  -H "Authorization: Bearer <token_super_admin>" -H "Content-Type: application/json" \
  -d '{"can_view": true}'
```
Expected: 200, objeto `UserPermission` devuelto con `can_view: true`.

```bash
curl -s "http://localhost:3000/api/auth/my-apps" -H "Authorization: Bearer <token_admin>" | head -c 400
```
Expected: ahora `"can_reportes":true` para ese usuario.

```bash
curl -s -X DELETE "http://localhost:3000/api/users/<id_del_admin>/permissions/reportes" \
  -H "Authorization: Bearer <token_super_admin>" -o /dev/null -w "status: %{http_code}\n"
```
Expected: `status: 204`, y un `GET /my-apps` posterior vuelve a mostrar `can_reportes:false`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/users.js backend/src/routes/auth.js
git commit -m "feat(permisos): endpoints de permiso individual + my-apps expone can_reportes"
```

---

### Task 4: Frontend — `ProtectedRoute` con roles globales, permiso de reportes, y exclusión de rol

**Files:**
- Modify: `frontend/src/components/ProtectedRoute.jsx`

**Interfaces:**
- Produces: `<ProtectedRoute requireApp roles={[...]} globalRoles={[...]} reportesOnly excludeRoles={[...]} />` — props nuevos `globalRoles`, `reportesOnly`, `excludeRoles`, consumidos por la Task 5 (`App.jsx`).

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar todo el contenido de `frontend/src/components/ProtectedRoute.jsx`:

```jsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'

// `roles`: si se pasa, solo esos roles (de la app activa) pueden entrar.
// `globalRoles`: independiente de la app activa -- evalúa TODAS las
//   asignaciones de rol del usuario (para zonas globales como Admin).
// `reportesOnly`: exige que la app activa tenga el permiso real de Reportes
//   (activeApp.can_reportes), no un nombre de rol.
// `excludeRoles`: si el rol de la app activa está en esta lista, se redirige
//   a /reportes en vez de dejar pasar (para el rol "reportes", que no opera).
export default function ProtectedRoute({
  children, requireApp = true, roles = null,
  globalRoles = null, reportesOnly = false, excludeRoles = null
}) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const activeApp = useAppStore((s) => s.activeApp)

  if (!token) return <Navigate to="/login" replace />

  if (globalRoles) {
    const userRoleNames = (user?.user_app_roles ?? []).map(r => r.role?.nombre)
    if (!globalRoles.some(r => userRoleNames.includes(r))) return <Navigate to="/dashboard" replace />
    return children
  }

  if (requireApp && !activeApp) return <Navigate to="/select-app" replace />
  if (excludeRoles && excludeRoles.includes(activeApp?.role)) return <Navigate to="/reportes" replace />
  if (reportesOnly && !activeApp?.can_reportes) return <Navigate to="/dashboard" replace />
  if (roles && !roles.includes(activeApp?.role)) return <Navigate to="/dashboard" replace />
  return children
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso. Los props nuevos no se usan todavía en ningún lado (eso pasa en la Task 5) — no es un error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProtectedRoute.jsx
git commit -m "feat(auth): ProtectedRoute soporta roles globales, permiso de reportes y exclusion de rol"
```

---

### Task 5: Frontend — reestructurar `App.jsx` con los Guards nuevos

**Files:**
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `ProtectedRoute` con `globalRoles`/`reportesOnly`/`excludeRoles` (Task 4).

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar todo el contenido de `frontend/src/App.jsx`:

```jsx
import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/Layout.jsx'
import { useAuthStore } from './store/authStore.js'

const Login         = lazy(() => import('./pages/Login.jsx'))
const StartChoice   = lazy(() => import('./pages/StartChoice.jsx'))
const AppSelector   = lazy(() => import('./pages/AppSelector.jsx'))
const Dashboard     = lazy(() => import('./pages/Dashboard.jsx'))
const CajaList      = lazy(() => import('./pages/cajas/CajaList.jsx'))
const CajaDetail    = lazy(() => import('./pages/cajas/CajaDetail.jsx'))
const PagoList      = lazy(() => import('./pages/pagos/PagoList.jsx'))
const PagoForm      = lazy(() => import('./pages/pagos/PagoForm.jsx'))
const PdpDashboard  = lazy(() => import('./pages/pdp/PdpDashboard.jsx'))
const ProveedorList = lazy(() => import('./pages/proveedores/ProveedorList.jsx'))
const ProveedorForm = lazy(() => import('./pages/proveedores/ProveedorForm.jsx'))
const Reportes      = lazy(() => import('./pages/reportes/Reportes.jsx'))
const Auditorias    = lazy(() => import('./pages/auditorias/Auditorias.jsx'))
const Users         = lazy(() => import('./pages/admin/Users.jsx'))
const Apps          = lazy(() => import('./pages/admin/Apps.jsx'))
const Locales       = lazy(() => import('./pages/admin/Locales.jsx'))
const RubCat        = lazy(() => import('./pages/admin/RubCat.jsx'))
const MetodosPago   = lazy(() => import('./pages/admin/MetodosPago.jsx'))
const Roles         = lazy(() => import('./pages/admin/Roles.jsx'))
const DetalleTipos  = lazy(() => import('./pages/admin/DetalleTipos.jsx'))

function PageFallback() {
  return (
    <div className="page-loading">
      <div className="spinner" />
    </div>
  )
}

// Grupos de roles para guardar rutas
const SUPER       = ['super_admin']
const ADMIN_PANEL = ['super_admin', 'dcsmart']
const OPERATIVE   = ['super_admin', 'dcsmart', 'admin']

// Guard de rol dentro del Layout: la app ya está garantizada por el ProtectedRoute padre.
function Guard({ roles, children }) {
  return <ProtectedRoute requireApp roles={roles}>{children}</ProtectedRoute>
}
// Dashboard/Cajas/Pagos: requieren app activa, pero el rol "reportes"
// (restringido a Reportes) no puede entrar -- se lo manda a /reportes.
function OperativeGuard({ children }) {
  return <ProtectedRoute requireApp excludeRoles={['reportes']}>{children}</ProtectedRoute>
}
// Reportes: requiere app activa + el permiso real (no el nombre del rol).
function ReportesGuard({ children }) {
  return <ProtectedRoute requireApp reportesOnly>{children}</ProtectedRoute>
}
// Zonas globales (Admin): independientes de la app activa -- evalúa TODAS
// las asignaciones de rol del usuario, no la app elegida.
function GlobalGuard({ roles, children }) {
  return <ProtectedRoute requireApp={false} globalRoles={roles}>{children}</ProtectedRoute>
}

export default function App() {
  const token = useAuthStore((s) => s.token)
  const refreshUser = useAuthStore((s) => s.refreshUser)

  // Sincroniza roles/datos del usuario al iniciar la app si hay sesión activa
  useEffect(() => {
    if (token) refreshUser()
  }, [])

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/start"
          element={
            <ProtectedRoute requireApp={false}>
              <StartChoice />
            </ProtectedRoute>
          }
        />
        <Route
          path="/select-app"
          element={
            <ProtectedRoute requireApp={false}>
              <AppSelector />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute requireApp={false}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"                  element={<OperativeGuard><Dashboard /></OperativeGuard>} />
          <Route path="cajas"                      element={<OperativeGuard><CajaList /></OperativeGuard>} />
          <Route path="cajas/:id"                  element={<OperativeGuard><CajaDetail /></OperativeGuard>} />
          <Route path="pagos"                      element={<OperativeGuard><PagoList /></OperativeGuard>} />
          <Route path="pagos/nuevo"                element={<OperativeGuard><PagoForm /></OperativeGuard>} />
          <Route path="pagos/:id/editar"           element={<OperativeGuard><PagoForm /></OperativeGuard>} />
          <Route path="pdp"                        element={<Guard roles={OPERATIVE}><PdpDashboard /></Guard>} />
          <Route path="proveedores"                element={<Guard roles={OPERATIVE}><ProveedorList /></Guard>} />
          <Route path="proveedores/nuevo"          element={<Guard roles={OPERATIVE}><ProveedorForm /></Guard>} />
          <Route path="proveedores/:id/editar"     element={<Guard roles={OPERATIVE}><ProveedorForm /></Guard>} />
          <Route path="reportes"                    element={<ReportesGuard><Reportes /></ReportesGuard>} />
          <Route path="auditorias"                  element={<GlobalGuard roles={SUPER}><Auditorias /></GlobalGuard>} />
          <Route path="admin/users"                element={<GlobalGuard roles={SUPER}><Users /></GlobalGuard>} />
          <Route path="admin/apps"                 element={<GlobalGuard roles={ADMIN_PANEL}><Apps /></GlobalGuard>} />
          <Route path="admin/locales"              element={<GlobalGuard roles={ADMIN_PANEL}><Locales /></GlobalGuard>} />
          <Route path="admin/rubcat"               element={<GlobalGuard roles={SUPER}><RubCat /></GlobalGuard>} />
          <Route path="admin/metodos-pago"         element={<GlobalGuard roles={ADMIN_PANEL}><MetodosPago /></GlobalGuard>} />
          <Route path="admin/roles"                element={<GlobalGuard roles={SUPER}><Roles /></GlobalGuard>} />
          <Route path="admin/detalle-tipos"        element={<GlobalGuard roles={ADMIN_PANEL}><DetalleTipos /></GlobalGuard>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
```

Notas sobre los cambios respecto al archivo original:
- El `<Route path="/">` que envuelve `Layout` pasa de `requireApp` implícito (`true`) a `requireApp={false}` explícito — esto es lo que permite llegar a `/admin/*` sin haber elegido una app. Las rutas que sí necesitan una app activa (`dashboard`, `cajas`, `pagos` y sus subrutas) ahora la exigen explícitamente vía `OperativeGuard`/`ReportesGuard`/`Guard`, en vez de depender del wrapper exterior.
- Se agrega la ruta `/start` (Task 6, `StartChoice.jsx`).
- `dashboard`/`cajas`/`cajas/:id`/`pagos`/`pagos/nuevo`/`pagos/:id/editar` pasan de no tener ningún Guard a usar `OperativeGuard` (antes dependían solo de que el backend devolviera 403 si correspondía; ahora además se bloquean prolijamente en el frontend).
- `reportes` pasa de `Guard roles={OPERATIVE}` a `ReportesGuard` (permiso real, no nombre de rol).
- `auditorias` y todo `admin/*` pasan de `Guard` a `GlobalGuard` (independientes de la app activa).

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(auth): reestructurar rutas -- admin global, reportes por permiso, dashboard/cajas/pagos guardados"
```

---

### Task 6: Frontend — pantalla "¿Administrar o entrar a un grupo?"

**Files:**
- Create: `frontend/src/pages/StartChoice.jsx`
- Modify: `frontend/src/pages/Login.jsx`

**Interfaces:**
- Consumes: `useAuthStore().user.user_app_roles` (ya disponible desde `GET /api/auth/me`, sin cambios de backend necesarios).
- Produces: ruta `/start`, ya registrada en `App.jsx` (Task 5).

- [ ] **Step 1: Crear `StartChoice.jsx`**

Crear `frontend/src/pages/StartChoice.jsx`:

```jsx
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import AppLogo from '../components/AppLogo.jsx'
import './auth.css'

const GLOBAL_ROLES = ['super_admin', 'dcsmart']

export default function StartChoice() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const roleNames = (user?.user_app_roles ?? []).map(r => r.role?.nombre)
  const hasGlobalRole = GLOBAL_ROLES.some(r => roleNames.includes(r))

  // Sin rol global: nunca debería ver esta pantalla -- sigue directo al selector,
  // sin ningún flash visible (la redirección ocurre antes de pintar nada más).
  if (!hasGlobalRole) return <Navigate to="/select-app" replace />

  return (
    <div className="auth-root">
      <div className="auth-grid-veil" />
      <main className="sel-main" style={{ justifyContent: 'center' }}>
        <div className="sel-heading">
          <AppLogo variant="horizontal" />
          <h1 style={{ marginTop: '1.5rem' }}>¿Qué querés hacer?</h1>
          <p>Elegí si querés administrar el sistema o entrar a operar un grupo</p>
        </div>
        <div className="app-grid" style={{ maxWidth: 640 }}>
          <button className="app-card" onClick={() => navigate('/admin/users')}>
            <div className="app-card-body">
              <h2>Administrar</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                Usuarios, apps, locales, roles y configuración global
              </p>
            </div>
          </button>
          <button className="app-card" onClick={() => navigate('/select-app')}>
            <div className="app-card-body">
              <h2>Entrar a un grupo</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                Operar Cajas, Pagos y Reportes de un grupo puntual
              </p>
            </div>
          </button>
        </div>
      </main>
    </div>
  )
}
```

Nota: reutiliza las clases `auth-root`/`auth-grid-veil`/`sel-main`/`sel-heading`/`app-grid`/`app-card`/`app-card-body` ya definidas en `frontend/src/pages/auth.css` (usadas hoy por `AppSelector.jsx`) — no hace falta CSS nuevo.

- [ ] **Step 2: Redirigir a `/start` en vez de `/select-app` después del login**

En `frontend/src/pages/Login.jsx`, hay 3 lugares que navegan a `/select-app` tras un login exitoso. Buscar y reemplazar cada uno:

Primero, buscar:
```javascript
  useEffect(() => {
    if (token) navigate('/select-app', { replace: true })
  }, [token, navigate])
```
Reemplazar por:
```javascript
  useEffect(() => {
    if (token) navigate('/start', { replace: true })
  }, [token, navigate])
```

Segundo, dentro del callback de Google Identity Services, buscar la línea:
```javascript
            navigate('/select-app')
```
(la que está dentro del bloque que llama `await loginGoogle(credential)`) y reemplazarla por:
```javascript
            navigate('/start')
```

Tercero, en el handler de login manual (email/password), buscar la línea:
```javascript
      navigate('/select-app')
```
y reemplazarla por:
```javascript
      navigate('/start')
```

Confirmar, antes de guardar, que las 3 ocurrencias de `'/select-app'` en llamadas a `navigate(...)` fueron reemplazadas por `'/start'` — correr `grep -n "navigate('/select-app'" frontend/src/pages/Login.jsx` y confirmar que no devuelve nada.

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación en vivo**

Si es posible loguearse con un usuario `super_admin`/`dcsmart` real: confirmar que tras el login aparece la pantalla "¿Qué querés hacer?", que "Administrar" navega a `/admin/users` sin pasar por el selector de apps, y que "Entrar a un grupo" navega a `/select-app` con el flujo de siempre. Con un usuario `admin`/`cajero`/`reportes`: confirmar que el login sigue yendo derecho a `/select-app`, sin ver esta pantalla nueva ni un flash visible de ella.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/StartChoice.jsx frontend/src/pages/Login.jsx
git commit -m "feat(auth): pantalla Administrar/Entrar a un grupo para roles globales"
```

---

### Task 7: Frontend — nav y redirects basados en el permiso real de Reportes

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/pages/AppSelector.jsx`

**Interfaces:**
- Consumes: `activeApp.can_reportes` (Task 3), `useAuthStore().user.user_app_roles` (ya disponible).

- [ ] **Step 1: `Sidebar.jsx` — nav de Reportes por permiso, nav de Admin por rol global**

Buscar:

```javascript
const NAV_MAIN = [
  { to: '/dashboard',   label: 'Dashboard',   Icon: IcoDashboard, roles: ALL },
  { to: '/cajas',       label: 'Cajas',       Icon: IcoCaja,      roles: ALL },
  { to: '/pagos',       label: 'Pagos',       Icon: IcoPagos,     roles: ALL },
  { to: '/pdp',         label: 'PDP',         Icon: IcoPdp,       roles: ['super_admin', 'dcsmart', 'admin'] },
  { to: '/proveedores', label: 'Proveedores', Icon: IcoProveedor, roles: ['super_admin', 'dcsmart', 'admin'] },
  { to: '/reportes',    label: 'Reportes',    Icon: IcoReportes,  roles: ['super_admin', 'dcsmart', 'admin'] },
]
```

Reemplazar por (el ítem de Reportes ya no lleva `roles` — su visibilidad se resuelve aparte, por permiso real, en el `visibleFor` de más abajo):

```javascript
const NAV_MAIN = [
  { to: '/dashboard',   label: 'Dashboard',   Icon: IcoDashboard, roles: ALL },
  { to: '/cajas',       label: 'Cajas',       Icon: IcoCaja,      roles: ALL },
  { to: '/pagos',       label: 'Pagos',       Icon: IcoPagos,     roles: ALL },
  { to: '/pdp',         label: 'PDP',         Icon: IcoPdp,       roles: ['super_admin', 'dcsmart', 'admin'] },
  { to: '/proveedores', label: 'Proveedores', Icon: IcoProveedor, roles: ['super_admin', 'dcsmart', 'admin'] },
  { to: '/reportes',    label: 'Reportes',    Icon: IcoReportes },
]
```

Buscar:

```javascript
  const role       = activeApp?.role
  const isGlobal   = role === 'super_admin' || role === 'dcsmart'
  const visibleFor = (item) => !item.roles || item.roles.includes(role)
  const mainItems  = NAV_MAIN.filter(visibleFor)
  const adminItems = NAV_ADMIN.filter(visibleFor)
```

Reemplazar por:

```javascript
  const user       = useAuthStore((s) => s.user)
  const role       = activeApp?.role
  const isGlobal   = role === 'super_admin' || role === 'dcsmart'
  const isReportesOnly = role === 'reportes'

  const visibleFor = (item) => {
    if (item.to === '/reportes') return !!activeApp?.can_reportes
    return !item.roles || item.roles.includes(role)
  }
  const mainItems = isReportesOnly
    ? NAV_MAIN.filter(i => i.to === '/reportes')
    : NAV_MAIN.filter(visibleFor)

  // Admin: independiente de la app activa -- evalúa TODAS las asignaciones
  // de rol del usuario, no la app elegida (para cuando no hay app activa).
  const globalRoleNames = (user?.user_app_roles ?? []).map(r => r.role?.nombre)
  const adminItems = NAV_ADMIN.filter(item => !item.roles || item.roles.some(r => globalRoleNames.includes(r)))
```

Nota: `useAuthStore` ya está importado al principio del archivo (`import { useAuthStore } from '../store/authStore.js'`) — no hace falta agregar el import.

- [ ] **Step 2: `AppSelector.jsx` — navegar directo a Reportes para el rol restringido**

Buscar:

```javascript
  const handleSelect = (item) => {
    if (selecting) return
    setSelecting(true)
    authApi.touchApp(item.app.id).catch(() => {})
    setActiveApp(item)
    if (item.locales.length === 1) {
      setActiveLocal(item.locales[0])
    }
    navigate('/dashboard', { replace: true })
  }
```

Reemplazar por:

```javascript
  const handleSelect = (item) => {
    if (selecting) return
    setSelecting(true)
    authApi.touchApp(item.app.id).catch(() => {})
    setActiveApp(item)
    if (item.locales.length === 1) {
      setActiveLocal(item.locales[0])
    }
    navigate(item.role === 'reportes' ? '/reportes' : '/dashboard', { replace: true })
  }
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación en vivo**

Con un usuario `admin` sin el permiso de Reportes: confirmar que el ítem "Reportes" no aparece en el menú, y que ir a `/reportes` a mano por la URL redirige a `/dashboard`. Activarle el permiso (vía curl, como en la Task 3, o vía la Task 8 una vez lista): confirmar que ahora sí aparece "Reportes" en el menú y la ruta funciona. Con un usuario de rol `reportes`: confirmar que el menú solo muestra "Reportes", que elegir grupo/local lo lleva directo ahí (no a Dashboard), y que ir a `/cajas`/`/pagos`/`/dashboard` a mano por la URL termina rebotando a `/reportes`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/pages/AppSelector.jsx
git commit -m "feat(reportes): nav y redirects segun el permiso real, no el nombre del rol"
```

---

### Task 8: Frontend — Admin → Usuarios, toggle "Puede ver Reportes"

**Files:**
- Modify: `frontend/src/api/users.js`
- Modify: `frontend/src/pages/admin/Users.jsx`

**Interfaces:**
- Consumes: `PUT`/`DELETE /api/users/:id/permissions/:moduleName` (Task 3).

- [ ] **Step 1: Agregar los métodos al cliente API**

En `frontend/src/api/users.js`, reemplazar:

```javascript
import client from './client.js'

export const usersApi = {
  list: () => client.get('/users'),
  get: (id) => client.get(`/users/${id}`),
  create: (data) => client.post('/users', data),
  update: (id, data) => client.put(`/users/${id}`, data),
  remove: (id) => client.delete(`/users/${id}`),
  assignRole: (id, data) => client.post(`/users/${id}/roles`, data),
  removeRole: (id, id_app) => client.delete(`/users/${id}/roles/${id_app ?? 'global'}`),
  addLocalAccess: (id, data) => client.post(`/users/${id}/local-access`, data),
  removeLocalAccess: (id, data) => client.delete(`/users/${id}/local-access`, { data })
}
```

Por:

```javascript
import client from './client.js'

export const usersApi = {
  list: () => client.get('/users'),
  get: (id) => client.get(`/users/${id}`),
  create: (data) => client.post('/users', data),
  update: (id, data) => client.put(`/users/${id}`, data),
  remove: (id) => client.delete(`/users/${id}`),
  assignRole: (id, data) => client.post(`/users/${id}/roles`, data),
  removeRole: (id, id_app) => client.delete(`/users/${id}/roles/${id_app ?? 'global'}`),
  addLocalAccess: (id, data) => client.post(`/users/${id}/local-access`, data),
  removeLocalAccess: (id, data) => client.delete(`/users/${id}/local-access`, { data }),
  setPermission: (id, moduleName, data) => client.put(`/users/${id}/permissions/${moduleName}`, data),
  removePermission: (id, moduleName) => client.delete(`/users/${id}/permissions/${moduleName}`)
}
```

- [ ] **Step 2: Agregar el toggle en el detalle del usuario**

En `frontend/src/pages/admin/Users.jsx`, buscar el bloque `{/* Roles y Accesos */}`:

```jsx
              {/* Roles y Accesos */}
              <div className="drawer-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Roles y Accesos</span>
                {reloading && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />}
              </div>
```

Insertar, INMEDIATAMENTE ANTES de ese bloque, la sección nueva de permisos individuales:

```jsx
              {/* Permisos individuales */}
              <div className="drawer-section-title">Permisos individuales</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: '1.25rem', fontSize: 13, color: 'var(--t2)' }}>
                <input
                  type="checkbox"
                  className="select-checkbox"
                  checked={(selected.user_permissions ?? []).some(p => p.module?.nombre === 'reportes' && p.can_view)}
                  onChange={async (e) => {
                    const checked = e.target.checked
                    try {
                      if (checked) {
                        await usersApi.setPermission(selected.id, 'reportes', { can_view: true })
                      } else {
                        await usersApi.removePermission(selected.id, 'reportes')
                      }
                      const { data } = await usersApi.get(selected.id)
                      setSelected(data)
                      usersApi.list().then(({ data: all }) => setUsers(all)).catch(() => {})
                    } catch (err) {
                      notify(err.response?.data?.error || 'Error al actualizar el permiso', 'error')
                    }
                  }}
                />
                Puede ver Reportes
              </label>

              {/* Roles y Accesos */}
              <div className="drawer-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Roles y Accesos</span>
                {reloading && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />}
              </div>
```

Notas:
- `selected.user_permissions` ya viene incluido en la respuesta de `GET /users/:id` (`user_permissions: { include: { module: true } }`, confirmado en `backend/src/routes/users.js`) — no hace falta ningún cambio de backend adicional para leerlo.
- `notify` (línea ~97), `setUsers` (línea ~103) y `setSelected` (línea ~108) ya están definidos en el componente con esos nombres exactos — confirmado por inspección directa del archivo.
- Se reutiliza la clase `.select-checkbox` (dorada, ya agregada en el Bloque 5) para consistencia visual.

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación en vivo**

Abrir el detalle de un usuario con rol `admin` en Admin → Usuarios, tildar "Puede ver Reportes", confirmar que la llamada sale bien (sin error) y que el checkbox queda marcado tras recargar el detalle. Destildarlo y confirmar que vuelve a quedar sin marcar.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/users.js frontend/src/pages/admin/Users.jsx
git commit -m "feat(admin): toggle para dar/quitar el permiso individual de Reportes"
```

---

## Nota final

Después de completar las 8 tareas, mañana (según lo acordado) revisar junto al usuario la tabla de permisos resultante por rol (correr de nuevo el script de verificación del Step 6 de la Task 1, pero listando TODOS los módulos, no solo `reportes`, para confirmar visualmente que nada más cambió sin querer) antes de considerar este trabajo cerrado.
