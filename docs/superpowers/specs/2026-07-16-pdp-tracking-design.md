# Registro de PDP (Planilla de Pago) — diseño

## Contexto

Hoy el "PDP" (Planilla de Pago) es un reporte que se genera 100% del lado del cliente:
`PdpDashboard.jsx` arma un PDF con `jsPDF`/`jspdf-autotable` (vía `frontend/src/lib/pdpReport.js`) a
partir de los pagos en estado `CUENTA_CTE`/`PDP` del local activo, y lo descarga directo al
navegador (`doc.save(...)`). No queda ningún registro en la base de que ese lote se generó, quién lo
generó, ni cuándo se volvió a descargar.

El modelo `Pago` ya tiene un campo `id_pdp` (`String?`), pero está huérfano — sin relación definida
ni ningún código que lo lea o escriba. `EstadoOp` ya tiene los valores `PDP`/`MP_PDP` para el flujo de
pagos (`mandar-pdp`/`revertir-pdp`/`pagar` en `pagos.js`), pero eso es sobre el estado de cada `Pago`
individual, no sobre el documento/lote en sí.

El patrón ya existente en el codebase para "quién hizo algo y cuándo" es el modelo genérico `Audit`
(tabla/id_registro/id_user/fecha), pero para este caso se decidió una **tabla dedicada nueva**
(`Pdp`), ya que necesita guardar más que un evento de auditoría: el PDF real generado y los pagos que
entraron en ese lote específico.

## Objetivo

Cada vez que se genera un PDP desde el frontend, queda un registro persistente: quién lo creó, cuándo,
en qué local, cuántos pagos/qué total incluía, y el PDF real (no una reconstrucción posterior) para
poder volver a descargarlo más adelante sin depender de que los pagos originales sigan igual.

## Modelo de datos

**Cada click en "Generar reporte" crea una fila `Pdp` nueva** (no se pisa un registro único por
local) — se acumula historial. El PDF que se genera en ese momento se sube a GCS (mismo bucket/
mecanismo que ya usan `Pago.foto_url`/`pdf_url`) y su `gs://` se guarda tal cual — la redescarga
siempre sirve ese mismo archivo, sin regenerarlo, así que es inmune a que los pagos originales
cambien de estado después.

```prisma
model Pdp {
  id              String    @id @default(uuid())
  id_local        String
  created_by      String?
  created_at      DateTime  @default(now())
  ultima_descarga DateTime?
  pdf_url         String    // gs://bucket/path, igual que Pago.pdf_url
  cantidad_pagos  Int
  total           Decimal   @db.Decimal(12, 2)

  local   Local  @relation(fields: [id_local], references: [id])
  creador User?  @relation(fields: [created_by], references: [id])
  pagos   Pago[]

  @@index([id_local, created_at])
  @@map("pdp")
}
```

`Pago.id_pdp` deja de ser un campo huérfano: se agrega la relación `pdp Pdp? @relation(fields:
[id_pdp], references: [id])`, y se setea en cada `Pago` que entró en el lote al crear el `Pdp`.

## Backend

Nuevas rutas (archivo `backend/src/routes/pdp.js`, registrado con prefijo `/api/pdp`):

- **`POST /pdp`** — recibe `{ id_local, pago_ids: string[], pdf_url }`. El `pdf_url` ya viene subido
  previamente por el frontend vía el endpoint genérico `POST /pagos/upload` (ya existente, reusado
  tal cual). Crea la fila `Pdp` (`created_by` = usuario autenticado, `cantidad_pagos` = length de
  `pago_ids`, `total` = suma de `Pago.importe` de esos ids), y hace un `updateMany` de
  `Pago.id_pdp` para todos los `pago_ids` incluidos.
- **`GET /pdp?id_local=X`** — lista el historial de `Pdp` de ese local, `orderBy: created_at desc`
  (el primero de la lista es siempre "el último"), incluyendo `creador.nombre` para mostrar quién lo
  generó.
- **`GET /pdp/:id/attachment`** — mismo patrón que `pagos.js:698` (`GET :id/attachment`): resuelve el
  `gs://` guardado, hace streaming privado del archivo a través del backend (el cliente nunca ve el
  path de GCS directo), con el `Content-Type` de PDF. Antes de responder, actualiza
  `Pdp.ultima_descarga = new Date()` — esto es lo que responde a "cuándo fue la última vez que se
  descargó".

Permisos: mismo criterio que el resto del módulo de pagos (`fastify.can('pagos', 'view')` para
listar/descargar, `fastify.can('pagos', 'create')` para crear un `Pdp` nuevo).

## Frontend

- `PdpDashboard.jsx` — el armado del PDF (`pdpReport.js`) no cambia. Después de generarlo (y de que
  `doc.save(...)` lo descargue al navegador como ya hace hoy), se sube el mismo blob vía
  `POST /pagos/upload` (obtiene `gs://...`), y se llama `POST /pdp` con `id_local`, los ids de los
  pagos incluidos en el lote, y ese `pdf_url`. Si esta parte falla, no debe bloquear la descarga que
  el usuario ya recibió — se notifica el error pero el PDF ya está en su navegador.
- Sección nueva **"Historial de PDP"** dentro de la misma pantalla: tabla con fecha de creación, quién
  lo creó (`creador.nombre`), cantidad de pagos, total, y un botón "Descargar" que pega contra
  `GET /pdp/:id/attachment` (mismo mecanismo que ya usa el visor de adjuntos de Pagos/Cajas).

## Fuera de alcance

- No se migra retroactivamente ningún PDP generado antes de este cambio (no hay datos históricos que
  recuperar, ya que nunca se guardó nada).
- No se agrega ninguna validación nueva sobre el flujo existente de `mandar-pdp`/`revertir-pdp`/
  `pagar` — esos endpoints siguen igual, el `Pdp` es un registro del documento generado, no una etapa
  nueva del flujo de estado de los pagos.
