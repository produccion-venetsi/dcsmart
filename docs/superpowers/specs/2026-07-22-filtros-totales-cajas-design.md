# Filtro por tipo de turno y totales en Cajas

## Contexto

La tabla de Cajas (`frontend/src/pages/cajas/CajaList.jsx`) ya tiene un panel de filtros con Desde/Hasta y Auditado, pero no permite filtrar por tipo de turno. Además, el backend ya expone `GET /cajas/stats` (agregados de `total`, `efectivo`, `tickets`, `comensales`, cantidad de turnos) pero ningún componente del frontend lo llama — quedó sin usar.

## Objetivo

1. Agregar un filtro por "Tipo de turno" (Mañana/Tarde/Noche/Trasnoche/Evento/Otros) a la tabla de Cajas.
2. Mostrar un cuadro de totales (recaudado, efectivo, turnos, tickets, comensales) cuando el usuario tenga un rango de fecha (Desde y Hasta) aplicado, usando `GET /cajas/stats`.
3. Que ese cuadro de totales refleje los mismos filtros activos en la tabla (fecha, auditado, tipo), no solo la fecha.

## Diseño

### 1. Backend — filtro por tipo de turno en `GET /cajas` (list)

En `backend/src/routes/caja.js`, el handler `GET /` agrega `tipo_turno` a los params desestructurados y al `where`, usando `toTipoTurnoEnum` (ya existente en el mismo archivo) para convertir la etiqueta visible (`"Mañana"`) a la clave del enum (`MANANA`) antes de filtrar.

### 2. Backend — extender `GET /cajas/stats`

Mismo archivo: `GET /stats` agrega `audit` y `tipo_turno` a los params y al `where`, reutilizando `buildCajaAuditFilter` (ya existente, usado en `GET /`) y `toTipoTurnoEnum`. El resto del endpoint (agregación `_sum`/`_count`) no cambia.

### 3. Frontend — filtro de tipo de turno

En `CajaList.jsx`:
- `FILTER_INIT_CAJAS` pasa de `{ desde: '', hasta: '', audit: '' }` a incluir `tipo_turno: ''`.
- En el panel de filtros, un nuevo `<select>` (mismo patrón visual que el de Auditado) con las 6 opciones fijas del enum `TipoTurno` (las mismas etiquetas ya usadas en los formularios de alta/edición de Caja: Mañana, Tarde, Noche, Trasnoche, Evento, Otros), más "Todos" para no filtrar.
- Se agrega `tipo_turno` al armado de params de la consulta de listado (donde hoy se arman `audit`/`desde`/`hasta`).

### 4. Frontend — cuadro de totales

- Nuevo estado `stats`/`statsLoading` (mismo patrón que el resumen de Pagos: `useEffect` gateado en `filters.desde && filters.hasta`, llamando `cajasApi.stats(params)` con los mismos filtros que ya arma la tabla — incluyendo ahora `audit` y `tipo_turno`).
- UI: fila de tarjetas (mismo estilo visual que las del resumen de Pagos) con: Total Recaudado, Total Efectivo, Turnos, Tickets, Comensales. Se muestra solo cuando `filters.desde && filters.hasta`.
- Si la consulta falla, se notifica el error y no se muestran las tarjetas (no bloquea el resto de la pantalla) — mismo criterio que en Pagos.

## Alcance

Incluye: filtro de tipo de turno (tabla + stats), cuadro de totales gateado por fecha, extensión de `/cajas/stats`.

Fuera de alcance: cambiar las columnas del CSV de Cajas, cambiar la paginación, tocar el endpoint `/cajas/:id` o los formularios de alta/edición.

## Testing

- Backend: verificar contra la base real que `GET /cajas?tipo_turno=Mañana` y `GET /cajas/stats?tipo_turno=Mañana&audit=true` filtran correctamente.
- Frontend: build limpio; verificación manual en navegador de que el filtro de tipo funciona y que el cuadro de totales aparece/desaparece según el gate de fecha y coincide con sumar manualmente las filas visibles.
