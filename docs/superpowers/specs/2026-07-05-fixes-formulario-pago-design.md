# Fixes formulario de pago (defaults, buscadores, número de OP)

**Fecha:** 2026-07-05
**Estado:** Aprobado, pendiente de implementación
**Rama:** `DEV-fixes-for-mvp-08`

## Contexto

El formulario de pago (`frontend/src/pages/pagos/PagoForm.jsx`) tiene varios problemas reportados por el usuario en producción:

1. El tipo de movimiento arranca en "Ingreso" cuando la mayoría de los pagos cargados son egresos.
2. La fecha de factura no arranca en el día de hoy en modo normal (sí en modo rápido), obligando a elegirla siempre.
3. El buscador de proveedores no encuentra todos los proveedores existentes.
4. El buscador de rubcat es un `<select>` nativo sin búsqueda por texto, con una UX inferior a la de proveedores.
5. El número de OP (orden de pago) correlativo por local no se muestra en ningún lado del formulario antes de guardar.

## Diagnóstico (estado actual)

- **Proveedores:** `PagoForm.jsx` carga hasta 500 proveedores una sola vez al montar (`proveedoresApi.list({ activo:'true', limit: 500 })`) y filtra en el navegador solo por `nombre` (`filteredProvs`), mostrando además un máximo de 60 resultados (`.slice(0, 60)`). Si hay más de 500 proveedores activos, o se busca por razón social/CUIT, los resultados faltantes no aparecen sin ningún aviso. El backend de proveedores (`backend/src/routes/proveedores.js`) ya soporta un parámetro `search` que busca por nombre/razón social/CUIT, pero el form nunca lo usa.
- **RubCat:** es un `<select>` nativo (`rubro.nombre / categoria.nombre`), alimentado por `rubcatApi.list()` sin parámetros ni paginación. El backend (`backend/src/routes/rubcat.js`) no soporta ningún parámetro de búsqueda por texto.
- **Número de OP:** el campo `nro_ord` (Prisma, modelo `Pago`) se calcula de forma inline dentro del handler `POST /pagos` (`backend/src/routes/pagos.js`, líneas ~305-313): `findFirst` por `id_local` con `nro_ord` no nulo, ordenado descendente, `+1`. Solo depende de `id_local` (no de proveedor, importe, etc.), por lo que se puede calcular apenas se conoce el local. No existe un endpoint separado para consultarlo antes de guardar, y el form nunca lo muestra ni lo guarda en su estado.
- **`id_local`:** viene de `activeLocal` en el store global (Zustand), disponible desde el primer render del form en el caso común (un local activo ya seleccionado en la app). Si no hay `activeLocal`, el usuario lo elige con un `<select>` manual.

## Cambios

### 1. Egreso por defecto

En el estado inicial de `PagoForm.jsx` (tanto modo normal como modo rápido), `ingresa_egreso` pasa de `true` a `false`. Sin cambios de modelo ni backend.

### 2. Fecha de factura = hoy por defecto

El estado inicial de `fecha` en modo normal pasa de `''` a la fecha de hoy (mismo valor que ya usa modo rápido). El usuario sigue pudiendo cambiarla; la lógica existente de recálculo de `cashflow`/`periodo` al cambiar `fecha` no se modifica.

### 3. Buscador de proveedores — búsqueda en backend

Se reemplaza la carga completa + filtro local por búsqueda server-side:

- El combobox de proveedores deja de precargar la lista completa al montar el form.
- En cada tipeo del usuario (con debounce de ~300ms para no saturar de requests), se llama a `proveedoresApi.list({ search: texto, activo: 'true', limit: 60 })`, usando el parámetro `search` que el backend ya soporta.
- Si el campo de búsqueda está vacío, se puede mostrar un listado inicial (ej. los primeros 60 proveedores activos) o dejar la lista vacía hasta que el usuario tipee — se deja este detalle menor a criterio de implementación, priorizando consistencia con el comportamiento actual al abrir el combobox.
- Se elimina el límite silencioso de "500 cargados / 60 mostrados sin aviso": ahora el máximo de 60 resultados es directamente lo que devuelve el backend para ese texto de búsqueda, consistente en todo momento.
- El resto de la lógica de negocio (`selectProveedor` autocompleta `id_rubcat` del proveedor y recalcula `cashflow`, `clearProveedor` resetea) no cambia de comportamiento, solo de dónde vienen los `items`.

### 4. Buscador de rubcat — misma UX que proveedores

**Backend** (`backend/src/routes/rubcat.js`, `GET /`): se agrega soporte a un parámetro `search` en query, que filtra `RubCat` por `rubro.nombre` o `categoria.nombre` (case-insensitive, `contains`), replicando el patrón ya usado en `proveedores.js`.

**Frontend:** se extrae el patrón de combobox actualmente ad-hoc en `PagoForm.jsx` (estado `provSearch`/`provOpen`/`provRef`, filtrado, lista `combobox-inline-list`) a un componente genérico reutilizable:

```
frontend/src/components/Combobox.jsx
```

Props: `value`, `getLabel(item)`, `getKey(item)`, `onSelect(item)`, `onClear()`, `fetchItems(search)` (async, devuelve array), `placeholder`. El componente maneja el estado de apertura/cierre, el input de búsqueda con debounce, el click-outside, y el render de la lista de opciones — sin conocer nada de proveedores ni rubcat. La lógica de negocio específica de cada uso (autocompletar rubcat al elegir proveedor, recalcular cashflow, etc.) vive en los callbacks `onSelect` que pasa `PagoForm.jsx`, no en el componente.

Se reemplaza el `<select>` nativo de rubcat por este mismo componente `Combobox`, usando `rubcatApi.list({ search: texto })` como `fetchItems`.

### 5. Número de OP visible en "Información del pago"

**Backend:**
- Se extrae la lógica de cálculo del correlativo (hoy embebida en el `POST /pagos`) a una función reutilizable, por ejemplo `getNextNroOrd(fastify, id_local)` en el mismo archivo `routes/pagos.js` o en un helper compartido.
- Se agrega un nuevo endpoint `GET /pagos/next-nro-ord?id_local=X` que devuelve `{ nro_ord: N }` usando esa función.
- El handler `POST /pagos` existente se actualiza para usar la misma función en vez de duplicar la query (mismo comportamiento, sin cambios funcionales).

**Frontend:**
- Apenas `id_local` está disponible (inmediatamente en el caso común, ya que `activeLocal` viene del store desde el montaje; o al elegirlo manualmente si no hay local activo), `PagoForm.jsx` llama a `GET /pagos/next-nro-ord` y guarda el resultado en un estado local (ej. `previewNroOrd`).
- Se muestra como texto informativo de solo lectura dentro de la sección "Información del Pago": **"N° OP a asignar: {previewNroOrd}"**.
- Se aclara junto al texto (tooltip o texto secundario chico) que es una previsualización: el número final se confirma recién al guardar. No se agrega ningún mecanismo de lock/reserva — el riesgo de que el número se corra por creación concurrente en el mismo local ya existe hoy en el `POST` y queda fuera de alcance de este fix.
- Este preview solo aplica al **crear** un pago nuevo. Al editar un pago existente, se muestra el `nro_ord` real ya asignado (dato que hoy el form de edición ni siquiera lee del pago — se agrega a la lectura del estado en modo edición).

## Fuera de alcance

- Resolver la condición de carrera del cálculo de `nro_ord` ante creaciones concurrentes del mismo local (riesgo preexistente, no introducido ni agravado por este fix).
- Buscar proveedores/rubcat por otros criterios además de texto libre (filtros avanzados, por rubro, etc.).
- Cambiar el límite de 60 resultados mostrados por búsqueda (se mantiene, ahora aplicado consistentemente en el backend).
- Deshabilitar o quitar el `<select>` manual de local cuando no hay `activeLocal` — sigue igual.

## Testing / verificación

- Abrir el formulario de pago (modo normal y modo rápido) y confirmar que arranca en "Egreso" y con la fecha de hoy en ambos modos.
- Buscar un proveedor por nombre, razón social y CUIT, incluyendo uno que antes no aparecía por estar fuera del límite de 500 o por no matchear el filtro por nombre — confirmar que ahora aparece.
- Buscar una categoría/rubro por texto en el combobox de rubcat y confirmar que filtra igual que proveedores.
- Con un local activo seleccionado, abrir el formulario para crear un pago nuevo y confirmar que se muestra el próximo número de OP antes de completar el resto de los campos.
- Guardar el pago y confirmar que el `nro_ord` final asignado coincide con el que se había previsualizado (en ausencia de creaciones concurrentes).
- Editar un pago existente y confirmar que se muestra su `nro_ord` real, no un preview.
