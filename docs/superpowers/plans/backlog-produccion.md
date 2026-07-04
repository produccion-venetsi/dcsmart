# Backlog "camino a producción" — DEV-08-production-goal

Fecha de armado: 2026-07-03
Rama de trabajo: `DEV-08-production-goal` (desde `dev`, sin PR todavía)

Este documento es el backlog completo que se armó en conversación (no vino de un spec/plan formal como el resto de `docs/superpowers/`), separado en 6 bloques. Se va actualizando el estado de cada ítem a medida que se implementa y se prueba en vivo.

**Convención de estado:** `[ ]` pendiente · `[~]` implementado, falta probar en vivo · `[x]` implementado y confirmado por el usuario · `[?]` en duda / requiere otra vuelta

---

## Bloque 1 — Fixes chicos y bugs (sin spec, van directo a implementación)

1. `[x]` Autofill del navegador en Login se veía con fondo blanco → fix CSS (`:-webkit-autofill`).
2. `[x]` Selector de período del Dashboard (incluida fecha personalizada) — confirmado por el usuario en vivo, funciona bien.
3. `[x]` Bug reportado de cajas en el Dashboard no reactivas a la fecha — confirmado por el usuario en vivo que **no era un bug real** (consistente con la revisión de código previa, donde `desde`/`hasta` ya se aplicaban bien en frontend y backend).
4. `[x]` Botón de auditar y de eliminar sacados de la fila de tabla en Pagos y Cajas — "Auditado" queda como dato de solo lectura, más cerca del principio de las columnas. Las acciones (auditar, editar, eliminar) ahora viven solo en el panel de detalle (se agregó el botón "Eliminar" al detalle de Caja, que antes solo existía en la fila).
5. `[x]` Card del selector de apps: mostrar los nombres reales de todos los locales (no un texto genérico ni un conteo) — iterado varias veces hasta quedar bien:
   - v1: texto genérico "Todos los locales" → **incorrecto**, el usuario pedía lo contrario.
   - v2: nombres truncados en una línea con tooltip → reemplazado.
   - v3: hover-accordion que hacía crecer la card → rompía el diseño de grilla, descartado.
   - v4: ticker que corría todo el tiempo (se pausaba en hover) → el usuario pidió que sea al revés.
   - v5: invisible por defecto, aparece + desliza solo con hover → con 3 locales no entraba el tercero, y con pocos el primero se veía difuminado (el degradado de bordes se aplicaba siempre).
   - v6: degradado de bordes solo cuando hay scroll real; umbral de "cuenta con scroll" bajado a ≥3 (antes &gt;3).
   - v7 (final, confirmado): duración de la animación proporcional al largo total del texto, para que la velocidad (px/seg) sea siempre la misma sin importar cuántos locales o qué tan largos sean los nombres.
6. `[x]` Texto "Cuenta personal" debajo del nombre de usuario en el selector de apps: era texto fijo sin información real → se sacó directamente.

**Bloque 1: completo y confirmado por el usuario.**

## Bloque 2 — Rediseño de formularios (spec: `2026-07-03-rediseno-formularios-design.md`, plan: `2026-07-03-rediseno-formularios.md`)

7. `[x]` Reordenar form de Pagos: proveedor ya no ocupa una fila entera (se agrupa con Rubro/Categoría y Método de Pago); las 4 fechas (Factura, Período, Cashflow, Fecha de Pago) quedan juntas en un mismo bloque.
8. `[x]` Inputs de fecha/select clickeables en cualquier parte del input (fix compartido en `Layout.jsx`, no por formulario) — pendiente de verificación visual en navegador.
9. `[x]` Nuevo componente `AdjuntoUpload` (dropzone) reemplaza el input de archivo nativo en Pagos (foto + PDF, ambos permitidos) y Cajas (que además ganó upload real de fotos — antes era un input de URL manual, sin backend de subida).
10. `[x]` Quitar foto/PDF cómodamente desde `AdjuntoUpload` (botón grande de eliminar); la "x" diminuta de proveedores se agrandó a un botón circular de 24px con hover (fix aplicado aparte, se había quedado afuera del spec original por error).

**Bloque 2: completo, pendiente de verificación visual en navegador** (revisión final de código limpia, incluye un fix de preview rota con fotos `gs://` ya guardadas).

## Bloque 3 — Reportes/Dashboard (spec: `2026-07-04-reportes-dashboard-design.md`, plan: `2026-07-04-reportes-dashboard.md`)

11. `[x]` Dashboard reducido a pantalla de bienvenida liviana (saludo + botón "Ver Reportes" + accesos rápidos), sin fetch de stats al cargar.
12. `[x]` Reportes es ahora la pantalla principal, con todos los reportes (Pagos, Cajas, CMV).
13. `[x]` Separado el reporte combinado en pestañas propias: Pagos / Cajas / CMV.
14. `[x]` Reportes nuevos en Pagos: auditados, no auditados, en efectivo. "No avión" (no fiscal, sin IVA) resultó ser un concepto de **Cajas**, no de Pagos — corregido: se unificó con el placeholder "Porc Avión" que ya existía ahí (antes hardcodeado en 0%, duplicado con "Porc No Fiscal"), ahora con el dato real (total - fiscal, %).

**Bloque 3: completo, pendiente de verificación visual en navegador.**

## Bloque 4 — Cajas a la par de Pagos (spec propia, no arrancado)

15. `[ ]` Botón "Filtros" en Cajas (mismo patrón visual/UX que Pagos, pero con campos propios de cajas, no los mismos filtros exactos).
16. `[ ]` Form de caja más completo (todos los campos necesarios) + poder cargar foto/detalles/movimientos *antes* de crear la caja (hoy solo después).

## Bloque 5 — Acciones de tabla + detalle + bulk actions (parcialmente arrancado en Bloque 1 item 4)

17. `[x]` Sacar botones de auditar/borrar de la fila (cubierto en el ítem 4 del Bloque 1).
18. `[ ]` Detalle (pago o caja): reemplazar la fila de botones de arriba (Editar, Auditar, PDP, Pagar, Eliminar, etc.) por un botón "Acciones" que al hacer **hover** despliega toda la sección con las acciones disponibles — en vez de tenerlas todas visibles como botones separados.
19. `[ ]` Selector múltiple (checkboxes) de pagos/cajas en el listado, para auditar o borrar varios a la vez.

## Bloque 6 — Login/Auth (no arrancado)

20. `[ ]` Verificar/reforzar el flujo Google Auth + permisos ya asignados por email (ya existe parcialmente: si el email ya existe sin `google_id`, se asocia automático — falta probarlo a fondo en producción).
21. `[ ]` Favoritos / "más usados" para el usuario que tiene muchas apps/grupos.
22. Recuperar contraseña — **sin cambios**, baja prioridad (la mayoría de los usuarios entran por Google; el login por contraseña probablemente lo usan cuentas compartidas tipo `gestion@dcsmart.app`).

---

## Decisiones ya tomadas (para no repreguntar)

- El texto de "sin locales" en la card de apps es **"Sin apps"** (decisión explícita, "por ahora", el usuario puede cambiarlo después).
- ~~El PDF/foto mutuamente excluyentes en Pagos es lógica intencional~~ → **revertido** en el spec del Bloque 2 (2026-07-03-rediseno-formularios-design.md): el usuario decidió que, por ahora, se pueda cargar foto Y PDF en un mismo pago si quiere. Cajas sigue con un solo adjunto (Foto), porque el modelo no tiene columna de PDF.
- El bug de cajas-no-reactivas-a-fecha en Reportes (no Dashboard) — el usuario aclaró que **solo lo vio en el Dashboard**, no en Reportes.
- Orden de bloques: se decidió arrancar por el Bloque 1 (fixes chicos) antes que los bloques con spec propia.
