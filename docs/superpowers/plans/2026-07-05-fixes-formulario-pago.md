# Fixes formulario de pago Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar 5 fixes al formulario de pago (`frontend/src/pages/pagos/PagoForm.jsx`): egreso por defecto, fecha de factura por defecto, búsqueda de proveedores en backend, combobox de rubcat con búsqueda igual a proveedores, y preview del número de OP correlativo.

**Architecture:** Cambios incrementales sobre archivos existentes. Se agrega soporte de `search` al endpoint de rubcat (mismo patrón que proveedores), se extrae un componente `Combobox` genérico reutilizado por proveedor y rubcat, y se extrae la lógica de cálculo de `nro_ord` a una función compartida expuesta por un nuevo endpoint `GET /pagos/next-nro-ord`.

**Tech Stack:** Fastify + Prisma (backend), React + Vite + Zustand (frontend), sin framework de tests de UI instalado. El backend tiene `node --test` configurado pero sin tests existentes ni carpeta `src/test/`; no se introduce infraestructura de test nueva en este plan — se sigue el patrón actual del proyecto (verificación manual vía `curl` y en el navegador), documentado explícitamente en cada tarea.

## Global Constraints

- ESModules (`import/export`) en todo el proyecto, `async/await` siempre.
- IDs son UUID v4. Nombres de campo backend en snake_case.
- No se modifica el comportamiento de negocio existente salvo lo descrito en cada tarea (ej. `selectProveedor`/`clearProveedor`/`calcCashflow` no cambian su lógica interna).
- No se agrega infraestructura de test nueva (jest/vitest/etc.) — el proyecto no la tiene hoy. La verificación de cada tarea es manual (curl para backend, navegador para frontend).
- Commits individuales por tarea, en la rama `DEV-fixes-for-mvp-08` (ya creada y con la spec commiteada).
- Spec de referencia: `docs/superpowers/specs/2026-07-05-fixes-formulario-pago-design.md`.

---

### Task 1: Egreso por defecto + fecha de factura por defecto

**Files:**
- Modify: `frontend/src/pages/pagos/PagoForm.jsx:118-129`

**Interfaces:**
- No introduce funciones ni tipos nuevos — solo cambia valores default dentro del `useState` inicial de `form`.

- [ ] **Step 1: Cambiar los defaults en el estado inicial del form**

En `frontend/src/pages/pagos/PagoForm.jsx`, reemplazar:

```jsx
  const [form, setForm] = useState(() => ({
    fecha: modoRapido ? hoy : '',
    id_proveedor: '', id_rubcat: '', id_tipo: modoRapido ? 'STK' : '',
    pv: '', nro: '',
    importe_neto: '', descuento: '', importe: '',
    id_metodo: '', cashflow: '', observaciones: '',
    pagado: modoRapido, fecha_pago: modoRapido ? hoy : '', periodo: modoRapido ? hoy : '',
    estado_op: 'CUENTA_CTE', ingresa_egreso: true,
    periodico: false,
    id_local: activeLocal?.id || '',
    foto_url: '', pdf_url: '',
  }))
```

por:

```jsx
  const [form, setForm] = useState(() => ({
    fecha: hoy,
    id_proveedor: '', id_rubcat: '', id_tipo: modoRapido ? 'STK' : '',
    pv: '', nro: '',
    importe_neto: '', descuento: '', importe: '',
    id_metodo: '', cashflow: '', observaciones: '',
    pagado: modoRapido, fecha_pago: modoRapido ? hoy : '', periodo: modoRapido ? hoy : '',
    estado_op: 'CUENTA_CTE', ingresa_egreso: false,
    periodico: false,
    id_local: activeLocal?.id || '',
    foto_url: '', pdf_url: '',
  }))
```

(Solo dos cambios: `fecha: modoRapido ? hoy : ''` → `fecha: hoy`, e `ingresa_egreso: true` → `ingresa_egreso: false`. El resto de la línea de `periodo`/`fecha_pago` con `modoRapido ? hoy : ...` no se toca porque son campos distintos a "fecha de factura".)

- [ ] **Step 2: Verificación manual**

Con el backend y frontend corriendo (`npm run dev` en ambas carpetas), abrir `/pagos/nuevo` (modo normal) y confirmar:
- El toggle Ingreso/Egreso arranca marcado en "Egreso" (rojo).
- El campo "Fecha Factura" ya viene con la fecha de hoy cargada.

Abrir `/pagos/nuevo?modo=rapido` y confirmar lo mismo.

Abrir un pago existente en modo edición y confirmar que sus valores reales de `ingresa_egreso`/`fecha` se muestran sin cambios (el efecto de carga en el `useEffect` de la línea 160-182 sobreescribe el estado inicial, así que no debería verse afectado).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/pagos/PagoForm.jsx
git commit -m "fix: formulario de pago arranca en Egreso y con fecha de hoy por defecto"
```

---

### Task 2: Backend — soporte de búsqueda por texto en rubcat

**Files:**
- Modify: `backend/src/routes/rubcat.js:97-102`

**Interfaces:**
- Produce: `GET /api/rubcat?search=texto` — devuelve `RubCat[]` (mismo shape que antes: `{ id, id_cat, id_rub, cuenta, tipo, costo, clasificacion, rubro: {...}, categoria: {...} }`) filtrado por `rubro.nombre` o `categoria.nombre` conteniendo `texto` (case-insensitive). Sin `search`, devuelve todo (comportamiento actual, sin cambios).

- [ ] **Step 1: Agregar el parámetro `search` al handler `GET /`**

En `backend/src/routes/rubcat.js`, reemplazar:

```javascript
  // ─── RUBCAT ───────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async () => {
    return fastify.db.rubCat.findMany({
      include: { rubro: true, categoria: true },
      orderBy: [{ rubro: { nombre: 'asc' } }, { categoria: { nombre: 'asc' } }]
    })
  })
```

por:

```javascript
  // ─── RUBCAT ───────────────────────────────────────
  fastify.get('/', { preHandler: viewHandler }, async (request) => {
    const { search } = request.query
    return fastify.db.rubCat.findMany({
      where: search ? {
        OR: [
          { rubro:     { nombre: { contains: search, mode: 'insensitive' } } },
          { categoria: { nombre: { contains: search, mode: 'insensitive' } } }
        ]
      } : {},
      include: { rubro: true, categoria: true },
      orderBy: [{ rubro: { nombre: 'asc' } }, { categoria: { nombre: 'asc' } }]
    })
  })
```

- [ ] **Step 2: Verificar manualmente con curl**

Con el backend corriendo localmente y un JWT válido (tomarlo de la respuesta de `POST /api/auth/login` o de las devtools del navegador tras loguearse):

```bash
curl -s "http://localhost:3000/api/rubcat" -H "Authorization: Bearer $TOKEN" | head -c 300
curl -s "http://localhost:3000/api/rubcat?search=algun_texto_de_un_rubro_existente" -H "Authorization: Bearer $TOKEN"
```

Esperado: la segunda respuesta devuelve solo los `RubCat` cuyo `rubro.nombre` o `categoria.nombre` contiene el texto buscado (probar con un texto que sepas que existe en tu base de datos de rubros/categorías), y una búsqueda con texto inexistente devuelve `[]`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/rubcat.js
git commit -m "feat: soporte de busqueda por texto en GET /rubcat"
```

---

### Task 3: Componente `Combobox` genérico reutilizable

**Files:**
- Create: `frontend/src/components/Combobox.jsx`

**Interfaces:**
- Produce: `export default function Combobox({ value, displayValue, getKey, getLabel, onSelect, onClear, fetchItems, placeholder, wrapClassName })`.
  - `value`: id actualmente seleccionado (string u otro tipo de key), o `''`/`null` si no hay selección.
  - `displayValue`: string a mostrar en el input cuando hay un item seleccionado (el padre decide qué texto mostrar, ej. `prov.nombre`).
  - `getKey(item)`: devuelve la key única de un item (para el `key` de React y comparaciones).
  - `getLabel(item)`: devuelve el texto a mostrar en cada opción de la lista.
  - `onSelect(item)`: callback al elegir un item de la lista.
  - `onClear()`: callback al limpiar la selección (botón "×").
  - `fetchItems(search)`: función async que recibe el texto de búsqueda actual (string, puede ser `''`) y devuelve un array de items. El componente la llama con debounce de 300ms en cada cambio de texto, y una vez al montar (con `search: ''`) para mostrar un listado inicial.
  - `placeholder`: placeholder del input de texto.
  - `wrapClassName` (opcional): clase adicional para el `div` contenedor, además de `combobox-wrap` (para casos como `style={{ gridColumn: 'span 2' }}` que hoy se aplica solo al de proveedor).
- No conoce nada de proveedores, rubcat, cashflow, ni de ningún dominio de negocio — toda esa lógica vive en los callbacks que le pasa el padre.

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/components/Combobox.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'

export default function Combobox({
  value,
  displayValue,
  getKey,
  getLabel,
  onSelect,
  onClear,
  fetchItems,
  placeholder,
  wrapClassName = '',
}) {
  const [search, setSearch]     = useState(displayValue || '')
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(false)
  const ref        = useRef(null)
  const debounceId = useRef(null)
  const reqId      = useRef(0)

  useEffect(() => {
    setSearch(displayValue || '')
  }, [displayValue])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const runFetch = (text) => {
    const myReqId = ++reqId.current
    setLoading(true)
    fetchItems(text)
      .then(result => {
        if (myReqId !== reqId.current) return
        setItems(result)
      })
      .finally(() => {
        if (myReqId === reqId.current) setLoading(false)
      })
  }

  useEffect(() => {
    runFetch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onInputChange = (text) => {
    setSearch(text)
    setOpen(true)
    if (debounceId.current) clearTimeout(debounceId.current)
    debounceId.current = setTimeout(() => runFetch(text), 300)
  }

  const handleSelect = (item) => {
    onSelect(item)
    setOpen(false)
  }

  const handleClear = () => {
    setSearch('')
    onClear()
    setOpen(false)
  }

  return (
    <div className={`combobox-wrap ${wrapClassName}`} ref={ref}>
      <div className="form-input-wrap">
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          autoComplete="off"
          onChange={e => onInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="input-clear-btn"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
            title="Quitar selección"
          >×</button>
        )}
      </div>
      {open && (
        <div className="combobox-inline-list">
          {loading
            ? <div className="combobox-inline-empty">Buscando…</div>
            : items.length === 0
              ? <div className="combobox-inline-empty">Sin resultados</div>
              : items.map(item => (
                <button
                  key={getKey(item)}
                  type="button"
                  className="combobox-option"
                  onClick={() => handleSelect(item)}
                >
                  {getLabel(item)}
                </button>
              ))
          }
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificación**

No hay verificación aislada posible sin un consumidor (no hay framework de tests de componentes en el proyecto). Se verifica en conjunto con las Tasks 4 y 5, que son quienes lo usan. Confirmar en este paso únicamente que el archivo no tiene errores de sintaxis: `cd frontend && npx eslint src/components/Combobox.jsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Combobox.jsx
git commit -m "feat: componente Combobox generico reutilizable"
```

---

### Task 4: Usar `Combobox` para proveedores con búsqueda server-side

**Files:**
- Modify: `frontend/src/pages/pagos/PagoForm.jsx`

**Interfaces:**
- Consume: `Combobox` de Task 3, `proveedoresApi.list({ search, activo: 'true', limit: 60 }, signal)` (ya existe en `frontend/src/api/proveedores.js`).
- Produce: reemplaza el estado `proveedores`/`provSearch`/`provOpen`/`filteredProvs`/`provRef` por el uso de `Combobox`; `selectProveedor`/`clearProveedor` se mantienen como los callbacks de negocio.

- [ ] **Step 1: Importar `Combobox`**

En `frontend/src/pages/pagos/PagoForm.jsx`, agregar el import (junto a los demás imports, línea 11):

```jsx
import Combobox from '../../components/Combobox.jsx'
```

El `useEffect` de carga inicial se reescribe por completo en el Step 2 siguiente (deja de precargar la lista completa de proveedores).

- [ ] **Step 2: Reemplazar el bloque completo del `useEffect` y los estados de proveedor**

Dado que el paso anterior es propenso a errores por edición parcial, reemplazar el archivo en estas zonas puntuales con precisión total:

**2a.** Reemplazar la declaración de estados (líneas 76-90):

```jsx
  const [proveedores,     setProveedores]     = useState([])
  const [rubcats,         setRubcats]         = useState([])
  const [metodos,         setMetodos]         = useState([])
  const [loading,         setLoading]         = useState(false)
  const [localProveedor,  setLocalProveedor]  = useState(null)
  const [fotoFile,        setFotoFile]        = useState(null)
  const [pdfFile,         setPdfFile]         = useState(null)
  const [uploadingFoto,   setUploadingFoto]   = useState(false)
  const [uploadingPdf,    setUploadingPdf]    = useState(false)

  // combobox de proveedor
  const [provSearch, setProvSearch] = useState('')
  const [provOpen,   setProvOpen]   = useState(false)
  const [provPlazo,  setProvPlazo]  = useState(null)
  const provRef = useRef(null)
```

por:

```jsx
  const [metodos,         setMetodos]         = useState([])
  const [loading,         setLoading]         = useState(false)
  const [localProveedor,  setLocalProveedor]  = useState(null)
  const [fotoFile,        setFotoFile]        = useState(null)
  const [pdfFile,         setPdfFile]         = useState(null)
  const [uploadingFoto,   setUploadingFoto]   = useState(false)
  const [uploadingPdf,    setUploadingPdf]    = useState(false)

  // proveedor seleccionado (objeto completo, para mostrar su nombre en el Combobox)
  const [provSelected, setProvSelected] = useState(null)
  const [provPlazo,    setProvPlazo]    = useState(null)
```

(Se elimina `proveedores`, `provSearch`, `provOpen`, `provRef` — reemplazados por `provSelected` + el `Combobox`. `rubcats` se elimina en la Task 5, no en esta.)

**2b.** Eliminar el `useEffect` de "cerrar dropdown al hacer click fuera" (líneas 131-138) — ahora vive dentro de `Combobox`:

```jsx
  // cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (provRef.current && !provRef.current.contains(e.target)) setProvOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
```

Se borra por completo este bloque.

**2c.** Reemplazar el `useEffect` de carga inicial (antes líneas 140-200) por:

```jsx
  useEffect(() => {
    const ctrl = new AbortController()
    const rubcatReq = rubcatApi.list()
    const metReq    = metodosApi.list()
    const pagoReq   = isEditing ? pagosApi.get(id, ctrl.signal) : Promise.resolve(null)
    const localReq  = (!isEditing && modoRapido && activeLocal) ? localesApi.get(activeLocal.id) : Promise.resolve(null)

    Promise.all([rubcatReq, metReq, pagoReq, localReq])
      .then(async ([{ data: rubs }, { data: mets }, pagoRes, localRes]) => {
        setRubcats(rubs)
        setMetodos(mets)
        if (pagoRes) {
          const d = pagoRes.data
          if (d.id_proveedor && d.proveedor) {
            setProvSelected(d.proveedor)
            setProvPlazo(d.proveedor.plazo || null)
          }
          setForm({
            fecha:          d.fecha      ? d.fecha.slice(0, 10)      : '',
            id_proveedor:   d.id_proveedor   || '',
            id_rubcat:      d.id_rubcat      || '',
            id_tipo:        d.id_tipo        || '',
            pv:             d.pv != null     ? String(d.pv)           : '',
            nro:            d.nro != null    ? String(d.nro)          : '',
            importe_neto:   d.importe_neto   || '',
            descuento:      d.descuento      || '',
            importe:        d.importe        || '',
            id_metodo:      d.id_metodo      || '',
            cashflow:       d.cashflow   ? d.cashflow.slice(0, 10)   : '',
            observaciones:  d.observaciones  || '',
            pagado:         d.pagado,
            fecha_pago:     d.fecha_pago ? d.fecha_pago.slice(0, 10) : '',
            periodo:        d.periodo    ? d.periodo.slice(0, 10)    : '',
            estado_op:      d.estado_op      || 'CUENTA CTE',
            ingresa_egreso: d.ingresa_egreso,
            periodico:      d.periodico      ?? false,
            id_local:       d.id_local       || '',
            foto_url:       d.foto_url       || '',
            pdf_url:        d.pdf_url        || '',
            nro_ord:        d.nro_ord        ?? null,
          })
        } else if (localRes?.data?.id_proveedor) {
          const { data: prov } = await proveedoresApi.get(localRes.data.id_proveedor, ctrl.signal)
          setProvSelected(prov)
          setProvPlazo(prov.plazo || null)
          setForm(f => ({
            ...f,
            id_proveedor: prov.id,
            id_rubcat:    prov.id_rubcat || f.id_rubcat,
            cashflow:     calcCashflow(f.fecha, prov.plazo) || f.cashflow,
          }))
        }
      })
      .catch(() => { if (!ctrl.signal.aborted) notify('Error al cargar datos', 'error') })

    return () => ctrl.abort()
  }, [id])
```

Cambios respecto al original: ya no depende de la lista completa de `proveedores` para resolver el proveedor de un pago en edición o del local en modo rápido — usa `d.proveedor` (que el backend ya incluye en `GET /pagos/:id`, confirmado en `backend/src/routes/pagos.js:260`) o, en el caso de modo rápido, un `proveedoresApi.get(id)` puntual. Se agrega `nro_ord: d.nro_ord ?? null` al estado del form (usado en la Task 6). El campo `estado_op` conserva el bug preexistente `'CUENTA CTE'` (con espacio, no guion bajo) tal como estaba — no se corrige en este plan por no ser parte de los 5 fixes pedidos.

**2d.** Reemplazar `selectProveedor`/`clearProveedor`/`filteredProvs` (antes líneas 215-237):

```jsx
  // seleccionar proveedor desde el combobox: pre-llena rubcat y recalcula cashflow si hay plazo
  const selectProveedor = (prov) => {
    const plazo = prov.plazo || null
    setProvPlazo(plazo)
    setProvSelected(prov)
    setForm(f => ({
      ...f,
      id_proveedor: prov.id,
      id_rubcat:    prov.id_rubcat || f.id_rubcat,
      cashflow:     calcCashflow(f.fecha, plazo) || f.cashflow
    }))
  }

  const clearProveedor = () => {
    setProvPlazo(null)
    setProvSelected(null)
    setForm(f => ({ ...f, id_proveedor: '', cashflow: '' }))
  }

  const fetchProveedores = (search) =>
    proveedoresApi.list({ search, activo: 'true', limit: 60 }).then(r => r.data.data)
```

(`filteredProvs` se elimina — ya no existe filtrado local.)

**2e.** Reemplazar el bloque JSX del combobox de proveedor (antes líneas 430-463):

```jsx
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Proveedor</label>
              <Combobox
                value={form.id_proveedor}
                displayValue={provSelected?.nombre || ''}
                getKey={p => p.id}
                getLabel={p => p.nombre}
                onSelect={selectProveedor}
                onClear={clearProveedor}
                fetchItems={fetchProveedores}
                placeholder="Buscar proveedor…"
              />
            </div>
```

- [ ] **Step 3: Verificación manual**

Con backend y frontend corriendo:
- Abrir `/pagos/nuevo`, tipear en "Proveedor" un nombre, razón social o CUIT de un proveedor real y confirmar que aparece en la lista (probar especialmente con un proveedor que antes no aparecía, si se conoce alguno con más de 500 proveedores activos en la base, o buscando por razón social/CUIT en vez de nombre).
- Elegir un proveedor y confirmar que se autocompleta "Rubro/Categoría" (si el proveedor tiene uno asociado) y se recalcula "Cashflow" (si tiene plazo).
- Editar un pago existente que tenga proveedor y confirmar que el combobox muestra el nombre del proveedor ya seleccionado al abrir el form.
- Crear un pago en modo rápido con un local que tenga proveedor por defecto y confirmar que se autocompleta igual que antes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/pagos/PagoForm.jsx
git commit -m "fix: buscador de proveedores usa busqueda en backend via Combobox"
```

---

### Task 5: Usar `Combobox` para rubcat

**Files:**
- Modify: `frontend/src/pages/pagos/PagoForm.jsx`

**Interfaces:**
- Consume: `Combobox` de Task 3, `rubcatApi.list({ search })` (actualizado para aceptar params — ver Step 1).

- [ ] **Step 1: Permitir pasar params a `rubcatApi.list`**

En `frontend/src/api/rubcat.js`, reemplazar:

```javascript
export const rubcatApi = {
  list: () => client.get('/rubcat'),
```

por:

```javascript
export const rubcatApi = {
  list: (params) => client.get('/rubcat', { params }),
```

- [ ] **Step 2: Quitar `visibleRubcats` como filtro de texto y agregar `fetchRubcats`**

En `PagoForm.jsx`, el `useMemo` `visibleRubcats` (líneas 239-244) hoy filtra solo por el caso `modoRapido && id_tipo === 'STK'` (mostrar solo rubros que empiezan con "CMV") — esa lógica de negocio se mantiene, pero como filtro posterior a lo que devuelve el backend, ya no sobre el estado global `rubcats` (que se elimina de la carga inicial y pasa a ser responsabilidad del `Combobox`).

Agregar, junto a `fetchProveedores` (definido en la Task 4, Step 2d):

```jsx
  const fetchRubcats = (search) =>
    rubcatApi.list({ search }).then(r => {
      const data = r.data
      if (modoRapido && form.id_tipo === 'STK') {
        return data.filter(rc => rc.rubro?.nombre?.toUpperCase().startsWith('CMV'))
      }
      return data
    })
```

Eliminar el `useMemo` `visibleRubcats` (líneas 239-244) y el import de `useMemo` si queda sin otros usos (verificar con `grep -n "useMemo" frontend/src/pages/pagos/PagoForm.jsx` antes de tocar el import de la línea 1).

Eliminar también `rubcats`/`setRubcats` del estado y de la carga inicial (`setRubcats(rubs)` en el `useEffect` de la Task 4, Step 2c, y `rubcatApi.list()` sin params pasa a no ser necesario ahí) — el `Combobox` de rubcat hace su propia carga inicial (con `search: ''`) igual que el de proveedor.

Nota de orden: como la Task 4 ya reescribió por completo ese `useEffect`, al aplicar esta task hay que volver a editarlo quitando la línea `const rubcatReq = rubcatApi.list()`, `setRubcats(rubs)` y el parámetro `{ data: rubs }` de la desestructuración, dejando:

```jsx
  useEffect(() => {
    const ctrl = new AbortController()
    const metReq    = metodosApi.list()
    const pagoReq   = isEditing ? pagosApi.get(id, ctrl.signal) : Promise.resolve(null)
    const localReq  = (!isEditing && modoRapido && activeLocal) ? localesApi.get(activeLocal.id) : Promise.resolve(null)

    Promise.all([metReq, pagoReq, localReq])
      .then(async ([{ data: mets }, pagoRes, localRes]) => {
        setMetodos(mets)
        if (pagoRes) {
          const d = pagoRes.data
          if (d.id_proveedor && d.proveedor) {
            setProvSelected(d.proveedor)
            setProvPlazo(d.proveedor.plazo || null)
          }
          setForm({
            fecha:          d.fecha      ? d.fecha.slice(0, 10)      : '',
            id_proveedor:   d.id_proveedor   || '',
            id_rubcat:      d.id_rubcat      || '',
            id_tipo:        d.id_tipo        || '',
            pv:             d.pv != null     ? String(d.pv)           : '',
            nro:            d.nro != null    ? String(d.nro)          : '',
            importe_neto:   d.importe_neto   || '',
            descuento:      d.descuento      || '',
            importe:        d.importe        || '',
            id_metodo:      d.id_metodo      || '',
            cashflow:       d.cashflow   ? d.cashflow.slice(0, 10)   : '',
            observaciones:  d.observaciones  || '',
            pagado:         d.pagado,
            fecha_pago:     d.fecha_pago ? d.fecha_pago.slice(0, 10) : '',
            periodo:        d.periodo    ? d.periodo.slice(0, 10)    : '',
            estado_op:      d.estado_op      || 'CUENTA CTE',
            ingresa_egreso: d.ingresa_egreso,
            periodico:      d.periodico      ?? false,
            id_local:       d.id_local       || '',
            foto_url:       d.foto_url       || '',
            pdf_url:        d.pdf_url        || '',
            nro_ord:        d.nro_ord        ?? null,
          })
        } else if (localRes?.data?.id_proveedor) {
          const { data: prov } = await proveedoresApi.get(localRes.data.id_proveedor, ctrl.signal)
          setProvSelected(prov)
          setProvPlazo(prov.plazo || null)
          setForm(f => ({
            ...f,
            id_proveedor: prov.id,
            id_rubcat:    prov.id_rubcat || f.id_rubcat,
            cashflow:     calcCashflow(f.fecha, prov.plazo) || f.cashflow,
          }))
        }
      })
      .catch(() => { if (!ctrl.signal.aborted) notify('Error al cargar datos', 'error') })

    return () => ctrl.abort()
  }, [id])
```

Este es el bloque final del `useEffect` (reemplaza por completo el resultado de la Task 4, Step 2c).

- [ ] **Step 3: Reemplazar el `<select>` de rubcat por `Combobox`**

Reemplazar (antes líneas 464-476):

```jsx
            <div className="form-group">
              <label className="form-label">Rubro / Categoría</label>
              <div className="form-input-wrap">
                <select value={form.id_rubcat} onChange={e => set('id_rubcat', e.target.value)}>
                  <option value="">Sin clasificar</option>
                  {visibleRubcats.map(rc => (
                    <option key={rc.id} value={rc.id}>
                      {rc.rubro?.nombre} / {rc.categoria?.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
```

por:

```jsx
            <div className="form-group">
              <label className="form-label">Rubro / Categoría</label>
              <Combobox
                value={form.id_rubcat}
                displayValue={rubcatSelected ? `${rubcatSelected.rubro?.nombre} / ${rubcatSelected.categoria?.nombre}` : ''}
                getKey={rc => rc.id}
                getLabel={rc => `${rc.rubro?.nombre} / ${rc.categoria?.nombre}`}
                onSelect={rc => { setRubcatSelected(rc); set('id_rubcat', rc.id) }}
                onClear={() => { setRubcatSelected(null); set('id_rubcat', '') }}
                fetchItems={fetchRubcats}
                placeholder="Buscar rubro / categoría…"
              />
            </div>
```

Agregar el estado `rubcatSelected` junto a `provSelected` (Task 4, Step 2a):

```jsx
  const [rubcatSelected, setRubcatSelected] = useState(null)
```

Y en la carga en modo edición (dentro del `if (pagoRes)` del `useEffect`), agregar la resolución del rubcat seleccionado — el endpoint `GET /pagos/:id` ya incluye `rubcat: { include: { rubro: true, categoria: true } }` (`backend/src/routes/pagos.js:261`), así que alcanza con:

```jsx
          if (d.id_rubcat && d.rubcat) {
            setRubcatSelected(d.rubcat)
          }
```

agregado inmediatamente después del bloque `if (d.id_proveedor && d.proveedor) { ... }` dentro del mismo `if (pagoRes)`.

También, en `selectProveedor` (Task 4, Step 2d), cuando el proveedor autocompleta `id_rubcat`, hay que sincronizar `rubcatSelected` para que el combobox de rubcat muestre el texto correcto sin que el usuario tenga que abrirlo. El proveedor (`GET /proveedores` y `GET /proveedores/:id`) incluye `rubcat: { include: { rubro: true, categoria: true } }` (`backend/src/routes/proveedores.js:23`/`37`), así que en `selectProveedor` agregar:

```jsx
  const selectProveedor = (prov) => {
    const plazo = prov.plazo || null
    setProvPlazo(plazo)
    setProvSelected(prov)
    if (prov.rubcat) setRubcatSelected(prov.rubcat)
    setForm(f => ({
      ...f,
      id_proveedor: prov.id,
      id_rubcat:    prov.id_rubcat || f.id_rubcat,
      cashflow:     calcCashflow(f.fecha, plazo) || f.cashflow
    }))
  }
```

Y en el caso de modo rápido con proveedor por defecto del local (`localRes?.data?.id_proveedor` en el `useEffect`), agregar la misma sincronización tras obtener `prov`:

```jsx
        } else if (localRes?.data?.id_proveedor) {
          const { data: prov } = await proveedoresApi.get(localRes.data.id_proveedor, ctrl.signal)
          setProvSelected(prov)
          setProvPlazo(prov.plazo || null)
          if (prov.rubcat) setRubcatSelected(prov.rubcat)
          setForm(f => ({
            ...f,
            id_proveedor: prov.id,
            id_rubcat:    prov.id_rubcat || f.id_rubcat,
            cashflow:     calcCashflow(f.fecha, prov.plazo) || f.cashflow,
          }))
        }
```

- [ ] **Step 4: Verificación manual**

- Abrir `/pagos/nuevo`, tipear en "Rubro / Categoría" y confirmar que filtra por texto igual que proveedores (probar con parte del nombre de un rubro y de una categoría existente).
- Elegir un proveedor que tenga rubcat asociado y confirmar que el combobox de "Rubro / Categoría" muestra automáticamente el texto correcto sin que el usuario tenga que buscarlo.
- Editar un pago existente que tenga rubcat y confirmar que se muestra correctamente al abrir el form.
- Modo rápido (`?modo=rapido`) con `id_tipo=STK`: confirmar que el combobox de rubcat solo ofrece rubros que empiezan con "CMV" (comportamiento preexistente que debe seguir funcionando).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/pagos/PagoForm.jsx frontend/src/api/rubcat.js
git commit -m "fix: buscador de rubcat usa Combobox con busqueda igual a proveedores"
```

---

### Task 6: Backend — extraer cálculo de `nro_ord` y exponer `GET /pagos/next-nro-ord`

**Files:**
- Modify: `backend/src/routes/pagos.js:1-56` (agregar función helper), `backend/src/routes/pagos.js:201-256` (agregar endpoint nuevo antes de `GET /:id`), `backend/src/routes/pagos.js:288-313` (usar el helper en el POST)

**Interfaces:**
- Produce: `async function getNextNroOrd(fastify, id_local)` → `Promise<number>`. Devuelve `(último nro_ord del local ?? 0) + 1`.
- Produce: `GET /api/pagos/next-nro-ord?id_local=X` → `{ nro_ord: number }`, protegido por el mismo `viewHandler` que el resto de las lecturas de pagos, con el mismo chequeo de `request.allowedLocalIds` que ya usan `GET /stats` y `POST /`.

- [ ] **Step 1: Agregar la función helper**

En `backend/src/routes/pagos.js`, después de `buildAuditFilter` (línea 47) y antes de `export default async function pagosRoutes(fastify) {` (línea 49), agregar:

```javascript
// Calcula el próximo nro_ord correlativo para un local: (último nro_ord
// no nulo de ese local, descendente) + 1, o 1 si el local no tiene pagos
// con nro_ord asignado todavía.
async function getNextNroOrd(fastify, id_local) {
  const last = await fastify.db.pago.findFirst({
    where: { id_local, nro_ord: { not: null } },
    orderBy: { nro_ord: 'desc' },
    select: { nro_ord: true }
  })
  return (last?.nro_ord ?? 0) + 1
}
```

- [ ] **Step 2: Agregar el endpoint `GET /next-nro-ord`, antes de `GET /:id`**

Insertar, inmediatamente antes de `// ── GET /:id... ` (antes de la línea `fastify.get('/:id', { preHandler: viewHandler }, ...)`, que hoy está en la línea 256 — debe quedar **antes** de esta ruta para que Fastify no interprete `next-nro-ord` como un `:id`):

```javascript
  // ── GET /next-nro-ord ────────────────────────────────────────────────
  fastify.get('/next-nro-ord', { preHandler: viewHandler }, async (request, reply) => {
    const { id_local } = request.query
    if (!id_local) return reply.code(400).send({ error: 'id_local es requerido' })
    if (!request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }
    const nro_ord = await getNextNroOrd(fastify, id_local)
    return { nro_ord }
  })

```

- [ ] **Step 3: Usar el helper en `POST /`**

Reemplazar, dentro del handler `POST /` (líneas 305-313):

```javascript
    let finalNroOrd = nro_ord ? (parseInt(nro_ord) || null) : null
    if (!finalNroOrd) {
      const last = await fastify.db.pago.findFirst({
        where: { id_local, nro_ord: { not: null } },
        orderBy: { nro_ord: 'desc' },
        select: { nro_ord: true }
      })
      finalNroOrd = (last?.nro_ord ?? 0) + 1
    }
```

por:

```javascript
    let finalNroOrd = nro_ord ? (parseInt(nro_ord) || null) : null
    if (!finalNroOrd) {
      finalNroOrd = await getNextNroOrd(fastify, id_local)
    }
```

- [ ] **Step 4: Verificar manualmente con curl**

```bash
curl -s "http://localhost:3000/api/pagos/next-nro-ord?id_local=UN_ID_LOCAL_VALIDO" -H "Authorization: Bearer $TOKEN"
```

Esperado: `{"nro_ord": N}` donde `N` es uno más que el último `nro_ord` de pagos de ese local (verificar contra la base o contra el último pago creado en ese local).

Luego crear un pago nuevo (`POST /api/pagos` con ese mismo `id_local` y los campos obligatorios `fecha`, `importe`) y confirmar que el `nro_ord` asignado en la respuesta coincide con el que devolvió `next-nro-ord` justo antes (asumiendo que no hubo otra creación concurrente entre medio).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pagos.js
git commit -m "feat: endpoint GET /pagos/next-nro-ord y helper compartido para el correlativo"
```

---

### Task 7: Mostrar el número de OP en "Información del Pago"

**Files:**
- Modify: `frontend/src/pages/pagos/PagoForm.jsx`

**Interfaces:**
- Consume: `pagosApi` (agregar método `nextNroOrd`), endpoint de Task 6.

- [ ] **Step 1: Agregar el método al cliente de API**

En `frontend/src/api/pagos.js`, agregar dentro del objeto `pagosApi`:

```javascript
  nextNroOrd: (id_local, signal) => client.get('/pagos/next-nro-ord', { params: { id_local }, signal }),
```

- [ ] **Step 2: Agregar estado y efecto para el preview**

En `PagoForm.jsx`, agregar junto a los demás `useState` (cerca de `provSelected`/`rubcatSelected`):

```jsx
  const [previewNroOrd, setPreviewNroOrd] = useState(null)
```

Agregar un nuevo `useEffect`, después del `useEffect` de carga inicial:

```jsx
  useEffect(() => {
    if (isEditing) return // en edición se muestra el nro_ord real, no un preview
    const localId = activeLocal?.id || form.id_local
    if (!localId) { setPreviewNroOrd(null); return }
    const ctrl = new AbortController()
    pagosApi.nextNroOrd(localId, ctrl.signal)
      .then(({ data }) => setPreviewNroOrd(data.nro_ord))
      .catch(() => { if (!ctrl.signal.aborted) setPreviewNroOrd(null) })
    return () => ctrl.abort()
  }, [isEditing, activeLocal?.id, form.id_local])
```

- [ ] **Step 3: Mostrar el número en "Información del Pago"**

En el JSX de la sección "Información del Pago" (`<div className="form-panel-title">Información del Pago</div>`, línea 376), agregar justo debajo del título:

```jsx
          <div className="form-panel-title">Información del Pago</div>
          <div style={{ marginBottom: '0.75rem', fontSize: 13, color: 'var(--t3)' }}>
            {isEditing
              ? (form.nro_ord != null && <>N° OP: <strong style={{ color: 'var(--t1)' }}>{form.nro_ord}</strong></>)
              : (previewNroOrd != null && (
                <>
                  N° OP a asignar: <strong style={{ color: 'var(--t1)' }}>{previewNroOrd}</strong>
                  {' '}<span title="El número final se confirma al guardar; puede variar si se crea otro pago en el mismo local antes de guardar este.">(previsualización)</span>
                </>
              ))
            }
          </div>
```

(`form.nro_ord` ya se carga en el estado del form gracias a la Task 4, Step 2c, que agregó `nro_ord: d.nro_ord ?? null` a la desestructuración del pago en edición.)

- [ ] **Step 4: Verificación manual**

- Con un local activo seleccionado, abrir `/pagos/nuevo` y confirmar que aparece "N° OP a asignar: N (previsualización)" antes de completar ningún otro campo.
- Guardar ese pago y confirmar (en la lista de pagos o abriendo el pago recién creado) que su `nro_ord` real es efectivamente `N`.
- Abrir el mismo pago en modo edición y confirmar que ahora muestra "N° OP: N" sin la leyenda de previsualización.
- Si la app permite tener múltiples locales sin uno activo fijo, cambiar el `<select>` de local (cuando corresponda) y confirmar que el preview se recalcula para el nuevo local.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/pagos/PagoForm.jsx frontend/src/api/pagos.js
git commit -m "feat: mostrar numero de OP a asignar en Informacion del Pago"
```

---

## Verificación final end-to-end

Después de completar las 7 tareas, con backend y frontend corriendo:

1. Crear un pago nuevo en modo normal: confirmar Egreso + fecha de hoy por defecto, buscar y elegir un proveedor (por nombre y por CUIT en dos intentos distintos), confirmar que rubcat se autocompletó, ver el N° OP a asignar, completar importe y guardar.
2. Repetir en modo rápido (`?modo=rapido`).
3. Editar el pago recién creado: confirmar que proveedor, rubcat y N° OP real se muestran correctamente.
4. Buscar en el combobox de rubcat un texto que no matchee ningún rubro/categoría y confirmar que muestra "Sin resultados" sin romper la página.
