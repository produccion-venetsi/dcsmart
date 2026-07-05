# Fixes de Proveedores (paginado y buscador)

**Fecha:** 2026-07-05
**Estado:** Aprobado, pendiente de implementación
**Rama:** `DEV-fixes-for-mvp-08`

## Contexto

Tras los fixes del formulario de pago, el usuario reporta que la sección de Proveedores en general funciona mal: el paginado debería parecerse al de Pagos, y el buscador de proveedores funciona pésimo tanto en el filtro de la lista como en los formularios/comboboxes que buscan proveedores.

## Diagnóstico (estado actual)

- **Paginado de Pagos** (`frontend/src/pages/pagos/PagoList.jsx`): paginado real server-side. `search` (input crudo) se separa de `debouncedSearch` (400ms) en un `useEffect` propio; el fetch reacciona a `[buildParams, page]` sin debounce adicional sobre el cambio de página. Controles completos: primera página («), anterior (‹ Anterior), "Página N de M", siguiente (Siguiente ›), última página (»), y el contador `"{(page-1)*LIMIT+1}–{Math.min(page*LIMIT,total)} de {total} pagos"`. Se muestra siempre que `total > 0`.
- **"Paginado" de Cajas** (`frontend/src/pages/cajas/CajaList.jsx`): no es comparable — usa `limit: 0` (trae todo) + scroll virtual, sin controles de página. No se toma como referencia (decisión del usuario: seguir el patrón de Pagos).
- **Paginado de Proveedores** (`frontend/src/pages/proveedores/ProveedorList.jsx`): ya usa `LIMIT = 100` (línea 59, igual que Pagos) y page/limit real contra el backend, pero:
  - El `useEffect` de carga (líneas 82-92) aplica un debounce de 300ms a **todo**, incluido el cambio de página (`[search, showInac, page]` todo dentro del mismo `setTimeout`), a diferencia de Pagos donde solo el texto de búsqueda se debounce. Resultado: cada click en "Siguiente/Anterior" tarda ~300ms de más sin necesidad.
  - Controles de paginación pobres (líneas 211-217): solo "← Anterior" / "Siguiente →" y "Página N de M — T proveedores", sin ir a primera/última página ni mostrar el rango "X–Y de Z".
  - Se muestra la paginación solo si `total > LIMIT` (línea 211), inconsistente con Pagos que la muestra siempre que `total > 0`.
- **Backend `GET /proveedores`** (`backend/src/routes/proveedores.js`):
  - El filtro `search` (líneas 11-17) cubre `nombre`, `razon_social` y `cuit`, pero el de `cuit` es un `contains` literal sin normalizar formato. Como `ProveedorForm.jsx` no fuerza una máscara de entrada, hay proveedores guardados con CUIT en formato `"20-12345678-0"` y otros como `"20123456780"` (u otras variantes). Buscar `"20123456780"` no matchea `"20-12345678-0"` y viceversa — causa concreta de "el buscador funciona pésimo" para CUIT.
  - No tiene el guard de `limit=0` que sí tienen `pagos.js` (líneas 133-135) y `caja.js` (líneas 55-57): si algún consumidor futuro pidiera `limit: 0` esperando "traer todo" (como hace Cajas), Prisma interpretaría `take: 0` y devolvería un array vacío en vez de todos los registros.
- **Otros consumidores del mismo endpoint**: el combobox de proveedor en `PagoForm.jsx` (ya usa `proveedoresApi.list({ search, ... })`) y el selector de proveedores dentro del panel de filtros de `PagoList.jsx` (líneas ~890-900, debounce propio de 300ms, mínimo 2 caracteres) llaman al mismo endpoint — heredan automáticamente cualquier mejora en el backend sin necesidad de tocarlos.

## Cambios

### 1. `ProveedorList.jsx` — separar debounce de búsqueda del cambio de página

Se introduce `debouncedSearch` (estado separado de `search`), con su propio `useEffect` de 400ms (mismo valor que Pagos), igual que el patrón de `PagoList.jsx`. El `useEffect` de carga pasa a depender de `[debouncedSearch, showInac, page]` y ya no envuelve la llamada en un `setTimeout` — el debounce ya ocurrió al calcular `debouncedSearch`, así que cambiar de página dispara el fetch de inmediato. Cambiar `search` o `showInac` sigue reseteando `page` a 1 (comportamiento ya existente en la línea 80, se mantiene).

### 2. `ProveedorList.jsx` — controles de paginación completos, iguales a Pagos

Se reemplaza el bloque de paginación (líneas 211-217) por el mismo patrón visual y funcional de `PagoList.jsx` (líneas 1313-1329): primera página («), anterior (‹ Anterior), "Página N de M", siguiente (Siguiente ›), última página (»), y el contador `"{(page-1)*LIMIT+1}–{Math.min(page*LIMIT,total)} de {total} proveedores"`. Se muestra siempre que `total > 0` (no solo `total > LIMIT`), igual que Pagos.

### 3. Backend — CUIT tolerante a formato con/sin guiones

En `backend/src/routes/proveedores.js`, sin modificar datos existentes en la base: cuando el `search` recibido, al quitarle todo carácter no numérico, resulte en una cadena de dígitos no vacía, se agregan al `OR` del filtro dos variantes adicionales de comparación contra `cuit`:
- los dígitos solos (ej. `"20123456780"`),
- y, si son exactamente 11 dígitos (largo de un CUIT completo), el formato canónico con guiones `XX-XXXXXXXX-X` (ej. `"20-12345678-0"`).

Esto cubre que el usuario busque con o sin guiones y que el proveedor esté guardado en cualquiera de los dos formatos, sin tocar los registros existentes. El `contains` original sobre `search` tal cual se mantiene además de estas dos variantes (para no perder matches parciales por dígitos sueltos que no formen un CUIT completo).

### 4. Backend — guard de `limit=0` por consistencia

Se agrega a `proveedores.js` el mismo guard que ya tienen `pagos.js` y `caja.js`: `limit=0` implica `skip`/`take` en `undefined` (trae todo) en vez de `take: 0` (array vacío). Cambio defensivo, no hay ningún consumidor actual que use `limit: 0` contra este endpoint.

## Fuera de alcance

- Ampliar la búsqueda a alias, CBU, teléfono u otros campos (evaluado y descartado).
- Normalizar el CUIT de los registros ya existentes en la base de datos.
- Cambiar la máscara/validación de entrada del campo CUIT en `ProveedorForm.jsx`.
- Tocar el patrón de Cajas (scroll virtual) — no se usa como referencia para este fix.
- Cambios en `PagoForm.jsx` o en el selector de proveedores del panel de filtros de `PagoList.jsx` más allá del beneficio automático de la mejora de búsqueda de CUIT en el backend.

## Testing / verificación

- Abrir `/proveedores` con más de 100 proveedores activos: confirmar que aparecen los controles «, ‹ Anterior, "Página N de M", Siguiente ›, », y el contador "X–Y de Z proveedores".
- Cambiar de página y confirmar que la tabla se actualiza sin demora perceptible de debounce.
- Tipear en el buscador y confirmar que sigue aplicando el debounce (no dispara un request por cada tecla).
- Buscar un proveedor por CUIT sin guiones cuando está guardado con guiones en la base (y viceversa, si existe algún caso de prueba) y confirmar que aparece en los resultados.
- Buscar por nombre y razón social parcial y confirmar que sigue funcionando igual que antes.
- Confirmar que el combobox de proveedor en el formulario de pago (`PagoForm.jsx`) también encuentra proveedores por CUIT en cualquiera de los dos formatos, sin haber tocado ese archivo.
