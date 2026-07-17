# Grupo de testing visible solo para super_admin — diseño

## Contexto

Se necesita un local de prueba con pagos y cajas de ejemplo para probar features en general (y en
particular el flujo nuevo de PDP) sin que otros usuarios reales (admin, cajero, o incluso `dcsmart`,
que hoy tiene acceso global igual que `super_admin`) vean estos datos de prueba.

Investigado el código real: `GET /apps` (`backend/src/routes/apps.js`) no filtra apps por rol en
absoluto — cualquier usuario con permiso `apps:view` ve el listado completo. Y en
`backend/src/plugins/appContext.js`, el bloque que resuelve el rol efectivo dentro de una app da
bypass automático de scoping (acceso a todos los locales activos) tanto a `super_admin` como a
`dcsmart` — no hay hoy ningún mecanismo para restringir una app a "solo `super_admin`, ni siquiera
`dcsmart`".

## Objetivo

Una app nueva (`TESTING`) con un local (`Local Testing`) y datos de ejemplo (pagos y cajas variados,
incluyendo estados que permitan ejercitar el flujo de PDP), visible **únicamente** para usuarios con
rol `super_admin` — ni `dcsmart`, ni `admin`, ni `cajero` deben poder verla ni acceder, sin importar
qué asignaciones tengan en otras apps.

## Cambios de código

### Schema

Se agrega `App.solo_super_admin Boolean @default(false)`. Default `false` para no afectar ninguna app
existente — solo la app `TESTING` se crea con este flag en `true`.

### `GET /apps` (`backend/src/routes/apps.js`)

Hoy es un `findMany` plano sin filtro de rol. Se agrega: si `request.isSuperAdmin` (flag ya calculado
por `appContext`/`authenticate`, `true` solo cuando el rol literal es `super_admin`) es `false`, se
excluyen del resultado las apps con `solo_super_admin: true`.

### `appContext.js`

En el bloque que hoy da bypass automático a `super_admin`/`dcsmart` (comentario existente: "Roles
globales del usuario: super_admin / dcsmart tienen acceso a TODAS las apps..."), se agrega una
verificación extra: si la app activa (`X-App-Id`) tiene `solo_super_admin: true` y el rol efectivo NO
es literalmente `super_admin` (es decir, es `dcsmart`, o cualquier otro), se responde 403 — sin
bypass, sin importar que `dcsmart` normalmente lo tendría. Un `admin`/`cajero` sin ninguna asignación
a esta app ya recibiría 403 de todas formas por el camino normal (no tiene `UserAppRole`/
`UserLocalAccess` para esta app) — el cambio real es específicamente cerrar el hueco de `dcsmart`.

## Datos de ejemplo

- **App**: `TESTING` (`solo_super_admin: true`).
- **Local**: `Local Testing`, dentro de esa app.
- **~5 `Caja`**: variedad de `tipo_turno`, algunas auditadas (`Audit` con `tabla:'cajas'`) y otras no,
  con `CajaDetalle` variados (usando `DetalleTipo` existentes o creando algunos nuevos scopeados a
  esta app si hace falta), y con `total`/`efectivo`/`fiscal` coherentes entre sí (sin descuadre
  forzado, para no confundir la validación ya existente en `CajaList.jsx`).
- **~8 `Pago`**: mezcla de `estado_op` (`CUENTA_CTE`, `PDP`, y algunos ya `pagado: true`), referenciando
  `Proveedor`/`RubCat`/`MetodoPago` **reales ya existentes** en el catálogo compartido (nunca se crean
  proveedores/rubcat nuevos para esto — se reusan filas de la base real, ya que son catálogos
  globales sin scope de app). Al menos 3-4 pagos en estado `PDP` para poder generar un reporte PDP
  real desde `PdpDashboard.jsx` y probar el flujo completo (subida a GCS + registro + historial +
  redescarga) de punta a punta.

## Fuera de alcance

- No se crea ningún usuario de prueba nuevo — el super_admin ya existente (`produccion@venetsi.com`)
  es quien prueba esto.
- No se toca ningún dato real de otras apps/locales.
- La restricción `solo_super_admin` es un mecanismo genérico reusable (no hardcodeado al nombre
  "TESTING") — cualquier app futura podría marcarse igual si hiciera falta.
