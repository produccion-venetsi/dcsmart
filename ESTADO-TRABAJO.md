# Estado del trabajo — DCSmart

_Última actualización: 2026-06-16_

Resumen del trabajo realizado sobre la app DCSmart (frontend React + backend Fastify/Prisma)
durante las sesiones de desarrollo en el ambiente `dev`.

---

## 1. Ambientes dev / producción

**Estado: ✅ Hecho**

- Se separó el flujo de despliegue: `master` → producción, `dev` → canal de preview de Firebase.
- Workflow nuevo: `.github/workflows/deploy-dev.yml`
  - Se dispara al hacer push a la rama `dev`.
  - Despliega con `firebase hosting:channel:deploy dev` (mismo site `dc-smart-mvp`).
  - URL de dev: **https://dc-smart-mvp--dev.web.app**

---

## 2. Cajas

**Estado: ✅ Hecho**

- **Fix:** las cajas no aparecían cuando se elegía "Todos los locales" (la tabla estaba
  condicionada a tener un local activo). Ahora la tabla se muestra siempre.
- Se agregó la columna **"Local"** al final de la tabla de cajas, siempre visible.

---

## 3. Pagos — Filtros

**Estado: ✅ Hecho**

- Sistema de filtros completo dentro de un **popover** (no satura la tabla), con fondo sólido.
- **Atajos rápidos (chips):** STK, CMV, No auditado, No pagado, Egreso.
- **Filtros completos:** tipo, método, rubro, categoría (cascada rubro→categoría), pagado,
  estado op., auditado, dirección (ingreso/egreso), rango de fechas.
- Los filtros se aplican **recién al presionar "Aplicar"** (se editan sobre un borrador y no
  disparan recargas en cada cambio). "Limpiar todo" resetea borrador y filtros.

---

## 4. Pagos — Auditoría

**Estado: ✅ Hecho**

- Funcionalidad de auditar/desauditar arreglada de punta a punta (botón, backend, feedback).
- **Arquitectura real:** el estado "auditado" **no** es una columna de `pagos`; vive en la
  tabla `audits` (`tabla='pagos'`, `id_registro=pago.id`). El backend calcula `audit: boolean`
  y lo agrega a cada pago.
- Toggle: si existe registro → se borra (desauditar); si no → se crea (auditar).
- Confirmación al **desauditar** ("¿Querés desauditarla?").
- **Spinner** de carga mientras se audita, tanto en la tabla como en el panel de detalle.

---

## 5. Módulo PDP (Plan de Pago) — NUEVO

**Estado: 🟡 Primera entrega lista · faltan etapas**

Reconstrucción del módulo "DASH ARMADO PDP" de la app vieja (AppSheet). Flujo de 3 etapas
para armar y ejecutar pagos a proveedores.

### Lo que ya funciona ✅

- Nueva página **`/pdp`** (ítem "PDP" en el menú lateral).
- **Dashboard de 3 columnas:**

  | Columna | Condición | Acción |
  |---|---|---|
  | **Deuda** | `estado_op = CUENTA_CTE` y `pagado = false` | seleccionar → **Mandar a PDP** |
  | **En PDP** | `estado_op = PDP` | solo lectura (revisión) |
  | **Pagar PDP** | `estado_op = PDP` y `pagado = false` | seleccionar → **Pagar** (fecha + forma de pago) |

- **Agrupación por proveedor** (razón social) con subtotal por proveedor y total general por columna.
- **Selección** por fila o por proveedor completo; barra que muestra "N sel · $monto".
- **Proveedores colapsables:** click en el encabezado pliega/despliega; botón para colapsar o
  expandir todos a la vez; contador de órdenes visible aunque esté colapsado.
- Al ejecutar una acción se recargan las 3 columnas y la orden se mueve sola de etapa.

### Backend agregado

- `POST /pagos/mandar-pdp` `{ ids }` → cambia `estado_op` a `PDP` (valida acceso por local).
- `POST /pagos/pagar` `{ ids, fecha_pago, id_metodo }` → marca `pagado = true` + fecha + método.
- Se agregó `razon_social` al `select` del proveedor en `GET /pagos` (para agrupar).

### Pendiente ⬜ (próximas etapas)

- **Carátula / Reporte PDP + PDF:** generar el lote tipo `3MONOS_010426` con RESUMEN (total por
  proveedor) + DETALLE (orden, fecha, razón social, nro factura, importe) y envío por mail.
  Requiere modelar una tabla nueva (`reporte_pdp`) y un generador de PDF.
- **Campo `id_pdp`** en `Pago` para identificar el lote de pago.
- Considerar **paginar/agrupar en backend** si la deuda supera ~1000 órdenes (hoy se traen hasta
  1000 por columna sin paginar para poder agrupar).

---

## Notas técnicas

- **Auditoría:** estado en tabla `audits`, no en `pagos`.
- **Estados de pago (`estado_op`):** enum Prisma `CAJA`, `CUENTA_CTE` (`"CUENTA CTE"`),
  `MP_PDP` (`"MP PDP"`), `PDP`.
- **Lint:** el repo usa el plugin estricto `react-hooks` v7 que marca el patrón de fetch en
  `useEffect` (avisos preexistentes en todo el código). El deploy corre `npm run build`
  (no `lint`), por lo que no bloquea.
