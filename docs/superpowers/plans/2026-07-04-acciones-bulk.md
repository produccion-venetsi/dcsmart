# Acciones de tabla + detalle + bulk actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la fila de botones del detalle de Pago/Caja por un botón "Acciones" con panel desplegable (hover en desktop, click en touch), y agregar selección múltiple con acciones bulk (Auditar/Desauditar/Eliminar) en las tablas de Pagos y Cajas.

**Architecture:** Un componente nuevo `ActionsMenu.jsx` envuelve los botones ya existentes en los dos paneles de detalle, sin tocar su lógica. La selección múltiple se implementa por separado en cada archivo de lista (`PagoList.jsx`, `CajaList.jsx`), replicando el mismo estilo visual ya usado por el panel de Filtros — sin extraer un componente compartido, siguiendo la misma convención de duplicación deliberada que ya usa el proyecto para esos paneles de filtro. Las acciones bulk llaman en secuencia a los endpoints individuales que ya existen (`PATCH /:id/audit`, `DELETE /:id`), sin backend nuevo.

**Tech Stack:** React + Vite (frontend). Sin cambios de backend.

## Global Constraints

- ESModules, `async/await` siempre, nunca callbacks.
- Sin endpoints bulk nuevos en el backend — todo se resuelve llamando repetidamente a `pagosApi.audit`/`cajasApi.audit`/`pagosApi.remove`/`cajasApi.remove` (ya existentes).
- `PATCH /:id/audit` es un *toggle*: llamarlo sobre un registro no auditado lo audita; llamarlo sobre uno auditado lo desaudita. El bulk "Auditar" debe filtrar de antemano solo los seleccionados con `audit === false`, y "Desauditar" solo los que tengan `audit === true` — nunca llamar el endpoint sobre un registro que ya está en el estado deseado.
- Desauditar en bulk NO pide un motivo por fila (a diferencia del botón individual que sí pregunta vía `showPrompt`) — se llama `pagosApi.audit(id, { observaciones: null })` / `cajasApi.audit(id, { observaciones: null })` directamente.
- Toda acción bulk sigue el patrón "sin rollback, contar éxitos/fallos" ya usado en el Bloque 4: cada ítem se procesa en su propio try/catch, un fallo no detiene el resto.
- No se agregan tests automatizados (el proyecto no tiene suite) — verificación manual vía build + inspección visual/funcional.

---

### Task 1: Componente `ActionsMenu`

**Files:**
- Create: `frontend/src/components/ActionsMenu.jsx`

**Interfaces:**
- Produces: `<ActionsMenu label="Acciones" align="left"|"right">{children}</ActionsMenu>` — componente presentacional puro, sin conocimiento de qué botones recibe. Consumido por las Tasks 2 y 3.

- [ ] **Step 1: Crear el archivo completo**

```jsx
import { useEffect, useRef, useState } from 'react'

function IcoChevronDown() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

export default function ActionsMenu({ label = 'Acciones', align = 'left', children }) {
  const [open, setOpen] = useState(false)
  const [hoverCapable, setHoverCapable] = useState(true)
  const wrapRef = useRef(null)

  useEffect(() => {
    setHoverCapable(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  useEffect(() => {
    if (hoverCapable || !open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [hoverCapable, open])

  const hoverProps = hoverCapable
    ? { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) }
    : {}

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }} {...hoverProps}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => { if (!hoverCapable) setOpen(o => !o) }}
      >
        {label} <IcoChevronDown />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, zIndex: 200,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '0.6rem', minWidth: 200,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: '0.4rem',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}
```

Notas:
- `hoverCapable` se calcula una sola vez al montar (`useEffect` con deps `[]`), vía `window.matchMedia('(hover: hover) and (pointer: fine)')` — verdadero en desktop con mouse, falso en touch.
- En modo hover, el panel se abre/cierra con `onMouseEnter`/`onMouseLeave` puestos en el `<div>` contenedor (que envuelve tanto el botón como el panel), así mover el mouse del botón al panel no lo cierra.
- En modo touch, el botón alterna `open` con `onClick`, y un listener de `mousedown` en `document` lo cierra si el click fue fuera de `wrapRef`.
- `align="left"` pone `left: 0` (panel alineado al borde izquierdo del botón); `align="right"` pone `right: 0`.
- Los `children` se renderizan tal cual, sin envolverlos en botones adicionales ni forzar `width: 100%` — mantienen el mismo aspecto que ya tienen hoy.

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso. El componente no se usa todavía en ningún lado (eso pasa en las Tasks 2 y 3) — no es un error que quede sin importar por ahora.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ActionsMenu.jsx
git commit -m "feat(ui): componente ActionsMenu (boton + panel hover/click, reutilizable)"
```

---

### Task 2: Usar `ActionsMenu` en el detalle de Pago

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx` (componente `PagoDetailPanel`)

**Interfaces:**
- Consumes: `ActionsMenu` (Task 1).

- [ ] **Step 1: Importar `ActionsMenu`**

Al principio de `frontend/src/pages/pagos/PagoList.jsx`, junto a los otros imports de componentes:

```javascript
import FotoViewer from '../../components/FotoViewer.jsx'
```

Agregar debajo:

```javascript
import ActionsMenu from '../../components/ActionsMenu.jsx'
```

- [ ] **Step 2: Envolver los botones existentes**

Dentro de `PagoDetailPanel`, buscar el bloque que arranca en:

```jsx
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {canEdit && (
          <button className="btn btn-secondary" onClick={() => navigate(`/pagos/${pago.id}/editar`)}>
            <IcoEdit /> Editar
          </button>
        )}
        {canEdit && (
          <button
            className={`btn ${audited ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handlePanelAudit}
            disabled={auditando}
          >
            {auditando
              ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              : audited ? '✓ Auditado' : 'Auditar'
            }
          </button>
        )}
        {canEdit && pago.estado_op !== 'PDP' && (
          <button className="btn btn-secondary" onClick={handleMandarPdp} disabled={mandando} title="Mandar a PDP">
            {mandando ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlane />}
            {' '}PDP
          </button>
        )}
        {canEdit && pago.estado_op === 'PDP' && (
          <button className="btn btn-secondary" onClick={handleRevertirPdp} disabled={mandando} title="Revertir a deuda">
            {mandando ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '↩'}
            {' '}Deuda
          </button>
        )}
        {canEdit && !pago.pagado && (
          <button className="btn btn-secondary" onClick={() => setPagarOpen(true)} title="Registrar pago">
            <IcoDollar /> Pagar
          </button>
        )}
        {canEdit && (
          <button
            className={`btn ${periodico ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleTogglePeriodico}
            disabled={toggling}
            title="Marcar como periódico"
          >
            {toggling ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoRepeat />}
            {' '}{periodico ? 'Periódico' : 'Periódico'}
          </button>
        )}
        {canDelete && (
          <button className="btn btn-danger" onClick={() => onDelete(pago.id)}>
            <IcoTrash /> Eliminar
          </button>
        )}
      </div>
```

Reemplazarlo por (mismos botones, mismas condiciones, mismos handlers — solo cambia el wrapper):

```jsx
      <div style={{ marginBottom: '1.25rem' }}>
        <ActionsMenu label="Acciones" align="left">
          {canEdit && (
            <button className="btn btn-secondary" onClick={() => navigate(`/pagos/${pago.id}/editar`)}>
              <IcoEdit /> Editar
            </button>
          )}
          {canEdit && (
            <button
              className={`btn ${audited ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handlePanelAudit}
              disabled={auditando}
            >
              {auditando
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : audited ? '✓ Auditado' : 'Auditar'
              }
            </button>
          )}
          {canEdit && pago.estado_op !== 'PDP' && (
            <button className="btn btn-secondary" onClick={handleMandarPdp} disabled={mandando} title="Mandar a PDP">
              {mandando ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoPlane />}
              {' '}PDP
            </button>
          )}
          {canEdit && pago.estado_op === 'PDP' && (
            <button className="btn btn-secondary" onClick={handleRevertirPdp} disabled={mandando} title="Revertir a deuda">
              {mandando ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '↩'}
              {' '}Deuda
            </button>
          )}
          {canEdit && !pago.pagado && (
            <button className="btn btn-secondary" onClick={() => setPagarOpen(true)} title="Registrar pago">
              <IcoDollar /> Pagar
            </button>
          )}
          {canEdit && (
            <button
              className={`btn ${periodico ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleTogglePeriodico}
              disabled={toggling}
              title="Marcar como periódico"
            >
              {toggling ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <IcoRepeat />}
              {' '}{periodico ? 'Periódico' : 'Periódico'}
            </button>
          )}
          {canDelete && (
            <button className="btn btn-danger" onClick={() => onDelete(pago.id)}>
              <IcoTrash /> Eliminar
            </button>
          )}
        </ActionsMenu>
      </div>
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 3: Verificación visual**

Levantar el frontend, abrir el detalle de un pago:
- Confirmar que aparece un único botón "Acciones".
- En desktop (mouse real), pasar el mouse por encima despliega el panel con los botones de siempre; sacar el mouse lo cierra.
- Simular touch (DevTools → toggle device toolbar) y confirmar que ahora el panel se abre/cierra con tap, no con hover.
- Confirmar que cada botón interno (Editar, Auditar, PDP/Deuda, Pagar, Periódico, Eliminar) sigue haciendo exactamente lo mismo que antes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "feat(pagos): usar ActionsMenu en el detalle en vez de la fila de botones"
```

---

### Task 3: Usar `ActionsMenu` en el detalle de Caja

**Files:**
- Modify: `frontend/src/pages/cajas/CajaList.jsx` (componente `CajaDetailPanel`)

**Interfaces:**
- Consumes: `ActionsMenu` (Task 1).

- [ ] **Step 1: Importar `ActionsMenu`**

Al principio de `frontend/src/pages/cajas/CajaList.jsx`, junto a los otros imports de componentes:

```javascript
import AdjuntoUpload from '../../components/AdjuntoUpload.jsx'
```

Agregar debajo:

```javascript
import ActionsMenu from '../../components/ActionsMenu.jsx'
```

- [ ] **Step 2: Envolver los botones existentes**

Dentro de `CajaDetailPanel`, buscar el bloque:

```jsx
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {canEdit && (
          <button
            className={`btn btn-sm ${caja.audit ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleAudit}
            disabled={auditando}
          >
            {auditando
              ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              : caja.audit ? '✓ Auditado' : 'Auditar'
            }
          </button>
        )}
        {canEdit && (
          <button className="btn btn-secondary btn-sm" onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoEdit /> Editar
          </button>
        )}
        {canDelete && (
          <button className="btn btn-danger btn-sm" onClick={(e) => onDelete(cajaId, e)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoTrash /> Eliminar
          </button>
        )}
      </div>
```

Reemplazarlo por:

```jsx
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <ActionsMenu label="Acciones" align="right">
          {canEdit && (
            <button
              className={`btn btn-sm ${caja.audit ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleAudit}
              disabled={auditando}
            >
              {auditando
                ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                : caja.audit ? '✓ Auditado' : 'Auditar'
              }
            </button>
          )}
          {canEdit && (
            <button className="btn btn-secondary btn-sm" onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcoEdit /> Editar
            </button>
          )}
          {canDelete && (
            <button className="btn btn-danger btn-sm" onClick={(e) => onDelete(cajaId, e)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcoTrash /> Eliminar
            </button>
          )}
        </ActionsMenu>
      </div>
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación visual**

Mismo chequeo que en la Task 2, pero para el detalle de una Caja: un único botón "Acciones" alineado a la derecha, panel con Auditar/Editar/Eliminar, hover en desktop y tap en touch, cada botón interno funcionando igual que antes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/cajas/CajaList.jsx
git commit -m "feat(cajas): usar ActionsMenu en el detalle en vez de la fila de botones"
```

---

### Task 4: Selección múltiple y acciones bulk en Pagos

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx` (componente principal `PagoList`)

**Interfaces:**
- Consumes: `pagosApi.audit(id, data?)`, `pagosApi.remove(id)` (ya existentes).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Extraer la carga a un `load` callback reutilizable**

Buscar el bloque actual:

```javascript
  // ── Carga de la página actual (reemplaza, no acumula) ──────────────────────
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    pagosApi.list(buildParams(page), ctrl.signal)
      .then(({ data }) => {
        setPagos(data.data)
        setTotal(data.total)
        if (!autoOpenedRef.current && searchParams.get('search') && data.data.length === 1) {
          autoOpenedRef.current = true
          openDetail(data.data[0])
        }
      })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar pagos', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [buildParams, page])
```

Reemplazarlo por (agrega un `load` callback sin abort, usable desde las acciones bulk, y resetea la selección en cada recarga reactiva — mismo patrón dual `load`/`useEffect` ya usado en `CajaList.jsx`):

```javascript
  const load = useCallback(() => {
    setLoading(true)
    pagosApi.list(buildParams(page))
      .then(({ data }) => { setPagos(data.data); setTotal(data.total) })
      .catch(() => notify('Error al cargar pagos', 'error'))
      .finally(() => setLoading(false))
  }, [buildParams, page])

  // ── Carga de la página actual (reemplaza, no acumula) ──────────────────────
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setSelectedIds(new Set())
    pagosApi.list(buildParams(page), ctrl.signal)
      .then(({ data }) => {
        setPagos(data.data)
        setTotal(data.total)
        if (!autoOpenedRef.current && searchParams.get('search') && data.data.length === 1) {
          autoOpenedRef.current = true
          openDetail(data.data[0])
        }
      })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar pagos', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [buildParams, page])
```

- [ ] **Step 2: Agregar el estado de selección**

Buscar:

```javascript
  const [pagos,           setPagos]           = useState([])
```

Agregar debajo del bloque de `useState` existente (después de la línea `const [provSearchLoading, setProvSearchLoading] = useState(false)`):

```javascript
  const [selectedIds, setSelectedIds] = useState(new Set())
```

- [ ] **Step 3: Agregar los handlers de selección y bulk**

Después de la definición de `patchPago` (busca `const patchPago = (id, fields) => {...}`), agregar:

```javascript
  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const allVisibleSelected = pagos.length > 0 && pagos.every(p => selectedIds.has(p.id))
  const toggleSelectAllVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(pagos.map(p => p.id)))
  }

  const selectedPagos    = pagos.filter(p => selectedIds.has(p.id))
  const canBulkAudit     = selectedPagos.some(p => !p.audit)
  const canBulkDesaudit  = selectedPagos.some(p => p.audit)

  const bulkCancel = () => setSelectedIds(new Set())

  const bulkAuditar = async () => {
    const targets = selectedPagos.filter(p => !p.audit)
    let ok = 0, fail = 0
    for (const p of targets) {
      try { await pagosApi.audit(p.id); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} pagos auditados` : `${ok}/${targets.length} auditados, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkDesauditar = async () => {
    const targets = selectedPagos.filter(p => p.audit)
    let ok = 0, fail = 0
    for (const p of targets) {
      try { await pagosApi.audit(p.id, { observaciones: null }); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} pagos desauditados` : `${ok}/${targets.length} desauditados, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkEliminar = async () => {
    if (!(await showConfirm(`¿Eliminar ${selectedPagos.length} pagos?`))) return
    let ok = 0, fail = 0
    for (const p of selectedPagos) {
      try { await pagosApi.remove(p.id); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} pagos eliminados` : `${ok}/${selectedPagos.length} eliminados, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }
```

- [ ] **Step 4: Bumpear `colCount`**

Buscar:

```javascript
  const colCount = 18 + (showLocalCol ? 1 : 0)
```

Reemplazar por (se agrega 1 por la nueva columna de checkbox):

```javascript
  const colCount = 19 + (showLocalCol ? 1 : 0)
```

- [ ] **Step 5: Agregar la barra flotante de acciones bulk**

Buscar, justo antes de la tabla:

```jsx
      {/* ── Tabla ── */}
      <div className="table-wrap">
```

Insertar la barra bulk inmediatamente antes:

```jsx
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.75rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
            {selectedIds.size} seleccionados
          </span>
          <button className="btn btn-sm btn-secondary" onClick={bulkAuditar} disabled={!canBulkAudit}>
            Auditar
          </button>
          <button className="btn btn-sm btn-secondary" onClick={bulkDesauditar} disabled={!canBulkDesaudit}>
            Desauditar
          </button>
          <button className="btn btn-sm btn-danger" onClick={bulkEliminar}>
            Eliminar
          </button>
          <button className="btn btn-sm btn-secondary" onClick={bulkCancel} style={{ marginLeft: 'auto' }}>
            Cancelar
          </button>
        </div>
      )}

      {/* ── Tabla ── */}
      <div className="table-wrap">
```

- [ ] **Step 6: Agregar la columna de checkbox al header**

Buscar (dentro del `<thead>`):

```jsx
            <tr>
              <SortTh field="nro_ord" minWidth={70}>OP</SortTh>
```

Reemplazar por:

```jsx
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              </th>
              <SortTh field="nro_ord" minWidth={70}>OP</SortTh>
```

- [ ] **Step 7: Agregar la celda de checkbox a cada fila**

Buscar:

```jsx
              pagos.map((p) => (
                <tr key={p.id} className="row-clickable" onClick={() => openDetail(p)}>
                  <td className="td-primary" style={{ minWidth: 70, whiteSpace: 'nowrap' }}>{p.nro_ord != null ? `OP-${p.nro_ord}` : <span className="td-muted">—</span>}</td>
```

Reemplazar por:

```jsx
              pagos.map((p) => (
                <tr key={p.id} className="row-clickable" onClick={() => openDetail(p)}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} />
                  </td>
                  <td className="td-primary" style={{ minWidth: 70, whiteSpace: 'nowrap' }}>{p.nro_ord != null ? `OP-${p.nro_ord}` : <span className="td-muted">—</span>}</td>
```

- [ ] **Step 8: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 9: Verificación visual**

Levantar el frontend y el backend contra la base real si es posible. En la tabla de Pagos:
- Confirmar que aparece la columna de checkbox al principio de cada fila y en el header.
- Seleccionar varias filas, confirmar que aparece la barra "N seleccionados" con Auditar/Desauditar/Eliminar/Cancelar.
- Con una selección mixta (algunas auditadas, otras no), confirmar que ambos botones Auditar/Desauditar están habilitados.
- Con una selección donde todas ya están auditadas, confirmar que "Auditar" queda deshabilitado (no hay nada que auditar) y viceversa para "Desauditar".
- Clickear un checkbox de fila y confirmar que NO abre el detalle de esa fila.
- Ejecutar Auditar/Desauditar/Eliminar sobre una selección chica y confirmar que la tabla se actualiza y la selección se limpia.
- Cambiar de página o aplicar un filtro con filas seleccionadas y confirmar que la selección se resetea sola.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "feat(pagos): seleccion multiple + acciones bulk (auditar/desauditar/eliminar)"
```

---

### Task 5: Selección múltiple y acciones bulk en Cajas

**Files:**
- Modify: `frontend/src/pages/cajas/CajaList.jsx` (componente principal `CajaList`)

**Interfaces:**
- Consumes: `cajasApi.audit(id, data?)`, `cajasApi.remove(id)` (ya existentes), `load()` (ya existente en este componente desde el Bloque 4).

- [ ] **Step 1: Agregar el estado de selección**

Buscar:

```javascript
  const [cajas,      setCajas]      = useState([])
```

Agregar debajo del bloque de `useState` existente (después de `const [scrollTop, setScrollTop] = useState(0)`):

```javascript
  const [selectedIds, setSelectedIds] = useState(new Set())
```

- [ ] **Step 2: Resetear la selección cuando cambian los filtros/local**

Buscar, dentro del `useEffect` de carga inicial:

```javascript
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    cajasApi.list(cajaListParams(), ctrl.signal)
```

Reemplazar por:

```javascript
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setSelectedIds(new Set())
    cajasApi.list(cajaListParams(), ctrl.signal)
```

- [ ] **Step 3: Agregar los handlers de selección y bulk**

Después de la definición de `handleDelete` (busca `const handleDelete = async (id, e) => {...}`), agregar:

```javascript
  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const allVisibleSelected = sortedCajas.length > 0 && sortedCajas.every(c => selectedIds.has(c.id))
  const toggleSelectAllVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(sortedCajas.map(c => c.id)))
  }

  const selectedCajas    = sortedCajas.filter(c => selectedIds.has(c.id))
  const canBulkAudit     = selectedCajas.some(c => !c.audit)
  const canBulkDesaudit  = selectedCajas.some(c => c.audit)

  const bulkCancel = () => setSelectedIds(new Set())

  const bulkAuditar = async () => {
    const targets = selectedCajas.filter(c => !c.audit)
    let ok = 0, fail = 0
    for (const c of targets) {
      try { await cajasApi.audit(c.id); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} cajas auditadas` : `${ok}/${targets.length} auditadas, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkDesauditar = async () => {
    const targets = selectedCajas.filter(c => c.audit)
    let ok = 0, fail = 0
    for (const c of targets) {
      try { await cajasApi.audit(c.id, { observaciones: null }); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} cajas desauditadas` : `${ok}/${targets.length} desauditadas, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }

  const bulkEliminar = async () => {
    if (!(await showConfirm(`¿Eliminar ${selectedCajas.length} cajas?`))) return
    let ok = 0, fail = 0
    for (const c of selectedCajas) {
      try { await cajasApi.remove(c.id); ok++ }
      catch { fail++ }
    }
    notify(fail === 0 ? `${ok} cajas eliminadas` : `${ok}/${selectedCajas.length} eliminadas, ${fail} falló`, fail === 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    load()
  }
```

Nota: `sortedCajas` ya está definido más arriba en el componente (bloque `useMemo`) — estos handlers deben ubicarse DESPUÉS de esa definición. Si `handleDelete` está antes de `sortedCajas` en el archivo, mover este bloque nuevo a inmediatamente después de la definición de `sortedCajas` en su lugar (confirmar el orden real en el archivo antes de pegar: `sortedCajas` está definido antes de `handleDelete` en el código actual, así que agregar este bloque justo después de `handleDelete` es válido; si al implementar se encuentra lo contrario, ubicarlo después de `sortedCajas`, que es la única dependencia real).

- [ ] **Step 4: Bumpear `colCount`**

Buscar:

```javascript
  const colCount = 12 + (showLocalCol ? 1 : 0)
```

Reemplazar por:

```javascript
  const colCount = 13 + (showLocalCol ? 1 : 0)
```

- [ ] **Step 5: Agregar la barra flotante de acciones bulk**

Buscar, justo antes de la tabla virtualizada:

```jsx
      <div ref={scrollRef} className="vt-scroll-cajas table-wrap">
```

Insertar antes:

```jsx
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.75rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
            {selectedIds.size} seleccionados
          </span>
          <button className="btn btn-sm btn-secondary" onClick={bulkAuditar} disabled={!canBulkAudit}>
            Auditar
          </button>
          <button className="btn btn-sm btn-secondary" onClick={bulkDesauditar} disabled={!canBulkDesaudit}>
            Desauditar
          </button>
          <button className="btn btn-sm btn-danger" onClick={bulkEliminar}>
            Eliminar
          </button>
          <button className="btn btn-sm btn-secondary" onClick={bulkCancel} style={{ marginLeft: 'auto' }}>
            Cancelar
          </button>
        </div>
      )}

      <div ref={scrollRef} className="vt-scroll-cajas table-wrap">
```

- [ ] **Step 6: Agregar la columna de checkbox al header**

Buscar (dentro del `<thead>`):

```jsx
            <tr>
              <SortTh field="nro_turno">Nro Turno</SortTh>
```

Reemplazar por:

```jsx
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              </th>
              <SortTh field="nro_turno">Nro Turno</SortTh>
```

- [ ] **Step 7: Agregar la celda de checkbox a cada fila**

Buscar:

```jsx
                {visibleCajas.map((c) => (
                  <tr key={c.id} className="row-clickable" onClick={() => openDetail(c.id)}>
                    <td className="td-primary">{c.nro_turno ? `TRN ${c.nro_turno}` : <span className="td-muted">—</span>}</td>
```

Reemplazar por:

```jsx
                {visibleCajas.map((c) => (
                  <tr key={c.id} className="row-clickable" onClick={() => openDetail(c.id)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} />
                    </td>
                    <td className="td-primary">{c.nro_turno ? `TRN ${c.nro_turno}` : <span className="td-muted">—</span>}</td>
```

- [ ] **Step 8: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 9: Verificación visual**

Mismos chequeos que en la Task 4 (Step 9), pero para la tabla de Cajas. Nota adicional: como Cajas no tiene paginación (carga todo con `limit: 0`), "seleccionar todas las visibles" selecciona todo el conjunto filtrado (`sortedCajas`), no solo lo que está renderizado en el viewport virtualizado (`visibleCajas`) — confirmar que scrollear después de "seleccionar todas" no pierde la selección de las filas que entran a la vista recién al scrollear.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/cajas/CajaList.jsx
git commit -m "feat(cajas): seleccion multiple + acciones bulk (auditar/desauditar/eliminar)"
```

---

## Nota final

Después de completar las 5 tareas, correr `grep -n "ActionsMenu" frontend/src/pages/pagos/PagoList.jsx frontend/src/pages/cajas/CajaList.jsx` para confirmar que ambos archivos lo importan y usan, y `grep -n "selectedIds" frontend/src/pages/pagos/PagoList.jsx frontend/src/pages/cajas/CajaList.jsx` para confirmar que la selección múltiple quedó cableada en ambos.
