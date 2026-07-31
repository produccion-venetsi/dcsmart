# Arreglos de la reunión con Anaxi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el cálculo de deuda, permitir filtrar por varias fechas a la vez, cortar la precarga automática de rubro, agregar el reporte de facturas fuera de término y permitir exportar sin exigir rango de fechas.

**Architecture:** Toda la lógica nueva va a funciones puras en `backend/src/lib/` y `frontend/src/lib/` con tests de `node:test`, y las rutas/componentes las consumen. Es el patrón que el repo ya usa (`clasificaciones.js`, `estadoOp.js`, `filtros.js`, `dates.js`) y la razón es concreta: hoy la lógica de deuda está duplicada dentro de `reportes.js` y las dos copias no coinciden, que es justamente el bug de la Task 1.

**Tech Stack:** Backend Fastify + Prisma sobre PostgreSQL. Frontend Vite + React 19 + Zustand. Tests con `node --test` (sin framework extra, sin mocks). El spec completo está en `docs/superpowers/specs/2026-07-31-arreglos-reunion-anaxi-design.md`.

## Global Constraints

- **Branch:** `DEV-46-arreglos-reunion-anaxi`, PR contra `dev`. No mergear a `master` sin confirmación explícita del usuario.
- **El backend de Cloud Run es compartido entre `dev` y `master`.** Un push a `dev` redeploya el backend de producción. No hay base de datos de desarrollo separada.
- **Nunca correr `backend/prisma/seed.js`**: borra usuarios reales. Ninguna task de este plan lo necesita.
- **Ningún cambio de esquema.** Cero migraciones, cero `prisma db push`. Todo se calcula con columnas que ya existen.
- **Montos siempre positivos**, la dirección la da `ingresa_egreso`. Verificado: cero filas con `importe < 0` en las 28.920 de `pagos`.
- **Tests:** `node --test` desde `backend/` y desde `frontend/` (script `npm test`). Convención de nombres: `test('<nombreFuncion>: <caso en español, en minúscula>', ...)`. Los casos de compatibilidad se nombran por su origen histórico ("string suelto de un preset viejo"), no por el mecanismo.
- **Zonas horarias:** `fecha`, `periodo` y `cashflow` son días calendario y sus rangos van en UTC (`Z`). `fecha_pago` y `created_at` son instantes reales y van con offset `-03:00`. Ver `CAMPOS_FECHA_INSTANTE` en `backend/src/routes/pagos.js:143`. Romper esto corre los datos un día — ya pasó antes en este proyecto.
- **Commits individuales por task**, en español, con el prefijo convencional (`fix:`, `feat:`, `docs:`).

---

## Task 1: Función pura del cálculo de deuda

**Files:**
- Create: `backend/src/lib/deuda.js`
- Test: `backend/src/lib/deuda.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `wheresDeuda(whereBase)` → `{ egresos, ingresos }`, dos objetos `where` de Prisma. Y `deudaNeta(sumaEgresos, sumaIngresos)` → `number`. Las Tasks 2 y 3 las usan.

- [ ] **Step 1: Write the failing test**

Crear `backend/src/lib/deuda.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { wheresDeuda, deudaNeta } from './deuda.js'

test('wheresDeuda: parte el where base en egresos y ingresos impagos', () => {
  const base = { id_local: { in: ['L1'] } }
  const { egresos, ingresos } = wheresDeuda(base)

  assert.deepEqual(egresos,  { id_local: { in: ['L1'] }, pagado: false, ingresa_egreso: false })
  assert.deepEqual(ingresos, { id_local: { in: ['L1'] }, pagado: false, ingresa_egreso: true })
})

test('wheresDeuda: no muta el where base', () => {
  const base = { id_local: { in: ['L1'] } }
  wheresDeuda(base)
  assert.deepEqual(base, { id_local: { in: ['L1'] } })
})

test('wheresDeuda: pisa pagado e ingresa_egreso si venian en el where base', () => {
  // El filtro de la pantalla puede traer pagado/ingresa_egreso elegidos por el
  // usuario, pero la deuda es por definicion lo impago: manda la deuda.
  const base = { pagado: true, ingresa_egreso: true, id_local: { in: ['L1'] } }
  const { egresos, ingresos } = wheresDeuda(base)

  assert.equal(egresos.pagado, false)
  assert.equal(egresos.ingresa_egreso, false)
  assert.equal(ingresos.pagado, false)
  assert.equal(ingresos.ingresa_egreso, true)
})

test('wheresDeuda: un where base vacio da los dos where minimos', () => {
  const { egresos, ingresos } = wheresDeuda({})
  assert.deepEqual(egresos,  { pagado: false, ingresa_egreso: false })
  assert.deepEqual(ingresos, { pagado: false, ingresa_egreso: true })
})

test('deudaNeta: egresos menos ingresos', () => {
  assert.equal(deudaNeta(1000, 300), 700)
})

test('deudaNeta: una nota de credito cargada como ingreso reduce la deuda', () => {
  // El caso que reporto Anaxi: la NC entra como ingreso y tiene que restar.
  assert.equal(deudaNeta(148883513, 3570484.74), 145313028.26)
})

test('deudaNeta: sin ingresos la deuda es el total de egresos', () => {
  assert.equal(deudaNeta(1000, 0), 1000)
})

test('deudaNeta: puede dar negativo si hay mas notas de credito que facturas', () => {
  // A favor del local. No se recorta a cero: un cero escondería el saldo real.
  assert.equal(deudaNeta(100, 350), -250)
})

test('deudaNeta: trata null, undefined y Decimal como numero', () => {
  assert.equal(deudaNeta(null, undefined), 0)
  assert.equal(deudaNeta('1000.50', '0.50'), 1000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/lib/deuda.test.js`
Expected: FAIL con `Cannot find module './deuda.js'`

- [ ] **Step 3: Write minimal implementation**

Crear `backend/src/lib/deuda.js`:

```js
// La deuda es la suma de los EGRESOS impagos menos la suma de los INGRESOS
// impagos. La dirección la da `ingresa_egreso`, no el tipo de comprobante.
//
// Por qué no se excluyen NCA/NCB por tipo: en este proyecto los montos son
// siempre positivos y la dirección vive en un campo aparte (verificado: cero
// filas con importe < 0 en las 28.920 de pagos). Una nota de crédito cargada
// como ingreso resta sola, sin que el código tenga que saber que es una nota
// de crédito. Eso también cubre cualquier otro ingreso impago.
//
// El bug que esto arregla: `total_adeudado` sumaba TODOS los impagos sin mirar
// la dirección, así que los ingresos impagos inflaban la deuda en el doble de
// su valor. Medido el 31/07/2026: 152.453.997,74 informado contra 145.313.028,26
// real, o sea 7.140.969,48 de más.
//
// Límite conocido: 8 notas de crédito están cargadas como egreso en vez de
// ingreso (2 impagas por 451.238,33). En la base son indistinguibles de una
// factura, así que siguen sumando. Se decidió no corregir el dato ni agregar
// excepciones por tipo.

// Parte un `where` de Prisma en los dos que hacen falta para la deuda. El
// filtro de la deuda manda sobre lo que venga del where base: la deuda es por
// definición lo impago, aunque el usuario esté mirando los pagos ya pagados.
export function wheresDeuda(whereBase = {}) {
  return {
    egresos:  { ...whereBase, pagado: false, ingresa_egreso: false },
    ingresos: { ...whereBase, pagado: false, ingresa_egreso: true }
  }
}

// Puede dar negativo: significa saldo a favor del local. No se recorta a cero
// a propósito, un cero escondería el saldo real.
export function deudaNeta(sumaEgresos, sumaIngresos) {
  return Number(sumaEgresos ?? 0) - Number(sumaIngresos ?? 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/lib/deuda.test.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && npm test`
Expected: los 104 tests que ya pasaban siguen pasando, más los 9 nuevos

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/deuda.js backend/src/lib/deuda.test.js
git commit -m "feat(deuda): funcion pura de deuda como egresos menos ingresos"
```

---

## Task 2: Exponer `total_deuda` en el resumen de la lista de pagos

**Files:**
- Modify: `backend/src/routes/pagos.js:330-341` (el handler de `GET /summary`)
- Modify: `frontend/src/pages/pagos/PagoList.jsx` (el cuadro de resumen)

**Interfaces:**
- Consumes: `wheresDeuda`, `deudaNeta` de la Task 1.
- Produces: `GET /api/pagos/summary` devuelve `total_deuda: number` además del `total_importe` y `por_impuesto` que ya devolvía.

- [ ] **Step 1: Modificar el handler del backend**

En `backend/src/routes/pagos.js`, agregar el import arriba (junto a los otros imports de `../lib/`):

```js
import { wheresDeuda, deudaNeta } from '../lib/deuda.js'
```

Reemplazar el cuerpo de agregados de `GET /summary` (hoy líneas 330-341) por:

```js
    const { egresos, ingresos } = wheresDeuda(where)

    const [totalAgg, porImpuestoRows, egresosAgg, ingresosAgg] = await Promise.all([
      fastify.db.pago.aggregate({ where, _sum: { importe: true } }),
      fastify.db.impuesto.groupBy({ by: ['tipo'], where: { pago: where }, _sum: { monto: true } }),
      fastify.db.pago.aggregate({ where: egresos,  _sum: { importe: true }, _count: { id: true } }),
      fastify.db.pago.aggregate({ where: ingresos, _sum: { importe: true } })
    ])

    return {
      total_importe: Number(totalAgg._sum.importe ?? 0),
      // Deuda del conjunto FILTRADO, no del local entero: es lo que hace falta
      // para "cuánto le debo a este proveedor". Ver lib/deuda.js.
      total_deuda: deudaNeta(egresosAgg._sum.importe, ingresosAgg._sum.importe),
      count_deuda: egresosAgg._count.id,
      por_impuesto: Object.fromEntries(
        porImpuestoRows.map(row => [row.tipo, Number(row._sum.monto ?? 0)])
      )
    }
```

- [ ] **Step 2: Verificar a mano contra la base**

Levantar el túnel y el backend local:

```bash
./cloud-sql-proxy --gcloud-auth --port 5433 dc-smart-mvp:us-central1:dcsmart-mvp-insta
cd backend && node src/server.js
```

Pedir el resumen sin filtros y confirmar que `total_deuda` es menor que `total_importe` y que aparece `count_deuda`. El login para obtener el token es `POST /api/auth/login`.

Expected: `total_deuda` presente y numérico. Con los datos del 31/07/2026 y sin filtro de local, el orden de magnitud esperado es ~145.3 millones.

- [ ] **Step 3: Mostrar el dato en el frontend**

En `frontend/src/pages/pagos/PagoList.jsx`, en el bloque del cuadro de resumen (línea 1395), agregar una tarjeta de deuda inmediatamente después de la de TOTAL IMPORTE (que termina en la línea 1402) y antes del `map` de impuestos. Mismo markup y mismas clases que la tarjeta de al lado:

```jsx
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 1rem', minWidth: 140 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, letterSpacing: '0.03em' }} title="Egresos impagos menos ingresos impagos (las notas de crédito restan)">
              TOTAL DEUDA
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {summaryLoading
                ? <span className="skel" style={{ width: 80, height: 16, display: 'inline-block' }} />
                : fmt$(summary?.total_deuda)}
            </div>
          </div>
```

`fmt$` ya está en scope en ese archivo (se usa en la línea 1400).

- [ ] **Step 4: Verificar en el navegador**

Levantar el frontend (`cd frontend && npm run dev`), entrar a Pagos, poner un rango de fechas para que aparezca el resumen, y confirmar que se ve la fila de deuda con un número menor al total de importe.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pagos.js frontend/src/pages/pagos/PagoList.jsx
git commit -m "feat(pagos): total_deuda en el resumen, neto de notas de credito"
```

---

## Task 3: Corregir `total_adeudado` en el tablero de reportes

**Files:**
- Modify: `backend/src/routes/reportes.js:250-270` y `:316-331`

**Interfaces:**
- Consumes: `wheresDeuda`, `deudaNeta` de la Task 1.
- Produces: `GET /api/reportes/pagos` devuelve `total_adeudado` calculado con la fórmula nueva. `count_adeudado` pasa a contar solo los **egresos** impagos.

- [ ] **Step 1: Reemplazar el agregado roto**

En `backend/src/routes/reportes.js`, agregar el import:

```js
import { wheresDeuda, deudaNeta } from '../lib/deuda.js'
```

Borrar la línea `const TIPOS_NO_DEUDA = new Set(['NCA', 'NCB'])` (hoy línea 250) y reemplazar el `adeudadoAgg` del `Promise.all` (hoy líneas 253-257) por los dos agregados:

```js
    const { egresos, ingresos } = wheresDeuda({ ...localFilter, ...fechaWhere })

    const [egresosAgg, ingresosAgg, efectivoAgg, pagosEnRango] = await Promise.all([
      fastify.db.pago.aggregate({ where: egresos,  _sum: { importe: true }, _count: { id: true } }),
      fastify.db.pago.aggregate({ where: ingresos, _sum: { importe: true } }),
      // ... los otros dos agregados quedan igual que estaban
```

- [ ] **Step 2: Actualizar el objeto de respuesta**

En el `return` (hoy líneas 316-331), reemplazar las dos primeras claves:

```js
      total_adeudado: deudaNeta(egresosAgg._sum.importe, ingresosAgg._sum.importe),
      count_adeudado: egresosAgg._count.id,
```

- [ ] **Step 3: Arreglar el desglose de pendientes, que usaba la lista de tipos borrada**

El loop de `pagosEnRango` (hoy líneas 282-298) usaba `TIPOS_NO_DEUDA` en la línea 293. Reemplazar esa condición para que use la dirección en vez del tipo, y así el desglose quede coherente con el KPI:

```js
      // Antes: if (!p.pagado && !TIPOS_NO_DEUDA.has(p.id_tipo))
      // Los ingresos ya se descuentan del total en deudaNeta; acá se saltean
      // para no contarlos como pendientes de pago a un proveedor.
      if (!p.pagado) {
```

Notar que el `continue` de la línea 283 (`if (p.ingresa_egreso === true) continue`) ya excluye los ingresos de todo el loop, así que la condición de tipo era redundante para el desglose y su única función real era la que ahora cumple `deudaNeta`.

- [ ] **Step 4: Verificar que el KPI y su desglose ahora cierran**

Con el backend local levantado, pedir `GET /api/reportes/pagos?desde=...&hasta=...` y comprobar que `total_adeudado` es coherente con `pendientes_impuestos + pendientes_sueldos + pendientes_proveedores` más el CMV impago (que se muestra aparte). Antes de este cambio no cerraban.

Expected: `total_adeudado` bajó respecto del valor anterior, y ya no hay ingresos sumados.

- [ ] **Step 5: Correr la suite**

Run: `cd backend && npm test`
Expected: todo verde

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/reportes.js
git commit -m "fix(reportes): total_adeudado resta los ingresos en vez de sumarlos"
```

---

## Task 4: Cortar la precarga automática de rubro desde el proveedor

**Files:**
- Modify: `frontend/src/pages/pagos/PagoForm.jsx:270` y `:448`

**Interfaces:**
- Consumes: nada.
- Produces: nada. Es un cambio de comportamiento aislado.

- [ ] **Step 1: Quitar la precarga al elegir proveedor en el combobox**

En `frontend/src/pages/pagos/PagoForm.jsx`, en `selectProveedor` (línea 434), borrar la línea 438:

```js
    if (prov.rubcat) setRubcatSelected(prov.rubcat)
```

y en el `setForm` de abajo, cambiar la línea 448:

```js
        // Antes: id_rubcat: prov.id_rubcat || f.id_rubcat,
        // El rubro NO se precarga desde el proveedor: arrastraba
        // clasificaciones equivocadas porque quien carga no revisa un campo
        // que ya viene lleno (pedido de Anaxi, reunión del 31/07/2026). El
        // proveedor sigue teniendo su id_rubcat guardado y configurable.
```

Es decir: eliminar la clave `id_rubcat` del objeto que devuelve el `setForm`, dejando el resto (`id_proveedor`, `cashflow`) igual.

Actualizar también el comentario de la línea 433, que hoy dice "pre-llena rubcat y recalcula cashflow si hay plazo" y ya no sería cierto.

- [ ] **Step 2: Quitar la precarga del proveedor por defecto del local**

En el mismo archivo, en el bloque que corre al abrir un pago nuevo cuando el local tiene proveedor fijo (líneas 262-272), borrar la línea 266 (`if (prov.rubcat) setRubcatSelected(prov.rubcat)`) y la línea 270 (`id_rubcat: prov.id_rubcat || f.id_rubcat,`), con el mismo criterio.

- [ ] **Step 3: NO tocar el cashflow**

Confirmar que el cálculo de `cashflow` con el plazo del proveedor sigue intacto en los dos lugares. No se pidió cambiarlo y resuelve un problema real.

- [ ] **Step 4: Verificar en el navegador**

Con el frontend levantado, ir a Pagos → Nuevo Pago, elegir un proveedor que tenga rubro configurado (por ejemplo cualquiera que antes autocompletaba), y confirmar que:
- el campo Rubro / categoría **queda vacío**
- el campo Cashflow **sigue calculándose** si el proveedor tiene plazo
- se puede elegir el rubro a mano y guardar normalmente

Repetir abriendo un pago nuevo en un local que tenga proveedor por defecto.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/pagos/PagoForm.jsx
git commit -m "fix(pagos): no precargar el rubro desde el proveedor"
```

---

## Task 5: Backend de los rangos de fecha múltiples

**Files:**
- Create: `backend/src/lib/rangosFecha.js`
- Test: `backend/src/lib/rangosFecha.test.js`
- Modify: `backend/src/routes/pagos.js` (constantes de las líneas 132-143 y el bloque de fecha de `buildPagosWhere`, líneas 217-230)

**Interfaces:**
- Consumes: `parseCsvParam` de `backend/src/lib/queryParams.js`.
- Produces: `parseRangosFecha(campoFecha, desde, hasta)` → `Array<{campo, desde, hasta}>` y `whereRangosFecha(rangos)` → objeto `where` de Prisma. También exporta `CAMPOS_FECHA_VALIDOS` y `CAMPOS_FECHA_INSTANTE`, que `pagos.js` deja de declarar por su cuenta.

- [ ] **Step 1: Write the failing test**

Crear `backend/src/lib/rangosFecha.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRangosFecha, whereRangosFecha } from './rangosFecha.js'

test('parseRangosFecha: un solo rango sigue funcionando igual que antes', () => {
  assert.deepEqual(
    parseRangosFecha('fecha', '2026-07-01', '2026-07-31'),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }]
  )
})

test('parseRangosFecha: sin campo_fecha cae a fecha', () => {
  assert.deepEqual(
    parseRangosFecha(undefined, '2026-07-01', '2026-07-31'),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }]
  )
})

test('parseRangosFecha: dos rangos posicionales', () => {
  assert.deepEqual(
    parseRangosFecha('fecha,periodo', '2026-07-01,2026-06-01', '2026-07-31,2026-06-30'),
    [
      { campo: 'fecha',   desde: '2026-07-01', hasta: '2026-07-31' },
      { campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }
    ]
  )
})

test('parseRangosFecha: un rango con solo desde y otro con solo hasta', () => {
  assert.deepEqual(
    parseRangosFecha('fecha,periodo', '2026-07-01,', ',2026-06-30'),
    [
      { campo: 'fecha',   desde: '2026-07-01', hasta: null },
      { campo: 'periodo', desde: null,         hasta: '2026-06-30' }
    ]
  )
})

test('parseRangosFecha: un campo que no esta en la whitelist cae a fecha', () => {
  // Nunca se interpola un valor arbitrario como key de Prisma.
  assert.deepEqual(
    parseRangosFecha('id_local', '2026-07-01', '2026-07-31'),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }]
  )
})

test('parseRangosFecha: descarta los rangos sin ninguna fecha', () => {
  assert.deepEqual(parseRangosFecha('fecha,periodo', '2026-07-01,', '2026-07-31,'), [
    { campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }
  ])
})

test('parseRangosFecha: sin fechas devuelve lista vacia', () => {
  assert.deepEqual(parseRangosFecha('fecha', undefined, undefined), [])
  assert.deepEqual(parseRangosFecha(undefined, '', ''), [])
})

test('whereRangosFecha: sin rangos no filtra nada', () => {
  assert.deepEqual(whereRangosFecha([]), {})
})

test('whereRangosFecha: un rango va como clave suelta, sin AND', () => {
  const w = whereRangosFecha([{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }])
  assert.deepEqual(Object.keys(w), ['fecha'])
  assert.equal(w.fecha.gte.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(w.fecha.lte.toISOString(), '2026-07-31T23:59:59.999Z')
})

test('whereRangosFecha: dos rangos se combinan con AND', () => {
  const w = whereRangosFecha([
    { campo: 'fecha',   desde: '2026-07-01', hasta: '2026-07-31' },
    { campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }
  ])
  assert.deepEqual(Object.keys(w), ['AND'])
  assert.equal(w.AND.length, 2)
  assert.equal(w.AND[0].fecha.gte.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(w.AND[1].periodo.lte.toISOString(), '2026-06-30T23:59:59.999Z')
})

test('whereRangosFecha: dos rangos sobre el MISMO campo no se pisan', () => {
  // Por esto hace falta AND y no se puede usar una clave por campo.
  const w = whereRangosFecha([
    { campo: 'fecha', desde: '2026-01-01', hasta: '2026-12-31' },
    { campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }
  ])
  assert.equal(w.AND.length, 2)
})

test('whereRangosFecha: fecha_pago y created_at usan hora de Argentina', () => {
  // Son instantes reales: sin el offset, lo cargado de noche (21-24hs ART)
  // cae en el dia UTC siguiente y el filtro se corre un dia.
  const w = whereRangosFecha([{ campo: 'fecha_pago', desde: '2026-07-01', hasta: '2026-07-01' }])
  assert.equal(w.fecha_pago.gte.toISOString(), '2026-07-01T03:00:00.000Z')
  assert.equal(w.fecha_pago.lte.toISOString(), '2026-07-02T02:59:59.999Z')

  const w2 = whereRangosFecha([{ campo: 'created_at', desde: '2026-07-01', hasta: '2026-07-01' }])
  assert.equal(w2.created_at.gte.toISOString(), '2026-07-01T03:00:00.000Z')
})

test('whereRangosFecha: periodo y cashflow son dias calendario en UTC', () => {
  const w = whereRangosFecha([{ campo: 'periodo', desde: '2026-07-01', hasta: '2026-07-01' }])
  assert.equal(w.periodo.gte.toISOString(), '2026-07-01T00:00:00.000Z')

  const w2 = whereRangosFecha([{ campo: 'cashflow', desde: '2026-07-01', hasta: '2026-07-01' }])
  assert.equal(w2.cashflow.gte.toISOString(), '2026-07-01T00:00:00.000Z')
})

test('whereRangosFecha: un rango con solo desde no pone lte', () => {
  const w = whereRangosFecha([{ campo: 'fecha', desde: '2026-07-01', hasta: null }])
  assert.deepEqual(Object.keys(w.fecha), ['gte'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/lib/rangosFecha.test.js`
Expected: FAIL con `Cannot find module './rangosFecha.js'`

- [ ] **Step 3: Write the implementation**

Crear `backend/src/lib/rangosFecha.js`:

```js
import { parseCsvParam } from './queryParams.js'

// Campos de fecha filtrables desde el frontend. Whitelist estricta: cualquier
// valor fuera de esta lista cae al default 'fecha', para no interpolar un valor
// arbitrario como key de Prisma.
export const CAMPOS_FECHA_VALIDOS = ['fecha', 'fecha_pago', 'cashflow', 'periodo', 'created_at']

// De los campos filtrables, estos guardan un instante real (con hora), no un
// día calendario a medianoche UTC. Su rango se interpreta en hora de Argentina
// para que lo cargado de noche no caiga en el día UTC siguiente.
export const CAMPOS_FECHA_INSTANTE = ['fecha_pago', 'created_at']

// Los rangos viajan como tres params CSV paralelos y posicionales:
//   ?campo_fecha=fecha,periodo&desde=2026-07-01,2026-06-01&hasta=2026-07-31,2026-06-30
//
// Se eligió esta forma porque es retrocompatible bit a bit: un solo valor en
// cada param es exactamente el formato de siempre, así que los links viejos y
// los presets guardados siguen funcionando sin migrar nada. Es la misma
// convención CSV que ya usan id_tipo, id_metodo, estado_op y tipo_turno.
export function parseRangosFecha(campoFecha, desde, hasta) {
  const campos = parseCsvParam(campoFecha)
  const desdes = parseCsvParam(desde)
  const hastas = parseCsvParam(hasta)

  const n = Math.max(campos.length, desdes.length, hastas.length)
  const rangos = []

  for (let i = 0; i < n; i++) {
    const d = desdes[i] || null
    const h = hastas[i] || null
    if (!d && !h) continue // un rango sin ninguna fecha no filtra nada

    const campo = CAMPOS_FECHA_VALIDOS.includes(campos[i]) ? campos[i] : 'fecha'
    rangos.push({ campo, desde: d, hasta: h })
  }

  return rangos
}

// Devuelve el `where` de Prisma para esos rangos, combinados con AND.
//
// Con un solo rango va como clave suelta (`{ fecha: {...} }`) para no cambiar
// el SQL que se generaba antes. Con dos o más va bajo AND, que es obligatorio:
// si el usuario elige dos rangos sobre el mismo campo, dos claves iguales en el
// mismo objeto se pisarían y el filtro quedaría mal.
//
// El `qFilter` de la búsqueda por texto ya inyecta un OR top-level en
// buildPagosWhere; un AND hermano no choca con él.
export function whereRangosFecha(rangos) {
  const condiciones = rangos.map(({ campo, desde, hasta }) => {
    const suf = CAMPOS_FECHA_INSTANTE.includes(campo) ? '-03:00' : 'Z'
    return {
      [campo]: {
        ...(desde ? { gte: new Date(`${desde}T00:00:00.000${suf}`) } : {}),
        ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999${suf}`) } : {})
      }
    }
  })

  if (condiciones.length === 0) return {}
  if (condiciones.length === 1) return condiciones[0]
  return { AND: condiciones }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/lib/rangosFecha.test.js`
Expected: PASS, 14 tests

- [ ] **Step 5: Conectar `buildPagosWhere`**

En `backend/src/routes/pagos.js`:

1. Borrar las constantes `CAMPOS_FECHA_VALIDOS` (línea 135), la función `campoFechaValido` (136-138) y `CAMPOS_FECHA_INSTANTE` (143), e importar del módulo nuevo:

```js
import { parseRangosFecha, whereRangosFecha } from '../lib/rangosFecha.js'
```

2. En `buildPagosWhere`, borrar `const campoFecha = campoFechaValido(campo_fecha)` (línea 200) y reemplazar todo el bloque de fecha del objeto que se devuelve (líneas 217-230) por:

```js
    ...whereRangosFecha(parseRangosFecha(campo_fecha, desde, hasta)),
```

3. Verificar que `GET /pagos/stats` (línea 344) y `GET /pagos/chart` (línea 397) no usaban esas constantes borradas. Tienen su propia lógica de fecha hardcodeada a `fecha` y no pasan por `buildPagosWhere`; **no se tocan en esta task**.

- [ ] **Step 6: Verificar la retrocompatibilidad a mano**

Con el backend local levantado, comparar los dos formatos:

```
GET /api/pagos?campo_fecha=fecha&desde=2026-07-01&hasta=2026-07-31
GET /api/pagos?campo_fecha=fecha,periodo&desde=2026-07-01,2026-06-01&hasta=2026-07-31,2026-06-30
```

Expected: el primero devuelve exactamente el mismo `total` que antes del cambio (anotarlo antes de tocar el código). El segundo devuelve un subconjunto de ese total, porque agrega una condición.

- [ ] **Step 7: Correr la suite**

Run: `cd backend && npm test`
Expected: todo verde

- [ ] **Step 8: Commit**

```bash
git add backend/src/lib/rangosFecha.js backend/src/lib/rangosFecha.test.js backend/src/routes/pagos.js
git commit -m "feat(pagos): aceptar varios rangos de fecha combinados con AND"
```

---

## Task 6: Normalizador de rangos en el frontend y compatibilidad de presets

**Files:**
- Modify: `frontend/src/lib/filtros.js`
- Modify: `frontend/src/lib/filtros.test.js`
- Modify: `frontend/src/pages/pagos/PagoList.jsx:835-842` (`FILTER_INIT`), `:908-933` (`buildParams`), `:1122` (`activeFilterCount`), `:1187-1195` (`applyPreset`)

**Interfaces:**
- Consumes: nada.
- Produces: `normalizarRangos(guardado)` → `Array<{campo, desde, hasta}>`. `FILTER_INIT` pasa a tener `rangos_fecha: []` en lugar de `campo_fecha`, `desde` y `hasta`. La Task 7 (UI) y la Task 8 (export) dependen de esa forma.

- [ ] **Step 1: Write the failing test**

Agregar al final de `frontend/src/lib/filtros.test.js`:

```js
test('normalizarRangos: el formato viejo de un solo rango se convierte en una fila', () => {
  assert.deepEqual(
    normalizarRangos({ campo_fecha: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }),
    [{ campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }]
  )
})

test('normalizarRangos: formato viejo sin campo_fecha asume fecha', () => {
  assert.deepEqual(
    normalizarRangos({ desde: '2026-07-01', hasta: '2026-07-31' }),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }]
  )
})

test('normalizarRangos: el formato nuevo pasa igual', () => {
  const rangos = [
    { campo: 'fecha',   desde: '2026-07-01', hasta: '2026-07-31' },
    { campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }
  ]
  assert.deepEqual(normalizarRangos({ rangos_fecha: rangos }), rangos)
})

test('normalizarRangos: descarta las filas sin ninguna fecha', () => {
  assert.deepEqual(
    normalizarRangos({ rangos_fecha: [
      { campo: 'fecha',   desde: '2026-07-01', hasta: '' },
      { campo: 'periodo', desde: '',           hasta: '' }
    ] }),
    [{ campo: 'fecha', desde: '2026-07-01', hasta: '' }]
  )
})

test('normalizarRangos: un preset viejo sin ninguna fecha da lista vacia', () => {
  assert.deepEqual(normalizarRangos({ campo_fecha: 'fecha', desde: '', hasta: '' }), [])
})

test('normalizarRangos: vacio, null y ausente dan lista vacia', () => {
  assert.deepEqual(normalizarRangos({}), [])
  assert.deepEqual(normalizarRangos(null), [])
  assert.deepEqual(normalizarRangos(undefined), [])
})

test('normalizarRangos: el formato nuevo gana si por algun motivo estan los dos', () => {
  assert.deepEqual(
    normalizarRangos({
      rangos_fecha: [{ campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }],
      campo_fecha: 'fecha', desde: '2026-07-01', hasta: '2026-07-31'
    }),
    [{ campo: 'periodo', desde: '2026-06-01', hasta: '2026-06-30' }]
  )
})
```

Y agregar `normalizarRangos` al import de arriba del archivo.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/lib/filtros.test.js`
Expected: FAIL, `normalizarRangos is not a function`

- [ ] **Step 3: Implementar `normalizarRangos`**

Agregar a `frontend/src/lib/filtros.js`, al lado de `normalizarMulti`:

```js
// Los presets guardados ("Mis filtros") tienen el formato viejo de un solo
// rango de fecha: { campo_fecha, desde, hasta }. Se acepta igual que el nuevo
// para no migrar datos: el viejo solo se lee, siempre se escribe el nuevo.
export function normalizarRangos(guardado) {
  const g = guardado || {}

  if (Array.isArray(g.rangos_fecha)) {
    return g.rangos_fecha
      .filter(r => r && (r.desde || r.hasta))
      .map(r => ({ campo: r.campo || 'fecha', desde: r.desde || '', hasta: r.hasta || '' }))
  }

  if (g.desde || g.hasta) {
    return [{ campo: g.campo_fecha || 'fecha', desde: g.desde || '', hasta: g.hasta || '' }]
  }

  return []
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/lib/filtros.test.js`
Expected: PASS, 17 tests (los 10 que ya había más 7)

- [ ] **Step 5: Cambiar `FILTER_INIT`**

En `frontend/src/pages/pagos/PagoList.jsx`, reemplazar en `FILTER_INIT` (línea 836) las tres claves viejas por la nueva:

```js
const FILTER_INIT = {
  pagado: '', estado_op: [], rangos_fecha: [],
  id_tipo: [], id_rub: '', id_cat: '',
  audit: '', ingresa_egreso: '', id_metodo: [], cmv_quick: '',
  observaciones: '',
  id_proveedores: [],
  id_rubcats: [],
}
```

- [ ] **Step 6: Cambiar `buildParams`**

Reemplazar las tres líneas de fecha de `buildParams` (919-921) por:

```js
      ...(filters.rangos_fecha.length > 0 ? {
        campo_fecha: filters.rangos_fecha.map(r => r.campo).join(','),
        desde:       filters.rangos_fecha.map(r => r.desde || '').join(','),
        hasta:       filters.rangos_fecha.map(r => r.hasta || '').join(','),
      } : {}),
```

- [ ] **Step 7: Arreglar `applyPreset` para que no queden claves zombie**

En `applyPreset` (línea 1187), agregar `rangos_fecha` a las claves que se normalizan **y borrar las tres claves viejas** del objeto resultante. Sin ese borrado, `desde`/`hasta` guardados en un preset viejo quedarían en el estado inflando `activeFilterCount` y habilitando el export con un filtro que ya no aplica:

```js
    const filtros = {
      ...FILTER_INIT,
      ...guardado,
      rangos_fecha:   normalizarRangos(guardado),
      id_tipo:        normalizarMulti(guardado.id_tipo, TIPO_PAGO_MULTI),
      estado_op:      normalizarMulti(guardado.estado_op, ESTADO_OP_OPTIONS),
      id_metodo:      normalizarMulti(guardado.id_metodo, metodoOptions),
      id_rubcats:     normalizarMulti(guardado.id_rubcats, rubcatOptions),
      id_proveedores: normalizarMulti(guardado.id_proveedores),
    }
    // El spread de `guardado` puede traer las claves del formato viejo. Se
    // borran para que no queden como zombies: ya se leyeron en normalizarRangos.
    delete filtros.campo_fecha
    delete filtros.desde
    delete filtros.hasta
```

Agregar `normalizarRangos` al import de `../../lib/filtros.js` en ese archivo.

- [ ] **Step 8: Arreglar `activeFilterCount`**

La línea 1122 excluía `campo_fecha` del conteo porque siempre tenía valor. Con la forma nueva, `rangos_fecha` es un array y el conteo genérico de arrays ya funciona bien, así que la exclusión sobra:

```js
  const activeFilterCount = Object.entries(filters).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== '')).length
```

- [ ] **Step 9: Correr la suite y el build**

Run: `cd frontend && npm test && npm run build`
Expected: 55 tests en verde y build OK

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/filtros.js frontend/src/lib/filtros.test.js frontend/src/pages/pagos/PagoList.jsx
git commit -m "feat(pagos): estado de filtros con varios rangos de fecha y compat de presets"
```

---

## Task 7: UI de filas de fecha que se agregan

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx:1768-1784` (la sección "Fechas" del drawer de filtros)
- Modify: `frontend/src/styles/app.css` (si hace falta una clase para la fila)

**Interfaces:**
- Consumes: `FILTER_INIT.rangos_fecha` y `setDraftField` de la Task 6.
- Produces: nada. Es la UI de lo que la Task 6 dejó en el estado.

- [ ] **Step 1: Reemplazar la sección "Fechas" del drawer**

En `frontend/src/pages/pagos/PagoList.jsx`, reemplazar el bloque de la sección "Fechas" (líneas 1768-1784) por una lista de filas sobre `draft.rangos_fecha`, más un botón para agregar. Usar las clases y los estilos inline que ya usa el resto del drawer (`filter-select`, `lbl`) — no introducir un sistema de estilos nuevo:

```jsx
            <div className="drawer-section-title" style={{ marginTop: '1.25rem' }}>
              Fechas
              {draft.rangos_fecha.length > 1 && (
                <span style={{ fontWeight: 400, opacity: 0.7 }}> — se combinan con Y</span>
              )}
            </div>

            {draft.rangos_fecha.map((rango, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.6rem', alignItems: 'end', marginBottom: '0.6rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={lbl}>Tipo de fecha</span>
                  <select
                    className="filter-select"
                    style={{ width: '100%' }}
                    value={rango.campo}
                    onChange={e => setRangoField(i, 'campo', e.target.value)}
                  >
                    {CAMPO_FECHA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <span style={lbl}>Desde</span>
                  <input type="date" className="filter-select" style={{ width: '100%' }}
                    value={rango.desde}
                    onChange={e => setRangoField(i, 'desde', e.target.value)} />
                </div>
                <div>
                  <span style={lbl}>Hasta</span>
                  <input type="date" className="filter-select" style={{ width: '100%' }}
                    value={rango.hasta}
                    onChange={e => setRangoField(i, 'hasta', e.target.value)} />
                </div>
                <button type="button" className="btn btn-secondary btn-sm"
                  aria-label="Quitar este filtro de fecha"
                  onClick={() => quitarRango(i)}>
                  ✕
                </button>
              </div>
            ))}

            <button type="button" className="btn btn-secondary btn-sm" onClick={agregarRango}>
              + agregar fecha
            </button>
```

- [ ] **Step 2: Agregar los tres handlers**

En el cuerpo del componente, al lado de `setDraftField`:

```jsx
  const setRangoField = (i, campo, valor) => {
    setDraft(d => ({
      ...d,
      rangos_fecha: d.rangos_fecha.map((r, j) => j === i ? { ...r, [campo]: valor } : r)
    }))
  }

  // Arranca en 'fecha' salvo que ya esté usada: así dos filas nuevas seguidas
  // no quedan las dos en el mismo campo, que es el error fácil de cometer.
  const agregarRango = () => {
    setDraft(d => {
      const usados = d.rangos_fecha.map(r => r.campo)
      const libre = CAMPO_FECHA_OPTIONS.find(o => !usados.includes(o.value))
      return {
        ...d,
        rangos_fecha: [...d.rangos_fecha, { campo: libre?.value ?? 'fecha', desde: '', hasta: '' }]
      }
    })
  }

  const quitarRango = (i) => {
    setDraft(d => ({ ...d, rangos_fecha: d.rangos_fecha.filter((_, j) => j !== i) }))
  }
```

- [ ] **Step 3: Arrancar con una fila cuando el drawer se abre vacío**

En `openFilters` (línea 1125), si `draft.rangos_fecha` está vacío, sembrar una fila para que el usuario vea los campos sin tener que apretar "agregar" primero:

```jsx
  const openFilters = () => {
    setDraft(d => d.rangos_fecha.length > 0 ? d : { ...d, rangos_fecha: [{ campo: 'fecha', desde: '', hasta: '' }] })
    // ... el resto de openFilters queda igual
  }
```

Como `normalizarRangos` y `buildParams` descartan las filas sin fechas, una fila vacía no filtra ni cuenta como filtro activo.

- [ ] **Step 4: Verificar en el navegador**

Con el frontend levantado, en Pagos → Filtros:
- abrir el drawer y confirmar que hay una fila de fecha vacía
- poner Fecha de factura de julio, apretar "+ agregar fecha", elegir Período de junio, aplicar
- confirmar que la tabla trae **menos** filas que con cualquiera de los dos rangos por separado (es un AND)
- quitar una fila con la ✕ y confirmar que el resultado se amplía
- guardar un preset con dos rangos, cambiar los filtros, y volver a aplicar el preset: tienen que volver las dos filas
- aplicar un preset **viejo** (guardado antes de este cambio) y confirmar que su rango de fecha aparece como una fila y que el badge de filtros activos no cuenta de más

- [ ] **Step 5: Correr la suite y el build**

Run: `cd frontend && npm test && npm run build`
Expected: verde

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx frontend/src/styles/app.css
git commit -m "feat(pagos): filas de filtro de fecha que se agregan y se combinan con Y"
```

---

## Task 8: Exportar sin exigir fechas, con tope de 300

**Files:**
- Modify: `frontend/src/pages/pagos/PagoList.jsx:1001` (gate del resumen), `:1373-1383` (botón de export), `:1395` (render del resumen)

**Interfaces:**
- Consumes: `filters.rangos_fecha` de la Task 6, y `total` / `loading` que ya existen en el componente.
- Produces: nada.

- [ ] **Step 1: Agregar la constante y los dos derivados**

En `frontend/src/pages/pagos/PagoList.jsx`, al lado de `const LIMIT = 100` (línea 844):

```js
// Sin rango de fechas se permite exportar igual, pero acotado: traer la
// historia completa de un local son decenas de miles de filas. Con fechas no
// hay tope, como siempre.
const MAX_EXPORT_SIN_FECHA = 300
```

Y en el cuerpo del componente, después de donde se define `total`:

```js
  const hayFiltroFecha = filters.rangos_fecha.some(r => r.desde || r.hasta)
  // `total` arranca en 0 y conserva el valor anterior durante un refetch, así
  // que se mira `loading` para no habilitar/deshabilitar con un número viejo.
  const exportBloqueado = !loading && !hayFiltroFecha && total > MAX_EXPORT_SIN_FECHA
```

- [ ] **Step 2: Cambiar el botón de export**

Reemplazar el `disabled` y el `title` del botón (líneas 1377-1380):

```jsx
                disabled={exporting || loading || exportBloqueado}
                title={exportBloqueado
                  ? `Hay ${total} pagos y sin filtro de fecha el máximo es ${MAX_EXPORT_SIN_FECHA}. Poné un rango de fechas o afiná los filtros.`
                  : 'Exportar a Excel los pagos con los filtros actuales'}
```

- [ ] **Step 3: Cambiar el gate del resumen**

El resumen usaba el mismo gate de fechas (línea 1001). Pasa a calcularse siempre que haya resultados, porque ahora la deuda y el total son útiles también filtrando solo por proveedor:

```js
    if (loading || total === 0) { setSummary(null); return }
```

**Importante: actualizar el array de dependencias de ese `useEffect`.** Antes dependía de `buildParams` y de las fechas; ahora lee `loading` y `total`, así que los dos tienen que estar en las deps o el resumen se queda con datos viejos:

```js
  }, [buildParams, loading, total])
```

Y en el render del resumen (línea 1395), reemplazar la condición de fechas por la existencia del resumen:

```jsx
      {(summaryLoading || summary) && (
```

- [ ] **Step 4: Verificar en el navegador**

- Sin ningún filtro (o solo por local): si hay más de 300 pagos, el botón Exportar queda deshabilitado y el tooltip dice cuántos hay. El resumen **sí** se muestra.
- Filtrar por un proveedor con pocos pagos y ninguna fecha: el botón se habilita y la descarga funciona.
- Con un rango de fechas y muchos pagos: el botón se habilita igual (sin tope), como antes.

- [ ] **Step 5: Correr la suite y el build**

Run: `cd frontend && npm test && npm run build`
Expected: verde

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/pagos/PagoList.jsx
git commit -m "feat(pagos): exportar sin rango de fechas con tope de 300"
```

---

## Task 9: Reporte de facturas cargadas fuera de término

**Files:**
- Create: `backend/src/lib/fueraDeTermino.js`
- Test: `backend/src/lib/fueraDeTermino.test.js`
- Modify: `backend/src/routes/reportes.js` (endpoint nuevo al final del archivo)

**Interfaces:**
- Consumes: nada.
- Produces: `esFueraDeTermino(periodo, createdAt)` → `boolean`, y `GET /api/reportes/fuera-de-termino?desde&hasta&id_local` que devuelve `{ data: [...], total }`.

- [ ] **Step 1: Write the failing test**

Crear `backend/src/lib/fueraDeTermino.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { esFueraDeTermino } from './fueraDeTermino.js'

test('esFueraDeTermino: cargada en agosto con periodo de junio esta fuera de termino', () => {
  assert.equal(esFueraDeTermino('2026-06-01', '2026-08-05'), true)
})

test('esFueraDeTermino: cargada en el mismo mes del periodo esta en termino', () => {
  assert.equal(esFueraDeTermino('2026-08-01', '2026-08-05'), false)
})

test('esFueraDeTermino: cargada el ultimo dia del mes del periodo sigue en termino', () => {
  assert.equal(esFueraDeTermino('2026-08-01', '2026-08-31'), false)
})

test('esFueraDeTermino: cargada el primer dia del mes siguiente ya esta fuera', () => {
  // Es el criterio de Anaxi: la factura pertenece a un mes que ya se reporto.
  assert.equal(esFueraDeTermino('2026-07-01', '2026-08-01'), true)
})

test('esFueraDeTermino: el dia del periodo no importa, solo el mes', () => {
  // 97,8% de los pagos con periodo tienen dia 1, pero no todos.
  assert.equal(esFueraDeTermino('2026-07-15', '2026-08-01'), true)
  assert.equal(esFueraDeTermino('2026-08-31', '2026-08-01'), false)
})

test('esFueraDeTermino: cruza bien el fin de año', () => {
  assert.equal(esFueraDeTermino('2025-12-01', '2026-01-03'), true)
  assert.equal(esFueraDeTermino('2026-01-01', '2026-01-03'), false)
})

test('esFueraDeTermino: un periodo futuro no esta fuera de termino', () => {
  // Raro, pero no es el problema que este reporte busca.
  assert.equal(esFueraDeTermino('2026-09-01', '2026-08-05'), false)
})

test('esFueraDeTermino: sin periodo no se puede decir nada', () => {
  assert.equal(esFueraDeTermino(null, '2026-08-05'), false)
  assert.equal(esFueraDeTermino(undefined, '2026-08-05'), false)
})

test('esFueraDeTermino: acepta Date y string ISO, no solo el string del input', () => {
  assert.equal(esFueraDeTermino(new Date('2026-06-01T00:00:00Z'), new Date('2026-08-05T12:00:00Z')), true)
  assert.equal(esFueraDeTermino('2026-06-01T00:00:00.000Z', '2026-08-05T15:30:00.000Z'), true)
})

test('esFueraDeTermino: un valor que no es fecha no rompe ni afirma nada', () => {
  assert.equal(esFueraDeTermino('cualquiera', '2026-08-05'), false)
  assert.equal(esFueraDeTermino('2026-06-01', 'cualquiera'), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/lib/fueraDeTermino.test.js`
Expected: FAIL con `Cannot find module './fueraDeTermino.js'`

- [ ] **Step 3: Write the implementation**

Crear `backend/src/lib/fueraDeTermino.js`:

```js
// Una factura está "fuera de término" si se cargó en un mes posterior al mes de
// su período: pertenece a un mes que probablemente ya se reportó al cliente, y
// por eso los números del reporte enviado dejan de coincidir con la app.
//
// Es el problema que Anaxi describió el 31/07/2026: los administrativos cargan
// facturas tarde y el informe del mes cerrado cambia después de mandado.
//
// Se compara MES contra MES, no día contra día. El período representa un mes
// (el 97,8% de los pagos con período tienen día 1), así que el día es ruido.
// Cargar el 31 de agosto una factura de agosto está en término; cargar el 1 de
// septiembre esa misma factura, no.
//
// Ojo con la zona horaria: `created_at` es un instante real y se guarda en UTC.
// Un pago cargado el 31/08 a las 22hs de Argentina es el 01/09 en UTC, y sin
// corregir eso quedaría marcado como fuera de término sin serlo. Por eso se
// pasa a hora de Argentina antes de sacar el mes.
const OFFSET_ARG_MS = 3 * 60 * 60 * 1000

// Devuelve el número de mes absoluto (año * 12 + mes) o null.
function mesAbsoluto(valor, corregirZona) {
  if (!valor) return null
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return null

  const ms = corregirZona ? d.getTime() - OFFSET_ARG_MS : d.getTime()
  const enZona = new Date(ms)
  return enZona.getUTCFullYear() * 12 + enZona.getUTCMonth()
}

export function esFueraDeTermino(periodo, createdAt) {
  // El período es un día calendario a medianoche UTC: no se le corrige la zona.
  const mesPeriodo = mesAbsoluto(periodo, false)
  // created_at es un instante real: se lleva a hora de Argentina.
  const mesCarga = mesAbsoluto(createdAt, true)

  if (mesPeriodo === null || mesCarga === null) return false
  return mesPeriodo < mesCarga
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/lib/fueraDeTermino.test.js`
Expected: PASS, 10 tests

- [ ] **Step 5: Agregar el endpoint**

En `backend/src/routes/reportes.js`, al final del archivo (después de `GET /balance`), agregar el endpoint. Se filtra en SQL comparando las dos columnas, porque Prisma no compara dos campos entre sí:

```js
  // ── GET /fuera-de-termino ───────────────────────────────────────────────
  // Facturas cargadas en el rango pedido pero cuyo período es de un mes
  // anterior al de la carga. Sirve para ajustar un informe ya enviado sin
  // tener que cruzar Excels a mano. Ver lib/fueraDeTermino.js para el criterio.
  fastify.get('/fuera-de-termino', { preHandler: viewHandler }, async (request, reply) => {
    const { desde, hasta, id_local } = request.query
    if (!desde || !hasta) {
      return reply.code(400).send({ error: 'desde y hasta son requeridos' })
    }
    if (id_local && !request.allowedLocalIds.includes(id_local)) {
      return reply.code(403).send({ error: 'Sin acceso a este local' })
    }

    const localIds = id_local ? [id_local] : request.allowedLocalIds
    if (!localIds.length) return { data: [], total: 0 }

    // created_at es un instante real -> el rango va en hora de Argentina.
    const desdeDate = new Date(`${desde}T00:00:00.000-03:00`)
    const hastaDate = new Date(`${hasta}T23:59:59.999-03:00`)

    const rows = await fastify.db.$queryRaw`
      SELECT p.id, p.nro_ord, p.fecha, p.periodo, p.created_at, p.importe,
             p.id_tipo, p.pagado,
             pr.nombre AS proveedor,
             l.nombre  AS local,
             u.nombre  AS cargado_por
      FROM pagos p
      LEFT JOIN proveedores pr ON pr.id = p.id_proveedor
      LEFT JOIN locales     l  ON l.id  = p.id_local
      LEFT JOIN users       u  ON u.id  = p.created_by
      WHERE p.id_local = ANY(${localIds})
        AND p.created_at >= ${desdeDate}
        AND p.created_at <= ${hastaDate}
        AND p.periodo IS NOT NULL
        AND date_trunc('month', p.periodo)
              < date_trunc('month', p.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires')
      ORDER BY p.created_at DESC
    `

    return {
      data: rows.map(r => ({ ...r, importe: Number(r.importe ?? 0) })),
      total: rows.length
    }
  })
```

- [ ] **Step 6: Verificar el endpoint contra la base**

Con el túnel y el backend local levantados, pedir el reporte para el mes actual:

```
GET /api/reportes/fuera-de-termino?desde=2026-07-01&hasta=2026-07-31
```

Expected: una lista de pagos donde, para cada fila, el mes de `periodo` es anterior al mes de `created_at`. Revisar tres filas a mano para confirmarlo.

Verificar además el caso borde de la zona horaria: si hay algún pago con `created_at` entre las 00:00 y las 03:00 UTC del día 1 de un mes (o sea, cargado la noche del último día del mes anterior en Argentina), confirmar que **no** aparece marcado como fuera de término si su período es de ese mes anterior.

- [ ] **Step 7: Correr la suite**

Run: `cd backend && npm test`
Expected: verde

- [ ] **Step 8: Commit**

```bash
git add backend/src/lib/fueraDeTermino.js backend/src/lib/fueraDeTermino.test.js backend/src/routes/reportes.js
git commit -m "feat(reportes): endpoint de facturas cargadas fuera de termino"
```

---

## Task 10: Pantalla del reporte de fuera de término

**Files:**
- Modify: `frontend/src/api/reportes.js` (método nuevo)
- Modify: `frontend/src/pages/reportes/Reportes.jsx` (pestaña nueva)
- Create: `frontend/src/pages/reportes/ReporteFueraDeTermino.jsx`

**Interfaces:**
- Consumes: `GET /api/reportes/fuera-de-termino` de la Task 9.
- Produces: nada.

- [ ] **Step 1: Agregar el método a la API del frontend**

En `frontend/src/api/reportes.js`, agregar el método siguiendo la forma de los que ya están:

```js
  fueraDeTermino: (params, signal) => client.get('/reportes/fuera-de-termino', { params, signal }),
```

- [ ] **Step 2: Crear el componente**

Crear `frontend/src/pages/reportes/ReporteFueraDeTermino.jsx`. Antes de escribirlo, **leer `ReporteBalance.jsx` completo**: es el más parecido (tabla simple con export) y hay que seguir su estructura, sus clases y su manejo de estados de carga/vacío en lugar de inventar otros.

Esqueleto, con las columnas y los formatos ya decididos:

```jsx
import { useState, useEffect, useCallback } from 'react'
import { reportesApi } from '../../api/reportes.js'
import { fmtMonthUTC } from '../../lib/dates.js'
import { downloadExcel } from '../../lib/excel.js'
import { useUiStore } from '../../store/uiStore.js'

// Las dos columnas del medio son el punto del reporte: ver el período al lado
// de la fecha de carga es lo que hace visible el desfasaje.
const COLUMNS = [
  { label: 'Nro OP',        key: 'nro_ord' },
  { label: 'Local',         key: 'local' },
  { label: 'Proveedor',     key: 'proveedor' },
  { label: 'Fecha factura', key: 'fecha',      tipo: 'fecha' },
  { label: 'Período',       key: 'periodo',    tipo: 'mes' },
  { label: 'Cargado el',    key: 'created_at', tipo: 'fechaHora' },
  { label: 'Importe',       key: 'importe',    total: true },
  { label: 'Cargado por',   key: 'cargado_por' },
]

export default function ReporteFueraDeTermino({ applied, activeLocal }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const notify = useUiStore(s => s.notify)

  useEffect(() => {
    if (!applied.desde || !applied.hasta) return
    const ctrl = new AbortController()
    setLoading(true)
    reportesApi.fueraDeTermino({
      desde: applied.desde,
      hasta: applied.hasta,
      ...(activeLocal?.id ? { id_local: activeLocal.id } : {}),
    }, ctrl.signal)
      .then(({ data }) => setRows(data.data))
      .catch(() => { if (!ctrl.signal.aborted) notify('Error al cargar el reporte', 'error') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [applied.desde, applied.hasta, activeLocal?.id, notify])

  // ... render: estado de carga, estado vacío ("No hay facturas cargadas fuera
  // de término en este rango"), tabla y botón de export — todo siguiendo
  // ReporteBalance.jsx
}
```

Para el export, reusar `downloadExcel` con el mismo patrón de `ReporteBalance.jsx:78-114`, nombre de archivo `fuera_de_termino_<hoy>.xlsx`.

- [ ] **Step 3: Agregar la pestaña**

En `frontend/src/pages/reportes/Reportes.jsx`, agregar la pestaña a la lista de tabs y renderizar el componente nuevo pasándole `applied` y `activeLocal`, igual que se hace con `ReportePagos` en la línea 279. Etiqueta de la pestaña: **Fuera de término**.

- [ ] **Step 4: Verificar en el navegador**

Entrar a Reportes → Fuera de término con el rango del mes actual. Confirmar que:
- las filas muestran un período anterior al mes de carga
- el export descarga y las dos columnas de fecha se leen bien
- con un rango donde no haya nada, la pantalla muestra el estado vacío en lugar de romperse

- [ ] **Step 5: Correr la suite y el build**

Run: `cd frontend && npm test && npm run build`
Expected: verde

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/reportes.js frontend/src/pages/reportes/ReporteFueraDeTermino.jsx frontend/src/pages/reportes/Reportes.jsx
git commit -m "feat(reportes): pantalla de facturas cargadas fuera de termino"
```

---

## Verificación final antes del PR

- [ ] `cd backend && npm test` — todo verde
- [ ] `cd frontend && npm test` — todo verde
- [ ] `cd frontend && npm run build` — sin errores
- [ ] `cd frontend && npx eslint src/` y `cd backend && npx eslint src/` — sin hallazgos
- [ ] Levantar la app completa y recorrer los cinco cambios a mano
- [ ] Comparar el `total_deuda` de un proveedor contra el cálculo a mano de Anaxi, que es la validación que ella dijo que iba a hacer

## Lo que este plan NO hace (del spec)

- No corrige las 8 notas de crédito cargadas como egreso (2 impagas, 451.238,33)
- No agrega validación de `periodo` en el backend: el aviso sigue siendo solo del frontend y se puede saltear por API
- No unifica la whitelist divergente de `reportes.js:219-220` (le falta `created_at` y no lo trata como instante). Candidato natural cuando se toque ese endpoint
- No toca `GET /pagos/stats` ni `GET /pagos/chart`, que tienen lógica de fecha duplicada y hardcodeada a `fecha`
- No toca el reporte mensual de `dcsmart-analisis`
