# Cajas a la par de Pagos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón de filtros a la tabla de Cajas (Desde/Hasta/Auditado, mismo patrón que Pagos) y permitir cargar Detalles/Movimientos pendientes en el formulario de creación de una caja, antes de guardarla.

**Architecture:** Ambas tareas tocan solo `frontend/src/pages/cajas/CajaList.jsx` — no hay cambios de backend ni de esquema, todo con las APIs (`cajasApi`, `detallesApi`, `movimientosApi`, `metodosApi`) que ya existen. El botón de filtros reemplaza el `<select>` bare de auditoría que hoy vive suelto en el header de la página, replicando el patrón ya usado en `frontend/src/pages/pagos/PagoList.jsx` (botón + panel desplegable + estado `draft`/`filters`). Los ítems pendientes de Detalles/Movimientos viven en estado local del componente `CajaCreatePanel` y solo se persisten (vía `detallesApi.create`/`movimientosApi.create`) después de que la caja se crea exitosamente.

**Tech Stack:** React + Vite (frontend). Fastify + Prisma (backend, sin cambios en este plan).

## Global Constraints

- ESModules, `async/await` siempre, nunca callbacks.
- Sin cambios de esquema ni endpoints nuevos — solo `cajasApi`, `detallesApi`, `movimientosApi`, `metodosApi` ya existentes.
- El filtro "Auditado" en Cajas usa los mismos valores que ya acepta el backend (`audit=''|'true'|'false'`) — sin cambios de backend.
- Si falla la creación de un Detalle o Movimiento pendiente durante el submit, no se revierte la caja ya creada — se acumulan los fallos y se informa al usuario, sin rollback transaccional.
- No se agregan tests automatizados (el proyecto no tiene suite) — verificación manual vía build + inspección visual.

---

### Task 1: Botón "Filtros" en Cajas (Desde/Hasta/Auditado)

**Files:**
- Modify: `frontend/src/pages/cajas/CajaList.jsx` (componente principal `CajaList`, líneas ~749-900 actuales)

**Interfaces:**
- Consumes: `cajasApi.list(params, signal)` (ya existente) — se le agregan `desde`/`hasta` a los params cuando estén seteados, además del `audit` que ya se pasaba.
- Produces: nada que otras tareas consuman — la Task 2 es independiente.

- [ ] **Step 1: Reemplazar el estado `auditFilter` por `filters`/`draft`/`filterOpen`**

En `CajaList.jsx`, buscar (dentro del componente `CajaList`, ~línea 767):

```javascript
  const [auditFilter, setAuditFilter] = useState('')
```

Reemplazar por:

```javascript
  const FILTER_INIT_CAJAS = { desde: '', hasta: '', audit: '' }
  const [filters, setFilters] = useState(FILTER_INIT_CAJAS)
  const [draft,   setDraft]   = useState(FILTER_INIT_CAJAS)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  const hasActiveFilters  = activeFilterCount > 0

  const openFilters   = () => { setDraft(filters); setFilterOpen(true) }
  const applyFilters  = () => { setFilters(draft); setFilterOpen(false) }
  const clearFilters  = () => { setDraft(FILTER_INIT_CAJAS); setFilters(FILTER_INIT_CAJAS) }
  const setDraftField = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  useEffect(() => {
    if (!filterOpen) return
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])
```

Nota: `FILTER_INIT_CAJAS` se declara como constante local dentro del componente (no a nivel de módulo) porque solo se usa acá — si tu editor de linter se queja de que se recrea en cada render, no es un problema real (es un objeto de 3 strings vacíos, no afecta rendimiento ni identidad de referencia en ningún `useEffect` — ninguno de los `useEffect` de esta tarea depende de `FILTER_INIT_CAJAS` en su array de dependencias).

- [ ] **Step 2: Actualizar los 2 `useEffect`/`load` que llaman a `cajasApi.list`**

Buscar (hay 3 apariciones de este patrón: el `load` callback y el `useEffect` de carga inicial):

```javascript
  const load = useCallback(() => {
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, limit: 0, ...(auditFilter !== '' ? { audit: auditFilter } : {}) })
      .then(({ data }) => setCajas(data.data))
      .catch(() => notify('Error al cargar cajas', 'error'))
      .finally(() => setLoading(false))
  }, [activeLocal?.id, auditFilter])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    cajasApi.list({ id_local: activeLocal?.id, limit: 0, ...(auditFilter !== '' ? { audit: auditFilter } : {}) }, ctrl.signal)
      .then(({ data }) => {
        setCajas(data.data)
        const turno = searchParams.get('turno')
        if (!autoOpenedRef.current && turno) {
          const match = data.data.find(c => c.nro_turno === turno)
          if (match) {
            autoOpenedRef.current = true
            openDetail(match.id)
          }
        }
      })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar cajas', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [activeLocal?.id, auditFilter])
```

Reemplazar ambos por (mismo cuerpo, solo cambia cómo se arman los params y la dependencia):

```javascript
  const cajaListParams = () => ({
    id_local: activeLocal?.id,
    limit: 0,
    ...(filters.audit !== '' ? { audit: filters.audit } : {}),
    ...(filters.desde !== '' ? { desde: filters.desde } : {}),
    ...(filters.hasta !== '' ? { hasta: filters.hasta } : {})
  })

  const load = useCallback(() => {
    setLoading(true)
    cajasApi.list(cajaListParams())
      .then(({ data }) => setCajas(data.data))
      .catch(() => notify('Error al cargar cajas', 'error'))
      .finally(() => setLoading(false))
  }, [activeLocal?.id, filters])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    cajasApi.list(cajaListParams(), ctrl.signal)
      .then(({ data }) => {
        setCajas(data.data)
        const turno = searchParams.get('turno')
        if (!autoOpenedRef.current && turno) {
          const match = data.data.find(c => c.nro_turno === turno)
          if (match) {
            autoOpenedRef.current = true
            openDetail(match.id)
          }
        }
      })
      .catch(err => { if (!ctrl.signal.aborted) notify('Error al cargar cajas', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [activeLocal?.id, filters])
```

- [ ] **Step 3: Reemplazar el `<select>` bare por el botón "Filtros" + panel**

Buscar en el JSX (dentro del `return`, dentro de `.page-actions`):

```jsx
          <select className="filter-select" value={auditFilter} onChange={e => setAuditFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="false">No auditado</option>
            <option value="true">Auditado</option>
          </select>
```

Reemplazar por:

```jsx
          <div style={{ position: 'relative' }} ref={filterRef}>
            <button
              className={`btn ${filterOpen || hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => filterOpen ? setFilterOpen(false) : openFilters()}
            >
              <IcoFilter />
              Filtros
              {activeFilterCount > 0 && (
                <span style={{ marginLeft: 6, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filterOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '1.25rem', width: 320, maxWidth: '90vw',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <div>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Desde</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.desde} max={draft.hasta || undefined} onChange={e => setDraftField('desde', e.target.value)} />
                  </div>
                  <div>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Hasta</span>
                    <input type="date" className="filter-select" style={{ width: '100%' }} value={draft.hasta} min={draft.desde || undefined} onChange={e => setDraftField('hasta', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Auditado</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.audit} onChange={e => setDraftField('audit', e.target.value)}>
                      <option value="">Todos</option>
                      <option value="false">No auditado</option>
                      <option value="true">Auditado</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-sm btn-secondary" onClick={clearFilters}>
                    Limpiar todo
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={applyFilters}>
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>
```

- [ ] **Step 4: Agregar el ícono `IcoFilter`**

Cerca de los otros íconos definidos al principio del archivo (junto a `IcoPlus`/`IcoTrash`, ~línea 18), agregar:

```javascript
function IcoFilter() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}
```

- [ ] **Step 5: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso, sin errores de `auditFilter` no definido (confirmar con un grep que no queda ninguna referencia: `grep -n "auditFilter" frontend/src/pages/cajas/CajaList.jsx` no debe devolver nada).

- [ ] **Step 6: Verificación visual**

Levantar el frontend, entrar a Cajas, confirmar:
- Aparece el botón "Filtros" con el mismo look que en Pagos (badge de cantidad cuando hay filtros activos).
- El panel tiene Desde/Hasta/Auditado.
- Aplicar un filtro de fecha o de auditoría efectivamente cambia la lista mostrada.
- "Limpiar todo" vuelve a mostrar todas las cajas.
- Clickear afuera del panel lo cierra sin aplicar cambios no confirmados.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/cajas/CajaList.jsx
git commit -m "feat(cajas): boton Filtros (Desde/Hasta/Auditado), mismo patron que Pagos"
```

---

### Task 2: Detalles y Movimientos pendientes al crear una Caja

**Files:**
- Modify: `frontend/src/pages/cajas/CajaList.jsx` (componente `CajaCreatePanel`, líneas ~618-745 actuales)

**Interfaces:**
- Consumes: `detallesApi.tipos(id_local)`, `detallesApi.create(data)`, `movimientosApi.create(data)`, `metodosApi.list()` (todas ya existentes, mismos nombres/firmas que ya usa `CajaDetailPanel` en este mismo archivo).
- Produces: nada que otras tareas consuman — es la última tarea de este plan.

- [ ] **Step 1: Agregar estado e imports necesarios en `CajaCreatePanel`**

En `CajaCreatePanel` (busca `function CajaCreatePanel({ activeLocal, locales, onCreated, onClose }) {`), después de las declaraciones de estado existentes:

```javascript
  const [fotoFile,      setFotoFile]      = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)
```

Agregar:

```javascript
  const [tipos,   setTipos]   = useState([])
  const [metodos, setMetodos] = useState([])

  const [pendingDetalles, setPendingDetalles] = useState([])
  const [detForm, setDetForm] = useState({ id_tipo: '', monto: '', observaciones: '' })

  const [pendingMovimientos, setPendingMovimientos] = useState([])
  const [movForm, setMovForm] = useState({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
```

No hace falta ningún import nuevo — `detallesApi`, `movimientosApi`, `metodosApi`, `fmt$2`, `IcoTrash`, `IcoPlus` ya están importados/definidos a nivel de módulo en este archivo (los usa `CajaDetailPanel` más abajo).

- [ ] **Step 2: Cargar `tipos`/`metodos` cuando se conoce el local objetivo**

Después de la línea `const targetLocalId = activeLocal?.id || localId`, agregar:

```javascript
  useEffect(() => {
    if (!targetLocalId) return
    detallesApi.tipos(targetLocalId)
      .then(r => setTipos(r.data || []))
      .catch(() => {})
  }, [targetLocalId])

  useEffect(() => {
    metodosApi.list()
      .then(r => setMetodos(r.data || []))
      .catch(() => {})
  }, [])
```

- [ ] **Step 3: Funciones para agregar/quitar ítems pendientes**

Después del `useEffect` de `metodos` (Step 2), agregar:

```javascript
  const addPendingDetalle = () => {
    if (!detForm.monto) return
    setPendingDetalles(prev => [...prev, { ...detForm, _key: crypto.randomUUID() }])
    setDetForm({ id_tipo: '', monto: '', observaciones: '' })
  }
  const removePendingDetalle = (key) => setPendingDetalles(prev => prev.filter(d => d._key !== key))

  const addPendingMovimiento = () => {
    if (!movForm.monto) return
    setPendingMovimientos(prev => [...prev, { ...movForm, _key: crypto.randomUUID() }])
    setMovForm({ tipo: 'INGRESO', id_metodo: '', monto: '', cantidad: '' })
  }
  const removePendingMovimiento = (key) => setPendingMovimientos(prev => prev.filter(m => m._key !== key))
```

- [ ] **Step 4: Persistir los pendientes al crear la caja**

Reemplazar el `handleCreate` actual:

```javascript
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!targetLocalId) { notify('Seleccioná un local', 'error'); return }
    setSaving(true)
    try {
      let foto_url = form.foto_url
      if (fotoFile) {
        setUploadingFoto(true)
        const fd = new FormData()
        fd.append('file', fotoFile)
        const r = await cajasApi.upload(fd, targetLocalId)
        foto_url = r.data.url
        setUploadingFoto(false)
      }
      const res = await cajasApi.create({ ...form, foto_url, id_local: targetLocalId })
      notify('Caja creada', 'success')
      onCreated(res.data?.id)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
      setUploadingFoto(false)
    } finally { setSaving(false) }
  }
```

Por:

```javascript
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!targetLocalId) { notify('Seleccioná un local', 'error'); return }
    setSaving(true)
    try {
      let foto_url = form.foto_url
      if (fotoFile) {
        setUploadingFoto(true)
        const fd = new FormData()
        fd.append('file', fotoFile)
        const r = await cajasApi.upload(fd, targetLocalId)
        foto_url = r.data.url
        setUploadingFoto(false)
      }
      const res = await cajasApi.create({ ...form, foto_url, id_local: targetLocalId })
      const nuevoId = res.data?.id

      let detOk = 0, detFail = 0
      for (const d of pendingDetalles) {
        try {
          await detallesApi.create({
            id_caja: nuevoId,
            id_tipo: d.id_tipo || null,
            monto: parseFloat(d.monto),
            observaciones: d.observaciones || null
          })
          detOk++
        } catch { detFail++ }
      }

      let movOk = 0, movFail = 0
      for (const m of pendingMovimientos) {
        try {
          await movimientosApi.create({
            id_caja: nuevoId,
            tipo: m.tipo,
            id_metodo: m.id_metodo || null,
            monto: parseFloat(m.monto),
            cantidad: m.cantidad ? parseInt(m.cantidad) : null
          })
          movOk++
        } catch { movFail++ }
      }

      if (detFail === 0 && movFail === 0) {
        notify('Caja creada', 'success')
      } else {
        notify(
          `Caja creada. Detalles: ${detOk}/${pendingDetalles.length} guardados. Movimientos: ${movOk}/${pendingMovimientos.length} guardados. Los que fallaron podés agregarlos manualmente desde el detalle.`,
          'error'
        )
      }
      onCreated(nuevoId)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
      setUploadingFoto(false)
    } finally { setSaving(false) }
  }
```

- [ ] **Step 5: Agregar las secciones "Detalles" y "Movimientos" al JSX**

Buscar, dentro del `return` de `CajaCreatePanel`, el cierre de la grilla de campos y el inicio de `form-actions`:

```jsx
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label className="form-label">Observaciones</label>
          <div className="form-input-wrap form-textarea-wrap">
            <textarea rows={2} value={form.observaciones} onChange={e => setF('observaciones', e.target.value)} placeholder="Notas opcionales..." />
          </div>
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: '1.5rem' }}>
```

Insertar el siguiente bloque entre el `</div>` que cierra la grilla y el `<div className="form-actions"`:

```jsx
      <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>Detalles (opcional)</div>
      {pendingDetalles.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '0.75rem' }}>
          <table className="data-table">
            <thead><tr><th>Nombre</th><th>Monto</th><th></th></tr></thead>
            <tbody>
              {pendingDetalles.map(d => (
                <tr key={d._key}>
                  <td>{tipos.find(t => t.id === d.id_tipo)?.nombre || '—'}</td>
                  <td className="td-number">{fmt$2(d.monto)}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => removePendingDetalle(d._key)}>
                      <IcoTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
        <div className="form-group" style={{ margin: 0, flex: 1 }}>
          <label className="form-label">Nombre</label>
          <div className="form-input-wrap">
            <select value={detForm.id_tipo} onChange={e => setDetForm(f => ({ ...f, id_tipo: e.target.value }))}>
              <option value="">Ver opciones</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0, flex: 1 }}>
          <label className="form-label">Monto</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={detForm.monto} onChange={e => setDetForm(f => ({ ...f, monto: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0, flex: 1 }}>
          <label className="form-label">Observaciones</label>
          <div className="form-input-wrap">
            <input type="text" placeholder="Opcional" value={detForm.observaciones} onChange={e => setDetForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={addPendingDetalle} disabled={!detForm.monto}>
          <IcoPlus /> Agregar
        </button>
      </div>

      <div className="drawer-section-title">Movimientos (opcional)</div>
      {pendingMovimientos.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '0.75rem' }}>
          <table className="data-table">
            <thead><tr><th>Tipo</th><th>Método</th><th>Monto</th><th>Cant.</th><th></th></tr></thead>
            <tbody>
              {pendingMovimientos.map(m => (
                <tr key={m._key}>
                  <td>
                    <span className={`badge ${m.tipo === 'INGRESO' || m.tipo === 'APERTURA' ? 'badge-green' : 'badge-red'}`}>{m.tipo}</span>
                  </td>
                  <td className="td-muted">{metodos.find(x => x.id === m.id_metodo)?.nombre || '—'}</td>
                  <td className="td-number">{fmt$2(m.monto)}</td>
                  <td className="td-muted" style={{ textAlign: 'right' }}>{m.cantidad || '—'}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => removePendingMovimiento(m._key)}>
                      <IcoTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Tipo</label>
          <div className="form-input-wrap">
            <select value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}>
              <option>INGRESO</option>
              <option>EGRESO</option>
              <option>APERTURA</option>
              <option>CIERRE</option>
            </select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Método</label>
          <div className="form-input-wrap">
            <select value={movForm.id_metodo} onChange={e => setMovForm(f => ({ ...f, id_metodo: e.target.value }))}>
              <option value="">Sin método</option>
              {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Monto</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={movForm.monto} onChange={e => setMovForm(f => ({ ...f, monto: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Cantidad</label>
          <div className="form-input-wrap">
            <input type="number" min="1" step="1" placeholder="Opcional" value={movForm.cantidad} onChange={e => setMovForm(f => ({ ...f, cantidad: e.target.value }))} />
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={addPendingMovimiento} disabled={!movForm.monto}>
          <IcoPlus /> Agregar
        </button>
      </div>
```

- [ ] **Step 6: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 7: Verificación visual (crear una caja con pendientes)**

Levantar el frontend y el backend contra la base real si es posible (Cloud SQL Auth Proxy). Abrir "Nueva Caja":
- Completar los campos obligatorios (Local si corresponde, Fecha Inicio).
- Agregar al menos un Detalle pendiente (elegir un nombre de la lista de tipos, poner un monto) — confirmar que aparece en la tabla de pendientes con un botón para quitarlo.
- Agregar al menos un Movimiento pendiente — mismo chequeo.
- Quitar uno de los pendientes con el botón de tacho, confirmar que desaparece de la lista antes de crear.
- Crear la caja. Confirmar que navega al detalle de la caja recién creada, y que ahí aparecen los Detalles/Movimientos que quedaron en la lista pendiente al momento de crear (no el que se quitó).
- Crear otra caja sin agregar ningún pendiente (flujo actual) y confirmar que sigue funcionando igual que antes (sin errores, sin pedir nada extra).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/cajas/CajaList.jsx
git commit -m "feat(cajas): detalles y movimientos pendientes en el form de creacion"
```

---

## Nota final

Después de completar ambas tareas, correr `grep -n "auditFilter" frontend/src/pages/cajas/CajaList.jsx` para confirmar que no queda ningún rastro del filtro viejo (debe reemplazarse por completo con `filters`/`draft` en la Task 1).
