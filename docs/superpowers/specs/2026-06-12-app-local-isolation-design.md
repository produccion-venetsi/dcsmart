# Diseño: Aislamiento seguro de App/Local (multi-tenant)

**Fecha:** 2026-06-12  
**Branch:** fix/arreglos-generales  
**Estado:** Aprobado

---

## Problema

Cuando un usuario entra a una app y selecciona "todos los locales" (default, `activeLocal = null`), el backend devuelve datos de **todas** las apps y todos los locales porque el filtro `id_local` es opcional y no hay validación de contexto de app. Adicionalmente, cualquier UUID conocido permite acceder a recursos de otras apps directamente por ID.

El modelo de permisos actual (`UserAppRole.id_local`) solo soporta "todos los locales" o "exactamente uno", sin poder expresar "locales A y B pero no C".

---

## Decisiones de diseño

- El contexto de app activa viaja como header HTTP `X-App-Id` en cada request
- El backend resuelve `allowedLocalIds[]` en un middleware central (`appContext`)
- Sin registros en `UserLocalAccess` = acceso a **todos** los locales activos de la app
- Con registros en `UserLocalAccess` = acceso **solo** a esos locales
- `super_admin` es irrestricto: no se aplica `allowedLocalIds`
- El enforcement cubre listing, GET por ID, POST, PUT y DELETE
- `id_local` sigue como query/body param — el interceptor frontend solo agrega el header

---

## Sección 1: Schema

### `UserAppRole` — eliminar `id_local`

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
```

### Nueva tabla `UserLocalAccess`

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

### Relaciones inversas a agregar

- `User` → `local_access UserLocalAccess[]`
- `App` → `local_access UserLocalAccess[]`
- `Local` → `local_access UserLocalAccess[]`

### Migración de datos

```sql
-- Copiar registros existentes con id_local específico
INSERT INTO user_local_access (id, id_user, id_app, id_local)
SELECT gen_random_uuid(), id_user, id_app, id_local
FROM user_app_roles
WHERE id_local IS NOT NULL;

-- Luego Prisma elimina la columna id_local de user_app_roles
```

---

## Sección 2: Middleware `appContext`

**Archivo:** `backend/src/plugins/appContext.js`

Flujo por request:

1. Leer `X-App-Id` del header → `400` si ausente
2. Buscar `UserAppRole` para `(id_user, id_app)` → `403` si no existe
3. Si el rol es `super_admin` → `request.allowedLocalIds = null` (irrestricto)
4. Buscar registros en `UserLocalAccess` para `(id_user, id_app)`:
   - Sin registros → cargar todos los locales activos de la app → `request.allowedLocalIds = [...]`
   - Con registros → `request.allowedLocalIds = [id_local, ...]`
5. Decorar `request.activeAppId`

**Rutas que requieren `appContext`:**
- `GET/POST/PUT/DELETE /api/cajas`
- `GET/POST/PUT/DELETE /api/caja-movimientos`
- `GET/POST/PUT/DELETE /api/pagos`

**Rutas exentas** (tablas globales sin scope de local):
- `/api/auth`, `/api/apps`, `/api/locales`, `/api/users`
- `/api/proveedores`, `/api/rubcat`, `/api/metodos-pago`

---

## Sección 3: Patrones de enforcement en rutas

### Patrón 1 — GET lista

```js
if (id_local && !request.allowedLocalIds?.includes(id_local)) {
  return reply.code(403).send({ error: 'Sin acceso a este local' })
}
const localFilter = id_local
  ? { id_local }
  : { id_local: { in: request.allowedLocalIds } }

const items = await fastify.db.caja.findMany({ where: localFilter })
```

La validación de `id_local` ocurre en el handler (no en el middleware). El middleware solo resuelve y decora `allowedLocalIds`.

### Patrón 2 — GET por ID

```js
const caja = await fastify.db.caja.findUnique({
  where: { id },
  include: { local: true }
})
if (!caja || !request.allowedLocalIds?.includes(caja.id_local)) {
  return reply.code(403).send({ error: 'Sin acceso' })
}
```

### Patrón 3 — POST (crear)

```js
if (!request.allowedLocalIds?.includes(body.id_local)) {
  return reply.code(403).send({ error: 'Sin acceso a este local' })
}
```

### Patrón 4 — PUT / DELETE

```js
const caja = await fastify.db.caja.findUnique({ where: { id }, include: { local: true } })
if (!caja || !request.allowedLocalIds?.includes(caja.id_local)) {
  return reply.code(403).send({ error: 'Sin acceso' })
}
// luego operar
```

### Caso especial — `caja_movimientos`

No tiene `id_local` directo. Validar via caja padre:

```js
const mov = await fastify.db.cajaMovimiento.findUnique({
  where: { id },
  include: { caja: true }
})
if (!mov || !request.allowedLocalIds?.includes(mov.caja.id_local)) {
  return reply.code(403).send({ error: 'Sin acceso' })
}
```

---

## Sección 4: Frontend

### Interceptor de request en `frontend/src/api/index.js`

```js
api.interceptors.request.use((config) => {
  const { activeApp } = useAppStore.getState()
  if (activeApp?.id) {
    config.headers['X-App-Id'] = activeApp.id
  }
  return config
})
```

### Interceptor de respuesta — manejo de 403

```js
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 403) {
      // Mostrar notificación "Sin acceso a este recurso"
      // Si el error es por local inválido, limpiar activeLocal
    }
    return Promise.reject(err)
  }
)
```

### Sin cambios en componentes

`CajaList`, `PagoList` y demás no se modifican. El interceptor actúa de forma transparente.

---

## Sección 5: Migración y orden de deploy

### Orden obligatorio

1. **Deploy backend** con nuevo schema + plugin `appContext` + rutas actualizadas
2. **Deploy frontend** con interceptor `X-App-Id`

Si el frontend nuevo llega antes → los requests llevan `X-App-Id` pero el backend viejo lo ignora (sin daño).  
Si el backend nuevo llega antes sin frontend → el backend no recibe `X-App-Id` y devuelve `400` (rompe la app). Por eso **backend primero**.

### Archivos modificados

```
backend/
  prisma/schema.prisma                 ← UserAppRole sin id_local, nueva UserLocalAccess
  src/plugins/appContext.js            ← nuevo plugin
  src/routes/caja.js                   ← 4 patrones aplicados
  src/routes/caja_movimientos.js       ← patrón especial (via caja padre)
  src/routes/pagos.js                  ← 4 patrones aplicados
  src/server.js                        ← registrar appContext plugin

frontend/
  src/api/index.js                     ← interceptor X-App-Id + manejo 403
```

---

## Casos de uso cubiertos

| Caso | Resultado esperado |
|------|--------------------|
| User en App A, `activeLocal = null` | Ve solo cajas/pagos de locales de App A permitidos |
| User en App A, `activeLocal = local_x` | Ve solo cajas/pagos de local_x (si tiene acceso) |
| User con acceso a local A y B (no C) | `allowedLocalIds = [A, B]`, C devuelve 403 |
| User en App A pide UUID de App B | 403 por patrón 2 (GET por ID) |
| User en App A intenta crear en local de App B | 403 por patrón 3 (POST) |
| `super_admin` | `allowedLocalIds = null`, acceso irrestricto |
| Request sin `X-App-Id` | 400 Bad Request |
| User sin `UserAppRole` para la app | 403 Forbidden |
