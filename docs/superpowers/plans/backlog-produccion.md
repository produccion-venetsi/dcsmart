# Backlog "camino a producción" — DEV-08-production-goal

Fecha de armado: 2026-07-03
Rama de trabajo: `DEV-08-production-goal` (desde `dev`, sin PR todavía)

Este documento es el backlog completo que se armó en conversación (no vino de un spec/plan formal como el resto de `docs/superpowers/`), separado en 6 bloques. Se va actualizando el estado de cada ítem a medida que se implementa y se prueba en vivo.

**Convención de estado:** `[ ]` pendiente · `[~]` implementado, falta probar en vivo · `[x]` implementado y confirmado por el usuario · `[?]` en duda / requiere otra vuelta

---

## Bloque 1 — Fixes chicos y bugs (sin spec, van directo a implementación)

1. `[x]` Autofill del navegador en Login se veía con fondo blanco → fix CSS (`:-webkit-autofill`).
2. `[ ]` Verificar que el selector de período del Dashboard (incluida la fecha personalizada) funcione bien — no se tocó código, solo hay que confirmar en vivo. *(No era pedido de renombrar, solo de verificar.)*
3. `[ ]` Bug reportado: los datos de cajas en el Dashboard no cambian según la fecha. Se revisó el código (frontend `Dashboard.jsx` y backend `caja.js` `/stats`) y **ambos aplican `desde`/`hasta` correctamente** — no se encontró el bug en la lógica. Pendiente de reproducir en vivo; puede ser un tema de datos reales, no de código.
4. `[x]` Botón de auditar y de eliminar sacados de la fila de tabla en Pagos y Cajas — "Auditado" queda como dato de solo lectura, más cerca del principio de las columnas. Las acciones (auditar, editar, eliminar) ahora viven solo en el panel de detalle (se agregó el botón "Eliminar" al detalle de Caja, que antes solo existía en la fila).
5. `[x]` Card del selector de apps: mostrar los nombres reales de todos los locales (no un texto genérico ni un conteo) — iterado varias veces:
   - v1: texto genérico "Todos los locales" → **incorrecto**, el usuario pedía lo contrario.
   - v2: nombres truncados en una línea con tooltip → reemplazado.
   - v3: hover-accordion que hacía crecer la card → rompía el diseño de grilla, descartado.
   - v4 (actual): resumen oculto por defecto; al hacer **hover** aparecen los locales como tags dorados en una fila de **altura fija** (la card no crece); si son más de 3, se deslizan en loop tipo ticker mientras dura el hover (con &gt;3 se anima, con ≤3 quedan fijos sin animación). "Sin apps" cuando no tiene ningún local (siempre visible, no depende de hover).
6. `[x]` Texto "Cuenta personal" debajo del nombre de usuario en el selector de apps: era texto fijo sin información real → se sacó directamente.

## Bloque 2 — Rediseño de formularios (spec propia, no arrancado)

7. `[ ]` Reordenar form de Pagos: proveedor muy grande, debería ir junto a rubro/categoría; fechas juntas; en general más fácil de cargar.
8. `[ ]` Inputs de fecha/select: que funcionen clickeando en cualquier parte del input, no solo el ícono chico.
9. `[ ]` Rediseñar el input de foto/PDF (hoy se ve como un input viejo del navegador).
10. `[ ]` Poder quitar foto/PDF cómodamente desde el form (hoy no se puede); arreglar la "x" diminuta de proveedores.

## Bloque 3 — Reportes/Dashboard (spec propia, no arrancado)

11. `[ ]` Reducir la carga inicial (fetch grande al entrar) + pantalla de bienvenida con botón "Ver dashboard"/"Ver datos".
12. `[ ]` Fusionar/mover el dashboard a Reportes — que Reportes tenga *todos* los reportes que el usuario necesita.
13. `[ ]` Separar el reporte de Cajas del de Pagos (hoy están juntos en un mismo reporte).
14. `[ ]` Reportes nuevos: cantidad de pagos auditados, cantidad no auditados, pagos en efectivo, "no avión" (no fiscal, sin IVA), entre otros.

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
- El PDF/foto mutuamente excluyentes en Pagos (ítem que se pensó que era bug) **es lógica intencional**: un pago lleva PDF *o* foto, no ambos. No se toca.
- El bug de cajas-no-reactivas-a-fecha en Reportes (no Dashboard) — el usuario aclaró que **solo lo vio en el Dashboard**, no en Reportes.
- Orden de bloques: se decidió arrancar por el Bloque 1 (fixes chicos) antes que los bloques con spec propia.
