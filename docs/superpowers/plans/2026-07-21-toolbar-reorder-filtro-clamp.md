# Reordenar toolbar de Pagos + clamp del panel de Filtros — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar visualmente los botones del toolbar de Pagos (consulta a la izquierda, acciones a la derecha con un separador) y hacer que el panel de Filtros calcule su posición horizontal dinámicamente para nunca solaparse con el sidebar ni salirse de la pantalla, sin importar el nivel de zoom del navegador.

**Architecture:** Ambos cambios viven enteramente en `frontend/src/pages/pagos/PagoList.jsx`. El reordenamiento del toolbar es puramente CSS/JSX (un spacer `flex: 1` y un divisor de 1px insertados entre grupos de botones ya existentes, sin mover ni condicionar ningún botón). El clamp del panel de Filtros agrega un estado `panelLeft` calculado con `getBoundingClientRect()` en un `useLayoutEffect` que corre mientras el panel está abierto, con un listener de `resize` (el zoom del navegador dispara `resize`) para recalcular en caliente.

**Tech Stack:** React (hooks: `useState`, `useLayoutEffect`), sin dependencias nuevas. Sin frameworks de testing configurados en el frontend — verificación manual en navegador (`npm run build` para confirmar que compila, más inspección visual en distintos niveles de zoom).

## Global Constraints

- No se agrega, quita, ni cambia la condición de renderizado (`canEdit`, `canDelete`, `canExport`) de ningún botón del toolbar — solo se reordena su agrupación visual.
- El ancho fijo del panel de Filtros (520px, `maxWidth: '90vw'`) no cambia — el fix es de posición (`left` calculado), no de tamaño.
- El clamp debe recalcularse en `resize` mientras el panel esté abierto (el zoom de navegador dispara `resize`), y dejar de escuchar `resize` cuando el panel se cierra (limpieza del listener).
- Margen mínimo entre el panel y el sidebar: `8px` (`PANEL_MARGIN`). Ancho del panel para el cálculo: `520` (`PANEL_WIDTH`), igual al `width: 520` ya existente en el style inline del panel.

---

## Task 1: Reordenar el toolbar de Pagos (spacer + divisor)

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx:1388-1389` (spacer antes de "Seleccionar"), `frontend/src/pages/pagos/PagoList.jsx:1401-1402` (divisor antes de "Exportar CSV")

**Interfaces:**
- Consumes: nada de tareas anteriores (primera tarea, independiente de Task 2 — toca una región distinta del mismo archivo).
- Produces: nada para otras tareas — es una pieza de UI hoja.

El orden actual de los hijos directos de `<div className="page-actions">` (línea 1172) ya es: Buscador → Filtros → Seleccionar → Carga rápida (ActionsMenu) → Exportar CSV → Nuevo Pago. Ese orden coincide exactamente con los dos grupos que pide el diseño (consulta: Buscador+Filtros: / acciones: Seleccionar, Carga rápida, Exportar CSV, Nuevo Pago) — **no hace falta mover ningún botón**, solo insertar un spacer que empuje el segundo grupo a la derecha, y un divisor visual entre "Carga rápida" y "Exportar CSV".

- [ ] **Step 1: Insertar el spacer entre el panel de Filtros y el botón "Seleccionar"**

En `frontend/src/pages/pagos/PagoList.jsx`, el bloque del panel de Filtros cierra así (alrededor de la línea 1386-1388):

```jsx
              </div>
            )}
          </div>
          {(canEdit || canDelete) && (
```

Insertar una línea entre el `</div>` que cierra el `ref={filterRef}` y el bloque de "Seleccionar":

```jsx
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {(canEdit || canDelete) && (
```

- [ ] **Step 2: Insertar el divisor entre "Carga rápida" y "Exportar CSV"**

Un poco más abajo, el menú de "Carga rápida" cierra y sigue el botón de exportar (alrededor de la línea 1400-1402):

```jsx
          </ActionsMenu>
          {canExport && (
```

Insertar el divisor entre ambos:

```jsx
          </ActionsMenu>
          <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          {canExport && (
```

Nota: como "Nuevo Pago" (línea 1414-1416) no tiene guard de permisos, el divisor no queda nunca "colgado" sin nada después — siempre hay al menos "Nuevo Pago" a su derecha.

- [ ] **Step 3: Verificar en el navegador**

Con `npm run dev` corriendo en `frontend/`, abrir Pagos y confirmar:
- El buscador y el botón "Filtros" quedan pegados a la izquierda del toolbar.
- Hay un espacio claro (spacer) antes de "Seleccionar" que empuja el resto del grupo a la derecha.
- Aparece una línea vertical fina entre "Carga rápida" y "Exportar CSV".
- Todos los botones siguen funcionando igual que antes (probar con un usuario `admin`/`cajero` sin permisos de export/delete para confirmar que "Seleccionar" y "Exportar CSV" siguen ocultándose correctamente cuando corresponde).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "$(cat <<'EOF'
Agrupar visualmente el toolbar de Pagos con spacer y divisor

Separa el grupo de consulta (Buscar, Filtros) del grupo de acciones
(Seleccionar, Carga rápida, Exportar CSV, Nuevo Pago) sin mover ni
condicionar ningún botón existente.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Clamp del panel de Filtros al viewport

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx:1` (import de `useLayoutEffect`), `frontend/src/pages/pagos/PagoList.jsx:1066-1071` (nuevo estado + función de cálculo, junto a los demás hooks de filtros), `frontend/src/pages/pagos/PagoList.jsx:1225-1231` (JSX del panel — cambia `right: 0` por `left` calculado)

**Interfaces:**
- Consumes: `filterRef` (ya existente, línea 1069), `filterOpen`/`setFilterOpen` (ya existentes).
- Produces: nada para otras tareas (última tarea del plan).

- [ ] **Step 1: Agregar `useLayoutEffect` al import de React**

En `frontend/src/pages/pagos/PagoList.jsx:1`, cambiar:

```javascript
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
```

por:

```javascript
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
```

- [ ] **Step 2: Agregar el estado y la función de cálculo de posición**

En `frontend/src/pages/pagos/PagoList.jsx`, junto a los demás hooks de la sección de filtros (después de `const filterRef = useRef(null)`, línea 1069), agregar:

```javascript
  // Ancho fijo del panel de Filtros (debe coincidir con el `width: 520` del
  // style inline del panel) y margen mínimo respecto al sidebar/borde.
  const PANEL_WIDTH  = 520
  const PANEL_MARGIN = 8
  const [panelLeft, setPanelLeft] = useState(0)

  // Calcula dónde debe quedar el panel (en vez del `right: 0` fijo de antes)
  // para que nunca se superponga al sidebar ni se salga de la pantalla,
  // sin importar el zoom del navegador o el ancho de la ventana.
  //
  // getBoundingClientRect()/window.innerWidth devuelven coordenadas de
  // viewport, pero el panel es `position: absolute` dentro de filterRef
  // (que es `position: relative`) — su `left` final tiene que ser relativo
  // a `buttonRect.left`, no una coordenada de viewport cruda.
  const computePanelLeft = () => {
    if (!filterRef.current) return
    const buttonRect  = filterRef.current.getBoundingClientRect()
    const sidebarEl    = document.querySelector('.sidebar')
    const sidebarRight = sidebarEl ? sidebarEl.getBoundingClientRect().right : 0
    const idealLeftViewport = buttonRect.right - PANEL_WIDTH
    const minLeftViewport   = sidebarRight + PANEL_MARGIN
    const maxLeftViewport   = window.innerWidth - PANEL_WIDTH - PANEL_MARGIN
    const clampedLeftViewport = Math.max(minLeftViewport, Math.min(idealLeftViewport, maxLeftViewport))
    setPanelLeft(clampedLeftViewport - buttonRect.left)
  }

  useLayoutEffect(() => {
    if (!filterOpen) return
    computePanelLeft()
    window.addEventListener('resize', computePanelLeft)
    return () => window.removeEventListener('resize', computePanelLeft)
  }, [filterOpen])
```

- [ ] **Step 3: Usar `panelLeft` en vez de `right: 0` en el style del panel**

En `frontend/src/pages/pagos/PagoList.jsx`, alrededor de la línea 1226-1231, cambiar:

```jsx
            {filterOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '1.25rem', width: 520, maxWidth: '90vw',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}>
```

por:

```jsx
            {filterOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: panelLeft, zIndex: 200,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '1.25rem', width: 520, maxWidth: '90vw',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}>
```

- [ ] **Step 4: Verificar en el navegador en distintos niveles de zoom**

Con `npm run dev` corriendo en `frontend/`:
1. Zoom 100%: abrir Filtros, confirmar que el panel se ve igual que antes (pegado a la derecha del botón, sin cambios visibles).
2. Zoom 125%, 150%, 175% (Ctrl/Cmd + "+" en el navegador): abrir Filtros en cada nivel y confirmar que el panel nunca se superpone al sidebar ni se corta — debe desplazarse hacia la derecha del sidebar en vez de salirse por la izquierda.
3. Con el panel abierto en un zoom alto, cambiar el zoom (sin cerrar el panel) y confirmar que se reacomoda solo (gracias al listener de `resize`).
4. Cerrar el panel y confirmar que no quedan listeners de `resize` colgados (no hay forma directa de verificar esto visualmente, pero confirmar que abrir/cerrar el panel repetidamente no degrada el rendimiento ni tira errores en la consola del navegador).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "$(cat <<'EOF'
Clampear el panel de Filtros de Pagos al viewport

El panel usaba right:0 fijo, lo que lo hacía chocar/cortarse contra
el sidebar con zoom de navegador alto. Ahora calcula su posición con
getBoundingClientRect() y se recalcula en resize (el zoom dispara
resize), para que nunca se superponga al sidebar ni se salga de la
pantalla.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
