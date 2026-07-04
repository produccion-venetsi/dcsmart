# Acciones de tabla + detalle + bulk actions (Bloque 5 del backlog de producción)

**Fecha:** 2026-07-04
**Estado:** Aprobado, pendiente de implementación
**Rama:** `DEV-08-production-goal`

## Contexto

Ver `docs/superpowers/plans/backlog-produccion.md` — este spec cubre el Bloque 5 (item 17 ya estaba resuelto en el Bloque 1): reemplazar la fila de botones del detalle de Pago/Caja por un botón "Acciones" con panel desplegable, y agregar selección múltiple con acciones bulk (auditar/desauditar/eliminar) en las tablas de Pagos y Cajas.

## Objetivo

1. En el detalle de Pago y de Caja, reemplazar la fila de botones visibles (Editar, Auditar, PDP, Pagar, Periódico, Eliminar en Pagos; Auditar, Editar, Eliminar en Cajas) por un único botón "Acciones" que despliega un panel flotante con esos mismos botones.
2. Agregar checkboxes en las tablas de Pagos y Cajas para seleccionar varias filas, con una barra flotante de acciones bulk: Auditar, Desauditar, Eliminar.

## 1. Componente `ActionsMenu`

**Archivo nuevo:** `frontend/src/components/ActionsMenu.jsx`

Componente presentacional reutilizable entre `PagoDetailPanel` (`frontend/src/pages/pagos/PagoList.jsx`) y `CajaDetailPanel` (`frontend/src/pages/cajas/CajaList.jsx`):

```jsx
<ActionsMenu label="Acciones">
  {/* los botones actuales van acá adentro, sin cambios */}
  {canEdit && <button className="btn btn-secondary" onClick={...}>...</button>}
  {canDelete && <button className="btn btn-danger" onClick={...}>...</button>}
</ActionsMenu>
```

- Renderiza un único botón "Acciones" (con un ícono de flecha/chevron) y, debajo, un panel flotante (`position: absolute`, mismo estilo visual que el panel de Filtros ya existente: `background: var(--bg-elevated)`, `border`, `border-radius`, `box-shadow`) que contiene los `children` recibidos tal cual — no reimplementa la lógica de cada botón, solo cambia cómo se muestran.
- **Detección de dispositivo:** usa `window.matchMedia('(hover: hover) and (pointer: fine)').matches` para decidir el modo de interacción una sola vez al montar (no necesita reevaluarse dinámicamente — un dispositivo no cambia de mouse a touch en medio de una sesión).
  - Si tiene hover real (desktop): el panel se abre con `onMouseEnter` en el contenedor y se cierra con `onMouseLeave`.
  - Si no (touch): el panel se abre/cierra con `onClick` en el botón, y se cierra al clickear afuera (mismo patrón `useRef` + listener de `mousedown` ya usado en el panel de Filtros de `CajaList.jsx`/`PagoList.jsx`).
- El panel no empuja contenido (flota encima, `position: absolute`, `z-index` alto) — se cierra automáticamente al ejecutar cualquier acción de adentro (no hace falta lógica extra: los handlers ya existentes no cambian, y en modo touch, tras un click en un botón interno se puede cerrar el panel manualmente escuchando el click via bubbling hasta el listener de "afuera", pero como el clic SÍ fue "adentro" del panel, no se dispara ese cierre — se acepta que el panel quede abierto hasta que el usuario clickee afuera o pase el mouse fuera; no es necesario un cierre automático post-acción para este alcance).

### Uso en `PagoDetailPanel`

Reemplaza el `<div style={{ display: 'flex', gap: '0.5rem', ... }}>` que hoy envuelve los 6 botones (Editar, Auditar, PDP/Deuda, Pagar, Periódico, Eliminar) por `<ActionsMenu>` envolviendo exactamente esos mismos botones JSX, sin tocar ninguna condición (`canEdit`, `canDelete`, `pago.estado_op`, etc.) ni ningún handler.

### Uso en `CajaDetailPanel`

Mismo reemplazo para los 3 botones existentes (Auditar, Editar, Eliminar).

## 2. Selección múltiple + acciones bulk

**Archivos modificados:** `frontend/src/pages/pagos/PagoList.jsx`, `frontend/src/pages/cajas/CajaList.jsx`

### Estado y columna de checkbox

En el componente principal de cada lista (`PagoList`, `CajaList`), se agrega:

```javascript
const [selectedIds, setSelectedIds] = useState(new Set())
```

- Nueva primera columna `<th>` en el header con un checkbox "seleccionar todas las visibles" (marcado si `selectedIds` contiene todos los ids actualmente listados, indeterminado si contiene algunos).
- Nueva primera celda `<td>` en cada fila con un checkbox individual. El `onClick` del checkbox lleva `e.stopPropagation()` para no disparar la apertura del detalle de la fila (que hoy vive en el `onClick` del `<tr className="row-clickable">`).
- `selectedIds` se resetea (`setSelectedIds(new Set())`) cada vez que cambian `filters`, `activeLocal?.id`, o la página — mismo criterio que ya dispara un re-fetch de la lista hoy (agregar la limpieza al mismo `useEffect`/callback que ya escucha esos cambios).

### Barra flotante de acciones bulk

Cuando `selectedIds.size > 0`, se renderiza una barra fija (`position: sticky` o `position: fixed`, estilo consistente con el resto de la UI — fondo `var(--bg-elevated)`, `border`, `box-shadow`) inmediatamente arriba de `.table-wrap`, con:

- Texto "`N` seleccionados".
- Botón **Auditar**: solo habilitado si al menos una fila seleccionada NO está auditada. Al clickear, recorre las filas seleccionadas con `audit === false` y llama `pagosApi.audit(id)` / `cajasApi.audit(id)` (sin `data`, ya que el endpoint es un *toggle*: llamarlo sobre una fila no auditada la audita) para cada una, secuencialmente, en su propio try/catch (mismo patrón "sin rollback, contar éxitos/fallos" del Bloque 4).
- Botón **Desauditar**: solo habilitado si al menos una fila seleccionada SÍ está auditada. Llama `pagosApi.audit(id, { observaciones: null })` / `cajasApi.audit(id, { observaciones: null })` para cada fila con `audit === true` — **sin pedir un motivo por fila** (a diferencia del botón individual, que sí pregunta un motivo opcional vía `showPrompt`): pedir un motivo por cada una de N filas seleccionadas sería muy invasivo. El motivo queda vacío (`null`) en desauditaciones bulk.
- Botón **Eliminar**: pide una única confirmación (`showConfirm('¿Eliminar N pagos/cajas?')`) y, si se confirma, llama `pagosApi.remove(id)` / `cajasApi.remove(id)` para cada fila seleccionada, mismo patrón sin rollback.
- Botón **Cancelar**: `setSelectedIds(new Set())`.

Después de cualquiera de las 3 acciones (Auditar/Desauditar/Eliminar), se limpia la selección y se recarga la lista (`load()`), y se muestra una notificación con el resultado: éxito simple si todo salió bien ("3 pagos auditados"), o un resumen si hubo fallos parciales ("2/3 auditados, 1 falló").

## Fuera de alcance

- Endpoints bulk nuevos en el backend — todo se resuelve llamando en secuencia a los endpoints individuales que ya existen (`PATCH /:id/audit`, `DELETE /:id`).
- Persistencia de la selección entre sesiones o al recargar la página.
- Un cierre automático del panel de `ActionsMenu` en modo touch inmediatamente después de ejecutar una acción interna (el usuario lo cierra tocando afuera).

## Testing / verificación

- Detalle de Pago y de Caja: confirmar que aparece un único botón "Acciones", que en desktop el panel se abre con hover y se cierra al sacar el mouse, y que todos los botones internos (Editar, Auditar, PDP, Pagar, Periódico, Eliminar / Auditar, Editar, Eliminar) siguen funcionando exactamente igual que antes.
- Simular touch (DevTools → toggle device toolbar) y confirmar que el panel se abre/cierra con tap en vez de hover.
- En la tabla de Pagos y de Cajas: seleccionar varias filas con los checkboxes, confirmar que aparece la barra "N seleccionados".
- Con una selección mixta (algunas auditadas, algunas no), confirmar que ambos botones Auditar/Desauditar aparecen habilitados y que cada uno solo afecta al subconjunto correspondiente.
- Eliminar varias filas seleccionadas y confirmar que se borran todas tras la única confirmación.
- Cambiar de página, cambiar un filtro, o cambiar de local con filas seleccionadas y confirmar que la selección se limpia automáticamente.
- Clickear un checkbox de fila y confirmar que NO se abre el detalle de esa fila.
