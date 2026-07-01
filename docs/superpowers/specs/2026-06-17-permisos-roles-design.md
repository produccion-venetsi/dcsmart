# Diseño — Modelo de roles, permisos, apps y locales

_Fecha: 2026-06-17_

## Objetivo

Dejar el sistema de usuarios/roles/apps/locales/permisos coherente y funcional con
cuatro roles bien definidos:

- **super_admin**: sin límites. Cambia cualquier cosa de otros usuarios (rol, apps, locales)
  y todos los datos. Acceso a todas las apps. No necesita editar su propia config.
- **dcsmart**: hace todo lo que el super_admin **excepto** (a) gestionar usuarios
  (no entra al módulo usuarios en absoluto) y (b) la tabla rubcat / rubros / categorías
  (solo lectura). Acceso a todas las apps. Puede borrar datos operativos.
- **admin**: ve/crea/edita pero **no borra** ningún dato; **sin acceso al panel admin**;
  acceso otorgado por el super_admin a **una** app con **locales seleccionados**. Ve PDP.
- **cajero**: solo ver y crear **cajas y pagos** de **un** local de una app.

Principio transversal: quien tiene acceso a `pagos`/`caja` obtiene **lectura** de todas las
tablas relacionadas (proveedores, rubros, categorías, métodos de pago, impuestos,
detalle_tipos) para que los formularios funcionen, aunque no pueda gestionarlas.

## Matriz de permisos (módulo → View / Create / Edit / Delete)

| Módulo            | super_admin | dcsmart | admin   | cajero  |
|-------------------|-------------|---------|---------|---------|
| caja              | V C E D     | V C E D | V C E · | V C · · |
| caja_movimientos  | V C E D     | V C E D | V C E · | V C · · |
| pagos             | V C E D     | V C E D | V C E · | V C · · |
| proveedores       | V C E D     | V C E D | V C E · | V · · · |
| rubros            | V C E D     | V · · · | V · · · | V · · · |
| categorias        | V C E D     | V · · · | V · · · | V · · · |
| metodos_pago (nuevo) | V C E D  | V C E D | V · · · | V · · · |
| detalle_tipos (vía `caja`) | V C E D | V C E D | V C E · | V C · · |
| apps              | V C E D     | V C E D | · · · · | · · · · |
| locales           | V C E D     | V C E D | · · · · | · · · · |
| usuarios          | V C E D     | · · · · | · · · · | · · · · |

`super_admin` además tiene **bypass total** en `can()` — no depende de filas de seed.

## Cambios backend

1. **`plugins/permissions.js` (`can`)**
   - Bypass si el usuario es `super_admin` (en la app activa, o en cualquier app si la ruta
     no usa `appContext`).
   - Rutas **sin** `appContext`: evaluar el permiso como **OR sobre todos los `UserAppRole`**
     del usuario (en vez de `findFirst`, que tomaba un rol arbitrario según orden de DB).
   - Rutas **con** `appContext`: usar el rol de la app activa (aislamiento correcto).

2. **`plugins/appContext.js` y `routes/auth.js` (`/my-apps`)**
   - Quitar el fallback "sin filas en `user_local_access` ⇒ todos los locales" para
     `admin`/`cajero`. `super_admin` y `dcsmart` siguen viendo todos los locales de la app.

3. **`routes/metodos_pago.js`**
   - Escrituras (POST/PUT/DELETE) pasan de `can('pagos', …)` a `can('metodos_pago', …)`.
   - GET sigue como lectura (módulo `metodos_pago`, acción `view`).

4. **`routes/users.js`** — endpoints solo `super_admin` (guard explícito `isSuperAdmin`):
   - `POST /users/:id/roles` (ya existía; agregar guard explícito).
   - `POST /users/:id/local-access` `{ id_app, id_local }` — agregar acceso a un local.
   - `DELETE /users/:id/local-access` `{ id_app, id_local }` — quitar acceso.
   - `DELETE /users/:id/roles/:id_app` — quitar rol/app del usuario.

5. **`prisma/seed.js`** — reescrito y **autoritativo** (idempotente):
   - Setea permisos en `create` **y** `update` (hoy `update: {}` no actualizaba nada).
   - Crea rol `dcsmart` y módulo `metodos_pago`.
   - Aplica la matriz de arriba.
   - **Borra los usuarios existentes** (y sus `user_app_roles`, `user_local_access`,
     `user_permissions`; nulea `created_by` en cajas/pagos) y crea los 8 de prueba.

## Cambios frontend

1. **`components/Sidebar.jsx`** — menú filtrado por `activeApp.role`:
   - super_admin: todo.
   - dcsmart: main + Admin **sin** Usuarios, Roles, Rubros/Cats.
   - admin: solo main (Dashboard, Cajas, Pagos, **PDP**, Proveedores).
   - cajero: Dashboard, Cajas, Pagos.

2. **Route guard por rol** — componente (`RoleRoute` o extensión de `ProtectedRoute`) que
   bloquea el acceso por URL directa a `/admin/*` según el rol de la app activa.

3. **`pages/admin/Users.jsx`** — gestión de **múltiples** locales (agregar/quitar) y quitar
   rol de app, usando los endpoints nuevos.

4. **`pages/AppSelector.jsx`** — limpiar labels de roles fantasma (`gerente`, `operador`).

## Usuarios de prueba (8 — 2 por rol)

Contraseña común de prueba; todos `activo`. Reparto sobre apps demo:

- 2 `super_admin` — todas las apps.
- 2 `dcsmart` — todas las apps.
- 2 `admin` — 1 app, varios locales seleccionados.
- 2 `cajero` — 1 app, 1 local.

(El detalle de emails/apps/locales se fija al implementar el seed según las apps/locales
existentes en la DB.)

## Notas / no-objetivos

- No se cambian tablas del schema (no hace falta migración Prisma): todo es data + código.
- `UserPermission` (override por usuario) se mantiene como mecanismo pero no lo usan los
  usuarios de prueba.
- La ejecución del seed es destructiva y corre contra la DB real (Cloud SQL vía proxy):
  se coordina su ejecución con el usuario.
