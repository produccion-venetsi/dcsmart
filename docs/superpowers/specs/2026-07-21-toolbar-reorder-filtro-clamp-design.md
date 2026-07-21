# Reordenar toolbar de Pagos + clamp del panel de Filtros

## Contexto

En `PagoList.jsx` el toolbar de la tabla (buscador, botón Filtros, Seleccionar, Carga rápida, Exportar CSV, Nuevo Pago) está en una sola fila sin agrupación visual, lo que se siente amontonado. Además, el panel de Filtros es un dropdown `position: absolute; right: 0; width: 520px` anclado al botón "Filtros" (`frontend/src/pages/pagos/PagoList.jsx` alrededor de la línea 1201-1207). Con zoom de navegador alto, el espacio entre el sidebar y el borde derecho se achica, y el panel (que siempre mide 520px de ancho) se sale por la izquierda y queda tapado/cortado por `.app-main` (que tiene `overflow-x: hidden`, ver `frontend/src/styles/app.css:128-134`) o se superpone visualmente al sidebar.

Ambos problemas se validaron con mockups en el companion visual de brainstorming y el usuario aprobó:
1. Reagrupar el toolbar en dos bloques (consulta a la izquierda, acciones a la derecha) con un separador.
2. Resolver el choque del panel de Filtros con un **clamp automático al viewport** (no un modal centrado).

## Objetivo

1. Reordenar visualmente el toolbar de `PagoList.jsx` en dos grupos con un divisor, sin cambiar ningún botón ni funcionalidad existente.
2. Hacer que el panel de Filtros calcule su posición horizontal dinámicamente para nunca solaparse con el sidebar ni salirse de la pantalla, recalculando también en `resize` (el zoom del navegador dispara `resize`).

## Alcance

Incluye:
- Reordenamiento JSX/CSS del toolbar (mismo archivo, misma sección ya identificada en la tarea anterior de filtros de fecha).
- Lógica de posicionamiento del panel de Filtros vía `getBoundingClientRect()` + clamp, con recálculo en `resize`.

Fuera de alcance:
- Cambiar el contenido o los campos del panel de Filtros (eso ya se hizo en el feature de filtro de fecha, DEV-28/dev).
- Cambiar el ancho fijo del panel (520px) — el fix es de posición, no de tamaño.
- Cualquier otro dropdown/modal de la aplicación (el fix es específico a este panel).

## Diseño

### 1. Reordenar el toolbar

En el bloque JSX del toolbar (`frontend/src/pages/pagos/PagoList.jsx`, el `<div>` que envuelve el buscador, el botón Filtros, "Seleccionar", "Carga rápida", "Exportar CSV" y "Nuevo Pago" — actualmente todos como hermanos directos en una fila), se agrupa así, de izquierda a derecha:

1. **Grupo consulta** (sin cambios de posición relativa entre sí): buscador, botón Filtros.
2. Un spacer (`<div style={{ flex: 1 }} />`) que empuja el resto a la derecha.
3. **Grupo acciones secundarias**: botón "Seleccionar" (`canEdit || canDelete`), menú "Carga rápida".
4. Un separador visual: `<div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />`, mostrado solo si hay al menos un botón en cada grupo adyacente (no hace falta condicional especial: como "Exportar CSV" y "Nuevo Pago" siempre están presentes — "Nuevo Pago" no tiene guard de permisos — el separador siempre se renderiza).
5. **Grupo acciones principales**: botón "Exportar CSV" (si `canExport`), botón "Nuevo Pago".

No se agrega ni quita ningún botón, ni se cambian sus condiciones de renderizado (`canEdit`, `canDelete`, `canExport`) — solo se reordena su posición dentro del contenedor flex y se agregan el spacer y el divisor.

### 2. Clamp del panel de Filtros al viewport

El panel (`frontend/src/pages/pagos/PagoList.jsx`, el `<div>` con `position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 520`, dentro del contenedor `<div style={{ position: 'relative' }} ref={filterRef}>`) pasa de tener `right: 0` fijo a una posición calculada:

- Al abrir el panel (`filterOpen` pasa a `true`, ya sea por `openFilters()` o el toggle del botón), un `useLayoutEffect` (o cálculo inline antes del primer paint) mide `filterRef.current.getBoundingClientRect()` y el ancho de la sidebar (`document.querySelector('.sidebar')?.getBoundingClientRect().right ?? 0`).
- Se calcula el `left` ideal como si el panel estuviera anclado por la derecha (`buttonRect.right - PANEL_WIDTH`), y se clampea: `Math.max(sidebarRight + MARGIN, Math.min(idealLeft, window.innerWidth - PANEL_WIDTH - MARGIN))`, con `MARGIN = 8` y `PANEL_WIDTH = 520`.
- El panel pasa a posicionarse con `left: <valor calculado>` en vez de `right: 0` (se elimina `right: 0` del style inline y se agrega `left` dinámico vía estado `panelLeft`).
- Un listener de `resize` en `window` (agregado mientras `filterOpen` es `true`, removido al cerrar/desmontar) recalcula `panelLeft` para que el zoom del navegador (que dispara `resize`) mantenga el panel bien posicionado sin necesidad de cerrar y volver a abrir.
- Si `filterRef.current` o el panel no están montados todavía (primer render antes de abrir), no se ejecuta el cálculo — se hace solo cuando `filterOpen === true`.

### 3. Manejo de errores / casos borde

- Si `document.querySelector('.sidebar')` no encuentra el elemento (no debería pasar en esta página, pero por robustez), `sidebarRight` cae a `0` y el clamp sigue funcionando (solo con el límite del `window.innerWidth`).
- En viewports muy angostos donde ni siquiera `window.innerWidth - PANEL_WIDTH - MARGIN` deja espacio positivo (menor a `sidebarRight + MARGIN`), el panel se ancla al mínimo (`sidebarRight + MARGIN`) — puede quedar más ancho que el viewport visible y requerir scroll horizontal del panel mismo, pero eso ya excede el caso de uso real (zoom razonable en pantallas de escritorio) y no se resuelve en este alcance (ver "Fuera de alcance": no se cambia el ancho fijo de 520px).

## Testing

- Frontend: probar en el navegador con zoom del navegador en 100%, 125%, 150% y 175% (Ctrl/Cmd + "+"), abriendo el panel de Filtros en cada nivel y confirmando que nunca se superpone ni se corta contra el sidebar, y que sigue clampeado correctamente si se cambia el zoom con el panel ya abierto.
- Confirmar visualmente que el reordenamiento del toolbar no rompe ningún botón existente (Seleccionar, Carga rápida, Exportar CSV, Nuevo Pago siguen funcionando igual) en distintos roles de usuario (con y sin `canEdit`/`canDelete`/`canExport`).
