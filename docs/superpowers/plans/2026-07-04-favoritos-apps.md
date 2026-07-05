# Favoritos / más usados en el selector de apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordenar el selector de apps (`AppSelector.jsx`) por la última vez que el usuario entró a cada app (más reciente primero), sin ninguna acción manual — apps nunca usadas quedan al final en su orden alfabético actual.

**Architecture:** Se agrega una tabla nueva `UserAppUsage` (id_user, id_app, last_used_at) completamente separada del modelo de permisos (`UserAppRole`), porque un `super_admin`/`dcsmart` tiene un único registro de acceso global sin fila por app. El backend expone un endpoint para "marcar uso" (`POST /my-apps/:appId/touch`) y ordena `GET /my-apps` usando esos datos. El frontend llama al endpoint de "marcar uso" al seleccionar una app, sin esperar la respuesta.

**Tech Stack:** Fastify + Prisma (backend), React (frontend).

## Global Constraints

- ESModules, `async/await` siempre, nunca callbacks.
- **Este plan requiere un cambio de esquema (`npx prisma db push`) contra la base real (Cloud SQL).** Antes de correr ese comando, el controlador de este plan (quien dispatch los subagentes) DEBE pedir confirmación explícita y en el momento al usuario — no asumir que la aprobación del spec ya cubre esto. Es una acción de alto impacto sobre infraestructura compartida.
- No se agregan tests automatizados (el proyecto no tiene suite, confirmado: no existe `backend/src/test/`) — verificación manual vía curl contra la base real + inspección visual.
- El endpoint de "marcar uso" no valida que el usuario tenga acceso a esa app específica — no expone datos sensibles (solo una fecha), y una app sin acceso nunca va a aparecer en el propio `GET /my-apps` del usuario de todos modos.

---

### Task 1: Schema `UserAppUsage` + endpoints de ordenamiento y marcado de uso

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/routes/auth.js`

**Interfaces:**
- Produces: `GET /api/auth/my-apps` (ya existente, ahora devuelve la lista ordenada por uso). `POST /api/auth/my-apps/:appId/touch` (nuevo) — sin body, devuelve `{ ok: true }`. Consumido por la Task 2.

- [ ] **Step 1: Agregar el modelo `UserAppUsage` al schema**

En `backend/prisma/schema.prisma`, buscar el modelo `User` (línea ~48) y agregar `app_usage UserAppUsage[]` a su lista de relaciones — por ejemplo, después de la línea `audits           Audit[]           @relation("AuditUser")`:

```prisma
  audits           Audit[]           @relation("AuditUser")
  app_usage        UserAppUsage[]
```

Buscar el modelo `App` (línea ~11) y agregar `usage UserAppUsage[]` a su lista de relaciones, por ejemplo después de `local_access   UserLocalAccess[]`:

```prisma
  local_access   UserLocalAccess[]
  usage          UserAppUsage[]
```

Agregar el modelo nuevo completo, en cualquier punto del archivo cerca de `UserAppRole` (por legibilidad, ya que están relacionados):

```prisma
model UserAppUsage {
  id_user      String
  id_app       String
  last_used_at DateTime @default(now())

  user User @relation(fields: [id_user], references: [id])
  app  App  @relation(fields: [id_app], references: [id])

  @@id([id_user, id_app])
  @@map("user_app_usage")
}
```

- [ ] **Step 2: Regenerar el cliente de Prisma**

Run: `cd backend && npx prisma generate`
Expected: "✔ Generated Prisma Client" sin errores.

- [ ] **Step 3: DETENERSE — pedir confirmación antes de aplicar el cambio a la base real**

Este paso NO se ejecuta automáticamente. Reportar el estado con status `NEEDS_CONTEXT` y este mensaje exacto para que el controlador se lo traslade al usuario antes de continuar:

> "Necesito aplicar el nuevo modelo `UserAppUsage` a la base de datos real con `npx prisma db push` (agrega una tabla nueva `user_app_usage`, no modifica ni borra ninguna tabla existente). ¿Confirmás que corra este comando contra la base de producción?"

Solo continuar con el Step 4 si el controlador confirma que el usuario dio el OK explícito en este momento de la ejecución.

- [ ] **Step 4: Aplicar el cambio de esquema (solo tras la confirmación del Step 3)**

Run (desde `backend/`, con el Cloud SQL Auth Proxy corriendo): `npx prisma db push`
Expected: algo como "🚀 Your database is now in sync with your Prisma schema" y la mención de la tabla `user_app_usage` creada.

- [ ] **Step 5: Modificar `GET /api/auth/my-apps` para ordenar por uso**

En `backend/src/routes/auth.js`, reemplazar el handler completo (desde `// GET /api/auth/my-apps` hasta el `})` que lo cierra, justo antes de `// POST /api/auth/logout`):

```javascript
  // GET /api/auth/my-apps
  fastify.get('/my-apps', { preHandler: [fastify.authenticate] }, async (request) => {
    const userRoles = await fastify.db.userAppRole.findMany({
      where: { id_user: request.user.id },
      include: {
        app: {
          include: {
            locales: { where: { activo: true }, orderBy: { nombre: 'asc' } }
          }
        },
        role: true
      }
    })

    let result

    // super_admin / dcsmart: acceso a TODAS las apps y a todos sus locales.
    const isSuperAdmin = userRoles.some(r => r.role.nombre === 'super_admin')
    const isDcsmart    = !isSuperAdmin && userRoles.some(r => r.role.nombre === 'dcsmart')
    if (isSuperAdmin || isDcsmart) {
      const allApps = await fastify.db.app.findMany({
        where: { activo: true },
        include: { locales: { where: { activo: true }, orderBy: { nombre: 'asc' } } },
        orderBy: { nombre: 'asc' }
      })
      result = allApps.map(a => ({
        app:     { id: a.id, nombre: a.nombre, slug: a.slug },
        role:    isSuperAdmin ? 'super_admin' : 'dcsmart',
        locales: a.locales.map(l => ({ id: l.id, nombre: l.nombre }))
      }))
    } else {
      // Para usuarios normales: resolver locales permitidos desde user_local_access
      const localAccesses = await fastify.db.userLocalAccess.findMany({
        where: { id_user: request.user.id },
        include: { local: { select: { id: true, nombre: true } } }
      })

      // Agrupar por app
      const accessByApp = {}
      for (const la of localAccesses) {
        if (!accessByApp[la.id_app]) accessByApp[la.id_app] = []
        accessByApp[la.id_app].push({ id: la.local.id, nombre: la.local.nombre })
      }

      // admin / cajero: locales asignados en user_local_access.
      // Excepción: admin sin filas explícitas = acceso a TODOS los locales activos de la app.
      result = []
      for (const r of userRoles) {
        const assigned = accessByApp[r.id_app] ?? []
        let locales = assigned
        if (r.role.nombre === 'admin' && assigned.length === 0) {
          const allLocales = await fastify.db.local.findMany({
            where: { id_app: r.id_app, activo: true },
            select: { id: true, nombre: true },
            orderBy: { nombre: 'asc' }
          })
          locales = allLocales
        }
        result.push({
          app:    { id: r.app.id, nombre: r.app.nombre, slug: r.app.slug },
          role:   r.role.nombre,
          locales
        })
      }
    }

    // Ordenar por uso: las apps usadas más recientemente primero; las nunca
    // usadas quedan al final, en el orden que ya traían (alfabético).
    const usage = await fastify.db.userAppUsage.findMany({
      where: { id_user: request.user.id }
    })
    const lastUsedByApp = {}
    for (const u of usage) lastUsedByApp[u.id_app] = u.last_used_at

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

  // POST /api/auth/my-apps/:appId/touch
  fastify.post('/my-apps/:appId/touch', { preHandler: [fastify.authenticate] }, async (request) => {
    const { appId } = request.params
    await fastify.db.userAppUsage.upsert({
      where: { id_user_id_app: { id_user: request.user.id, id_app: appId } },
      create: { id_user: request.user.id, id_app: appId },
      update: { last_used_at: new Date() }
    })
    return { ok: true }
  })
```

Notas: `Array.prototype.sort` es estable en Node.js (garantizado desde ES2019, y este proyecto ya corre en un Node moderno) — al usar `sort` en vez de reconstruir el array, las apps nunca usadas (`ta`/`tb` ambos `undefined`, la comparación devuelve `0`) preservan el orden relativo que ya tenían entre sí (alfabético, heredado del `orderBy: { nombre: 'asc' }` de la consulta original). `id_user_id_app` es el nombre que Prisma genera automáticamente para la clave compuesta `@@id([id_user, id_app])` (concatena los nombres de campo en el orden declarado, separados por `_`).

- [ ] **Step 6: Verificar en vivo contra la base real**

Con el backend corriendo (`cd backend && npm run dev`) contra la base real (Cloud SQL Auth Proxy activo) y un JWT válido de un usuario de prueba:

```bash
curl -s "http://localhost:3000/api/auth/my-apps" -H "Authorization: Bearer <token>"
```
Expected: 200, array de apps (sin cambios visibles todavía si nunca se usó `touch`).

```bash
curl -s -X POST "http://localhost:3000/api/auth/my-apps/<un_app_id_de_la_respuesta_anterior>/touch" -H "Authorization: Bearer <token>"
```
Expected: `{"ok":true}`.

```bash
curl -s "http://localhost:3000/api/auth/my-apps" -H "Authorization: Bearer <token>"
```
Expected: la app recién tocada ahora aparece PRIMERA en el array (si no era ya la primera antes).

Repetir el `touch` sobre una segunda app distinta y confirmar que esa pasa a ser la primera, quedando la anterior segunda.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/routes/auth.js
git commit -m "feat(auth): ordenar my-apps por ultimo uso + endpoint para marcar uso (UserAppUsage)"
```

---

### Task 2: Frontend — marcar uso al seleccionar una app

**Files:**
- Modify: `frontend/src/api/auth.js`
- Modify: `frontend/src/pages/AppSelector.jsx`

**Interfaces:**
- Consumes: `POST /api/auth/my-apps/:appId/touch` (Task 1).

- [ ] **Step 1: Agregar `touchApp` al cliente API**

En `frontend/src/api/auth.js`, reemplazar:

```javascript
export const authApi = {
  register: (data) => client.post('/auth/register', data),
  login: (email, password) => client.post('/auth/login', { email, password }),
  loginGoogle: (credential) => client.post('/auth/google', { credential }),
  me: () => client.get('/auth/me'),
  myApps: () => client.get('/auth/my-apps'),
  logout: () => client.post('/auth/logout')
}
```

Por:

```javascript
export const authApi = {
  register: (data) => client.post('/auth/register', data),
  login: (email, password) => client.post('/auth/login', { email, password }),
  loginGoogle: (credential) => client.post('/auth/google', { credential }),
  me: () => client.get('/auth/me'),
  myApps: () => client.get('/auth/my-apps'),
  touchApp: (appId) => client.post(`/auth/my-apps/${appId}/touch`),
  logout: () => client.post('/auth/logout')
}
```

- [ ] **Step 2: Llamar a `touchApp` al seleccionar una app**

En `frontend/src/pages/AppSelector.jsx`, buscar:

```javascript
  const handleSelect = (item) => {
    if (selecting) return
    setSelecting(true)
    setActiveApp(item)
    if (item.locales.length === 1) {
      setActiveLocal(item.locales[0])
    }
    navigate('/dashboard', { replace: true })
  }
```

Reemplazar por (agrega la llamada de "marcar uso" sin esperar su resultado, para no demorar ni bloquear la navegación si la red está lenta o el endpoint falla):

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

Confirmar que `authApi` ya está importado en este archivo (`import { authApi } from '../api/auth.js'`) — si por algún motivo no lo está, agregar el import.

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación en vivo**

Con el backend corriendo contra la base real, si es posible usar el flujo real de la app (login → selector de apps con 2+ apps asignadas al usuario de prueba): seleccionar una app que no sea la primera de la lista, volver al selector, y confirmar que ahora aparece primera. Si no es posible probar en vivo en este entorno, verificar por inspección de código que `authApi.touchApp(item.app.id)` usa el `id` correcto (`item.app.id`, no `item.id` — la forma del objeto que devuelve `GET /my-apps` es `{ app: {id, nombre, slug}, role, locales }`, confirmar contra el Step 1 de la Task 1).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/auth.js frontend/src/pages/AppSelector.jsx
git commit -m "feat(auth): marcar uso de una app al seleccionarla en el selector"
```

---

## Nota final

Después de completar ambas tareas, correr `grep -n "touchApp\|UserAppUsage\|userAppUsage" backend/src/routes/auth.js frontend/src/api/auth.js frontend/src/pages/AppSelector.jsx` para confirmar que los 3 archivos quedaron correctamente cableados de punta a punta.
