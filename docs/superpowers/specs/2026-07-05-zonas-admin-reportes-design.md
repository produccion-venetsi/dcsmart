# Zonas separadas: Admin global + permiso de Reportes independiente

**Fecha:** 2026-07-05
**Estado:** Aprobado, pendiente de implementación
**Rama:** `DEV-08-production-goal`

## Contexto

Hoy toda la navegación pasa por: login → elegir app (grupo de negocio) → elegir local (si aplica) → Dashboard, con "Admin" y "Reportes" viviendo como rutas dentro de ese mismo árbol (`/admin/...`, `/reportes`), protegidas solo por nombre de rol (`OPERATIVE = ['super_admin','dcsmart','admin']`), sin depender de ningún permiso fino real.

Esto genera dos problemas concretos:
1. **Administrar no tiene nada que ver con elegir un grupo/local** — hoy, técnicamente, ir directo a `/admin/users` sin haber elegido una app te rebota igual al selector de apps, aunque el backend de esas pantallas ya es global (no depende de ningún local).
2. **No se puede dar acceso "solo a Reportes"** sin darle a esa persona el rol completo `admin` (que además le da Cajas, Pagos, Proveedores) — y ni siquiera el rol `admin` da Reportes por un permiso propio: el backend de Reportes hoy valida el permiso del módulo `caja` prestado, así que separar "puede ver Cajas" de "puede ver Reportes" es imposible hoy.

## Objetivo

1. Un usuario con rol `super_admin`/`dcsmart` en cualquiera de sus asignaciones elige, apenas loguea, entre **"Administrar"** (zona global, sin elegir grupo/local) o **"Entrar a un grupo"** (flujo de siempre).
2. El acceso a Reportes deja de depender del nombre del rol y pasa a depender de un permiso real, independiente del de Cajas — asignable individualmente por usuario.
3. Se agrega un rol nuevo `reportes`, para cuentas 100% restringidas a esa zona (sin ser admin de nada), sin necesidad de crear una app nueva en la base para lograrlo.
4. **Ningún rol existente pierde acceso que ya tiene hoy** — la migración preserva el comportamiento actual para `super_admin`, `dcsmart`, `admin` y `cajero`, salvo el cambio explícito descripto abajo (que `admin` deja de tener Reportes automático, movido a permiso individual).

## 1. Backend: módulo `reportes` propio

**Archivo:** `backend/prisma/seed.js` (o un script de datos equivalente, ver Fuera de alcance) + `backend/src/routes/reportes.js`.

- Se agrega la fila `reportes` a la tabla `modules` (hoy existen: `apps`, `caja`, `caja_movimientos`, `categorias`, `locales`, `metodos_pago`, `pagos`, `proveedores`, `rubros`, `usuarios` — ninguno es `reportes`).
- En `backend/src/routes/reportes.js`, el `viewHandler` compartido por los 3 endpoints (`GET /cajas`, `GET /pagos`, `GET /cmv`) pasa de `fastify.can('caja', 'view')` a `fastify.can('reportes', 'view')`.
- **Preservar el acceso actual de cada rol** (vía `RolePermission`, insertado una sola vez contra la base real):
  - `super_admin`: sin cambios — ya bypasea todo permiso (`request.isSuperAdmin` en `can()`).
  - `dcsmart`: se agrega `RolePermission { id_role: dcsmart, id_module: reportes, can_view: true }` — mantiene acceso automático, como ya lo tiene hoy.
  - `admin`: **no** se agrega ninguna fila — pierde el acceso automático que tenía "prestado" de `caja`, pasa a depender de un permiso individual (ver sección 2). Esto es el único cambio de comportamiento por defecto, explícitamente decidido.
  - `cajero`: sin cambios, nunca tuvo acceso a Reportes ni lo va a tener.

## 2. Backend: permiso individual por usuario (`UserPermission`)

**Archivo:** `backend/src/routes/users.js` (nuevos endpoints)

Hoy no existe ningún endpoint para gestionar `UserPermission` (la tabla ya existe en el schema, pero nunca se usó desde la API). Se agregan:

- **`PUT /api/users/:id/permissions/:moduleName`** — protegido por `[fastify.authenticate, fastify.can('usuarios', 'edit')]`. Body: `{ can_view, can_create, can_edit, can_delete }` (booleans, todos opcionales, default `false` los que falten). Hace un `upsert` sobre `UserPermission` con `where: { id_user_id_module: { id_user, id_module } }`. Para el alcance de este spec, el frontend solo va a usar esto para togglear `can_view` del módulo `reportes`, pero el endpoint queda genérico (reutilizable a futuro para cualquier módulo).
- **`DELETE /api/users/:id/permissions/:moduleName`** — mismo guard, borra la fila `UserPermission` si existe (volver a "usa el permiso del rol, sin override"). Se usa para "sacar" el permiso individual, en vez de un `PUT` con todo en `false` (evita dejar una fila fantasma con todo en `false` que además *bloquearía* explícitamente el módulo aunque el rol sí lo permita — recordar que `can()` trata una fila `UserPermission` existente como autoritativa incluso si es todo `false`).

## 3. Backend: rol nuevo `reportes`

Se crea (una sola vez, contra la base real) el rol `reportes` con `RolePermission { id_module: reportes, can_view: true }` y ninguna fila más — sin acceso a `caja`, `pagos`, `proveedores`, etc. Se asigna a usuarios vía `UserAppRole` exactamente igual que cualquier otro rol (ya soportado por el Admin de Usuarios existente, sin cambios ahí).

## 4. Backend: `GET /api/auth/my-apps` expone el permiso real de Reportes

**Archivo:** `backend/src/routes/auth.js`

Cada entrada del array que devuelve `my-apps` (`{ app, role, locales }`) gana un campo nuevo `can_reportes: boolean`, calculado con la misma lógica de resolución que `can()` (bypass si `super_admin`, `true` si el rol tiene `RolePermission` en `reportes`, `UserPermission` individual manda si existe) — para que el frontend no tenga que adivinar ni duplicar la lógica de permisos, solo lea este campo ya resuelto.

## 5. Frontend: pantalla "¿Administrar o entrar a un grupo?"

**Archivo nuevo:** `frontend/src/pages/StartChoice.jsx`

- Después del login (`refreshUser` completo), si el usuario tiene `super_admin` o `dcsmart` en **cualquiera** de sus filas de `user_app_roles` (no en una app puntual — se mira la lista completa que ya devuelve `/api/auth/me`), se lo redirige a esta pantalla nueva en vez de directo a `/select-app`.
- Si no tiene ese nivel de rol en ningún lado, sigue exactamente igual que hoy (directo a `/select-app`).
- Dos opciones: **"Administrar"** → navega a `/admin/users` sin pasar por `setActiveApp` (la ruta de Admin deja de requerir una app activa, ver sección 6). **"Entrar a un grupo"** → navega a `/select-app`, flujo intacto.

## 6. Frontend: rutas de Admin dejan de depender de una app activa

**Archivo:** `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/App.jsx`

- El chequeo de `roles` en `ProtectedRoute` hoy lee `activeApp?.role` (el rol en la app actualmente elegida). Para las rutas de Admin específicamente, se necesita en cambio "¿tiene este usuario `super_admin`/`dcsmart` en *cualquiera* de sus roles?" — un chequeo global, no atado a `activeApp`. Se agrega esta variante (ej. un prop nuevo `globalRoles` en `ProtectedRoute`, evaluado contra `useAuthStore().user.user_app_roles` en vez de `useAppStore().activeApp?.role`), y las rutas `admin/*` y `auditorias` pasan a usarla.
- El Sidebar, cuando no hay `activeApp` (porque se entró directo a Admin), muestra un layout simplificado: sin selector de local, sin "Cambiar grupo" (en su lugar, algo como "Salir de Admin" que lleva de vuelta a `/select-app` o a la pantalla de la sección 5).

## 7. Frontend: acceso a Reportes por permiso real, no por rol

**Archivo:** `frontend/src/components/Sidebar.jsx`, `frontend/src/App.jsx`

- El ítem de navegación "Reportes" en `NAV_MAIN` deja de filtrarse por `roles: [...]` y pasa a mostrarse solo si `activeApp?.can_reportes` es `true` (el campo nuevo de la sección 4).
- La ruta `/reportes` en `App.jsx` cambia su `Guard` para chequear ese mismo campo en vez de la lista de roles.
- Rol `reportes`: además de tener `can_reportes: true`, su navegación se reduce a **solo** el ítem Reportes (se ocultan Dashboard/Cajas/Pagos/Proveedores/PDP del menú), y al terminar de elegir grupo/local en `AppSelector.jsx`, en vez de navegar a `/dashboard` navega directo a `/reportes`.
- Se agregan `Guard`s a `/dashboard`, `/cajas`, `/pagos` y sus subrutas (hoy no tienen ninguno) para que un usuario con rol `reportes` no pueda llegar ahí ni tipeando la URL a mano — actualmente esas rutas solo estaban protegidas "en los hechos" por los permisos del backend (que igual las hubiera bloqueado con 403, pero mostrando una pantalla rota en vez de redirigir con gracia).

## 8. Frontend: toggle "Puede ver Reportes" en Admin → Usuarios

**Archivo:** `frontend/src/pages/admin/Users.jsx`

En el detalle de un usuario (donde ya se gestionan roles y accesos a locales), se agrega un checkbox simple: **"Puede ver Reportes"**, que llama `PUT`/`DELETE /api/users/:id/permissions/reportes` (sección 2) según se marque o desmarque. Solo aplica de forma útil a usuarios con rol `admin` (los demás roles ya tienen la respuesta resuelta por su rol: `super_admin`/`dcsmart` siempre sí, `cajero`/`reportes` siempre no/sí respectivamente) — pero el checkbox puede mostrarse igual para cualquier usuario, sin restricción especial, dado que es solo una fila `UserPermission` más.

## Fuera de alcance

- Un editor genérico de permisos por módulo para cualquier combinación rol/usuario (`UserPermission` queda con un único endpoint reusable, pero la UI de este spec solo cablea el caso "reportes").
- Una migración automática/script formal (`prisma migrate`) para insertar el módulo y los `RolePermission` nuevos — se hace con un script chico de una sola vez contra la base real, con confirmación explícita del usuario antes de correrlo (mismo criterio que cualquier cambio de datos en producción de este proyecto).
- Cambiar cómo funciona `UserLocalAccess`/asignación de locales — no se toca.
- Subdominios o despliegues separados por zona — todo sigue siendo la misma SPA, solo cambia el árbol de rutas/navegación internamente.

## Testing / verificación

- Con un usuario `super_admin` y otro `dcsmart`: loguear y confirmar que aparece la pantalla "¿Administrar o entrar a un grupo?"; probar ambas opciones.
- Con un usuario `admin` o `cajero`: loguear y confirmar que NO aparece esa pantalla, va directo al selector de apps como siempre.
- Repasar, para cada rol existente (`super_admin`, `dcsmart`, `admin`, `cajero`), qué módulos puede ver/crear/editar/borrar antes y después del cambio, confirmando que la única diferencia real es que `admin` deja de ver Reportes por defecto.
- Crear un usuario nuevo con rol `admin`, confirmar que no ve Reportes; activarle el toggle "Puede ver Reportes" desde Admin → Usuarios, confirmar que ahora sí lo ve (sin volver a loguearse, o revalidando `my-apps` según corresponda).
- Crear un usuario con el rol nuevo `reportes`, asignado a una app, confirmar que: entra, elige grupo/local, aterriza directo en Reportes, y no ve ni puede navegar (ni por URL) a Dashboard/Cajas/Pagos/Proveedores.
- Confirmar que ir directo a `/admin/users` (sin haber elegido ninguna app) funciona para `super_admin`/`dcsmart`, y sigue bloqueado para todos los demás roles.
