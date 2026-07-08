# Historial de auditoría (Pagos y Cajas)

**Fecha:** 2026-07-01
**Estado:** Aprobado, pendiente de implementación

## Contexto

Hoy existe un toggle simple de "auditado" (true/false) implementado solo para **pagos**, usando la tabla genérica `audits` (modelo `Audit` en `backend/prisma/schema.prisma`). El toggle actual (`PATCH /pagos/:id/audit` en `backend/src/routes/pagos.js`) borra la fila existente (`deleteMany`) al desauditar y crea una fila nueva al auditar — es decir, no se conserva historial: cada cambio de estado destruye la información del cambio anterior.

**Cajas no tiene ningún tipo de auditado implementado hoy** (ni backend ni frontend).

## Objetivo

1. Convertir el toggle de pagos en un **historial append-only**: cada acción (auditar / desauditar) queda registrada como un evento nuevo, sin borrar eventos anteriores. Se debe poder saber quién y cuándo hizo cada cambio, y ver el motivo cuando se desauditó.
2. Implementar el mismo mecanismo desde cero para **cajas**, reutilizando la tabla `audits` y replicando el patrón de pagos (backend + frontend).
3. Habilitar una vista de "historial de auditoría" por registro (pago o caja), como base para futuros reportes agregados (fuera de alcance de este spec).

## Modelo de datos

Cambios en el modelo `Audit` (`backend/prisma/schema.prisma`):

```prisma
model Audit {
  id            String    @id @default(uuid()) @db.Uuid
  id_registro   String
  tabla         String
  tipo          String
  accion        String    // "auditado" | "desauditado"
  aprobado      Boolean?  @default(false)
  vigente       Boolean   @default(true)
  id_user       String?   @db.Uuid
  user          User?     @relation(fields: [id_user], references: [id])
  fecha         DateTime?
  observaciones String?
  created_at    DateTime? @default(now())
  updated_at    DateTime? @default(now())

  @@index([tabla, id_registro, vigente])
  @@index([tabla, id_registro, fecha])
  @@map("audits")
}
```

Cambios respecto al modelo actual:

- **`accion`** (nuevo, string): `"auditado"` o `"desauditado"`, explícito para no tener que inferir el evento a partir de `aprobado` al leer el historial.
- **`vigente`** (nuevo, boolean, default `true`): marca la fila que representa el **estado actual** de ese `(tabla, id_registro)`. Al insertar un evento nuevo, la fila `vigente=true` anterior de ese mismo registro se actualiza a `vigente=false` dentro de la misma transacción. En todo momento debe existir como máximo una fila `vigente=true` por `(tabla, id_registro)`.
- **`id_user`**: pasa de string suelto a `@db.Uuid` con relación Prisma `@relation` a `User` (mismo patrón que `Pago.created_by` / `Caja.created_by`), para poder traer el nombre de usuario con un `include` en vez de un join manual.
- **Índices nuevos**: `(tabla, id_registro, vigente)` para resolver "estado actual" en listados sin escanear historial completo, y `(tabla, id_registro, fecha)` para traer el historial ordenado cronológicamente.
- **`fecha`** ya es `DateTime` (fecha + hora), no cambia — se sigue generando con `new Date()` en el evento y se muestra en frontend con fecha y hora (ej. `01/07/2026 14:32`).

### Migración de datos existentes

- Los registros actuales en `audits` (todos de pagos) representan el estado actual de cada pago auditado. La migración debe:
  1. Agregar las columnas `accion`, `vigente` (default `true`) y el índice de la FK a `User`.
  2. Backfill: `UPDATE audits SET accion = 'auditado', vigente = true` para todas las filas existentes (ya que hoy solo existen filas de pagos actualmente auditados — no hay estado "desauditado" persistido).
  3. Agregar la FK constraint sobre `id_user` (ya contiene uuids válidos de `request.user.id`, no requiere transformación de datos).

## Backend — Pagos (`backend/src/routes/pagos.js`)

- **`PATCH /:id/audit`**: deja de hacer `deleteMany`/`create`. Nueva lógica, dentro de `fastify.db.$transaction`:
  1. Buscar la fila `vigente=true` para `(tabla:'pagos', id_registro:id)`, si existe.
  2. Si existe y su `accion` es `'auditado'` → **desauditar**: acepta `observaciones` opcional en el body del PATCH (motivo). Marca la fila actual `vigente=false`. Inserta fila nueva: `accion:'desauditado'`, `aprobado:false`, `vigente:true`, `id_user:request.user.id`, `fecha:new Date()`, `observaciones`.
  3. Si no existe, o su `accion` es `'desauditado'` → **auditar**: no pide observaciones. Marca la anterior `vigente=false` (si existe). Inserta fila nueva: `accion:'auditado'`, `aprobado:true`, `vigente:true`, `id_user`, `fecha`.
- **`getAuditedSet`** / **`buildAuditFilter`**: el `where` pasa de "existe alguna fila para ese id" a `vigente:true` (más el filtro por `tabla`/`id_registro` que ya tenían). El resto de la lógica de listado (`GET /`) no cambia.
- **`GET /:id`**: pasa de `findFirst orderBy fecha desc` a `findFirst where vigente:true` — sigue exponiendo `audit`, `audit_by`, `audit_date` igual que hoy.
- **Nuevo endpoint `GET /:id/audit-history`**: devuelve todas las filas de `audits` para `(tabla:'pagos', id_registro:id)`, `orderBy: fecha desc`, con `include: { user: { select: { nombre... } } }`. Mismo permiso que la edición (`fastify.can('pagos', 'edit')`).
- **`DELETE /:id`**: se elimina el `deleteMany` en cascada sobre `audits` — el historial de auditoría se conserva aunque el pago se borre.

## Backend — Cajas (`backend/src/routes/caja.js`, nuevo)

Se replica exactamente el mismo patrón que pagos, usando `tabla:'cajas'`:

- `PATCH /:id/audit` (nuevo).
- `getAuditedSet` / `buildAuditFilter` equivalentes, aplicados al `GET /` de cajas para soportar `?audit=true|false`.
- `GET /:id` de caja expone `audit`, `audit_by`, `audit_date`.
- `GET /:id/audit-history` (nuevo).
- Mismo esquema de permisos: `fastify.can('cajas', 'edit')`.

## Frontend — Pagos

- `frontend/src/api/pagos.js`: `audit(id)` sigue igual (mismo endpoint y método), ahora acepta un body opcional `{ observaciones }`. Se agrega `auditHistory(id) => client.get(\`/pagos/${id}/audit-history\`)`.
- `frontend/src/pages/pagos/PagoList.jsx`: el modal de confirmación de desauditar ("¿Querés desauditarla?") agrega un campo de texto opcional "Motivo (opcional)", enviado como `observaciones`. Al auditar no se pide texto.
- En el panel de detalle del pago, debajo de la fila "Auditado: Sí/No", se agrega una sección **"Historial de auditoría"**: lista de eventos con fecha y hora, usuario, acción (Auditado/Desauditado) y observación si la tiene. Se carga on-demand al abrir el detalle.
- El resto de la UI existente (columna "Audit", filtro Todos/No auditado/Auditado, chip rápido "No auditado") no cambia — sigue basándose en el mismo booleano `audit` que ya devuelve el listado.

## Frontend — Cajas (nuevo)

- `frontend/src/api/cajas.js`: se agregan `audit(id, { observaciones })` y `auditHistory(id)`, análogos a pagos.
- `CajaList.jsx`: se agrega columna "Auditado", filtro Todos/No auditado/Auditado, chip rápido "No auditado" y botón Auditar/Desauditar por fila — replicando la estructura de `PagoList.jsx`.
- `CajaDetail.jsx`: se agrega fila "Auditado: Sí/No", botón de toggle con el mismo modal de confirmación + motivo opcional al desauditar, y la sección "Historial de auditoría".

## Fuera de alcance

- Pantalla/reporte agregado de auditorías (listado transversal con filtros por usuario/fecha/módulo) — queda para una siguiente etapa, una vez que el historial por registro esté funcionando.
- Reportes exportables (CSV/PDF) sobre auditorías.

## Testing / verificación

- Backend: ciclo auditar → desauditar (con motivo) → auditar de nuevo, verificando que `GET /:id/audit-history` devuelve las filas en orden correcto y que solo la última tiene `vigente=true`.
- Verificar que el filtro `?audit=true|false` del listado sigue funcionando igual que antes de la migración (regresión).
- Verificar que borrar un pago o una caja ya no borra su historial de auditoría asociado.
- Frontend: probar en navegador (`/run`) el flujo completo de auditar/desauditar con motivo y ver el historial, tanto en pagos como en cajas.
