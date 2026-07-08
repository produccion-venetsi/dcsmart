# Pantalla de auditorías (reporte agregado, solo superadmin)

**Fecha:** 2026-07-02
**Estado:** Aprobado, pendiente de implementación

## Contexto

El trabajo anterior (`docs/superpowers/specs/2026-07-01-historial-auditoria-design.md`) implementó un historial de auditoría append-only para pagos y cajas, visible dentro del panel de detalle de cada registro individual. Ese spec dejó explícitamente fuera de alcance una "pantalla/reporte agregado" con todos los eventos de auditoría y filtros — este documento la especifica.

## Objetivo

Una pantalla nueva, accesible solo para el rol `super_admin`, que liste **todos** los eventos de auditoría (de pagos y cajas juntos) en una sola tabla, con filtros por fecha, módulo, usuario y acción.

## Backend

Nuevo archivo `backend/src/routes/auditorias.js`, registrado en `server.js` con prefix `/api/auditorias`.

### `GET /api/auditorias`

- **Guard:** `[fastify.authenticate, fastify.requireSuperAdmin]` — sin `appContext`, ya que es una vista global cross-app/cross-local (a diferencia del resto de las rutas, que restringen por `allowedLocalIds`).
- **Query params:**
  - `desde`, `hasta` (fechas, filtran por `audits.fecha`)
  - `tabla` (`'pagos'` | `'cajas'`, opcional — sin este filtro trae ambos)
  - `id_user` (opcional, filtra por quién hizo el evento)
  - `accion` (`'auditado'` | `'desauditado'`, opcional)
  - `page`, `limit` (paginación, mismo patrón que el resto de los listados)
- **Respuesta:** `{ data, total, page, limit }`. Cada fila de `data`:
  ```json
  {
    "id": "...",
    "fecha": "2026-07-02T14:32:00.000Z",
    "tabla": "pagos",
    "id_registro": "...",
    "accion": "auditado",
    "observaciones": null,
    "user": { "id": "...", "nombre": "Juan Pérez" },
    "registro_label": "OP-123"
  }
  ```
- **Resolución de `registro_label`:** dado que `Audit` es polimórfica (`tabla` + `id_registro`, sin relación Prisma directa a `Pago`/`Caja`), se resuelve con dos queries adicionales acotados a los `id_registro` presentes en la página actual: `pago.findMany({ where: { id: { in: [...] } }, select: { id, nro_ord } })` para las filas con `tabla==='pagos'`, y `caja.findMany({ where: { id: { in: [...] } }, select: { id, nro_turno } })` para `tabla==='cajas'`. Se arma un mapa `id → etiqueta` (`"OP-123"` o `"TRN-45"`, o `"—"` si el registro ya no existe) y se adjunta a cada fila antes de responder. Este resuelve-por-página evita traer todos los pagos/cajas del sistema.

### `GET /api/auditorias/usuarios`

- Mismo guard (`requireSuperAdmin`).
- Devuelve la lista de usuarios distintos que aparecen como `id_user` en `audits` (join `Audit` → `User`, `distinct` por `id_user`), para poblar el `<select>` de filtro de usuario en el frontend sin traer todos los `User` del sistema.
- Respuesta: `[{ id, nombre }, ...]`.

## Frontend

- **Nuevo `frontend/src/api/auditorias.js`:**
  ```js
  export const auditoriasApi = {
    list:     (params, signal) => client.get('/auditorias', { params, signal }),
    usuarios: (signal)         => client.get('/auditorias/usuarios', { signal }),
  }
  ```
- **Nueva página `frontend/src/pages/auditorias/Auditorias.jsx`:**
  - Filtros arriba: fecha desde/hasta, módulo (Todos/Pagos/Cajas), usuario (select poblado con `auditoriasApi.usuarios()`), acción (Todos/Auditado/Desauditado) — mismo patrón visual que los filtros de `PagoList.jsx`/`ReportePagos.jsx`.
  - Tabla con columnas: Fecha (fecha y hora), Módulo, Registro (`registro_label`, con link a `/pagos` o `/cajas` según `tabla` — sin deep-link al registro puntual), Usuario, Acción (badge verde/ámbar como en el historial por-registro), Observación.
  - Paginación igual que `PagoList.jsx`.
- **Nuevo item de menú "Auditorías"** en el sidebar, visible solo cuando el rol efectivo del usuario logueado es `super_admin` (mismo criterio de gating por rol que ya usa el frontend en otras partes de la UI).
- **Ruta nueva** en el router de la app: `/auditorias` → `Auditorias.jsx`.

## Fuera de alcance

- Exportar a CSV/PDF.
- Deep-link directo al pago/caja específico desde la fila de auditoría (la columna "Registro" linkea a la lista general de `/pagos` o `/cajas`, no al registro puntual).
- Gráficos o KPIs sobre las auditorías — solo tabla con filtros.

## Testing / verificación

- Backend: verificar con curl (usuario superadmin) que `GET /auditorias` filtra correctamente por cada query param individualmente y combinados, que la paginación funciona, y que un usuario no-superadmin recibe 403.
- Verificar que `registro_label` resuelve correctamente tanto para pagos como para cajas, y que no rompe si el pago/caja referenciado ya fue borrado (debe mostrar `"—"`, no fallar).
- Frontend: probar en navegador que el menú "Auditorías" solo aparece para superadmin, que los 4 filtros funcionan individualmente y combinados, y que los links de la columna "Registro" navegan correctamente.
