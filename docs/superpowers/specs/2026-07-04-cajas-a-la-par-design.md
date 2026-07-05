# Cajas a la par de Pagos (Bloque 4 del backlog de producción)

**Fecha:** 2026-07-04
**Estado:** Aprobado, pendiente de implementación
**Rama:** `DEV-08-production-goal`

## Contexto

Ver `docs/superpowers/plans/backlog-produccion.md` — este spec cubre el Bloque 4 completo: agregar un botón de filtros a la tabla de Cajas (que hoy no tiene ninguno) y permitir cargar Detalles/Movimientos durante la creación de una caja, en vez de recién después de creada.

## Objetivo

1. Botón "Filtros" en Cajas, mismo patrón visual/UX que ya tiene Pagos, con campos propios (no los mismos filtros exactos de Pagos).
2. Poder agregar Detalles y Movimientos en el mismo formulario de creación de una caja, antes de guardarla — hoy solo se pueden agregar entrando a editar la caja ya creada.

## 1. Botón "Filtros" en Cajas

**Archivo:** `frontend/src/pages/cajas/CajaList.jsx`

Hoy `CajaList.jsx` no tiene ningún filtro — ni botón, ni panel, ni estado de filtros (confirmado: no hay coincidencias de "Filtros"/`filterOpen`/`filterRef` en el archivo). El backend (`GET /api/cajas`, `backend/src/routes/caja.js:53-95`) ya soporta `desde`, `hasta` y `audit` como query params — no hace falta ningún cambio de backend.

Se agrega el mismo patrón que ya usa `PagoList.jsx` (`frontend/src/pages/pagos/PagoList.jsx`):
- Un botón "Filtros" (ícono + label + badge con la cantidad de filtros activos) que alterna un panel desplegable (`filterOpen`/`filterRef`, cierre al clickear afuera — mismo mecanismo que Pagos).
- Estado `draft` (edición en el panel, no aplicado todavía) separado de `filters` (aplicado, dispara el fetch de la lista) — mismo patrón de "Aplicar"/"Limpiar" que Pagos.
- Campos del panel: **Desde** / **Hasta** (dos `<input type="date">`) y **Auditado** (`<select>` con opciones Todos / Auditados / No auditados, mapeado a `audit=''/'true'/'false'`).
- El fetch de la lista (`cajasApi.list(...)`) pasa a incluir `desde`, `hasta`, `audit` en los params cuando estén seteados, igual que ya hace Pagos con sus filtros.

No se agregan más campos (ni búsqueda por cajero, ni por nro de turno) — decisión explícita del usuario, alcanza con Desde/Hasta/Auditado.

## 2. Detalles y Movimientos antes de crear la caja

**Archivo:** `frontend/src/pages/cajas/CajaList.jsx`, componente `CajaCreatePanel` (línea ~618 actual).

Hoy `CajaCreatePanel` tiene los campos: Local (si corresponde), Fecha Inicio, Fecha Cierre, Nro Turno, Cajero, Total, Efectivo, Fiscal, Comensales, Tickets, Foto (`AdjuntoUpload`). Esos campos no cambian — el usuario confirmó que alcanzan.

Lo que se agrega son dos secciones nuevas dentro del mismo formulario: **Detalles** y **Movimientos**, como listas **pendientes en memoria** (no persistidas hasta que se crea la caja):

- Estado nuevo: `pendingDetalles` (array de `{ tipo, id_tipo, monto, observaciones }`) y `pendingMovimientos` (array de `{ tipo, id_metodo, monto, cantidad }`) — mismos campos que ya usan los forms "Agregar Detalle"/"Agregar Movimiento" del panel de detalle de una caja existente (`CajaDetailPanel`, líneas ~292-341 y ~380-419 actuales), reutilizando esos mismos mini-forms pero con un botón "Agregar a la lista" en vez de llamar a la API directamente — el ítem se agrega al array local con un id temporal (`crypto.randomUUID()` o índice) y se puede quitar con un botón de eliminar antes de crear la caja.
- Cada sección muestra la lista de ítems pendientes (tabla simple, igual estilo que las tablas de detalle: Tipo/Nombre/Monto + botón quitar) debajo de su mini-form.

### Flujo de creación (`handleCreate`)

1. Si hay `fotoFile`, se sube (igual que hoy: `cajasApi.upload`).
2. Se crea la caja: `cajasApi.create({ ...form, foto_url, id_local: targetLocalId })` → devuelve el `id` de la caja nueva.
3. Se recorren `pendingDetalles` y `pendingMovimientos` secuencialmente, llamando `detallesApi.create({ ...item, id_caja: nuevoId })` / `movimientosApi.create({ ...item, id_caja: nuevoId })` para cada uno.
4. Cada creación individual se envuelve en su propio `try/catch` — si una falla, no se detiene el resto ni se revierte la caja ya creada. Se acumulan los fallos.
5. Al final: si todo salió bien, notificación de éxito normal ("Caja creada"). Si hubo fallos parciales, notificación indicando cuántos detalles/movimientos se guardaron y cuántos fallaron (ej. "Caja creada. 2/3 detalles guardados, 1 falló — podés agregarlo manualmente."). En ambos casos se navega al detalle de la caja recién creada (`onCreated(nuevoId)`, comportamiento ya existente), donde el usuario puede agregar manualmente lo que haya fallado usando los forms que ya existen ahí.

No hay rollback de la caja si fallan detalles/movimientos — es intencional (decisión explícita: "no se revierte nada"), porque la caja en sí ya se guardó correctamente y perder ese trabajo por un fallo aislado en un detalle sería peor que dejar la caja creada con algún ítem pendiente de reintentar.

## Fuera de alcance

- Cambios de esquema o endpoints nuevos — todo con las APIs (`cajasApi`, `detallesApi`, `movimientosApi`) que ya existen.
- Búsqueda por cajero o cualquier otro filtro además de Desde/Hasta/Auditado.
- Rollback transaccional (crear todo en una sola llamada atómica al backend) — se descartó por complejidad innecesaria dado que el caso de fallo parcial es poco frecuente y fácilmente recuperable a mano.
- Cambios a `CajaEditPanel` o `CajaDetailPanel` — sus forms de "Agregar Detalle"/"Agregar Movimiento" (que sí llaman a la API directamente) no cambian, solo se reutiliza su estructura visual/de campos en el nuevo flujo de creación.

## Testing / verificación

- Entrar a Cajas, confirmar que aparece el botón "Filtros" con el mismo look que en Pagos, que el panel tiene Desde/Hasta/Auditado, y que aplicar un filtro efectivamente reduce/filtra la lista (comparar contra lo que ya se sabe de los datos).
- Limpiar filtros y confirmar que vuelve a mostrar todo.
- Crear una caja nueva agregando al menos un Detalle y un Movimiento pendientes antes de guardar, confirmar que al crear la caja ambos quedan persistidos (visibles en el detalle de la caja recién creada).
- Quitar un ítem pendiente de la lista antes de crear y confirmar que no se guarda.
- Crear una caja sin agregar ningún detalle/movimiento pendiente (flujo actual) y confirmar que sigue funcionando igual que antes.
