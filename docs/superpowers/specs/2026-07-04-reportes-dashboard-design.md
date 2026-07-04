# Reportes / Dashboard (Bloque 3 del backlog de producción)

**Fecha:** 2026-07-04
**Estado:** Aprobado, pendiente de implementación
**Rama:** `DEV-08-production-goal`

## Contexto

Ver `docs/superpowers/plans/backlog-produccion.md` — este spec cubre el Bloque 3 completo: reducir la carga inicial del Dashboard con una pantalla de bienvenida liviana, fusionar el contenido de Dashboard dentro de Reportes, separar el reporte combinado de Pagos/Cajas en dos pestañas propias, y agregar reportes nuevos sobre auditoría/efectivo/comprobantes no fiscales.

Hallazgo clave durante el diseño: el endpoint `GET /api/reportes` actual (usado hoy por la pestaña "Pagos y Cajas") es en realidad casi enteramente un reporte de **Cajas** (ventas, Z/fiscal, ticket promedio, cubiertos, medios de pago desde `caja_movimientos`, evolución semanal, desperdicios/invitaciones desde `caja_detalles`). El único dato genuinamente de Pagos que trae hoy es `total_adeudado`. Separar "Pagos" de "Cajas" es entonces más una reorganización real del backend que una simple división visual de una pestaña en dos.

## Objetivo

1. Que la pantalla de entrada (`/dashboard`) sea liviana: sin fetch de KPIs/gráficos al cargar, solo saludo + accesos rápidos.
2. Que Reportes sea la pantalla principal con **todos** los reportes que el usuario necesita, en 3 pestañas: Pagos, Cajas, CMV.
3. Reportes nuevos en la pestaña Pagos: cantidad/monto de pagos auditados, no auditados, en efectivo, y "no avión" (no fiscal, sin IVA).

## 1. Pantalla de entrada (Dashboard)

**Archivo:** `frontend/src/pages/Dashboard.jsx`

Se elimina el `useEffect` que hoy trae `pagosApi.stats`/`cajasApi.stats`/`pagosApi.chart` al montar. El componente queda reducido a:

- Saludo con el nombre del usuario.
- Botón grande "Ver Reportes" (navega a `/reportes`).
- Los accesos rápidos que ya existen hoy (`QUICK_ACTIONS` — links directos a Pagos, Cajas, etc., que no disparan fetch propio).

No se elimina la ruta `/dashboard` ni el link en el menú — solo se aliviana su contenido. Los KPIs y gráficos que hoy vive ahí se recrean (no se mueven literalmente, el código se reescribe) dentro de la nueva pestaña "Cajas" de Reportes, que es donde corresponden según los datos que realmente traen.

## 2. Reportes: 3 pestañas

**Archivo:** `frontend/src/pages/reportes/Reportes.jsx`

El array `TABS` pasa de `[Pagos y Cajas, CMV]` a `[Pagos, Cajas, CMV]`. `ReporteCMV.jsx` no cambia.

- **`ReporteCajas.jsx` (nuevo):** contiene lo que hoy tiene `ReportePagos.jsx` bajo el nombre "Pagos y Cajas" — total ventas, Z/fiscal, ticket promedio, cubiertos, gráfico de evolución semanal, medios de pago, desperdicios/invitaciones. Consume el nuevo endpoint `GET /api/reportes/cajas`.
- **`ReportePagos.jsx` (rehecho):** pasa a mostrar datos genuinamente de Pagos — total adeudado (ya existía) + los 4 KPIs nuevos (ver sección 4). Consume el nuevo endpoint `GET /api/reportes/pagos`.

## 3. Backend: separar el endpoint

**Archivo:** `backend/src/routes/reportes.js`

- El `GET /` actual (que es 90% de datos de Cajas) se renombra a `GET /cajas`, sin cambios de lógica interna — mismo `cajaAgg`, `payRows` (medios de pago desde `caja_movimientos`), `weekRows`, `detRows` (desperdicios/invitaciones). Se remueve del payload lo único que no es de Cajas: `total_adeudado` y su `pct_adeudado`.
- **`GET /pagos` (nuevo):** mismo `preHandler` (`viewHandler` = `[authenticate, appContext, can('caja','view')]`, igual que el resto del archivo) y misma validación de `desde`/`hasta`/`id_local`/`allowedLocalIds`. Devuelve:
  - `total_adeudado` / `count_adeudado`: pagos con `pagado: false` en el rango (ya existía en el endpoint viejo, se traslada tal cual).
  - `count_auditados` / `count_no_auditados`: se resuelve igual que en `pagos.js` (`getAuditedSet`/`getAuditedCajaSet`-equivalente para pagos) — un pago está "auditado" si su registro más reciente en `Audit` (`id_registro` = id del pago, `tipo` polimórfico de pagos) tiene `accion = 'auditado'` y `vigente = true`.
  - `total_efectivo` / `count_efectivo`: `pago.aggregate` filtrando por `metodo_pago.nombre = 'Efectivo'` (join a `MetodoPago`), en el rango de fechas.
  - `total_no_avion` / `count_no_avion`: `pago.aggregate` filtrando por `id_tipo = 'C'`, en el rango de fechas.
- **`GET /cmv`:** no cambia.

## 4. Frontend: `ReportePagos.jsx`

Cards de KPI con el mismo estilo ya usado en Reportes (`rep-kpi`/`rep-kpi-grid`):

1. Total adeudado (monto + cantidad de pagos pendientes) — ya existía.
2. Auditados (cantidad).
3. No auditados (cantidad).
4. En efectivo (monto + cantidad).
5. No avión — Tipo C (monto + cantidad).

Todos filtrados por el mismo rango `desde`/`hasta` + `id_local` que ya usa el resto de Reportes (mismo selector de fecha compartido del componente padre `Reportes.jsx`).

## Fuera de alcance

- Cambios visuales al selector de fecha o a la estructura general de `Reportes.jsx` más allá de agregar la pestaña — el selector de rango y el layout de pestañas ya existen y no cambian.
- Nuevos permisos o roles — se reutiliza el mismo `viewHandler` (`can('caja','view')`) que ya protege todo `reportes.js` hoy, sin agregar un permiso separado para el reporte de Pagos.
- Cualquier cambio a `ReporteCMV.jsx`.

## Testing / verificación

- Entrar a `/dashboard` y confirmar que no se dispara ningún fetch de stats/gráficos (revisar Network tab): solo debe verse el saludo y los accesos rápidos.
- Entrar a Reportes y confirmar que aparecen 3 pestañas: Pagos, Cajas, CMV.
- Pestaña Cajas: confirmar que los datos (ventas, Z, ticket promedio, medios de pago, gráfico semanal, desperdicios/invitaciones) coinciden con lo que mostraba antes la pestaña combinada.
- Pestaña Pagos: confirmar que aparecen los 5 KPIs (adeudado, auditados, no auditados, efectivo, no avión) con valores coherentes para un rango de fechas conocido — comparar manualmente auditados/no auditados contra el listado de Pagos filtrado por "Auditado"/"No auditado", y no avión contra el listado filtrado por Tipo C.
- Cambiar el selector de local/fecha y confirmar que las 3 pestañas reaccionan igual que hoy.
