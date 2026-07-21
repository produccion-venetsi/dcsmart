# Filtro de tipo de fecha + resumen agregado en Pagos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir filtrar los pagos por distintos campos de fecha (Fecha, Fecha de Pago, Cashflow, Período), bloquear la exportación de CSV hasta que se elija un rango de fecha, y mostrar un cuadro resumen (total de importes + suma por tipo de impuesto) de todos los pagos que matchean el filtro actual.

**Architecture:** El backend expone el filtro de fecha existente (`desde`/`hasta`, hoy fijo sobre `fecha`) de forma paramétrica vía un nuevo query param `campo_fecha`, reutilizando la misma construcción de `where` de Prisma tanto para `GET /api/pagos` (list/export) como para un nuevo endpoint `GET /api/pagos/summary` que agrega (`SUM`) importes e impuestos directo en la base. El frontend agrega un selector de tipo de fecha al panel de filtros existente, condiciona el botón de exportar CSV a que haya un rango de fecha, y agrega una fila de tarjetas de resumen que se recalcula con los mismos filtros que ya disparan la carga de la tabla.

**Tech Stack:** Fastify + Prisma (backend), React + Zustand (frontend), sin frameworks de testing automatizado configurados en ninguno de los dos paquetes — la verificación de cada tarea es manual (curl / navegador), siguiendo el patrón ya existente en el proyecto (no hay tests unitarios de rutas ni de páginas).

## Global Constraints

- Whitelist estricta de `campo_fecha`: solo `fecha | fecha_pago | cashflow | periodo`; cualquier otro valor cae al default `fecha` (nunca se interpola un valor no validado en una key de Prisma).
- El resumen (`/summary`) debe compartir exactamente la misma lógica de `where` que `GET /pagos` (list), incluyendo `rubcatFilter`, `auditFilter`, `proveedorFilter`, `qFilter`, y todos los filtros simples — se logra extrayendo esa construcción a una función compartida, no reimplementándola.
- El botón "Exportar CSV" y el cuadro de resumen comparten el mismo gate: habilitados solo cuando `filters.desde && filters.hasta` están completos.
- No se modifican las columnas del CSV (`PAGO_CSV_COLUMNS`) ni la paginación de la tabla.
- Nombres de campos en snake_case en el backend (convención del proyecto, ver `CLAUDE.md`).

---

## Task 1: Backend — extraer `buildPagosWhere` y parametrizar el filtro de fecha en `GET /pagos`

**Files:**
- Modify: `backend/src/routes/pagos.js:135-256` (agrega función helper antes de `pagosRoutes` y refactoriza el handler `GET /`)

**Interfaces:**
- Produces: `async function buildPagosWhere(fastify, request, query)` → devuelve el objeto `where` de Prisma para `pago.findMany`/`pago.count`/`pago.aggregate`. `query` es un objeto plano con las mismas keys que hoy desestructura el handler `GET /` (`id_local, id_proveedor, id_proveedores, pagado, estado_op, desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats, audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q`). Requiere que `request.allowedLocalIds` ya esté seteado (lo pone `appContext`, preHandler existente).
- Consumes: nada de tareas anteriores (es la primera tarea).

- [ ] **Step 1: Agregar la whitelist de campos de fecha y la función `buildPagosWhere`**

Insertar antes de `export default async function pagosRoutes(fastify) {` (línea 135), es decir justo después de la función `sanitizeFolderName` (línea 133):

```javascript
// Campos de fecha filtrables desde el frontend (dropdown "Tipo de fecha").
// Whitelist estricta: cualquier valor fuera de esta lista cae al default
// 'fecha', para no interpolar un valor arbitrario como key de Prisma.
const CAMPOS_FECHA_VALIDOS = ['fecha', 'fecha_pago', 'cashflow', 'periodo']
function campoFechaValido(campo) {
  return CAMPOS_FECHA_VALIDOS.includes(campo) ? campo : 'fecha'
}

// Construye el `where` de Prisma compartido entre GET /pagos (list/export)
// y GET /pagos/summary, para que el resumen agregado matchee exactamente
// los mismos pagos que ve la tabla con los mismos filtros.
async function buildPagosWhere(fastify, request, query) {
  const {
    id_local, id_proveedor, id_proveedores, pagado, estado_op,
    desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
    audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q
  } = query

  const localFilter = { id_local: { in: id_local ? [id_local] : request.allowedLocalIds } }

  // Rubcat: cmv_quick > id_rubcats (multi) > id_rub/id_cat > id_rubcat
  const rubcatIdsArr = id_rubcats ? id_rubcats.split(',').filter(Boolean) : []
  let rubcatFilter = {}
  if (cmv_quick === 'true') {
    rubcatFilter = { rubcat: { rubro: { nombre: { startsWith: 'CMV', mode: 'insensitive' } } } }
  } else if (rubcatIdsArr.length > 0) {
    rubcatFilter = { id_rubcat: { in: rubcatIdsArr } }
  } else if (id_rub || id_cat) {
    rubcatFilter = { rubcat: { ...(id_rub ? { id_rub } : {}), ...(id_cat ? { id_cat } : {}) } }
  } else if (id_rubcat) {
    rubcatFilter = { id_rubcat }
  }

  // Proveedor: multi > single
  const provIdsArr = id_proveedores ? id_proveedores.split(',').filter(Boolean) : []
  const proveedorFilter = provIdsArr.length > 0
    ? { id_proveedor: { in: provIdsArr } }
    : id_proveedor ? { id_proveedor } : {}

  const auditFilter = await buildAuditFilter(fastify, audit, request.allowedLocalIds)

  const qStr = q?.trim()
  let qFilter = {}
  if (qStr) {
    const qNum = parseInt(qStr.replace(/^op[-\s]*/i, ''))
    qFilter = {
      OR: [
        ...(!isNaN(qNum) ? [{ nro_ord: qNum }] : []),
        { proveedor: { nombre:       { contains: qStr, mode: 'insensitive' } } },
        { proveedor: { razon_social: { contains: qStr, mode: 'insensitive' } } },
        { rubcat: { cuenta:               { contains: qStr, mode: 'insensitive' } } },
        { rubcat: { rubro:     { nombre: { contains: qStr, mode: 'insensitive' } } } },
        { rubcat: { categoria: { nombre: { contains: qStr, mode: 'insensitive' } } } },
      ]
    }
  }

  const campoFecha = campoFechaValido(campo_fecha)

  return {
    ...localFilter,
    ...rubcatFilter,
    ...auditFilter,
    ...proveedorFilter,
    ...qFilter,
    ...(nro_ord        ? { nro_ord: parseInt(nro_ord) }                  : {}),
    ...(id_tipo        ? { id_tipo }                                      : {}),
    ...(id_metodo      ? { id_metodo }                                    : {}),
    ...(pagado         !== undefined ? { pagado:         pagado         === 'true' } : {}),
    ...(ingresa_egreso !== undefined ? { ingresa_egreso: ingresa_egreso === 'true' } : {}),
    ...(estado_op      ? { estado_op }                                    : {}),
    ...(desde || hasta ? {
      [campoFecha]: {
        ...(desde ? { gte: new Date(desde) } : {}),
        ...(hasta ? { lte: new Date(hasta) } : {})
      }
    } : {})
  }
}
```

- [ ] **Step 2: Reemplazar la construcción manual del `where` dentro del handler `GET /` para que use `buildPagosWhere`**

En `backend/src/routes/pagos.js`, dentro de `fastify.get('/', { preHandler: viewHandler }, ...)`, reemplazar desde la desestructuración de `request.query` (línea 146) hasta el cierre de `const where = {...}` (línea 216) por:

```javascript
    const {
      id_local, id_proveedor, id_proveedores, pagado, estado_op,
      desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
      audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q,
      sort_field = 'fecha', sort_dir = 'desc',
      page = 1, limit = 50
    } = request.query

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const where = await buildPagosWhere(fastify, request, {
      id_local, id_proveedor, id_proveedores, pagado, estado_op,
      desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
      audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q
    })
```

El resto del handler (`VALID_SORT`, `orderBy`, `findMany`/`count`, mapeo de `audit`/`audit_dc`, `return { data, total, page, limit }`) queda exactamente igual — solo cambia cómo se obtiene `where`.

- [ ] **Step 3: Verificar manualmente que el filtro por defecto (sin `campo_fecha`) sigue filtrando por `fecha`**

Levantar el backend local (`cd backend && npm run dev` o el comando que ya use el proyecto) y correr, reemplazando `TOKEN` por un JWT válido y `ID_LOCAL` por un local real:

```bash
curl -s "http://localhost:3000/api/pagos?id_local=ID_LOCAL&desde=2026-01-01&hasta=2026-01-31" \
  -H "Authorization: Bearer TOKEN" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log(d.total, d.data[0]?.fecha)"
```

Expected: el `total` y la primera fecha corresponden a pagos con `fecha` dentro de ese rango (mismo comportamiento que antes del cambio).

- [ ] **Step 4: Verificar manualmente que `campo_fecha=fecha_pago` filtra por ese campo en vez de `fecha`**

```bash
curl -s "http://localhost:3000/api/pagos?id_local=ID_LOCAL&campo_fecha=fecha_pago&desde=2026-01-01&hasta=2026-01-31" \
  -H "Authorization: Bearer TOKEN" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log(d.total, d.data.map(p=>p.fecha_pago))"
```

Expected: todos los `fecha_pago` de `data` caen dentro del rango (aunque su `fecha` no lo haga).

- [ ] **Step 5: Verificar que un `campo_fecha` inválido no rompe la query (cae al default)**

```bash
curl -s "http://localhost:3000/api/pagos?id_local=ID_LOCAL&campo_fecha=DROP TABLE&desde=2026-01-01&hasta=2026-01-31" \
  -H "Authorization: Bearer TOKEN"
```

Expected: `200 OK` con la misma respuesta que Step 3 (usa `fecha` porque `campoFechaValido` descarta el valor inválido).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/pagos.js
git commit -m "$(cat <<'EOF'
Parametrizar filtro de fecha en GET /pagos por campo_fecha

Extrae la construcción del where a buildPagosWhere() para poder
reutilizarla en el endpoint de resumen (siguiente tarea), y permite
elegir sobre qué campo de fecha filtrar (fecha, fecha_pago, cashflow,
periodo) en vez de solo `fecha`.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend — endpoint `GET /pagos/summary`

**Files:**
- Modify: `backend/src/routes/pagos.js` (agrega el endpoint nuevo después del handler `GET /`, antes de `GET /stats`)

**Interfaces:**
- Consumes: `buildPagosWhere(fastify, request, query)` de Task 1.
- Produces: `GET /api/pagos/summary` → `{ total_importe: number, por_impuesto: { [tipo: string]: number } }`. Usado por el frontend en Task 6.

- [ ] **Step 1: Agregar el endpoint `GET /summary`**

En `backend/src/routes/pagos.js`, inmediatamente después del `return { data, total, page: Number(page), limit: Number(limit) }` y el cierre `})` del handler `GET /` (justo antes del comentario `// ── GET /stats ──`), insertar:

```javascript
  // ── GET /summary ──────────────────────────────────────────────────────
  // Totales agregados (SUM en la base, no en el frontend) para los pagos
  // que matchean los mismos filtros que la tabla/CSV. Se usa para mostrar
  // el cuadro resumen sin tener que traer y sumar todas las filas.
  fastify.get('/summary', { preHandler: viewHandler }, async (request, reply) => {
    const {
      id_local, id_proveedor, id_proveedores, pagado, estado_op,
      desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
      audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q
    } = request.query

    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const where = await buildPagosWhere(fastify, request, {
      id_local, id_proveedor, id_proveedores, pagado, estado_op,
      desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, id_rubcat, id_rubcats,
      audit, ingresa_egreso, id_metodo, nro_ord, cmv_quick, q
    })

    const [totalAgg, porImpuestoRows] = await Promise.all([
      fastify.db.pago.aggregate({ where, _sum: { importe: true } }),
      fastify.db.impuesto.groupBy({ by: ['tipo'], where: { pago: where }, _sum: { monto: true } })
    ])

    return {
      total_importe: Number(totalAgg._sum.importe ?? 0),
      por_impuesto: Object.fromEntries(
        porImpuestoRows.map(row => [row.tipo, Number(row._sum.monto ?? 0)])
      )
    }
  })

```

- [ ] **Step 2: Verificar manualmente el total de importe**

```bash
curl -s "http://localhost:3000/api/pagos/summary?id_local=ID_LOCAL&desde=2026-01-01&hasta=2026-01-31" \
  -H "Authorization: Bearer TOKEN"
```

Expected: `{"total_importe": <número>, "por_impuesto": {...}}`. Comparar `total_importe` contra `data.reduce((a,p)=>a+Number(p.importe||0),0)` del mismo rango pedido con `GET /pagos?...&limit=0` — deben coincidir.

- [ ] **Step 3: Verificar que `por_impuesto` agrupa correctamente por tipo**

Elegir un rango donde se sepa que hay pagos con impuestos de al menos 2 tipos distintos (o crear un pago de prueba con un impuesto IVA21 vía la UI) y correr el mismo `curl` del Step 2.

Expected: `por_impuesto` tiene una key por cada `TipoImpuesto` presente en esos pagos (`IVA21`, `RETENCION`, etc.), con la suma de `monto` de ese tipo entre los pagos filtrados. Tipos sin pagos en el rango no aparecen (no hay entradas en 0).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/pagos.js
git commit -m "$(cat <<'EOF'
Agregar endpoint GET /pagos/summary con total e impuestos agregados

Permite mostrar en el frontend el total de importes y la suma por
tipo de impuesto de todos los pagos filtrados (no solo la página
visible), calculado con SUM directo en la base vía Prisma aggregate
y groupBy, reutilizando el mismo where que list/export.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Frontend — cliente API y estado de filtro `campo_fecha`

**Files:**
- Modify: `frontend/src/api/pagos.js:3-25`
- Modify: `frontend/src/pages/pagos/PagoList.jsx:806-812` (`FILTER_INIT`), `:871-894` (`buildParams`)

**Interfaces:**
- Produces: `pagosApi.summary(params, signal)` — usado por Task 6. `FILTER_INIT.campo_fecha` (default `'fecha'`) y `buildParams(...)` incluyendo `campo_fecha` — usados por Task 4, 5 y 6.
- Consumes: endpoint `GET /pagos/summary` de Task 2 (solo para que el método exista y apunte a la ruta correcta; no se invoca todavía en esta tarea).

- [ ] **Step 1: Agregar el método `summary` al cliente de API**

En `frontend/src/api/pagos.js`, agregar la línea después de `chart:` (línea 9):

```javascript
  chart:      (params, signal) => client.get('/pagos/chart',               { params, signal }),
  summary:    (params, signal) => client.get('/pagos/summary',             { params, signal }),
```

- [ ] **Step 2: Agregar `campo_fecha` a `FILTER_INIT`**

En `frontend/src/pages/pagos/PagoList.jsx`, `FILTER_INIT` (línea 806) pasa de:

```javascript
const FILTER_INIT = {
  pagado: '', estado_op: '', desde: '', hasta: '',
  id_tipo: '', id_rub: '', id_cat: '',
  audit: '', ingresa_egreso: '', id_metodo: '', cmv_quick: '',
  id_proveedores: [],
  id_rubcats: [],
}
```

a:

```javascript
const FILTER_INIT = {
  pagado: '', estado_op: '', campo_fecha: 'fecha', desde: '', hasta: '',
  id_tipo: '', id_rub: '', id_cat: '',
  audit: '', ingresa_egreso: '', id_metodo: '', cmv_quick: '',
  id_proveedores: [],
  id_rubcats: [],
}
```

- [ ] **Step 3: Agregar `campo_fecha` a `buildParams`**

En `buildParams` (dentro de `useCallback`, alrededor de la línea 882-883), reemplazar:

```javascript
      ...(filters.desde                ? { desde:            filters.desde }           : {}),
      ...(filters.hasta                ? { hasta:            filters.hasta }           : {}),
```

por:

```javascript
      ...(filters.desde                ? { desde:            filters.desde }           : {}),
      ...(filters.hasta                ? { hasta:            filters.hasta }           : {}),
      ...((filters.desde || filters.hasta) ? { campo_fecha:   filters.campo_fecha }    : {}),
```

Nota: `activeFilterCount` (línea 1046, `Object.values(filters).filter(v => ... v !== '')`) ahora también cuenta `campo_fecha` como "activo" en cuanto tenga cualquier valor — pero como su default `'fecha'` nunca es `''`, quedaría contando siempre como filtro activo aunque no se haya tocado nada. Para evitar ese conteo falso, en el mismo `buildParams`/línea de `activeFilterCount`, excluir `campo_fecha` del conteo: cambiar

```javascript
  const activeFilterCount = Object.values(filters).filter(v => Array.isArray(v) ? v.length > 0 : v !== '').length
```

por:

```javascript
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'campo_fecha' && (Array.isArray(v) ? v.length > 0 : v !== '')).length
```

- [ ] **Step 4: Verificar en el navegador que no rompió nada**

Con el frontend corriendo (`npm run dev` en `frontend/`), abrir Pagos, abrir el panel de Filtros: el contador de filtros activos (badge numérico sobre el botón "Filtros") no debe incrementarse solo por tener el filtro de fecha en su valor default. Aplicar cualquier otro filtro (ej. "No pagado") y confirmar que el contador sigue funcionando como antes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/pagos.js frontend/src/pages/pagos/PagoList.jsx
git commit -m "$(cat <<'EOF'
Agregar campo_fecha al estado de filtros y cliente de pagos/summary

Prepara el estado de filtros (FILTER_INIT, buildParams) y el cliente
de API para el selector de tipo de fecha y el cuadro resumen que se
agregan en las próximas tareas.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend — selector "Tipo de fecha" en el panel de filtros

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx:34-37` (constantes de opciones), `:1279-1286` (JSX del panel de filtros)

**Interfaces:**
- Consumes: `draft.campo_fecha` / `setDraftField('campo_fecha', ...)` — patrón ya existente en el componente (usado por todos los demás selects del panel), y `FILTER_INIT.campo_fecha` de Task 3.
- Produces: nada nuevo para otras tareas (es una pieza de UI hoja).

- [ ] **Step 1: Agregar la constante de opciones**

En `frontend/src/pages/pagos/PagoList.jsx`, después de `const TIPO_PAGO_OPTIONS = [...]` (línea 36), agregar:

```javascript
const CAMPO_FECHA_OPTIONS = [
  { value: 'fecha',      label: 'Fecha' },
  { value: 'fecha_pago', label: 'Fecha de Pago' },
  { value: 'cashflow',   label: 'Cashflow' },
  { value: 'periodo',    label: 'Período' },
]
```

- [ ] **Step 2: Agregar el `<select>` en el panel de filtros, antes de los inputs Desde/Hasta**

En el bloque `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>` del panel de filtros, justo antes del `<div>` de "Desde" (línea 1279), insertar:

```jsx
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={lbl}>Tipo de fecha</span>
                    <select className="filter-select" style={{ width: '100%' }} value={draft.campo_fecha} onChange={e => setDraftField('campo_fecha', e.target.value)}>
                      {CAMPO_FECHA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
```

(`gridColumn: '1 / -1'` para que ocupe todo el ancho del grid de 2 columnas, ya que Desde/Hasta van uno al lado del otro debajo).

- [ ] **Step 3: Verificar en el navegador**

Abrir Pagos → Filtros. Confirmar que aparece el selector "Tipo de fecha" con las 4 opciones, arriba de Desde/Hasta. Elegir "Fecha de Pago", completar Desde/Hasta con un rango conocido, click "Aplicar", y confirmar que la tabla muestra pagos cuya columna "Fecha Pago" cae en ese rango (aunque su columna "Fecha" no).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "$(cat <<'EOF'
Agregar selector de tipo de fecha al panel de filtros de Pagos

Permite elegir sobre qué campo (Fecha, Fecha de Pago, Cashflow,
Período) aplican los inputs Desde/Hasta ya existentes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend — gate del botón "Exportar CSV" según rango de fecha

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx:1372-1376`

**Interfaces:**
- Consumes: `filters.desde`, `filters.hasta` (ya existentes en el estado del componente).
- Produces: nada nuevo para otras tareas.

- [ ] **Step 1: Condicionar `disabled` y el `title` del botón de exportar**

Reemplazar:

```jsx
          {canExport && (
            <button className="btn btn-secondary" onClick={exportCsv} disabled={exporting} title="Exportar a CSV los pagos con los filtros actuales">
              {exporting ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <IcoDownload />} Exportar CSV
            </button>
          )}
```

por:

```jsx
          {canExport && (
            <button
              className="btn btn-secondary"
              onClick={exportCsv}
              disabled={exporting || !(filters.desde && filters.hasta)}
              title={filters.desde && filters.hasta
                ? 'Exportar a CSV los pagos con los filtros actuales'
                : 'Elegí un tipo de fecha y un rango (Desde/Hasta) en Filtros para poder exportar'}
            >
              {exporting ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <IcoDownload />} Exportar CSV
            </button>
          )}
```

- [ ] **Step 2: Verificar en el navegador**

Abrir Pagos sin ningún filtro de fecha aplicado: el botón "Exportar CSV" debe verse deshabilitado (gris, no clickeable), con tooltip pidiendo elegir tipo de fecha + rango. Abrir Filtros, completar Desde y Hasta, Aplicar: el botón debe habilitarse y el tooltip cambiar. Borrar Hasta (dejando solo Desde) y Aplicar: el botón vuelve a deshabilitarse.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "$(cat <<'EOF'
Deshabilitar exportar CSV hasta elegir un rango de fecha

Evita exportar la totalidad de los pagos sin acotar por fecha,
forzando a elegir tipo de fecha + Desde/Hasta en Filtros primero.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend — cuadro de resumen (total + impuestos por tipo)

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx` (nuevo estado + efecto cerca de la carga de la tabla, línea ~830-940; nueva sección JSX después del toolbar de filtros, línea ~1381)

**Interfaces:**
- Consumes: `pagosApi.summary(params, signal)` de Task 3, `buildParams(pageNum)` ya existente, `filters.desde`/`filters.hasta` de Task 3/5, `fmt$(n)` ya existente (línea 152).
- Produces: nada nuevo para otras tareas (última pieza del plan).

- [ ] **Step 1: Agregar estado de resumen**

En `frontend/src/pages/pagos/PagoList.jsx`, junto a los demás `useState` del componente principal (después de `const [exporting, setExporting] = useState(false)`, línea 830), agregar:

```javascript
  const [summary,        setSummary]        = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
```

- [ ] **Step 2: Agregar el efecto que carga el resumen cuando hay rango de fecha**

Inmediatamente después del `useEffect` de carga de la tabla (el que cierra con `return () => ctrl.abort()` y el array de dependencias `[buildParams, page]`, alrededor de la línea 939), agregar:

```javascript
  // ── Resumen agregado (total + impuestos) ───────────────────────────────────
  // Solo se calcula cuando hay un rango de fecha elegido (mismo gate que el
  // CSV) — usa los mismos filtros que la tabla pero sin paginar, porque el
  // total debe ser de TODOS los pagos filtrados, no solo la página visible.
  useEffect(() => {
    if (!(filters.desde && filters.hasta)) { setSummary(null); return }
    const ctrl = new AbortController()
    setSummaryLoading(true)
    pagosApi.summary(buildParams(1), ctrl.signal)
      .then(({ data }) => setSummary(data))
      .catch(() => { if (!ctrl.signal.aborted) { notify('Error al cargar el resumen', 'error'); setSummary(null) } })
      .finally(() => { if (!ctrl.signal.aborted) setSummaryLoading(false) })
    return () => ctrl.abort()
  }, [buildParams, filters.desde, filters.hasta])
```

- [ ] **Step 3: Agregar la UI de las tarjetas de resumen**

Justo después del `</div>` que cierra el toolbar principal de filtros/acciones (línea 1381, el que precede a `{selectionMode && selectedIds.size > 0 && (`), agregar:

```jsx
      {filters.desde && filters.hasta && (summaryLoading || summary) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 1rem', minWidth: 140 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.03em' }}>TOTAL IMPORTE</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {summaryLoading ? <span className="skel" style={{ width: 80, height: 16, display: 'inline-block' }} /> : fmt$(summary?.total_importe)}
            </div>
          </div>
          {!summaryLoading && summary && Object.entries(summary.por_impuesto).map(([tipo, monto]) => (
            <div key={tipo} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 1rem', minWidth: 120 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.03em' }}>{tipo}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt$(monto)}</div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Verificar en el navegador**

Abrir Pagos sin filtro de fecha: no debe aparecer ningún cuadro de resumen. Abrir Filtros, elegir "Fecha", completar Desde/Hasta con un rango conocido, Aplicar: debe aparecer una fila de tarjetas — "TOTAL IMPORTE" y una tarjeta por cada tipo de impuesto presente en esos pagos. Exportar el CSV con el mismo filtro y sumar manualmente la columna "Importe" y las columnas de impuestos (o abrir cada pago) para confirmar que los números coinciden con las tarjetas. Cambiar el rango o cualquier otro filtro (ej. Proveedor) y confirmar que las tarjetas se recalculan.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "$(cat <<'EOF'
Agregar cuadro de resumen de importes e impuestos en Pagos

Muestra el total de importe y la suma por tipo de impuesto de TODOS
los pagos que matchean el filtro actual (no solo la página visible),
usando el nuevo endpoint /pagos/summary. Se muestra solo cuando hay
un rango de fecha elegido, igual que la exportación de CSV.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
