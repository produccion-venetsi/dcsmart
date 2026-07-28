# Filtros multiselect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir seleccionar varios valores a la vez en los filtros de Tipo de turno (Cajas y Reportes) y de Tipo de pago, Método y Estado OP (Pagos), con un único componente reutilizable.

**Architecture:** Un componente `MultiSelect` en el frontend que maneja `Array<{value,label}>`; los valores viajan al backend como CSV en un solo query param (`?tipo_turno=Mañana,Noche`), formato que el repo ya usa para `id_rubcats` e `id_proveedores`; el backend parsea el CSV con un helper compartido y convierte cada filtro a `{ in: [...] }` de Prisma.

**Tech Stack:** React 18 + Vite (frontend), Fastify + Prisma + PostgreSQL (backend), `node --test` para tests.

**Spec:** `docs/superpowers/specs/2026-07-28-filtros-multiselect-design.md`

## Global Constraints

- **Branch:** `DEV-37`. No pushear a `dev` ni a `master`.
- **ESModules** (`import`/`export`) en todo el proyecto. `async/await`, nunca callbacks.
- **Tests:** `node --test`, archivos `*.test.js` co-locados junto al módulo que testean, con `import { test } from 'node:test'` y `import assert from 'node:assert/strict'`. No hay infra para testear componentes React ni rutas Fastify — no agregarla.
- **Comandos de test:** backend `cd backend && npm test`; frontend `cd frontend && npm test`.
- **Semántica de filtro vacío:** array vacío = sin filtrar. Nunca "cero resultados".
- **Retrocompatibilidad obligatoria:** un CSV de un solo valor (`?tipo_turno=Mañana`) debe comportarse exactamente como hoy. Los presets guardados en la tabla `filtro_presets` NO se migran.
- **Idioma:** comentarios y textos de UI en español, con acentos correctos.
- **Un commit por tarea.**

### Nota sobre el SQL crudo

Las tres queries de `reportes.js` usan **placeholders dinámicos con `IN (...)`**
en vez de `= ANY($N::text[])`: es el patrón que ese mismo archivo ya usa para
`localIds` (`reportes.js:68`) y no depende de cómo Prisma serialice un array JS
a un array de Postgres. El spec fue actualizado para reflejarlo.

---

## File Structure

**Backend**
- Crear `backend/src/lib/queryParams.js` — parseo de query params multi-valor (CSV). Sin dependencias.
- Crear `backend/src/lib/queryParams.test.js`
- Crear `backend/src/lib/tipoTurno.js` — mapeo label ↔ enum `TipoTurno`, hoy duplicado en dos routers.
- Crear `backend/src/lib/tipoTurno.test.js`
- Modificar `backend/src/routes/caja.js` — importa los dos helpers; `tipo_turno` pasa a `{ in: [...] }`.
- Modificar `backend/src/routes/pagos.js` — `id_tipo`, `id_metodo`, `estado_op` pasan a `{ in: [...] }`.
- Modificar `backend/src/routes/reportes.js` — importa los helpers; `where` de Prisma a `{ in: [...] }` y tres cláusulas SQL a `IN (...)`.

**Frontend**
- Crear `frontend/src/lib/filtros.js` — lógica pura de filtros multi: normalización de presets, armado del param CSV, texto del control cerrado.
- Crear `frontend/src/lib/filtros.test.js`
- Crear `frontend/src/components/MultiSelect.jsx` — el control. Única responsabilidad: elegir varios valores.
- Modificar `frontend/src/styles/app.css` — estilos del control (bloque nuevo al final).
- Modificar `frontend/src/pages/cajas/CajaList.jsx` — filtro Tipo de turno + contador de filtros activos.
- Modificar `frontend/src/pages/pagos/PagoList.jsx` — Tipo, Método, Estado OP; migración de Rubros/Cat y Proveedores; chip STK; `buildParams`; `applyPreset`.
- Modificar `frontend/src/pages/reportes/Reportes.jsx` — filtro Tipo de turno de la pestaña Cajas.
- Modificar `frontend/src/pages/reportes/ReporteCajas.jsx` — arma el param `tipo_turno`.

---

## Task 1: Helper de query params multi-valor

**Files:**
- Create: `backend/src/lib/queryParams.js`
- Test: `backend/src/lib/queryParams.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `parseCsvParam(value: string | undefined | null) => string[]`. Usada por las Tasks 3, 4 y 5.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/lib/queryParams.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsvParam } from './queryParams.js'

test('parseCsvParam: sin valor devuelve lista vacía', () => {
  assert.deepEqual(parseCsvParam(undefined), [])
  assert.deepEqual(parseCsvParam(null), [])
  assert.deepEqual(parseCsvParam(''), [])
})

test('parseCsvParam: un solo valor sigue funcionando igual que antes', () => {
  assert.deepEqual(parseCsvParam('Mañana'), ['Mañana'])
})

test('parseCsvParam: varios valores separados por coma', () => {
  assert.deepEqual(parseCsvParam('Mañana,Noche'), ['Mañana', 'Noche'])
})

test('parseCsvParam: descarta segmentos vacíos y espacios sobrantes', () => {
  assert.deepEqual(parseCsvParam('a,,b, c ,'), ['a', 'b', 'c'])
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module ... queryParams.js`

- [ ] **Step 3: Escribir la implementación mínima**

Crear `backend/src/lib/queryParams.js`:

```js
// Los filtros multi-valor viajan como CSV en un solo query param
// (?tipo_turno=Mañana,Noche), mismo formato que ya usaban id_rubcats e
// id_proveedores en pagos.js. Un solo valor viaja igual que siempre, así que
// los links viejos y los presets guardados siguen funcionando.
export function parseCsvParam(value) {
  if (value == null) return []
  return String(value).split(',').map(s => s.trim()).filter(Boolean)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npm test`
Expected: PASS — los 4 tests nuevos en verde y los existentes sin romperse.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/queryParams.js backend/src/lib/queryParams.test.js
git commit -m "feat(backend): helper parseCsvParam para filtros multi-valor"
```

---

## Task 2: Extraer el mapeo de TipoTurno a un módulo compartido

`TIPO_TURNO_MAP` está duplicado en `caja.js:11-18` y `reportes.js:4-7`. Esta
tarea lo unifica **sin cambiar comportamiento** — es un refactor puro, para que
la conversión a lista de la Task 3 y la Task 5 exista en un solo lugar.

**Files:**
- Create: `backend/src/lib/tipoTurno.js`
- Test: `backend/src/lib/tipoTurno.test.js`
- Modify: `backend/src/routes/caja.js:8-32` (borrar el bloque, importar)
- Modify: `backend/src/routes/reportes.js:1-11` (borrar el bloque, importar)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `toTipoTurnoEnum(label: string) => string | null` — `'Mañana'` → `'MANANA'`
  - `fromTipoTurnoEnum(key: string) => string` — `'MANANA'` → `'Mañana'`
  - `toTipoTurnoEnumList(labels: string[]) => string[]`
  Usadas por las Tasks 3 y 5.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/lib/tipoTurno.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTipoTurnoEnum, fromTipoTurnoEnum, toTipoTurnoEnumList } from './tipoTurno.js'

test('toTipoTurnoEnum: etiqueta visible a clave del enum', () => {
  assert.equal(toTipoTurnoEnum('Mañana'), 'MANANA')
  assert.equal(toTipoTurnoEnum('Trasnoche'), 'TRASNOCHE')
})

test('toTipoTurnoEnum: vacío devuelve null', () => {
  assert.equal(toTipoTurnoEnum(''), null)
  assert.equal(toTipoTurnoEnum(undefined), null)
})

test('toTipoTurnoEnum: valor desconocido pasa tal cual', () => {
  assert.equal(toTipoTurnoEnum('MANANA'), 'MANANA')
  assert.equal(toTipoTurnoEnum('Cualquiera'), 'Cualquiera')
})

test('fromTipoTurnoEnum: clave del enum a etiqueta visible', () => {
  assert.equal(fromTipoTurnoEnum('NOCHE'), 'Noche')
  assert.equal(fromTipoTurnoEnum(null), null)
})

test('toTipoTurnoEnumList: convierte la lista y descarta vacíos', () => {
  assert.deepEqual(toTipoTurnoEnumList(['Mañana', 'Noche']), ['MANANA', 'NOCHE'])
  assert.deepEqual(toTipoTurnoEnumList([]), [])
  assert.deepEqual(toTipoTurnoEnumList(undefined), [])
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module ... tipoTurno.js`

- [ ] **Step 3: Escribir la implementación**

Crear `backend/src/lib/tipoTurno.js`:

```js
// El enum TipoTurno usa @map en el schema (ver prisma/schema.prisma), por lo
// que Prisma Client espera la clave (MANANA) y no la etiqueta visible
// ("Mañana") que envía el frontend. En SQL crudo pasa al revés: la columna
// guarda el label por el @map, así que ahí se compara contra la etiqueta.
export const TIPO_TURNO_MAP = {
  'Mañana': 'MANANA',
  'Tarde': 'TARDE',
  'Noche': 'NOCHE',
  'Trasnoche': 'TRASNOCHE',
  'Evento': 'EVENTO',
  'Otros': 'OTROS'
}

const TIPO_TURNO_REVERSE_MAP = Object.fromEntries(
  Object.entries(TIPO_TURNO_MAP).map(([label, key]) => [key, label])
)

export function toTipoTurnoEnum(value) {
  if (!value) return null
  return TIPO_TURNO_MAP[value] || value
}

export function fromTipoTurnoEnum(value) {
  if (!value) return value
  return TIPO_TURNO_REVERSE_MAP[value] || value
}

export function toTipoTurnoEnumList(values) {
  return (values || []).map(toTipoTurnoEnum).filter(Boolean)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 5: Reemplazar la copia de `caja.js` por el import**

En `backend/src/routes/caja.js`, **borrar** las líneas 8 a 32 (desde el comentario
`// El enum TipoTurno usa @map…` hasta el cierre de `fromTipoTurnoEnum`) y
agregar el import arriba de todo, junto a los otros:

```js
import multipart from '@fastify/multipart'
import { Storage } from '@google-cloud/storage'
import { toTipoTurnoEnum, fromTipoTurnoEnum } from '../lib/tipoTurno.js'
```

No tocar nada más del archivo: los usos en las líneas 114, 146, 165, 223, 249,
265, 293 y 306 siguen igual porque los nombres no cambian.

- [ ] **Step 6: Reemplazar la copia de `reportes.js` por el import**

En `backend/src/routes/reportes.js`, **borrar** las líneas 1 a 11 (el comentario,
`TIPO_TURNO_MAP` y `toTipoTurnoEnum`) y dejar el archivo empezando así:

```js
import { toTipoTurnoEnum } from '../lib/tipoTurno.js'

// Comprobantes que entran al reporte BALANCE (ver GET /balance). Son los tipos
// fiscales; el reporte se define por este conjunto, no por lo que el usuario
// tenga filtrado en pantalla. Valores del enum TipoPago en schema.prisma.
const TIPOS_BALANCE = ['A', 'C', 'M', 'NDA', 'NCA']
```

- [ ] **Step 7: Verificar que el backend arranca**

Run: `cd backend && node --check src/routes/caja.js && node --check src/routes/reportes.js && npm test`
Expected: sin errores de sintaxis, tests en verde.

- [ ] **Step 8: Commit**

```bash
git add backend/src/lib/tipoTurno.js backend/src/lib/tipoTurno.test.js backend/src/routes/caja.js backend/src/routes/reportes.js
git commit -m "refactor(backend): unificar el mapeo de TipoTurno en lib/tipoTurno.js"
```

---

## Task 3: Backend — `tipo_turno` multi-valor en Cajas

**Files:**
- Modify: `backend/src/routes/caja.js` (imports, línea ~114 en `GET /`, línea ~165 en `GET /stats`)

**Interfaces:**
- Consumes: `parseCsvParam` (Task 1), `toTipoTurnoEnumList` (Task 2).
- Produces: `GET /api/cajas` y `GET /api/cajas/stats` aceptan `?tipo_turno=Mañana,Noche`.

No hay test automatizado posible: es una ruta Fastify y el repo no testea rutas.
La verificación es de sintaxis acá y funcional en la Task 8 (la pantalla que la
consume).

- [ ] **Step 1: Ampliar el import**

En `backend/src/routes/caja.js`, cambiar el import de la Task 2 por:

```js
import { toTipoTurnoEnum, fromTipoTurnoEnum, toTipoTurnoEnumList } from '../lib/tipoTurno.js'
import { parseCsvParam } from '../lib/queryParams.js'
```

- [ ] **Step 2: `GET /` — parsear el CSV y filtrar con `in`**

En el handler de `GET /`, después de la línea
`const auditFilter = await buildCajaAuditFilter(fastify, audit, request.allowedLocalIds)`,
agregar:

```js
    // tipo_turno puede traer varios valores separados por coma.
    const tipoTurnos = toTipoTurnoEnumList(parseCsvParam(tipo_turno))
```

Y reemplazar la línea del `where`:

```js
      ...(tipo_turno ? { tipo_turno: toTipoTurnoEnum(tipo_turno) } : {}),
```

por:

```js
      ...(tipoTurnos.length ? { tipo_turno: { in: tipoTurnos } } : {}),
```

- [ ] **Step 3: `GET /stats` — el mismo cambio**

En el handler de `GET /stats`, después de
`const auditFilter = await buildCajaAuditFilter(fastify, audit, request.allowedLocalIds)`,
agregar la misma línea:

```js
    const tipoTurnos = toTipoTurnoEnumList(parseCsvParam(tipo_turno))
```

Y reemplazar:

```js
      ...(tipo_turno ? { tipo_turno: toTipoTurnoEnum(tipo_turno) } : {}),
```

por:

```js
      ...(tipoTurnos.length ? { tipo_turno: { in: tipoTurnos } } : {}),
```

- [ ] **Step 4: Verificar que `toTipoTurnoEnum` sigue usándose**

`toTipoTurnoEnum` (singular) todavía se usa en `POST /` y `PUT /:id` para
guardar la caja, así que **el import sigue haciendo falta**. Confirmarlo:

Run: `cd backend && grep -n "toTipoTurnoEnum(" src/routes/caja.js`
Expected: al menos dos resultados (el `create` y el `update`). Si aparecen cero,
el paso 2 o 3 borró de más.

- [ ] **Step 5: Verificar sintaxis y tests**

Run: `cd backend && node --check src/routes/caja.js && npm test`
Expected: sin errores, tests en verde.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/caja.js
git commit -m "feat(cajas): el filtro tipo_turno acepta varios valores"
```

---

## Task 4: Backend — `id_tipo`, `id_metodo` y `estado_op` multi-valor en Pagos

**Files:**
- Modify: `backend/src/routes/pagos.js` (import; `buildPagosWhere`, líneas ~208, ~209 y ~212)

**Interfaces:**
- Consumes: `parseCsvParam` (Task 1).
- Produces: `GET /api/pagos` y `GET /api/pagos/summary` aceptan `?id_tipo=A,B`, `?id_metodo=<uuid>,<uuid>` y `?estado_op=CAJA,PDP`.

`buildPagosWhere` ya alimenta a los dos endpoints, así que alcanza con tocarla
una vez.

- [ ] **Step 1: Agregar el import**

En `backend/src/routes/pagos.js`, junto a los imports de arriba del archivo:

```js
import { parseCsvParam } from '../lib/queryParams.js'
```

- [ ] **Step 2: Parsear los tres CSV**

Dentro de `buildPagosWhere`, justo debajo del bloque del proveedor
(`const proveedorFilter = ...`, línea ~179), agregar:

```js
  // Tipo, método y estado OP admiten varios valores (CSV), igual que
  // id_rubcats e id_proveedores.
  const tipoIds   = parseCsvParam(id_tipo)
  const metodoIds = parseCsvParam(id_metodo)
  const estadoOps = parseCsvParam(estado_op)
```

- [ ] **Step 3: Reemplazar los tres filtros del objeto devuelto**

Cambiar estas tres líneas del `return`:

```js
    ...(id_tipo        ? { id_tipo }                                      : {}),
    ...(id_metodo      ? { id_metodo }                                    : {}),
```
```js
    ...(estado_op      ? { estado_op }                                    : {}),
```

por:

```js
    ...(tipoIds.length   ? { id_tipo:   { in: tipoIds } }                 : {}),
    ...(metodoIds.length ? { id_metodo: { in: metodoIds } }               : {}),
```
```js
    ...(estadoOps.length ? { estado_op: { in: estadoOps } }               : {}),
```

Dejar intactas las líneas de `nro_ord`, `pagado` e `ingresa_egreso` que están
entremedio — son los filtros binarios y no cambian.

- [ ] **Step 4: Verificar sintaxis y tests**

Run: `cd backend && node --check src/routes/pagos.js && npm test`
Expected: sin errores, tests en verde.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pagos.js
git commit -m "feat(pagos): los filtros de tipo, metodo y estado OP aceptan varios valores"
```

---

## Task 5: Backend — `tipo_turno` multi-valor en Reportes

**Files:**
- Modify: `backend/src/routes/reportes.js` (import; `GET /cajas`: `where` de Prisma ~L47 y las tres cláusulas SQL ~L76-80, ~L120-124, ~L152-156)

**Interfaces:**
- Consumes: `parseCsvParam` (Task 1), `toTipoTurnoEnumList` (Task 2).
- Produces: `GET /api/reportes/cajas` acepta `?tipo_turno=Mañana,Noche`.

Ojo con la asimetría ya documentada en el archivo: **Prisma compara contra la
clave del enum** (`MANANA`), **el SQL crudo contra la etiqueta** (`Mañana`).
Por eso hay dos listas.

- [ ] **Step 1: Ampliar el import**

```js
import { toTipoTurnoEnumList } from '../lib/tipoTurno.js'
import { parseCsvParam } from '../lib/queryParams.js'
```

Si `toTipoTurnoEnum` (singular) ya no queda usado en el archivo después de esta
tarea, sacarlo del import.

- [ ] **Step 2: Reemplazar la conversión de un solo valor por la de lista**

Cambiar:

```js
    const tipoTurnoEnum = toTipoTurnoEnum(tipo_turno)
```

por:

```js
    // Dos listas por la asimetría del @map: el SQL crudo compara contra la
    // etiqueta ("Tarde") y Prisma contra la clave del enum ("TARDE").
    const tipoTurnoLabels = parseCsvParam(tipo_turno)
    const tipoTurnoEnums  = toTipoTurnoEnumList(tipoTurnoLabels)
```

- [ ] **Step 3: Actualizar el `where` de Prisma**

Cambiar:

```js
      ...(tipoTurnoEnum ? { tipo_turno: tipoTurnoEnum } : {}),
```

por:

```js
      ...(tipoTurnoEnums.length ? { tipo_turno: { in: tipoTurnoEnums } } : {}),
```

- [ ] **Step 4: Cláusula SQL 1 — métodos de pago (`payRows`)**

Cambiar:

```js
    let payTipoClause = ''
    if (tipoTurnoEnum) {
      payParams.push(tipo_turno)
      payTipoClause = `AND c.tipo_turno::text = $${payParams.length}`
    }
```

por:

```js
    let payTipoClause = ''
    if (tipoTurnoLabels.length) {
      // Placeholders dinámicos, igual que localPlaceholders más arriba.
      const ph = tipoTurnoLabels.map((_, i) => `$${payParams.length + i + 1}`).join(', ')
      payParams.push(...tipoTurnoLabels)
      payTipoClause = `AND c.tipo_turno::text IN (${ph})`
    }
```

El `ph` se calcula **antes** del `push`: los placeholders arrancan en
`payParams.length + 1`, que es la posición que van a ocupar.

- [ ] **Step 5: Cláusula SQL 2 — serie semanal (`weekRows`)**

Cambiar:

```js
    let weekTipoClause = ''
    if (tipoTurnoEnum) {
      weekParams.push(tipo_turno)
      weekTipoClause = `AND tipo_turno::text = $${weekParams.length}`
    }
```

por:

```js
    let weekTipoClause = ''
    if (tipoTurnoLabels.length) {
      const ph = tipoTurnoLabels.map((_, i) => `$${weekParams.length + i + 1}`).join(', ')
      weekParams.push(...tipoTurnoLabels)
      weekTipoClause = `AND tipo_turno::text IN (${ph})`
    }
```

(Sin alias `c.` — esa query lee de `cajas` directo.)

- [ ] **Step 6: Cláusula SQL 3 — desglose de detalles (`detRows`)**

Cambiar:

```js
    let detTipoClause = ''
    if (tipoTurnoEnum) {
      detParams.push(tipo_turno)
      detTipoClause = `AND c.tipo_turno::text = $${detParams.length}`
    }
```

por:

```js
    let detTipoClause = ''
    if (tipoTurnoLabels.length) {
      const ph = tipoTurnoLabels.map((_, i) => `$${detParams.length + i + 1}`).join(', ')
      detParams.push(...tipoTurnoLabels)
      detTipoClause = `AND c.tipo_turno::text IN (${ph})`
    }
```

- [ ] **Step 7: Verificar que no quedó ninguna referencia vieja**

Run: `cd backend && grep -n "tipoTurnoEnum\b" src/routes/reportes.js`
Expected: **cero resultados**. Si aparece alguno, quedó una referencia a la
variable borrada y el endpoint va a tirar `ReferenceError` en runtime.

Run: `cd backend && node --check src/routes/reportes.js && npm test`
Expected: sin errores, tests en verde.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/reportes.js
git commit -m "feat(reportes): el filtro tipo_turno acepta varios valores"
```

---

## Task 6: Lógica pura de filtros multi en el frontend

**Files:**
- Create: `frontend/src/lib/filtros.js`
- Test: `frontend/src/lib/filtros.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `multiParam(value: Array<{value,label}>) => string` — CSV para el query param.
  - `normalizarMulti(raw: any, options?: Array<{value,label}>) => Array<{value,label}>` — tolera los formatos viejos de los presets.
  - `resumenSeleccion(value: Array<{value,label}>, placeholder: string, max?: number) => string` — texto del control cerrado.
  Usadas por las Tasks 7, 8, 9, 10 y 11.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/filtros.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { multiParam, normalizarMulti, resumenSeleccion } from './filtros.js'

const TURNOS = [
  { value: 'Mañana', label: 'Mañana' },
  { value: 'Noche',  label: 'Noche' },
]

test('multiParam: arma el CSV con los values', () => {
  assert.equal(multiParam([{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }]), 'A,B')
  assert.equal(multiParam([]), '')
  assert.equal(multiParam(undefined), '')
})

test('normalizarMulti: string suelto de un preset viejo', () => {
  assert.deepEqual(normalizarMulti('Mañana', TURNOS), [{ value: 'Mañana', label: 'Mañana' }])
})

test('normalizarMulti: array de ids resuelve labels contra las opciones', () => {
  assert.deepEqual(
    normalizarMulti(['Noche'], TURNOS),
    [{ value: 'Noche', label: 'Noche' }]
  )
})

test('normalizarMulti: id sin opción conocida usa el value como label', () => {
  assert.deepEqual(normalizarMulti(['zzz'], TURNOS), [{ value: 'zzz', label: 'zzz' }])
})

test('normalizarMulti: formato viejo de proveedores {id, nombre}', () => {
  assert.deepEqual(
    normalizarMulti([{ id: 'u1', nombre: 'Coca' }]),
    [{ value: 'u1', label: 'Coca' }]
  )
})

test('normalizarMulti: el formato nuevo pasa igual', () => {
  assert.deepEqual(
    normalizarMulti([{ value: 'A', label: 'A' }]),
    [{ value: 'A', label: 'A' }]
  )
})

test('normalizarMulti: vacío, null y ausente dan lista vacía', () => {
  assert.deepEqual(normalizarMulti(undefined), [])
  assert.deepEqual(normalizarMulti(null), [])
  assert.deepEqual(normalizarMulti(''), [])
  assert.deepEqual(normalizarMulti([]), [])
})

test('resumenSeleccion: sin selección muestra el placeholder', () => {
  assert.equal(resumenSeleccion([], 'Todos los turnos'), 'Todos los turnos')
})

test('resumenSeleccion: hasta el máximo lista los labels', () => {
  assert.equal(resumenSeleccion(TURNOS, 'Todos'), 'Mañana, Noche')
})

test('resumenSeleccion: pasado el máximo agrega el contador', () => {
  const cuatro = ['Mañana', 'Noche', 'Tarde', 'Evento'].map(v => ({ value: v, label: v }))
  assert.equal(resumenSeleccion(cuatro, 'Todos'), 'Mañana, Noche +2')
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module ... filtros.js`

- [ ] **Step 3: Escribir la implementación**

Crear `frontend/src/lib/filtros.js`:

```js
// Los filtros multiselect guardan siempre { value, label }: el label viaja
// junto al value porque con búsqueda remota (proveedores) la lista completa no
// está cargada y, sin él, no se podría mostrar el nombre de lo ya elegido.

// Cuántos labels se listan antes de pasar a "+N".
const MAX_LABELS_RESUMEN = 2

// CSV para el query param: ?id_tipo=A,B
export function multiParam(value) {
  return (value || []).map(v => v.value).join(',')
}

// Los presets guardados ("Mis filtros") tienen formatos históricos: string
// suelto ("A"), array de ids (["uuid"]) o el formato viejo de proveedores
// ({ id, nombre }). Se aceptan todos para no migrar datos.
export function normalizarMulti(raw, options = []) {
  if (raw == null || raw === '') return []
  const labelDe = (value) => options.find(o => o.value === value)?.label ?? value
  const items = Array.isArray(raw) ? raw : [raw]
  return items
    .map(item => {
      if (item && typeof item === 'object') {
        const value = item.value ?? item.id
        return { value, label: item.label ?? item.nombre ?? labelDe(value) }
      }
      return { value: item, label: labelDe(item) }
    })
    .filter(x => x.value != null && x.value !== '')
}

// Texto del control cerrado.
export function resumenSeleccion(value, placeholder, max = MAX_LABELS_RESUMEN) {
  const arr = value || []
  if (arr.length === 0) return placeholder
  if (arr.length <= max) return arr.map(v => v.label).join(', ')
  return `${arr.slice(0, max).map(v => v.label).join(', ')} +${arr.length - max}`
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npm test`
Expected: PASS — los 10 tests nuevos en verde y `exportPagos.test.js` sin romperse.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/filtros.js frontend/src/lib/filtros.test.js
git commit -m "feat(frontend): helpers de filtros multiselect"
```

---

## Task 7: Componente `MultiSelect`

**Files:**
- Create: `frontend/src/components/MultiSelect.jsx`
- Modify: `frontend/src/styles/app.css` (bloque nuevo al final)

**Interfaces:**
- Consumes: `resumenSeleccion` de `frontend/src/lib/filtros.js` (Task 6).
- Produces: componente por defecto `MultiSelect` con estas props:
  - `value: Array<{value,label}>` (requerida)
  - `onChange: (next: Array<{value,label}>) => void` (requerida)
  - `options?: Array<{value,label}>` — lista fija
  - `fetchOptions?: (query: string) => Promise<Array<{value,label}>>` — búsqueda remota, excluyente con `options`
  - `placeholder?: string` (default `'Todos'`)
  - `minCharsRemoto?: number` (default `2`)
  Usado por las Tasks 8, 9, 10 y 11.

No hay test automatizado: el repo no tiene infra para componentes React. La
lógica testeable ya vive en `lib/filtros.js` (Task 6). La verificación es
visual, en la Task 8.

- [ ] **Step 1: Escribir el componente**

Crear `frontend/src/components/MultiSelect.jsx`:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { resumenSeleccion } from '../lib/filtros.js'

// A partir de cuántas opciones fijas aparece el buscador.
const UMBRAL_BUSCADOR = 8

export default function MultiSelect({
  value = [],
  onChange,
  options,
  fetchOptions,
  placeholder = 'Todos',
  minCharsRemoto = 2,
}) {
  const [open, setOpen]       = useState(false)
  const [search, setSearch]   = useState('')
  const [remotas, setRemotas] = useState([])
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  const esRemoto   = typeof fetchOptions === 'function'
  const searchable = esRemoto || (options?.length ?? 0) > UMBRAL_BUSCADOR

  // fetchOptions suele llegar como arrow inline; guardarla en un ref evita que
  // el efecto se vuelva a disparar en cada render del padre.
  const fetchRef = useRef(fetchOptions)
  useEffect(() => { fetchRef.current = fetchOptions })

  // Cierra al click afuera y con Escape. El stopPropagation evita que el mismo
  // Escape cierre además el panel de filtros que contiene al control.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey  = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // Búsqueda remota con debounce de 300 ms (mismo valor que Combobox.jsx).
  useEffect(() => {
    if (!esRemoto || !open) return
    const q = search.trim()
    if (q.length < minCharsRemoto) { setRemotas([]); setLoading(false); return }
    let vivo = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchRef.current(q)
        .then(r => { if (vivo) setRemotas(r || []) })
        .catch(() => { if (vivo) setRemotas([]) })
        .finally(() => { if (vivo) setLoading(false) })
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [search, open, esRemoto, minCharsRemoto])

  const visibles = useMemo(() => {
    if (esRemoto) return remotas
    const q = search.trim().toLowerCase()
    const base = options || []
    return q ? base.filter(o => String(o.label).toLowerCase().includes(q)) : base
  }, [esRemoto, remotas, options, search])

  // Lo ya elegido se muestra siempre arriba, aunque no esté en el resultado de
  // la búsqueda -- si no, no habría forma de destildarlo.
  const lista = useMemo(() => {
    const fuera = value.filter(v => !visibles.some(o => o.value === v.value))
    return [...fuera, ...visibles]
  }, [value, visibles])

  const estaElegido = (opt) => value.some(v => v.value === opt.value)

  const toggle = (opt) => {
    onChange(estaElegido(opt)
      ? value.filter(v => v.value !== opt.value)
      : [...value, { value: opt.value, label: opt.label }])
  }

  // "Todos" marca lo que está a la vista; con búsqueda remota eso es el
  // resultado actual, no el catálogo entero.
  const marcarTodos = () => onChange(lista.map(o => ({ value: o.value, label: o.label })))
  const marcarNinguno = () => onChange([])

  const hayNada = lista.length === 0
  const esperandoTexto = esRemoto && search.trim().length < minCharsRemoto

  return (
    <div className="multiselect-wrap" ref={ref}>
      <button
        type="button"
        className={`filter-select multiselect-trigger${value.length > 0 ? ' has-value' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={value.length > 0 ? value.map(v => v.label).join(', ') : placeholder}
      >
        <span className="multiselect-resumen">{resumenSeleccion(value, placeholder)}</span>
        {value.length > 0 && <span className="multiselect-count">{value.length}</span>}
      </button>

      {open && (
        <div className="combobox-dropdown multiselect-panel">
          {searchable && (
            <input
              type="text"
              className="multiselect-search"
              placeholder={esRemoto ? 'Escribí para buscar…' : 'Buscar…'}
              value={search}
              autoFocus
              onChange={e => setSearch(e.target.value)}
            />
          )}

          <div className="multiselect-lista">
            {loading
              ? <div className="combobox-inline-empty">Buscando…</div>
              : esperandoTexto && value.length === 0
                ? <div className="combobox-inline-empty">Escribí al menos {minCharsRemoto} letras para buscar</div>
                : hayNada
                  ? <div className="combobox-inline-empty">Sin resultados</div>
                  : lista.map(opt => (
                      <label key={opt.value} className="multiselect-option">
                        <input type="checkbox" checked={estaElegido(opt)} onChange={() => toggle(opt)} />
                        <span>{opt.label}</span>
                      </label>
                    ))
            }
          </div>

          <div className="multiselect-footer">
            <button type="button" onClick={marcarTodos} disabled={hayNada}>Todos</button>
            <button type="button" onClick={marcarNinguno} disabled={value.length === 0}>Ninguno</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Agregar los estilos**

Al final de `frontend/src/styles/app.css`:

```css
/* ── MultiSelect (filtros multi-valor) ─────────────────────────────────── */
.multiselect-wrap { position: relative; }

.multiselect-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  padding-right: 26px;
}
.multiselect-trigger.has-value { color: var(--t1); }

.multiselect-resumen {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.multiselect-count {
  background: rgba(212,175,55,0.18);
  color: var(--gold-bright);
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
}

.multiselect-panel { padding: 6px; }

.multiselect-search {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  margin-bottom: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 6px;
  color: var(--t1);
  font-size: 12px;
  outline: none;
}

.multiselect-lista { max-height: 190px; overflow-y: auto; }

.multiselect-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--t1);
}
.multiselect-option:hover { background: var(--bg-card-hi); }

.multiselect-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.multiselect-footer button {
  background: none;
  border: none;
  color: var(--t2);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
}
.multiselect-footer button:hover:not(:disabled) { color: var(--gold-bright); }
.multiselect-footer button:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Step 3: Verificar que el proyecto compila**

Run: `cd frontend && npm run build`
Expected: build exitoso, sin errores de import.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MultiSelect.jsx frontend/src/styles/app.css
git commit -m "feat(frontend): componente MultiSelect para filtros"
```

---

## Task 8: Cajas — filtro Tipo de turno multiselect

Primera pantalla que usa el componente. Acá se verifica visualmente el trabajo
de las Tasks 3, 6 y 7.

**Files:**
- Modify: `frontend/src/pages/cajas/CajaList.jsx` (imports; `TIPOS_TURNO` ~L23; `FILTER_INIT_CAJAS` ~L1562; `activeFilterCount` ~L1568; `cajaListParams` ~L1598; el `<select>` del popover ~L1825-1831)

**Interfaces:**
- Consumes: `MultiSelect` (Task 7), `multiParam` (Task 6), `GET /api/cajas` multi-valor (Task 3).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Agregar imports y la lista de opciones**

Agregar a los imports de `CajaList.jsx`:

```js
import MultiSelect from '../../components/MultiSelect.jsx'
import { multiParam } from '../../lib/filtros.js'
```

Debajo de la constante `TIPOS_TURNO` (que se deja como está, la usa el
formulario de alta y edición), agregar:

```js
const TURNO_OPTIONS = TIPOS_TURNO.map(t => ({ value: t, label: t }))
```

- [ ] **Step 2: El filtro arranca como array**

Cambiar:

```js
  const FILTER_INIT_CAJAS = { desde: '', hasta: '', audit: '', tipo_turno: '' }
```

por:

```js
  const FILTER_INIT_CAJAS = { desde: '', hasta: '', audit: '', tipo_turno: [] }
```

- [ ] **Step 3: Arreglar el contador de filtros activos**

Cambiar:

```js
  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
```

por:

```js
  // Un array vacío es "sin filtrar", igual que un string vacío.
  const activeFilterCount = Object.values(filters)
    .filter(v => (Array.isArray(v) ? v.length > 0 : v !== '')).length
```

Sin esto, el filtro recién inicializado (`[]`) contaría como activo y el botón
"Filtros" aparecería siempre resaltado con un `1`.

- [ ] **Step 4: Armar el query param**

En `cajaListParams`, cambiar:

```js
    ...(filters.tipo_turno !== '' ? { tipo_turno: filters.tipo_turno } : {}),
```

por:

```js
    ...(filters.tipo_turno.length > 0 ? { tipo_turno: multiParam(filters.tipo_turno) } : {}),
```

- [ ] **Step 5: Reemplazar el `<select>` por el `MultiSelect`**

En el popover de filtros, cambiar el bloque:

```jsx
                    <select className="filter-select" style={{ width: '100%' }} value={draft.tipo_turno} onChange={e => setDraftField('tipo_turno', e.target.value)}>
                      <option value="">Todos</option>
                      {TIPOS_TURNO.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
```

por:

```jsx
                    <MultiSelect
                      value={draft.tipo_turno}
                      onChange={(v) => setDraftField('tipo_turno', v)}
                      options={TURNO_OPTIONS}
                      placeholder="Todos"
                    />
```

Dejar el `<span>` del label "Tipo de turno" que está justo arriba.

- [ ] **Step 6: Ampliar el popover**

El popover mide `width: 320` y el panel del MultiSelect se abre adentro. Subir
el ancho para que la lista respire: en el `style` del contenedor del popover
(el `div` con `position: 'absolute'`), cambiar `width: 320` por `width: 360`.

- [ ] **Step 7: Verificar en la app**

Run: `cd frontend && npm run build`
Expected: build exitoso.

Después, con backend y frontend levantados:
1. Abrir **Cajas** → botón **Filtros**. El control dice "Todos".
2. Marcar **Mañana** y **Noche** → el control dice `Mañana, Noche` con el badge `2`.
3. **Aplicar** → la tabla trae solo cajas de esos dos turnos y el botón Filtros muestra `1`.
4. Poner un rango Desde/Hasta → la fila de totales (TOTAL RECAUDADO, TURNOS…) respeta los dos turnos.
5. **Exportar Excel** → el archivo trae las mismas filas que la tabla.
6. **Limpiar todo** → vuelve a traer todas las cajas y el badge desaparece.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/cajas/CajaList.jsx
git commit -m "feat(cajas): seleccionar varios tipos de turno en los filtros"
```

---

## Task 9: Pagos — Tipo, Método y Estado OP multiselect

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx` (imports; `FILTER_INIT` ~L832; `buildParams` ~L917, ~L921, ~L926; `CHIPS` ~L1241; `isChipActive`/`toggleChip` ~L1248-1258; `applyPreset` ~L1175; los tres `<select>` ~L1662, ~L1669, ~L1762)

**Interfaces:**
- Consumes: `MultiSelect` (Task 7), `multiParam` y `normalizarMulti` (Task 6), `GET /api/pagos` multi-valor (Task 4).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Imports y opciones de métodos**

Agregar a los imports:

```js
import MultiSelect from '../../components/MultiSelect.jsx'
import { multiParam, normalizarMulti } from '../../lib/filtros.js'
```

Debajo de `TIPO_PAGO_OPTIONS` (~L37) agregar:

```js
const TIPO_PAGO_MULTI = TIPO_PAGO_OPTIONS.map(t => ({ value: t, label: t }))
```

- [ ] **Step 2: Los tres filtros arrancan como array**

En `FILTER_INIT`, cambiar `id_tipo: ''`, `estado_op: ''` e `id_metodo: ''` por
arrays. El objeto queda así:

```js
const FILTER_INIT = {
  pagado: '', estado_op: [], campo_fecha: 'fecha', desde: '', hasta: '',
  id_tipo: [], id_rub: '', id_cat: '',
  audit: '', ingresa_egreso: '', id_metodo: [], cmv_quick: '',
  observaciones: '',
  id_proveedores: [],
  id_rubcats: [],
}
```

`activeFilterCount` (L1121) ya contempla arrays — no se toca.

- [ ] **Step 3: Armar los query params**

En `buildParams`, cambiar estas tres líneas:

```js
      ...(filters.estado_op            ? { estado_op:        filters.estado_op }       : {}),
```
```js
      ...(filters.id_tipo              ? { id_tipo:          filters.id_tipo }         : {}),
```
```js
      ...(filters.id_metodo            ? { id_metodo:        filters.id_metodo }       : {}),
```

por:

```js
      ...(filters.estado_op.length > 0 ? { estado_op:        multiParam(filters.estado_op) } : {}),
```
```js
      ...(filters.id_tipo.length   > 0 ? { id_tipo:          multiParam(filters.id_tipo) }   : {}),
```
```js
      ...(filters.id_metodo.length > 0 ? { id_metodo:        multiParam(filters.id_metodo) } : {}),
```

- [ ] **Step 4: Arreglar el chip rápido STK**

El chip `{ id_tipo: 'STK' }` compara con `draft[k] === v`, que con arrays nunca
matchea. Cambiar la definición del chip:

```js
    { label: 'STK',         filters: { id_tipo: 'STK' } },
```

por:

```js
    { label: 'STK',         filters: { id_tipo: [{ value: 'STK', label: 'STK' }] } },
```

Y hacer que `isChipActive` y `toggleChip` entiendan arrays:

```js
  const mismoValor = (a, b) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      const va = (a || []).map(x => x.value).join(',')
      const vb = (b || []).map(x => x.value).join(',')
      return va !== '' && va === vb
    }
    return b !== '' && a === b
  }

  const isChipActive = (chipFilters) =>
    Object.entries(chipFilters).every(([k, v]) => mismoValor(draft[k], v))

  const toggleChip = (chipFilters) => {
    if (isChipActive(chipFilters)) {
      const cleared = Object.keys(chipFilters).reduce(
        (acc, k) => ({ ...acc, [k]: Array.isArray(FILTER_INIT[k]) ? [] : '' }), {})
      setDraft(d => ({ ...d, ...cleared }))
    } else {
      setDraft(d => ({ ...d, ...chipFilters }))
    }
  }
```

Los otros cuatro chips (CMV, No auditado, No pagado, Egreso) usan filtros
binarios y siguen funcionando igual por la rama `else` de `mismoValor`.

- [ ] **Step 5: Normalizar los presets al aplicarlos**

Los presets guardados tienen `id_tipo: "A"` y `id_rubcats: ["uuid"]` en el
formato viejo. Cambiar `applyPreset`:

```js
  const applyPreset = (preset) => {
    const filtros = { ...FILTER_INIT, ...preset.filtros }
    setDraft(filtros)
    setFilters(filtros)
  }
```

por:

```js
  // Los presets guardados antes del multiselect tienen strings donde ahora van
  // arrays -- se normalizan al aplicarlos, sin migrar nada en la base.
  const applyPreset = (preset) => {
    const guardado = preset.filtros || {}
    const metodoOptions = metodos.map(m => ({ value: m.id, label: m.nombre }))
    const rubcatOptions = rubcats.map(rc => ({
      value: rc.id,
      label: `${rc.rubro?.nombre ?? ''} / ${rc.categoria?.nombre ?? ''}`,
    }))
    const filtros = {
      ...FILTER_INIT,
      ...guardado,
      id_tipo:        normalizarMulti(guardado.id_tipo, TIPO_PAGO_MULTI),
      estado_op:      normalizarMulti(guardado.estado_op, ESTADO_OP_OPTIONS),
      id_metodo:      normalizarMulti(guardado.id_metodo, metodoOptions),
      id_rubcats:     normalizarMulti(guardado.id_rubcats, rubcatOptions),
      id_proveedores: normalizarMulti(guardado.id_proveedores),
    }
    setDraft(filtros)
    setFilters(filtros)
  }
```

- [ ] **Step 6: Reemplazar el `<select>` de Tipo**

```jsx
                <select className="filter-select" style={{ width: '100%' }} value={draft.id_tipo} onChange={e => setDraftField('id_tipo', e.target.value)}>
                  <option value="">Todos los tipos</option>
                  {TIPO_PAGO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
```

por:

```jsx
                <MultiSelect
                  value={draft.id_tipo}
                  onChange={(v) => setDraftField('id_tipo', v)}
                  options={TIPO_PAGO_MULTI}
                  placeholder="Todos los tipos"
                />
```

- [ ] **Step 7: Reemplazar el `<select>` de Método**

```jsx
                <select className="filter-select" style={{ width: '100%' }} value={draft.id_metodo} onChange={e => setDraftField('id_metodo', e.target.value)}>
                  <option value="">Todos los métodos</option>
                  {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
```

por:

```jsx
                <MultiSelect
                  value={draft.id_metodo}
                  onChange={(v) => setDraftField('id_metodo', v)}
                  options={metodos.map(m => ({ value: m.id, label: m.nombre }))}
                  placeholder="Todos los métodos"
                />
```

- [ ] **Step 8: Reemplazar el `<select>` de Estado op.**

```jsx
                <select className="filter-select" style={{ width: '100%' }} value={draft.estado_op} onChange={e => setDraftField('estado_op', e.target.value)}>
                  <option value="">Todos</option>
                  {ESTADO_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
```

por:

```jsx
                <MultiSelect
                  value={draft.estado_op}
                  onChange={(v) => setDraftField('estado_op', v)}
                  options={ESTADO_OP_OPTIONS}
                  placeholder="Todos"
                />
```

`ESTADO_OP_OPTIONS` ya tiene la forma `{value,label}`, se pasa tal cual.

- [ ] **Step 9: Verificar en la app**

Run: `cd frontend && npm run build`
Expected: build exitoso.

Con la app levantada, en **Pagos**:
1. Filtros → **Tipo**: marcar `A` y `B` → Aplicar. La tabla trae los dos tipos y
   el resumen de arriba (totales) coincide con la tabla.
2. **Estado op.**: marcar `CAJA` y `PDP` → la tabla trae los dos.
3. **Método**: marcar dos métodos → idem.
4. Chip **STK**: prenderlo → el control de Tipo muestra `STK`; apagarlo → vuelve
   a "Todos los tipos".
5. **Guardar un preset** con dos tipos marcados, limpiar todo, y volver a
   aplicarlo → los dos tipos vuelven marcados.
6. **Aplicar un preset viejo** (creado antes de este cambio) → no rompe y el
   filtro que tenía un solo valor aparece marcado.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "feat(pagos): seleccionar varios tipos, metodos y estados en los filtros"
```

---

## Task 10: Pagos — migrar Rubros/Cat y Proveedores al componente

Los dos multiselect hechos a mano pasan al componente, para que quede una sola
UI de multiselect en toda la app. **La funcionalidad no cambia.**

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx` (`toggleDraftArr` y `toggleDraftProv` ~L1213-1237; estados `provSearch`/`rubcatSearch` y su efecto ~L1218-1231; bloque Rubros/Cat ~L1691-1714; bloque Proveedor ~L1716-1748; `buildParams` ~L929-930)

**Interfaces:**
- Consumes: `MultiSelect` (Task 7), `multiParam` (Task 6).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: `id_rubcats` pasa a `{value,label}`**

En `buildParams`, cambiar:

```js
      ...(filters.id_rubcats.length    > 0 ? { id_rubcats:    filters.id_rubcats.join(',') }    : {}),
```

por:

```js
      ...(filters.id_rubcats.length    > 0 ? { id_rubcats:    multiParam(filters.id_rubcats) }  : {}),
```

Y la de proveedores, que hoy mapea `.id`:

```js
      ...(filters.id_proveedores.length > 0 ? { id_proveedores: filters.id_proveedores.map(p => p.id).join(',') } : {}),
```

por:

```js
      ...(filters.id_proveedores.length > 0 ? { id_proveedores: multiParam(filters.id_proveedores) } : {}),
```

- [ ] **Step 2: Reemplazar el bloque de Rubros/Cat**

Cambiar todo el bloque `{/* Multi-select rubcats */}` (el `div` con el label, el
`input` de búsqueda y el `div.filters-scroll` con los checkboxes) por:

```jsx
            {/* Multi-select rubcats */}
            <div style={{ marginTop: '0.75rem' }}>
              <span style={lbl}>Rubros/Cat (múltiple)</span>
              <MultiSelect
                value={draft.id_rubcats}
                onChange={(v) => setDraftField('id_rubcats', v)}
                options={rubcats.map(rc => ({
                  value: rc.id,
                  label: `${rc.rubro?.nombre ?? ''} / ${rc.categoria?.nombre ?? ''}`,
                }))}
                placeholder="Todos los rubros/cat"
              />
            </div>
```

El contador que antes estaba en el label ahora lo muestra el propio control.

- [ ] **Step 3: Reemplazar el bloque de Proveedores**

Cambiar todo el bloque que arranca en `<div className="drawer-section-title" …>Proveedor</div>`
(incluyendo el `input` de `provSearch` y el `div.filters-scroll`) por:

```jsx
            <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>Proveedor</div>
            <div>
              <span style={lbl}>Proveedores</span>
              <MultiSelect
                value={draft.id_proveedores}
                onChange={(v) => setDraftField('id_proveedores', v)}
                fetchOptions={buscarProveedores}
                placeholder="Todos los proveedores"
              />
            </div>
```

- [ ] **Step 4: Definir `buscarProveedores` y borrar lo que quedó sin uso**

Reemplazar el efecto de búsqueda de proveedores y `toggleDraftProv` por una sola
función. Borrar:

- el `useEffect` que observa `provSearch` (el del `setTimeout` de 300 ms),
- `const [provSearch, setProvSearch] = useState('')`,
- `const [rubcatSearch, setRubcatSearch] = useState('')`,
- `const toggleDraftProv = (p) => …`,
- `const toggleDraftArr = (k, v) => …` **solo si no quedan otros usos** (verificarlo en el paso 5).

Y agregar, con `useCallback` para no recrearla en cada render:

```js
  // El MultiSelect ya hace el debounce; acá solo se traduce la respuesta del
  // backend al formato { value, label }.
  const buscarProveedores = useCallback(async (q) => {
    const r = await proveedoresApi.list({ search: q, activo: 'true', limit: 30 })
    return (r.data?.data || []).map(p => ({ value: p.id, label: p.nombre }))
  }, [])
```

Si `provSearchResults` y `provSearchLoading` quedaron sin uso, borrar también sus
`useState`.

- [ ] **Step 5: Verificar que no quedaron referencias muertas**

Run: `cd frontend && grep -n "provSearch\|rubcatSearch\|toggleDraftProv\|toggleDraftArr" src/pages/pagos/PagoList.jsx`
Expected: **cero resultados**, salvo que `toggleDraftArr` tenga otros usos
legítimos — en ese caso, solo esos.

Run: `cd frontend && npm run build`
Expected: build exitoso. Un `useCallback` sin importar o una variable borrada de
más aparecen acá.

- [ ] **Step 6: Verificar en la app**

En **Pagos** → Filtros:
1. **Rubros/Cat**: abrir, buscar por texto, marcar dos → Aplicar → la tabla trae
   los dos rubros/cat.
2. **Proveedores**: escribir 2+ letras, marcar dos proveedores → Aplicar → la
   tabla trae los dos. Volver a abrir el panel: los dos siguen marcados y
   visibles aunque el buscador esté vacío.
3. Guardar un preset con proveedores y volver a aplicarlo → los nombres se ven
   bien (no ids crudos).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "refactor(pagos): rubcats y proveedores usan el componente MultiSelect"
```

---

## Task 11: Reportes — Tipo de turno multiselect

**Files:**
- Modify: `frontend/src/pages/reportes/Reportes.jsx` (imports; `TIPOS_TURNO` ~L80; estado `tipoTurno` ~L106; el `<select>` ~L234-243)
- Modify: `frontend/src/pages/reportes/ReporteCajas.jsx` (armado de `params` ~L88-93)

**Interfaces:**
- Consumes: `MultiSelect` (Task 7), `multiParam` (Task 6), `GET /api/reportes/cajas` multi-valor (Task 5).
- Produces: nada.

- [ ] **Step 1: Imports y opciones en `Reportes.jsx`**

```js
import MultiSelect from '../../components/MultiSelect.jsx'
```

Debajo de `TIPOS_TURNO`:

```js
const TURNO_OPTIONS = TIPOS_TURNO.map(t => ({ value: t, label: t }))
```

- [ ] **Step 2: El estado arranca como array**

```js
  const [tipoTurno, setTipoTurno] = useState([])
```

- [ ] **Step 3: Reemplazar el `<select>`**

Cambiar todo el `<select>` de tipo de turno (el que tiene el `style` inline
largo, dentro de `{tab === 'cajas' && …}`) por:

```jsx
                    <MultiSelect
                      value={tipoTurno}
                      onChange={setTipoTurno}
                      options={TURNO_OPTIONS}
                      placeholder="Todos"
                    />
```

Dejar el `<div className="rep-filter-col">`, el `rep-filter-label` y el
`<div className="rep-date-input">` que lo envuelven.

- [ ] **Step 4: Armar el param en `ReporteCajas.jsx`**

Agregar el import:

```js
import { multiParam } from '../../lib/filtros.js'
```

Cambiar el armado de params:

```js
    const params = {
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal ? { id_local: activeLocal.id } : {}),
      ...(tipoTurno ? { tipo_turno: tipoTurno } : {})
    }
```

por:

```js
    const params = {
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal ? { id_local: activeLocal.id } : {}),
      ...(tipoTurno?.length ? { tipo_turno: multiParam(tipoTurno) } : {})
    }
```

- [ ] **Step 5: Arreglar la dependencia del efecto**

El `useEffect` depende de `tipoTurno`, que ahora es un array nuevo en cada
render del padre y dispararía un fetch infinito. Cambiar la lista de deps:

```js
  }, [applied.desde, applied.hasta, activeLocal?.id, tipoTurno])
```

por:

```js
  // tipoTurno es un array: se compara por su CSV, no por identidad de objeto,
  // para no re-disparar el fetch en cada render del padre.
  }, [applied.desde, applied.hasta, activeLocal?.id, multiParam(tipoTurno)])
```

Este paso es obligatorio: sin él, la pestaña Cajas de Reportes entra en un loop
de requests.

- [ ] **Step 6: Verificar en la app**

Run: `cd frontend && npm run build`
Expected: build exitoso.

En **Reportes → Cajas**:
1. Elegir un rango de fechas y **Generar reporte** sin filtro de turno → anotar
   el TOTAL.
2. Marcar **Mañana** y **Noche** → el reporte se recalcula solo (no hace falta
   volver a generar) y el total baja o queda igual, nunca sube.
3. Abrir las herramientas del navegador (pestaña Red) y confirmar que hay **una
   sola** llamada a `/api/reportes/cajas` por cambio, no un chorro continuo.
4. Confirmar que las **tres** secciones filtran igual: métodos de pago, la serie
   semanal y el desglose de detalles. Si una muestra números de "todos los
   turnos" mientras las otras filtran, quedó una cláusula SQL sin actualizar en
   la Task 5.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/reportes/Reportes.jsx frontend/src/pages/reportes/ReporteCajas.jsx
git commit -m "feat(reportes): seleccionar varios tipos de turno"
```

---

## Task 12: Verificación final

**Files:** ninguno (solo verificación; si algo falla, se arregla y se commitea acá).

- [ ] **Step 1: Toda la suite de tests**

Run: `cd backend && npm test`
Expected: PASS, incluidos los tests previos (`estadoOp`, `nroOrd`,
`snapshotLabels`, `mapping`, `metodos`).

Run: `cd frontend && npm test`
Expected: PASS, incluido `exportPagos.test.js`.

- [ ] **Step 2: Build de producción**

Run: `cd frontend && npm run build`
Expected: build exitoso, sin warnings de imports rotos.

- [ ] **Step 3: Retrocompatibilidad de un solo valor**

Con la app levantada, pegar en el navegador una llamada con el formato viejo
(un solo valor, sin comas) y confirmar que devuelve lo mismo que antes del
cambio:

- `/api/cajas?tipo_turno=Mañana&limit=5`
- `/api/pagos?id_tipo=A&limit=5`
- `/api/reportes/cajas?desde=2026-07-01&hasta=2026-07-31&tipo_turno=Mañana`

Expected: los tres responden 200 con datos filtrados por ese único valor.

- [ ] **Step 4: Repaso de las tres pantallas**

Recorrer las verificaciones de las Tasks 8, 9, 10 y 11 de corrido, en una sola
sesión, para descartar interferencias entre pantallas.

- [ ] **Step 5: Revisar el diff completo**

Run: `git diff dev...DEV-37 --stat`
Expected: solo los archivos listados en File Structure, más los dos documentos
de `docs/superpowers/`. Cualquier otro archivo tocado es accidental.

- [ ] **Step 6: Commit final si hubo arreglos**

```bash
git add -A
git commit -m "fix(filtros): ajustes de la verificacion final"
```

Si no hubo arreglos, saltear este paso. **No pushear** — la rama queda local
hasta que el usuario lo pida.
