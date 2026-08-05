# DEV-60 — Data Entry, aviso al desauditar y KPIs de Reportes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un perfil que solo carga datos, avisarle al auditor cuando le revierten una auditoría, y completar los KPIs de los reportes de Pagos y Cajas.

**Architecture:** Todo el cálculo nuevo va a funciones puras en `backend/src/lib/*.js` con su `*.test.js` al lado, y las rutas quedan como plomería. Nada de reglas de negocio duplicadas: el efectivo se decide con el `esEfectivo` que ya vive en `cuadreCaja.js` y el descuadre con el `calcularCuadre` del mismo módulo. En el frontend se extrae el panel de alta de caja a su propio archivo para que exista una sola definición del alta.

**Tech Stack:** Fastify + Prisma + PostgreSQL en el backend; Vite + React + Zustand en el frontend. Tests con `node --test` (sin framework externo).

## Global Constraints

- ESModules (`import`/`export`) en todo el proyecto. `async/await`, nunca callbacks.
- Tests con `node --test`, archivos `*.test.js` al lado del módulo. Correr con `npm test` desde `backend/`.
- Campos de base en `snake_case`; tablas en plural.
- Montos: `Decimal(12,2)`, **siempre positivos**. La dirección va aparte (`ingresa_egreso`).
- Fechas: los campos que son día calendario (`fecha`, `cashflow`, `periodo`) se interpretan en UTC (`Z`); los que son instante real (`fecha_pago`, `fecha_inicio`, `Audit.fecha`) en hora Argentina (offset fijo `-03:00`).
- El backend nunca confía en el frontend: cada endpoint valida contra `role_permissions` vía `plugins/permissions.js`. Lo del frontend decide qué se muestra, no qué se puede.
- Branch: `DEV-60`. Un commit por entregable. **No pushear** sin permiso explícito.
- **No correr `seed.js`**: borra todos los usuarios reales.

---

## Orden y por qué

1. **Tareas 1-4 (Reportes)** primero: no tocan esquema ni permisos, riesgo mínimo.
2. **Tareas 5-7 (avisos)**: agregan tabla nueva (aditivo, pero va contra la base de producción).
3. **Tareas 8-9 (Data Entry)** al final: tocan `CajaList.jsx`, el archivo más cargado del frontend.

---

## Task 1: Agregado por dirección en el reporte de Pagos (backend)

**Files:**
- Create: `backend/src/lib/direccionPagos.js`
- Create: `backend/src/lib/direccionPagos.test.js`
- Modify: `backend/src/lib/cuadreCaja.js:65` (exportar `esEfectivo`)
- Modify: `backend/src/routes/reportes.js:274-398` (endpoint `GET /pagos`)

**Interfaces:**
- Consumes: `esEfectivo(nombreMetodo)` de `lib/cuadreCaja.js`.
- Produces: `agregarPorDireccion(filas)` → `{ total_ingresos, total_egresos, efectivo: { ingresos, egresos }, resto: { ingresos, egresos }, rubros: { ingresos: [{nombre,total}], egresos: [{nombre,total}] } }`. Cada fila de entrada es `{ importe, ingresa_egreso, metodo_pago: { nombre } | null, rubcat: { rubro: { nombre } } | null }`. Los arrays de `rubros` vienen ordenados por `total` descendente.

- [ ] **Step 1: Exportar `esEfectivo`**

En `backend/src/lib/cuadreCaja.js` línea 65, agregar `export`:

```javascript
export const esEfectivo = (nombreMetodo) => /efectivo/i.test(String(nombreMetodo ?? ''))
```

- [ ] **Step 2: Escribir el test que falla**

Crear `backend/src/lib/direccionPagos.test.js`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarPorDireccion } from './direccionPagos.js'

const fila = (importe, ingresa_egreso, metodo, rubro) => ({
  importe,
  ingresa_egreso,
  metodo_pago: metodo ? { nombre: metodo } : null,
  rubcat: rubro ? { rubro: { nombre: rubro } } : null,
})

test('sin filas devuelve todo en cero', () => {
  const r = agregarPorDireccion([])
  assert.equal(r.total_ingresos, 0)
  assert.equal(r.total_egresos, 0)
  assert.deepEqual(r.efectivo, { ingresos: 0, egresos: 0 })
  assert.deepEqual(r.resto, { ingresos: 0, egresos: 0 })
  assert.deepEqual(r.rubros, { ingresos: [], egresos: [] })
})

test('separa por direccion: ingresa_egreso true es ingreso, false es egreso', () => {
  const r = agregarPorDireccion([
    fila(100, true,  'Transferencia', 'Ventas'),
    fila(30,  false, 'Transferencia', 'Sueldos'),
  ])
  assert.equal(r.total_ingresos, 100)
  assert.equal(r.total_egresos, 30)
})

test('los montos son positivos: un egreso no resta del total de ingresos', () => {
  const r = agregarPorDireccion([
    fila(100, true,  null, null),
    fila(100, false, null, null),
  ])
  assert.equal(r.total_ingresos, 100)
  assert.equal(r.total_egresos, 100)
})

test('efectivo se decide por el nombre del metodo, sin importar mayusculas', () => {
  const r = agregarPorDireccion([
    fila(10, false, 'Efectivo', null),
    fila(20, false, 'EFECTIVO', null),
    fila(40, false, 'efectivo en mano', null),
  ])
  assert.equal(r.efectivo.egresos, 70)
  assert.equal(r.resto.egresos, 0)
})

test('resto es el total menos el efectivo, por direccion', () => {
  const r = agregarPorDireccion([
    fila(100, true,  'Efectivo', null),
    fila(25,  true,  'Tarjeta',  null),
    fila(60,  false, 'Efectivo', null),
    fila(15,  false, 'Cheque',   null),
  ])
  assert.equal(r.efectivo.ingresos, 100)
  assert.equal(r.resto.ingresos, 25)
  assert.equal(r.efectivo.egresos, 60)
  assert.equal(r.resto.egresos, 15)
})

test('un pago sin metodo asignado cuenta en resto, no desaparece', () => {
  const r = agregarPorDireccion([fila(80, false, null, null)])
  assert.equal(r.efectivo.egresos, 0)
  assert.equal(r.resto.egresos, 80)
  assert.equal(r.total_egresos, 80)
})

test('agrupa rubros por direccion y los ordena de mayor a menor', () => {
  const r = agregarPorDireccion([
    fila(10, false, null, 'Sueldos'),
    fila(50, false, null, 'CMV Alimentos'),
    fila(20, false, null, 'Sueldos'),
    fila(70, true,  null, 'Ventas'),
  ])
  assert.deepEqual(r.rubros.egresos, [
    { nombre: 'CMV Alimentos', total: 50 },
    { nombre: 'Sueldos', total: 30 },
  ])
  assert.deepEqual(r.rubros.ingresos, [{ nombre: 'Ventas', total: 70 }])
})

test('sin rubro cae en "Sin rubro" en vez de desaparecer', () => {
  const r = agregarPorDireccion([fila(15, false, null, null)])
  assert.deepEqual(r.rubros.egresos, [{ nombre: 'Sin rubro', total: 15 }])
})

test('importe null cuenta como cero y no rompe', () => {
  const r = agregarPorDireccion([fila(null, false, 'Efectivo', 'Sueldos')])
  assert.equal(r.total_egresos, 0)
  assert.equal(r.efectivo.egresos, 0)
})

test('importe como string (Decimal de Prisma viaja en JSON como string)', () => {
  const r = agregarPorDireccion([fila('123.45', false, null, null)])
  assert.equal(r.total_egresos, 123.45)
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd backend && node --test src/lib/direccionPagos.test.js`
Expected: FAIL — `Cannot find module './direccionPagos.js'`

- [ ] **Step 4: Implementar**

Crear `backend/src/lib/direccionPagos.js`:

```javascript
// Agregado de pagos por DIRECCION, para las tarjetas del reporte de Pagos.
//
// La direccion no es el signo del monto: los importes son siempre positivos y la
// direccion vive en `ingresa_egreso` (true = ingreso, false = egreso). Ver
// REGLAS_MIGRACION.md.
//
// "En efectivo" se decide con el MISMO esEfectivo que usa el cuadre de caja, a
// proposito: si algun dia se agrega un metodo "Efectivo USD", las dos pantallas
// tienen que cambiar juntas.

import { esEfectivo } from './cuadreCaja.js'

const SIN_RUBRO = 'Sin rubro'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// `ingresa_egreso === true` es ingreso. Cualquier otra cosa (false, null,
// undefined) se trata como egreso, que es el default de la columna en la base.
const esIngreso = (pago) => pago?.ingresa_egreso === true

function rubroDe(pago) {
  return pago?.rubcat?.rubro?.nombre || SIN_RUBRO
}

// De Map a array ordenado por total descendente. El orden lo decide el backend
// para que la torta y la leyenda coincidan sin que el frontend reordene.
function aListaOrdenada(mapa) {
  return [...mapa.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total)
}

export function agregarPorDireccion(filas) {
  let total_ingresos = 0, total_egresos = 0
  let efectivo_ingresos = 0, efectivo_egresos = 0
  const rubrosIngresos = new Map()
  const rubrosEgresos  = new Map()

  for (const fila of filas ?? []) {
    const monto = num(fila?.importe)
    const ingreso = esIngreso(fila)
    const enEfectivo = esEfectivo(fila?.metodo_pago?.nombre)
    const rubro = rubroDe(fila)
    const mapa = ingreso ? rubrosIngresos : rubrosEgresos

    if (ingreso) {
      total_ingresos += monto
      if (enEfectivo) efectivo_ingresos += monto
    } else {
      total_egresos += monto
      if (enEfectivo) efectivo_egresos += monto
    }
    mapa.set(rubro, (mapa.get(rubro) ?? 0) + monto)
  }

  return {
    total_ingresos,
    total_egresos,
    efectivo: { ingresos: efectivo_ingresos, egresos: efectivo_egresos },
    // El resto se deriva, no se acumula aparte: asi no puede quedar
    // desalineado con el total si alguien agrega una condicion nueva arriba.
    resto: {
      ingresos: total_ingresos - efectivo_ingresos,
      egresos:  total_egresos  - efectivo_egresos,
    },
    rubros: {
      ingresos: aListaOrdenada(rubrosIngresos),
      egresos:  aListaOrdenada(rubrosEgresos),
    },
  }
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && node --test src/lib/direccionPagos.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 6: Conectar al endpoint**

En `backend/src/routes/reportes.js`:

Agregar el import arriba (junto a los otros, después de la línea 8):

```javascript
import { agregarPorDireccion } from '../lib/direccionPagos.js'
```

En el `GET /pagos`, la consulta `pagosEnRango` (línea 327-333) necesita dos campos
más en el `select` para poder agregar por método:

```javascript
      fastify.db.pago.findMany({
        where: { ...localFilter, ...fechaWhere },
        select: {
          id: true, importe: true, pagado: true, ingresa_egreso: true, id_tipo: true,
          metodo_pago: { select: { nombre: true } },
          rubcat: { select: { rubro: { select: { nombre: true } } } }
        }
      })
```

En el `return` (línea 382-397), agregar el spread del agregado nuevo **antes** de
los campos actuales, y dejar los actuales intactos:

```javascript
    const porDireccion = agregarPorDireccion(pagosEnRango)

    return {
      ...porDireccion,
      total_adeudado: deudaNeta(egresosAgg._sum.importe, ingresosAgg._sum.importe),
      count_adeudado: egresosAgg._count.id,
      count_auditados: countAuditados,
      count_no_auditados: countNoAuditados,
      // OJO: total_efectivo/count_efectivo mezclan ingresos y egresos en un solo
      // numero. Se dejan por compatibilidad, pero la pantalla ya no los usa: usa
      // `efectivo.ingresos` y `efectivo.egresos` de agregarPorDireccion.
      total_efectivo: Number(efectivoAgg._sum.importe ?? 0),
      count_efectivo: efectivoAgg._count.id,
      total_gastos: totalGastos,
      total_cmv: totalCmv,
      pendientes_impuestos: pendImpuestos,
      pendientes_sueldos: pendSueldos,
      pendientes_proveedores: pendProveedores,
      total_impuestos: totalImpuestos,
      total_sueldos: totalSueldos,
      total_resto: totalGastos - totalCmv - totalImpuestos - totalSueldos
    }
```

También agregar los campos nuevos al early-return de scope vacío (línea 288-296),
para que la forma de la respuesta sea siempre la misma:

```javascript
    if (!localIds.length) {
      return {
        ...agregarPorDireccion([]),
        total_adeudado: 0, count_adeudado: 0,
        count_auditados: 0, count_no_auditados: 0,
        total_efectivo: 0, count_efectivo: 0,
        total_gastos: 0, total_cmv: 0,
        pendientes_impuestos: 0, pendientes_sueldos: 0, pendientes_proveedores: 0
      }
    }
```

- [ ] **Step 7: Verificar que toda la suite sigue verde**

Run: `cd backend && npm test`
Expected: todos los tests pasan (los 249 previos + los 10 nuevos).

- [ ] **Step 8: Verificar el endpoint contra la base real**

Levantar el backend en un puerto libre y pedir el reporte con un token de
super_admin. La app LOS GALGOS es `790eae1d-0a99-4668-b9b9-fb91937040bb`.

```bash
cd backend && PORT=3099 node src/server.js
# en otra terminal, con un JWT firmado con JWT_SECRET:
# GET /api/reportes/pagos?desde=2026-07-01&hasta=2026-07-31&campo_fecha=fecha
```

Expected: HTTP 200, y `total_ingresos + total_egresos` igual a la suma de todos los
importes del período. Chequear que `efectivo.ingresos + resto.ingresos === total_ingresos`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/lib/direccionPagos.js backend/src/lib/direccionPagos.test.js \
        backend/src/lib/cuadreCaja.js backend/src/routes/reportes.js
git commit -m "feat(reportes): totales por direccion, efectivo vs resto y rubros en el reporte de pagos"
```

---

## Task 2: Tarjetas y tortas de rubros en Reportes / Pagos (frontend)

**Files:**
- Create: `frontend/src/components/Donut.jsx`
- Modify: `frontend/src/pages/reportes/ReportePagos.jsx`
- Modify: `frontend/src/pages/reportes/reportes.css` (clases nuevas para la grilla de tortas)

**Interfaces:**
- Consumes: la respuesta de `GET /api/reportes/pagos` de la Task 1 (`total_ingresos`, `total_egresos`, `efectivo`, `resto`, `rubros`).
- Produces: `<Donut segmentos={[{ nombre, total }]} titulo="..." />`, que arma los gajos y la leyenda solo.

- [ ] **Step 1: Leer la skill de visualización**

Antes de escribir la primera línea de la torta, invocar la skill `dataviz`. Define
paleta, orden de gajos, contraste en tema claro y oscuro, y cuándo agrupar la cola en
"Otros". No improvisar colores.

- [ ] **Step 2: Crear el componente `Donut`**

El donut que ya existe en `ReporteCajas.jsx:239-260` es de dos gajos fijos con
`conic-gradient` y no sirve para N rubros. Este generaliza eso reusando las clases
`.rep-donut-*` que ya están en `reportes.css`.

Crear `frontend/src/components/Donut.jsx`:

```jsx
// Torta de N gajos con conic-gradient + leyenda.
//
// Reusa las clases .rep-donut-* de pages/reportes/reportes.css, que ya existian
// para el donut de dos gajos (Z fiscal vs no fiscal) de ReporteCajas.
//
// La cola larga se agrupa en "Otros": con 20 rubros los gajos de 0,3% no se ven
// y la leyenda tapa la pantalla. El limite es de gajos VISIBLES, no de rubros.

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})

// Paleta: la misma que usa el backend para los metodos de pago en
// routes/reportes.js, para que la app se vea de una sola pieza.
const COLORES = ['#3FA9DE', '#7FD49B', '#EF6F8E', '#4BC4CC', '#F4C152', '#F08A5D', '#B98CD8', '#9b958c']

const MAX_GAJOS = 7

export default function Donut({ segmentos, titulo, vacioLabel = 'Sin datos en el período' }) {
  const limpios = (segmentos ?? []).filter(s => Number(s.total) > 0)
  const total = limpios.reduce((s, x) => s + Number(x.total), 0)

  if (total <= 0) {
    return (
      <div className="rep-kpi">
        <div className="rep-kpi-head"><span className="rep-kpi-label">{titulo}</span></div>
        <div className="rep-kpi-sub">{vacioLabel}</div>
      </div>
    )
  }

  // Los segmentos ya llegan ordenados por total desc desde el backend.
  const visibles = limpios.slice(0, MAX_GAJOS)
  const cola = limpios.slice(MAX_GAJOS)
  const gajos = cola.length > 0
    ? [...visibles, { nombre: `Otros (${cola.length})`, total: cola.reduce((s, x) => s + Number(x.total), 0) }]
    : visibles

  // conic-gradient necesita los cortes acumulados en porcentaje.
  let acumulado = 0
  const stops = gajos.map((g, i) => {
    const desde = (acumulado / total) * 100
    acumulado += Number(g.total)
    const hasta = (acumulado / total) * 100
    return `${COLORES[i % COLORES.length]} ${desde}% ${hasta}%`
  }).join(', ')

  return (
    <div className="rep-kpi">
      <div className="rep-kpi-head"><span className="rep-kpi-label">{titulo}</span></div>
      <div className="rep-donut-wrap">
        <div
          className="rep-donut"
          role="img"
          aria-label={`${titulo}: ${gajos.map(g => `${g.nombre} ${fmtCurrency.format(g.total)}`).join(', ')}`}
          style={{ background: `conic-gradient(${stops})` }}
        />
        <div className="rep-donut-legend">
          {gajos.map((g, i) => (
            <div className="rep-donut-row" key={g.nombre}>
              <span className="rep-donut-dot" style={{ background: COLORES[i % COLORES.length] }} />
              <span className="rep-donut-name">{g.nombre}</span>
              <span className="rep-donut-val">{fmtCurrency.format(g.total)}</span>
              <span className="rep-donut-sep">·</span>
              <span className="rep-donut-val">{((Number(g.total) / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar que la clase `.rep-donut` existe**

Run: `grep -n "\.rep-donut" frontend/src/pages/reportes/reportes.css`
Expected: aparecen `.rep-donut-wrap`, `.rep-donut-legend`, `.rep-donut-row`,
`.rep-donut-dot`, `.rep-donut-name`, `.rep-donut-val`, `.rep-donut-sep`.

Si **no** existe `.rep-donut` (el círculo en sí, que hoy se estila inline en
`ReporteCajas.jsx:240-243`), agregarla a `reportes.css` copiando esos estilos inline:

```css
.rep-donut {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  flex-shrink: 0;
  /* El agujero del donut: mismo color que la tarjeta. */
  mask: radial-gradient(circle, transparent 46%, #000 47%);
  -webkit-mask: radial-gradient(circle, transparent 46%, #000 47%);
}
```

- [ ] **Step 4: Reemplazar las tarjetas de `ReportePagos`**

En `frontend/src/pages/reportes/ReportePagos.jsx`:

Agregar el import: `import Donut from '../../components/Donut.jsx'`

Reemplazar la tarjeta "En efectivo" (líneas 115-124), que hoy muestra el número
mezclado `d.total_efectivo`, por dos tarjetas de dirección más dos de efectivo/resto.
La primera grilla queda así:

```jsx
      {/* ── Direccion: lo que entra y lo que sale ── */}
      <div className="rep-kpi-grid cols-4">
        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Total ingresos</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(95,201,140,.18)' }}><IcoCheck /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_ingresos)}</div>}
          <div className="rep-kpi-sub">operaciones que ingresan, en el período</div>
        </div>

        <div className="rep-kpi danger">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Total egresos</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(196,107,99,.2)' }}><IcoTrendDown /></span>
          </div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.total_egresos)}</div>}
          <div className="rep-kpi-sub">operaciones que egresan, en el período</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">En efectivo</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(63,182,189,.16)' }}><IcoCash /></span>
          </div>
          {skel ? (
            <div className="rep-skel" style={{ width: '70%', height: 32, marginBottom: 12 }} />
          ) : (
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Ingresos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.efectivo?.ingresos)}</div>
              </div>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Egresos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.efectivo?.egresos)}</div>
              </div>
            </div>
          )}
          <div className="rep-kpi-sub">método de pago Efectivo</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head">
            <span className="rep-kpi-label">Resto de las formas</span>
            <span className="rep-kpi-icon" style={{ background: 'rgba(201,176,134,.18)' }}><IcoWallet /></span>
          </div>
          {skel ? (
            <div className="rep-skel" style={{ width: '70%', height: 32, marginBottom: 12 }} />
          ) : (
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Ingresos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.resto?.ingresos)}</div>
              </div>
              <div>
                <div className="rep-kpi-sub" style={{ marginBottom: 2 }}>Egresos</div>
                <div className="rep-kpi-value" style={{ fontSize: 18 }}>{fmt(d.resto?.egresos)}</div>
              </div>
            </div>
          )}
          <div className="rep-kpi-sub">todo lo que no es efectivo, incluye sin método</div>
        </div>
      </div>
```

La segunda grilla (Total adeudado, Auditados, No auditados) se mantiene tal cual,
sacándole la tarjeta "En efectivo" que ya se movió arriba.

Agregar al final, antes del `</>`, la fila de tortas:

```jsx
      {/* ── Rubros completos, en torta, separados por direccion ── */}
      <div className="rep-kpi-grid cols-2">
        {skel ? (
          <>
            <div className="rep-kpi"><div className="rep-skel" style={{ width: '100%', height: 160 }} /></div>
            <div className="rep-kpi"><div className="rep-skel" style={{ width: '100%', height: 160 }} /></div>
          </>
        ) : (
          <>
            <Donut titulo="Rubros — Egresos"  segmentos={d.rubros?.egresos} />
            <Donut titulo="Rubros — Ingresos" segmentos={d.rubros?.ingresos} />
          </>
        )}
      </div>
```

- [ ] **Step 5: Verificar que existe la clase de grilla de 2 columnas**

Run: `grep -n "cols-2" frontend/src/pages/reportes/reportes.css`

Si no existe, agregarla junto a `.rep-kpi-grid.cols-4`:

```css
.rep-kpi-grid.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 780px) {
  .rep-kpi-grid.cols-2 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Verificar en el navegador**

Levantar el frontend (`cd frontend && npm run dev`) apuntando al backend local,
entrar a Reportes → Pagos con LOS GALGOS y un rango de un mes. Comprobar:
- Ingresos + Egresos coinciden con lo que suma la tabla de Pagos con esos filtros.
- En efectivo + Resto da el total, por cada dirección.
- Las dos tortas se dibujan y la leyenda no se desborda de la tarjeta.
- Se ve bien en tema claro y oscuro, y en pantalla angosta.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Donut.jsx frontend/src/pages/reportes/ReportePagos.jsx \
        frontend/src/pages/reportes/reportes.css
git commit -m "feat(reportes): tarjetas por direccion y tortas de rubros en el reporte de pagos"
```

---

## Task 3: Descuadre y total de detalles en el reporte de Cajas (backend)

**Files:**
- Create: `backend/src/lib/descuadreAgregado.js`
- Create: `backend/src/lib/descuadreAgregado.test.js`
- Modify: `backend/src/routes/reportes.js` (endpoint `GET /cajas`, a partir de la línea 51)

**Interfaces:**
- Consumes: `calcularCuadre(caja)`, `TOLERANCIA` y `ROL_POR_CLASIFICACION` de `lib/cuadreCaja.js`.
- Produces:
  - `agregarDescuadre(cajas)` → `{ absoluto, cantidad_cajas, sin_total }`. Cada caja de entrada es la que espera `calcularCuadre`: `{ total, efectivo, detalles, movimientos }`.
  - `agruparDetallesReporte(detalles)` → `[{ clasificacion, label, total, cantidad, subgrupos: [{ nombre, total, cantidad }] }]`, ordenado cobro → gasto → informativo.

### Qué NO agregar, y por qué

Antes de escribir nada, mirar qué devuelve ya el endpoint (`routes/reportes.js:246-270`):

| pedido | ya existe como | qué hacer |
|---|---|---|
| Total cajas | `kpi.count_z` | **reusar**, no agregar |
| Total efectivo | `kpi.efectivo` | **reusar**, no agregar |
| Total detalles | `detalles_total` | **reusar**, no agregar |
| Desglose detalles | `detalles` (plano, por nombre) | agregar el nivel de clasificación aparte |
| Descuadre | — | agregar |

**No crear un `total_detalles` nuevo.** El `detalles_total` que ya existe sale de una
consulta SQL cruda (línea ~178-194) que además filtra por app
(`dt.id_app = $N OR dt.id_app IS NULL`). Un segundo total calculado con Prisma sin ese
filtro daría un número distinto para los mismos datos — que es exactamente el bug de
copias divergentes que `cuadreCaja.js` vino a cerrar. Se agregan **sólo** `descuadre` y
`desglose_detalles`.

El `desglose_detalles` nuevo sí aporta algo que el `detalles` actual no tiene: el
agrupamiento por clasificación (Cobros / Gastos / Informativos), que es lo que permite
explicar el descuadre. Se calcula sobre los detalles que ya se traen para el cuadre, sin
una consulta extra.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/lib/descuadreAgregado.test.js`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarDescuadre, agruparDetallesReporte } from './descuadreAgregado.js'

// Una caja que cuadra: total = efectivo + cobros - gastos.
const cajaQueCuadra = {
  total: 1000, efectivo: 1000, detalles: [], movimientos: []
}
// Falta plata: el total declarado es menor que lo que suman los componentes.
const cajaFaltante = {
  total: 900, efectivo: 1000, detalles: [], movimientos: []
}
// Sobra plata.
const cajaSobrante = {
  total: 1100, efectivo: 1000, detalles: [], movimientos: []
}

test('sin cajas devuelve todo en cero', () => {
  assert.deepEqual(agregarDescuadre([]), { absoluto: 0, cantidad_cajas: 0, sin_total: 0 })
})

test('una caja que cuadra no aporta descuadre', () => {
  assert.deepEqual(agregarDescuadre([cajaQueCuadra]), { absoluto: 0, cantidad_cajas: 0, sin_total: 0 })
})

test('un faltante y un sobrante iguales NO se cancelan', () => {
  const r = agregarDescuadre([cajaFaltante, cajaSobrante])
  assert.equal(r.absoluto, 200)
  assert.equal(r.cantidad_cajas, 2)
})

test('las cajas sin total cargado se cuentan aparte y no ensucian el desvio', () => {
  const r = agregarDescuadre([cajaQueCuadra, { total: null, efectivo: 500, detalles: [], movimientos: [] }])
  assert.equal(r.absoluto, 0)
  assert.equal(r.cantidad_cajas, 0)
  assert.equal(r.sin_total, 1)
})

test('una diferencia de un peso entra en la tolerancia y no es descuadre', () => {
  const r = agregarDescuadre([{ total: 1001, efectivo: 1000, detalles: [], movimientos: [] }])
  assert.equal(r.cantidad_cajas, 0)
})

test('una diferencia de dos pesos ya es descuadre', () => {
  const r = agregarDescuadre([{ total: 1002, efectivo: 1000, detalles: [], movimientos: [] }])
  assert.equal(r.cantidad_cajas, 1)
  assert.equal(r.absoluto, 2)
})

// ── agruparDetallesReporte ──

const det = (clasificacion, nombre, monto) => ({
  tipo: clasificacion, monto, detalle_tipo: { nombre, clasificacion },
})

test('sin detalles devuelve lista vacia', () => {
  assert.deepEqual(agruparDetallesReporte([]), [])
})

test('agrupa por clasificacion y dentro por nombre, con totales', () => {
  const r = agruparDetallesReporte([
    det('cobro', 'MP QR', 100),
    det('cobro', 'MP QR', 50),
    det('gasto', 'Fletes', 30),
  ])
  assert.equal(r.length, 2)
  assert.equal(r[0].clasificacion, 'cobro')
  assert.equal(r[0].total, 150)
  assert.equal(r[0].cantidad, 2)
  assert.deepEqual(r[0].subgrupos, [{ nombre: 'MP QR', total: 150, cantidad: 2 }])
  assert.equal(r[1].clasificacion, 'gasto')
  assert.equal(r[1].total, 30)
})

test('ordena cobro, gasto, informativo', () => {
  const r = agruparDetallesReporte([
    det('informativo', 'Delivery', 10),
    det('gasto', 'Fletes', 10),
    det('cobro', 'MP QR', 10),
  ])
  assert.deepEqual(r.map(g => g.clasificacion), ['cobro', 'gasto', 'informativo'])
})

test('normaliza las clasificaciones historicas al mismo grupo', () => {
  // 'ingreso' y 'medio_pago' son cobros; 'canal' es informativo.
  const r = agruparDetallesReporte([
    det('cobro', 'A', 10),
    det('ingreso', 'B', 20),
    det('medio_pago', 'C', 30),
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].clasificacion, 'cobro')
  assert.equal(r[0].total, 60)
})

test('un detalle sin nombre de tipo usa su nombre libre', () => {
  const r = agruparDetallesReporte([
    { tipo: 'gasto', monto: 15, nombre: 'Cargado a mano', detalle_tipo: null },
  ])
  assert.deepEqual(r[0].subgrupos, [{ nombre: 'Cargado a mano', total: 15, cantidad: 1 }])
})

test('monto como string se suma bien', () => {
  const r = agruparDetallesReporte([det('cobro', 'MP QR', '10.50')])
  assert.equal(r[0].total, 10.5)
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && node --test src/lib/descuadreAgregado.test.js`
Expected: FAIL — `Cannot find module './descuadreAgregado.js'`

- [ ] **Step 3: Implementar**

Crear `backend/src/lib/descuadreAgregado.js`:

```javascript
// Agregados de caja para el reporte: descuadre del periodo y desglose de detalles.
//
// El descuadre NO se recalcula aca: se reusa calcularCuadre de cuadreCaja.js, que
// es la unica definicion de la diferencia de caja del sistema. Ese modulo existe
// justamente porque antes habia dos copias divergentes de esta regla.

import { calcularCuadre, TOLERANCIA, ROL_POR_CLASIFICACION } from './cuadreCaja.js'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Suma en VALOR ABSOLUTO a proposito: un faltante de 5000 y un sobrante de 5000
// no se cancelan. La suma neta daria cero y esconderia dos errores de carga.
export function agregarDescuadre(cajas) {
  let absoluto = 0
  let cantidad_cajas = 0
  let sin_total = 0

  for (const caja of cajas ?? []) {
    const cuadre = calcularCuadre(caja)
    // Sin total declarado no hay contra que comparar: no entra en el desvio ni
    // cuenta como descuadre, pero se informa para que la tarjeta pueda aclarar
    // que hay cajas sin verificar (si no, un "0 descuadres" miente).
    if (!cuadre || cuadre.diferencia == null) { sin_total++; continue }
    const dif = Math.abs(cuadre.diferencia)
    if (dif > TOLERANCIA) {
      absoluto += dif
      cantidad_cajas++
    }
  }

  return { absoluto, cantidad_cajas, sin_total }
}

// ── Desglose de detalles ────────────────────────────────────────────────────
//
// Mismo criterio que frontend/src/lib/desgloses.js: nivel 1 la clasificacion
// efectiva, nivel 2 el nombre. Asi el numero del reporte coincide con el que se ve
// abriendo la caja. Se normalizan las clasificaciones historicas ('ingreso',
// 'medio_pago', 'canal'...) con la misma tabla que usa el cuadre.

const ORDEN = ['cobro', 'gasto', 'informativo']
const LABEL = { cobro: 'Cobros', gasto: 'Gastos', informativo: 'Informativos' }
const SIN_NOMBRE = 'Sin nombre'

function clasificacionDe(detalle) {
  const propia = detalle?.tipo ?? detalle?.detalle_tipo?.clasificacion ?? null
  if (!propia) return 'cobro'
  return ROL_POR_CLASIFICACION[propia] ?? 'cobro'
}

function nombreDe(detalle) {
  return detalle?.detalle_tipo?.nombre ?? detalle?.nombre ?? SIN_NOMBRE
}

export function agruparDetallesReporte(detalles) {
  const grupos = new Map()

  for (const d of detalles ?? []) {
    const clave = clasificacionDe(d)
    if (!grupos.has(clave)) grupos.set(clave, { total: 0, cantidad: 0, subs: new Map() })
    const g = grupos.get(clave)
    const monto = num(d?.monto)
    g.total += monto
    g.cantidad++

    const nombre = nombreDe(d)
    if (!g.subs.has(nombre)) g.subs.set(nombre, { total: 0, cantidad: 0 })
    const s = g.subs.get(nombre)
    s.total += monto
    s.cantidad++
  }

  return [...grupos.entries()]
    .map(([clasificacion, g]) => ({
      clasificacion,
      label: LABEL[clasificacion] ?? clasificacion,
      total: g.total,
      cantidad: g.cantidad,
      subgrupos: [...g.subs.entries()]
        .map(([nombre, s]) => ({ nombre, total: s.total, cantidad: s.cantidad }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => ORDEN.indexOf(a.clasificacion) - ORDEN.indexOf(b.clasificacion))
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && node --test src/lib/descuadreAgregado.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Conectar al endpoint `GET /cajas`**

En `backend/src/routes/reportes.js`, agregar el import:

```javascript
import { agregarDescuadre, agruparDetallesReporte } from '../lib/descuadreAgregado.js'
```

Después del `cajaAgg` (línea 51-55), agregar una consulta que traiga lo que hace
falta para el cuadre y el desglose. Es una sola consulta con `include`; se apoya en
`caja_detalles_id_caja_idx` y `caja_movimientos_id_caja_idx`, agregados el 2026-08-05:

```javascript
    // Se traen las colecciones para poder aplicar calcularCuadre por caja y
    // desglosar los detalles. Un mes de LOS GALGOS son ~90 cajas y ~630
    // detalles, y desde los indices de FK esto no escanea tablas enteras.
    const cajasConHijos = await fastify.db.caja.findMany({
      where: cajaWhere,
      select: {
        total: true,
        efectivo: true,
        movimientos: { select: { tipo: true, monto: true, metodo_pago: { select: { nombre: true } } } },
        detalles: {
          select: {
            monto: true, tipo: true, nombre: true,
            detalle_tipo: { select: { nombre: true, clasificacion: true } }
          }
        }
      }
    })

    const descuadre = agregarDescuadre(cajasConHijos)
    const desgloseDetalles = agruparDetallesReporte(cajasConHijos.flatMap(c => c.detalles ?? []))
```

Agregar **sólo estos dos** campos al objeto que devuelve el endpoint (el `return` de la
línea 246), sin tocar nada de lo que ya devuelve:

```javascript
      descuadre,
      desglose_detalles: desgloseDetalles,
```

Y al early-return de scope vacío (línea 31), para que la forma sea estable:

```javascript
    if (!localIds.length) {
      return {
        kpi: {}, secondary: [], weekly: [], fiscal: {}, payments: [], pay_total: 0,
        descuadre: { absoluto: 0, cantidad_cajas: 0, sin_total: 0 },
        desglose_detalles: []
      }
    }
```

- [ ] **Step 6: Correr toda la suite**

Run: `cd backend && npm test`
Expected: todo verde.

- [ ] **Step 7: Verificar contra la base real**

Con el backend levantado en 3099:
`GET /api/reportes/cajas?desde=2026-07-01&hasta=2026-07-31` con X-App-Id de LOS GALGOS.

Expected: HTTP 200. Chequear que `total_cajas` coincide con lo que dice la tabla de
Cajas con ese rango, y que `descuadre.cantidad_cajas + descuadre.sin_total` es menor o
igual a `total_cajas`. Abrir una caja descuadrada en la app y verificar que su
diferencia está incluida en `descuadre.absoluto`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/lib/descuadreAgregado.js backend/src/lib/descuadreAgregado.test.js \
        backend/src/routes/reportes.js
git commit -m "feat(reportes): descuadre del periodo, total de detalles y desglose en el reporte de cajas"
```

---

## Task 4: Tarjetas y desglose en Reportes / Cajas (frontend)

**Files:**
- Modify: `frontend/src/pages/reportes/ReporteCajas.jsx`

**Interfaces:**
- Consumes: de la respuesta de `GET /api/reportes/cajas` — `kpi.count_z` (total de cajas), `kpi.efectivo` (total efectivo) y `detalles_total`, que **ya existían**; más `descuadre` y `desglose_detalles`, que agrega la Task 3.

Los nombres exactos están verificados contra `routes/reportes.js:246-270`. No son
`total_cajas` ni `total_efectivo` ni `total_detalles`: esos no existen en esta respuesta.

- [ ] **Step 1: Agregar la fila de tarjetas nuevas**

En `frontend/src/pages/reportes/ReporteCajas.jsx`, antes del bloque del donut de
fiscal, agregar una grilla de 4 tarjetas siguiendo el mismo patrón visual que
`ReportePagos.jsx` (`rep-kpi-grid cols-4` + `rep-kpi` + `rep-kpi-head/label/value/sub`):

```jsx
      <div className="rep-kpi-grid cols-4">
        <div className="rep-kpi">
          <div className="rep-kpi-head"><span className="rep-kpi-label">Total cajas</span></div>
          {skel
            ? <div className="rep-skel" style={{ width: '40%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{d.kpi?.count_z ?? 0}</div>}
          <div className="rep-kpi-sub">turnos del período</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head"><span className="rep-kpi-label">Total efectivo</span></div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.kpi?.efectivo ?? 0)}</div>}
          <div className="rep-kpi-sub">cobrado en efectivo</div>
        </div>

        <div className="rep-kpi">
          <div className="rep-kpi-head"><span className="rep-kpi-label">Total detalles</span></div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.detalles_total ?? 0)}</div>}
          <div className="rep-kpi-sub">suma de los detalles cargados</div>
        </div>

        <div className="rep-kpi danger">
          <div className="rep-kpi-head"><span className="rep-kpi-label">Descuadre</span></div>
          {skel
            ? <div className="rep-skel" style={{ width: '60%', height: 32, marginBottom: 12 }} />
            : <div className="rep-kpi-value med">{fmt(d.descuadre?.absoluto ?? 0)}</div>}
          <div className="rep-kpi-sub">
            {d.descuadre?.cantidad_cajas ?? 0} cajas descuadradas
            {d.descuadre?.sin_total ? ` · ${d.descuadre.sin_total} sin total cargado` : ''}
          </div>
        </div>
      </div>
```

Nota: `ReporteCajas.jsx` ya tiene su propio `fmt` y su propia variable de skeleton.
Usar las que ya están en el archivo, no redeclararlas.

- [ ] **Step 2: Agregar la tabla de desglose de detalles**

Al final del componente, antes del cierre:

```jsx
      {!skel && (d.desglose_detalles?.length ?? 0) > 0 && (
        <div className="rep-kpi" style={{ marginTop: 16 }}>
          <div className="rep-kpi-head"><span className="rep-kpi-label">Desglose de detalles</span></div>
          <table className="table" style={{ marginTop: 8 }}>
            <thead>
              <tr><th>Concepto</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Total</th></tr>
            </thead>
            <tbody>
              {d.desglose_detalles.map((g) => (
                <>
                  <tr key={g.clasificacion} style={{ fontWeight: 700 }}>
                    <td>{g.label}</td>
                    <td style={{ textAlign: 'right' }}>{g.cantidad}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(g.total)}</td>
                  </tr>
                  {g.subgrupos.map((s) => (
                    <tr key={`${g.clasificacion}-${s.nombre}`}>
                      <td style={{ paddingLeft: '1.75rem', color: 'var(--t2)' }}>{s.nombre}</td>
                      <td style={{ textAlign: 'right', color: 'var(--t2)' }}>{s.cantidad}</td>
                      <td style={{ textAlign: 'right', color: 'var(--t2)' }}>{fmt(s.total)}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
          <div className="rep-kpi-sub">
            Los informativos no entran en la diferencia de caja: son desglose de algo ya contado.
          </div>
        </div>
      )}
```

Nota: React exige `key` en el elemento raíz de cada iteración. Reemplazar el
fragmento corto `<>` por `<Fragment key={g.clasificacion}>` importando `Fragment`
de `react`, si no la consola avisa por cada fila.

- [ ] **Step 3: Verificar en el navegador**

Reportes → Cajas, LOS GALGOS, un mes. Comprobar:
- `Total cajas` coincide con el total que muestra la tabla de Cajas con ese rango.
- La suma de los subgrupos de cada grupo del desglose da el total del grupo.
- Abrir una caja de las descuadradas y ver que su diferencia se corresponde con lo
  que informa la tarjeta.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/reportes/ReporteCajas.jsx
git commit -m "feat(reportes): tarjetas de cajas/efectivo/detalles/descuadre y desglose de detalles"
```

---

## Task 5: Tabla de avisos y emisión al desauditar (backend)

**Files:**
- Modify: `backend/prisma/schema.prisma` (modelo `Notificacion` + contra-relación en `User`)
- Create: `backend/src/lib/notificacionDesauditado.js`
- Create: `backend/src/lib/notificacionDesauditado.test.js`
- Modify: `backend/src/routes/pagos.js` (handler `PATCH /:id/audit` y `PATCH /:id/audit-dc`)
- Modify: `backend/src/routes/caja.js` (ídem, líneas ~365 y ~413 después de los cambios del PR #114)

**Interfaces:**
- Produces: `destinatarioDeAviso({ historial, quienDesaudita })` → `string | null`. `historial` son filas de `audits` del registro con `{ accion, id_user, fecha }`; devuelve el `id_user` del último `auditado`, o `null` si no hay o si coincide con `quienDesaudita`.

- [ ] **Step 1: Agregar el modelo al esquema**

En `backend/prisma/schema.prisma`, agregar el modelo:

```prisma
model Notificacion {
  id          String   @id @default(uuid())
  id_user     String
  tipo        String
  titulo      String
  cuerpo      String?
  tabla       String?
  id_registro String?
  id_local    String?
  leida       Boolean  @default(false)
  created_at  DateTime @default(now())

  user User @relation(fields: [id_user], references: [id])

  // id_user va primero en los dos indices: todas las consultas son "las mias".
  // Ademas cubre la FK, que Prisma no indexa sola (ver PR #114).
  @@index([id_user, leida])
  @@index([id_user, created_at])
  @@map("notificaciones")
}
```

Y en `model User`, agregar la contra-relación (sin esto Prisma no valida el esquema):

```prisma
  notificaciones Notificacion[]
```

- [ ] **Step 2: Leer el SQL antes de aplicar nada**

**No hay base de dev: la que está en `backend/.env` es producción.** Antes de tocarla:

Run: `cd backend && npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`

Expected: solo `CREATE TABLE "notificaciones"`, dos `CREATE INDEX` y un
`ALTER TABLE ... ADD CONSTRAINT` de la FK. **Si aparece cualquier `DROP` o
`ALTER COLUMN` sobre una tabla existente, parar y avisar.**

- [ ] **Step 3: Aplicar y regenerar el cliente**

Run: `cd backend && npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 4: Escribir el test que falla**

Crear `backend/src/lib/notificacionDesauditado.test.js`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destinatarioDeAviso } from './notificacionDesauditado.js'

const ev = (accion, id_user, fecha) => ({ accion, id_user, fecha: new Date(fecha) })

test('sin historial no hay a quien avisar', () => {
  assert.equal(destinatarioDeAviso({ historial: [], quienDesaudita: 'u1' }), null)
})

test('avisa al que habia auditado', () => {
  const historial = [ev('auditado', 'auditor', '2026-08-01T10:00:00Z')]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'otro' }), 'auditor')
})

test('toma el ultimo auditado, no el primero', () => {
  const historial = [
    ev('auditado',    'viejo',  '2026-07-01T10:00:00Z'),
    ev('desauditado', 'alguien','2026-07-15T10:00:00Z'),
    ev('auditado',    'nuevo',  '2026-08-01T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'otro' }), 'nuevo')
})

test('el orden del array no importa: decide la fecha', () => {
  const historial = [
    ev('auditado', 'nuevo', '2026-08-01T10:00:00Z'),
    ev('auditado', 'viejo', '2026-07-01T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'otro' }), 'nuevo')
})

test('no se avisa a uno mismo', () => {
  const historial = [ev('auditado', 'yo', '2026-08-01T10:00:00Z')]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'yo' }), null)
})

test('si el ultimo evento de auditoria es un desauditado, no hay auditor vigente', () => {
  const historial = [
    ev('auditado',    'auditor', '2026-07-01T10:00:00Z'),
    ev('desauditado', 'otro',    '2026-08-01T10:00:00Z'),
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'tercero' }), null)
})

test('un auditado sin id_user no genera aviso', () => {
  const historial = [ev('auditado', null, '2026-08-01T10:00:00Z')]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'otro' }), null)
})

test('historial null no rompe', () => {
  assert.equal(destinatarioDeAviso({ historial: null, quienDesaudita: 'u1' }), null)
})

test('eventos con fecha null se ignoran en vez de romper el orden', () => {
  const historial = [
    ev('auditado', 'bueno', '2026-08-01T10:00:00Z'),
    { accion: 'auditado', id_user: 'sinfecha', fecha: null },
  ]
  assert.equal(destinatarioDeAviso({ historial, quienDesaudita: 'otro' }), 'bueno')
})
```

- [ ] **Step 5: Correr el test y verificar que falla**

Run: `cd backend && node --test src/lib/notificacionDesauditado.test.js`
Expected: FAIL — `Cannot find module './notificacionDesauditado.js'`

- [ ] **Step 6: Implementar**

Crear `backend/src/lib/notificacionDesauditado.js`:

```javascript
// A quien hay que avisarle cuando se revierte una auditoria.
//
// El estado de auditoria es un historial append-only en la tabla `audits`: cada
// auditar/desauditar inserta una fila. "El auditor" es quien hizo el ULTIMO
// evento `auditado`, y solo si ese evento sigue siendo el mas reciente de los
// dos tipos -- si lo ultimo fue un desauditado, ya no hay auditoria vigente que
// revertir y no hay a quien avisarle.
//
// Funcion pura: no lee ni escribe la base. El llamador le pasa el historial.

export function destinatarioDeAviso({ historial, quienDesaudita }) {
  const eventos = (historial ?? [])
    .filter(e => e?.fecha != null && (e.accion === 'auditado' || e.accion === 'desauditado'))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  const ultimo = eventos[0]
  if (!ultimo || ultimo.accion !== 'auditado') return null
  if (!ultimo.id_user) return null
  // Avisarle a alguien de su propia accion es ruido.
  if (ultimo.id_user === quienDesaudita) return null
  return ultimo.id_user
}
```

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `cd backend && node --test src/lib/notificacionDesauditado.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 8: Crear el helper que escribe el aviso**

Lo usan `pagos.js` y `caja.js`, así que vive en `lib/` desde el principio — no en una
ruta para después moverlo.

Crear `backend/src/lib/avisos.js`:

```javascript
// Escritura de avisos. La decision de A QUIEN avisarle es pura y vive en
// notificacionDesauditado.js; aca esta el efecto de lado.
//
// Un fallo NUNCA puede hacer fallar la operacion que lo dispara: mismo criterio
// que logActivity en routes/pagos.js. Si no se puede avisar, se loguea y sigue --
// perder un aviso es molesto, no poder desauditar es un bloqueo.

import { destinatarioDeAviso } from './notificacionDesauditado.js'

export async function avisarDesauditado(fastify, { tabla, id_registro, id_local, quienDesaudita, etiqueta }) {
  try {
    // Solo el circuito normal (audit_dc: false): el circuito DC es interno de
    // DCSmart y no genera avisos hacia el auditor del local.
    const historial = await fastify.db.audit.findMany({
      where: { tabla, id_registro, audit_dc: false },
      select: { accion: true, id_user: true, fecha: true }
    })
    const id_user = destinatarioDeAviso({ historial, quienDesaudita })
    if (!id_user) return

    await fastify.db.notificacion.create({
      data: {
        id_user,
        tipo: 'desauditado',
        titulo: `Se revirtió una auditoría: ${etiqueta}`,
        cuerpo: null,
        tabla, id_registro, id_local
      }
    })
  } catch (err) {
    fastify.log.error({ err, tabla, id_registro }, 'No se pudo crear el aviso de desauditado')
  }
}
```

**Cuidado con el orden de la llamada:** este helper lee el historial de `audits`, así
que hay que invocarlo **después** de que la transacción del desauditar hizo commit. Si
se llama antes, el último evento del historial todavía es el `auditado` viejo y el
destinatario saldría bien por casualidad — pero con la cascada de `audit-dc` daría mal.

- [ ] **Step 9: Emitir el aviso desde pagos**

En `backend/src/routes/pagos.js`, agregar el import:

```javascript
import { avisarDesauditado } from '../lib/avisos.js'
```

En el handler `PATCH /:id/audit`, después de que la transacción devuelve `nextAccion`
y antes del `return`, agregar:

```javascript
    if (nextAccion === 'desauditado') {
      const p = await fastify.db.pago.findUnique({
        where: { id: request.params.id },
        select: { id_local: true, nro_ord: true }
      })
      await avisarDesauditado(fastify, {
        tabla: 'pagos',
        id_registro: request.params.id,
        id_local: p?.id_local ?? null,
        quienDesaudita: request.user.id,
        etiqueta: p?.nro_ord != null ? `OP-${p.nro_ord}` : 'un pago'
      })
    }
```

Hacer lo mismo en `PATCH /:id/audit-dc`: cuando el resultado arrastra el circuito
normal a desauditado (`result.audit === false` habiendo estado en `true`), emitir el
aviso igual. Una sola notificación por evento.

- [ ] **Step 10: Emitir el aviso desde cajas**

En `backend/src/routes/caja.js`, el mismo import (`import { avisarDesauditado } from
'../lib/avisos.js'`) y el mismo patrón. La etiqueta usa `nro_turno`:

```javascript
    if (nextAccion === 'desauditado') {
      const c = await fastify.db.caja.findUnique({
        where: { id: request.params.id },
        select: { id_local: true, nro_turno: true }
      })
      await avisarDesauditado(fastify, {
        tabla: 'cajas',
        id_registro: request.params.id,
        id_local: c?.id_local ?? null,
        quienDesaudita: request.user.id,
        etiqueta: c?.nro_turno ? `Turno ${c.nro_turno}` : 'una caja'
      })
    }
```

- [ ] **Step 11: Correr toda la suite**

Run: `cd backend && npm test`
Expected: todo verde.

- [ ] **Step 12: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/lib/notificacionDesauditado.js \
        backend/src/lib/notificacionDesauditado.test.js backend/src/lib/avisos.js \
        backend/src/routes/pagos.js backend/src/routes/caja.js
git commit -m "feat(auditoria): avisar al auditor cuando le revierten una auditoria"
```

---

## Task 6: Endpoints de avisos (backend)

**Files:**
- Create: `backend/src/routes/notificaciones.js`
- Modify: `backend/src/server.js` (registrar la ruta)

**Interfaces:**
- Produces: `GET /api/notificaciones` → `{ data: [...], no_leidas: number }`; `PATCH /api/notificaciones/:id/leida` → `{ ok: true }`; `PATCH /api/notificaciones/leer-todas` → `{ ok: true, marcadas: number }`.

- [ ] **Step 1: Crear las rutas**

Crear `backend/src/routes/notificaciones.js`:

```javascript
// Avisos del propio usuario. No pasa por `can()`: no es un modulo del sistema de
// permisos, son datos personales. Solo exige estar autenticado, y cada consulta
// esta acotada a request.user.id -- nunca se puede leer ni marcar la de otro.

export default async function notificacionesRoutes(fastify) {
  const guard = [fastify.authenticate]

  // ── GET / ─────────────────────────────────────────────────────────────
  fastify.get('/', { preHandler: guard }, async (request) => {
    const limit = Math.min(Number(request.query.limit) || 20, 100)

    const [data, no_leidas] = await Promise.all([
      fastify.db.notificacion.findMany({
        where: { id_user: request.user.id },
        // No leidas primero, y dentro de cada grupo lo mas nuevo arriba.
        orderBy: [{ leida: 'asc' }, { created_at: 'desc' }],
        take: limit
      }),
      fastify.db.notificacion.count({
        where: { id_user: request.user.id, leida: false }
      })
    ])

    return { data, no_leidas }
  })

  // ── PATCH /:id/leida ──────────────────────────────────────────────────
  fastify.patch('/:id/leida', { preHandler: guard }, async (request, reply) => {
    // updateMany con id_user en el where: si la notificacion es de otro usuario
    // no actualiza nada y se responde 404, sin revelar que existe.
    const { count } = await fastify.db.notificacion.updateMany({
      where: { id: request.params.id, id_user: request.user.id },
      data: { leida: true }
    })
    if (count === 0) return reply.code(404).send({ error: 'Aviso no encontrado' })
    return { ok: true }
  })

  // ── PATCH /leer-todas ─────────────────────────────────────────────────
  fastify.patch('/leer-todas', { preHandler: guard }, async (request) => {
    const { count } = await fastify.db.notificacion.updateMany({
      where: { id_user: request.user.id, leida: false },
      data: { leida: true }
    })
    return { ok: true, marcadas: count }
  })
}
```

- [ ] **Step 2: Registrar la ruta**

En `backend/src/server.js`, junto a los otros registros:

```javascript
import notificacionesRoutes from './routes/notificaciones.js'
// ...
await app.register(notificacionesRoutes, { prefix: '/api/notificaciones' })
```

**Ojo con el orden de las rutas:** `/leer-todas` tiene que declararse de modo que no
la capture `/:id/leida`. Con estos paths no hay colisión (`/leer-todas` es un
segmento y `/:id/leida` son dos), pero verificarlo con el test del paso 3.

- [ ] **Step 3: Verificar contra la base real**

Levantar el backend en 3099 con un JWT de un usuario cualquiera:

```
GET   /api/notificaciones            → 200, { data: [], no_leidas: 0 }
PATCH /api/notificaciones/leer-todas → 200, { ok: true, marcadas: 0 }
PATCH /api/notificaciones/xxx/leida  → 404
```

Después, provocar un aviso de verdad: auditar un pago con el usuario A, desauditarlo
con el usuario B, y verificar que `GET /api/notificaciones` con el token de A trae 1
con `no_leidas: 1`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/notificaciones.js backend/src/server.js
git commit -m "feat(avisos): endpoints para listar y marcar leidos los avisos propios"
```

---

## Task 7: Avisos en el frontend

**Files:**
- Create: `frontend/src/api/notificaciones.js`
- Create: `frontend/src/pages/avisos/Avisos.jsx`
- Modify: `frontend/src/components/Sidebar.jsx` (ítem de nav con contador)
- Modify: `frontend/src/App.jsx` (ruta `/avisos`)

**Interfaces:**
- Consumes: los endpoints de la Task 6.

**Decisión de diseño, distinta del spec:** el spec decía "campanita en el header",
pero **no existe un header en desktop** — sólo `MobileTopbar` (mobile) y el `Sidebar`.
Poner un header nuevo sólo para esto es desproporcionado. Va como ítem del sidebar con
el contador de no leídas, más una página `/avisos`. Es más simple y consistente con
todo lo demás.

**Cuidado con el nombre:** `uiStore` ya tiene `notifications`, que son los toasts
transitorios. Para no confundir, todo lo del frontend acá se llama **avisos**.

- [ ] **Step 1: Crear el cliente de API**

Crear `frontend/src/api/notificaciones.js`:

```javascript
import client from './client.js'

export const avisosApi = {
  list:       (params, signal) => client.get('/notificaciones', { params, signal }),
  marcarLeida: (id)            => client.patch(`/notificaciones/${id}/leida`),
  leerTodas:   ()              => client.patch('/notificaciones/leer-todas'),
}
```

- [ ] **Step 2: Crear la página de avisos**

Crear `frontend/src/pages/avisos/Avisos.jsx`:

```jsx
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { avisosApi } from '../../api/notificaciones.js'
import { useUiStore } from '../../store/uiStore.js'

// A donde lleva cada aviso segun de que tabla habla.
function destinoDe(aviso) {
  if (aviso.tabla === 'pagos' && aviso.id_registro) return `/pagos/${aviso.id_registro}/editar`
  if (aviso.tabla === 'cajas' && aviso.id_registro) return `/cajas/${aviso.id_registro}`
  return null
}

export default function Avisos() {
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(() => {
    avisosApi.list({ limit: 100 })
      .then((r) => setAvisos(r.data.data ?? []))
      .catch(() => notify('No se pudieron cargar los avisos', 'error'))
      .finally(() => setLoading(false))
  }, [notify])

  useEffect(() => { cargar() }, [cargar])

  const abrir = async (aviso) => {
    if (!aviso.leida) {
      try { await avisosApi.marcarLeida(aviso.id) } catch { /* igual navegamos */ }
    }
    const destino = destinoDe(aviso)
    if (destino) navigate(destino)
    else cargar()
  }

  const leerTodas = async () => {
    try {
      await avisosApi.leerTodas()
      cargar()
    } catch { notify('No se pudieron marcar como leídos', 'error') }
  }

  const noLeidas = avisos.filter(a => !a.leida).length

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Avisos</h1>
        </div>
        {noLeidas > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={leerTodas}>
            Marcar todo como leído
          </button>
        )}
      </div>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : avisos.length === 0 ? (
        <div className="card"><div className="card-body">No tenés avisos.</div></div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ display: 'grid', gap: '0.5rem' }}>
            {avisos.map((a) => (
              <button
                key={a.id}
                className="btn btn-secondary"
                style={{
                  justifyContent: 'flex-start', textAlign: 'left',
                  fontWeight: a.leida ? 400 : 700,
                }}
                onClick={() => abrir(a)}
              >
                {!a.leida && <span className="sidebar-local-dot" style={{ marginRight: 8 }} />}
                <span style={{ flex: 1 }}>{a.titulo}</span>
                <span style={{ color: 'var(--t3)', fontSize: 12, marginLeft: 12 }}>
                  {new Date(a.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Agregar la ruta**

En `frontend/src/App.jsx`:

```jsx
const Avisos = lazyWithReload(() => import('./pages/avisos/Avisos.jsx'))
```

Y dentro del `Layout`, una ruta que **no** exige app activa ni rol (los avisos son
del usuario, no de la app):

```jsx
          <Route path="avisos" element={<ProtectedRoute requireApp={false}><Avisos /></ProtectedRoute>} />
```

- [ ] **Step 4: Agregar el ítem al sidebar con el contador**

En `frontend/src/components/Sidebar.jsx`, adentro del componente `Sidebar`:

```jsx
  const [noLeidas, setNoLeidas] = useState(0)

  // Contador de avisos sin leer. Polling cada 60s; se pausa si la pestaña esta
  // oculta para no pegarle a la API de fondo. No hay websockets a proposito:
  // para un aviso de auditoria, un minuto de demora no cambia nada.
  useEffect(() => {
    let cancelado = false
    const traer = () => {
      if (document.hidden) return
      avisosApi.list({ limit: 1 })
        .then(r => { if (!cancelado) setNoLeidas(r.data.no_leidas ?? 0) })
        .catch(() => {})
    }
    traer()
    const id = setInterval(traer, 60000)
    return () => { cancelado = true; clearInterval(id) }
  }, [])
```

Con su import (`import { avisosApi } from '../api/notificaciones.js'`) y el ícono:

```jsx
function IcoCampana() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
```

Renderizar el ítem arriba de `NAV_MAIN`, fuera del filtro por rol (**todos** los
roles pueden recibir avisos, incluido `reportes` y `data_entry`):

```jsx
        <NavLink
          to="/avisos"
          className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          onClick={closeMobileNav}
          title={collapsed ? 'Avisos' : undefined}
        >
          <IcoCampana />
          <span className="nav-item-label">Avisos</span>
          {noLeidas > 0 && <span className="nav-item-badge">{noLeidas}</span>}
        </NavLink>
```

Y el estilo del badge en `frontend/src/app.css`, al lado de `.nav-item` (línea 207):

```css
.nav-item-badge {
  margin-left: auto;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #C46B63;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
.sidebar.collapsed .nav-item-badge { display: none; }
```

- [ ] **Step 5: Verificar el circuito completo en el navegador**

Con dos usuarios: A audita un pago, B lo desaudita. Entrar como A y comprobar:
- El sidebar muestra "Avisos 1".
- `/avisos` lista el aviso en negrita con el link al pago.
- Al hacer click, navega al pago y el contador baja a 0.
- Como B, que desauditó, no aparece ningún aviso.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/notificaciones.js frontend/src/pages/avisos/Avisos.jsx \
        frontend/src/components/Sidebar.jsx frontend/src/App.jsx frontend/src/app.css
git commit -m "feat(avisos): pantalla de avisos y contador en el sidebar"
```

---

## Task 8: Rol `data_entry` (backend + helpers de rol)

**Files:**
- Create: `backend/scripts/crear-rol-data-entry.cjs`
- Modify: `frontend/src/lib/roles.js`
- Modify: `frontend/src/lib/roles.test.js`

**Interfaces:**
- Produces: `ROLES.DATA_ENTRY = 'data_entry'`; `homeDeRol(rol)` → `'/reportes' | '/cargar' | '/dashboard'`.

- [ ] **Step 1: Script de alta del rol en producción**

**Nunca con `seed.js`**, que borra todos los usuarios reales. Crear
`backend/scripts/crear-rol-data-entry.cjs`:

```javascript
// Da de alta el rol `data_entry` y sus permisos. Idempotente: se puede correr
// dos veces sin duplicar nada. NO toca usuarios ni ningun otro rol.
//
// Correr con el proxy de Cloud SQL levantado:
//   node scripts/crear-rol-data-entry.cjs
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

// Solo crear en los modulos de carga; ver en los catalogos que alimentan los
// combos del formulario. Sin `view` en pagos/caja, GET /api/pagos responde 403
// por si solo: la tabla queda inaccesible aunque se fuerce la llamada.
const PERMISOS = {
  pagos:            { can_view: false, can_create: true,  can_edit: false, can_delete: false },
  caja:             { can_view: false, can_create: true,  can_edit: false, can_delete: false },
  caja_movimientos: { can_view: false, can_create: true,  can_edit: false, can_delete: false },
  proveedores:      { can_view: true,  can_create: false, can_edit: false, can_delete: false },
  rubros:           { can_view: true,  can_create: false, can_edit: false, can_delete: false },
  categorias:       { can_view: true,  can_create: false, can_edit: false, can_delete: false },
  metodos_pago:     { can_view: true,  can_create: false, can_edit: false, can_delete: false },
}

async function main() {
  const rol = await db.role.upsert({
    where:  { nombre: 'data_entry' },
    update: {},
    create: { nombre: 'data_entry', descripcion: 'Solo carga de datos: no ve tablas ni reportes' },
  })
  console.log('rol:', rol.id, rol.nombre)

  for (const [modulo, perms] of Object.entries(PERMISOS)) {
    const m = await db.module.findUnique({ where: { nombre: modulo } })
    if (!m) { console.error(`FALTA el modulo ${modulo} — abortando`); process.exit(1) }
    await db.rolePermission.upsert({
      where:  { id_role_id_module: { id_role: rol.id, id_module: m.id } },
      update: perms,
      create: { id_role: rol.id, id_module: m.id, ...perms },
    })
    console.log(`  ${modulo}: ${JSON.stringify(perms)}`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
```

**Antes de correrlo:** verificar que el campo de descripción del modelo `Role` se
llama `descripcion`. Run: `grep -n -A6 "^model Role" backend/prisma/schema.prisma`.
Si no existe, sacarlo del `create`.

- [ ] **Step 2: Correr el script y verificar la matriz**

Run: `cd backend && node scripts/crear-rol-data-entry.cjs`

Después verificar en la base que quedó como se espera:

```sql
SELECT m.nombre, rp.can_view, rp.can_create, rp.can_edit, rp.can_delete
FROM role_permissions rp
JOIN roles r ON r.id = rp.id_role
JOIN modules m ON m.id = rp.id_module
WHERE r.nombre = 'data_entry' ORDER BY m.nombre;
```

Expected: 7 filas, con `can_create` sólo en `pagos`, `caja` y `caja_movimientos`, y
`can_view` sólo en los cuatro catálogos.

- [ ] **Step 3: Escribir los tests de `lib/roles.js` que fallan**

Agregar a `frontend/src/lib/roles.test.js`:

```javascript
import { ROLES, homeDeRol, puedeCrearCajas, puedeOperar, puedeEditar,
         puedeExportar, esRolDc, puedeBorrarPagos, puedeBorrarCajas,
         puedeBorrarMovimientos } from './roles.js'

test('data_entry existe como rol', () => {
  assert.equal(ROLES.DATA_ENTRY, 'data_entry')
})

test('data_entry puede crear cajas: es su tarea', () => {
  assert.equal(puedeCrearCajas(ROLES.DATA_ENTRY), true)
})

test('data_entry no opera, no edita, no exporta, no borra y no es de DC', () => {
  for (const fn of [puedeOperar, puedeEditar, puedeExportar, esRolDc,
                    puedeBorrarPagos, puedeBorrarCajas, puedeBorrarMovimientos]) {
    assert.equal(fn(ROLES.DATA_ENTRY), false, fn.name)
  }
})

test('cada rol restringido tiene su propio home', () => {
  assert.equal(homeDeRol('reportes'), '/reportes')
  assert.equal(homeDeRol(ROLES.DATA_ENTRY), '/cargar')
  assert.equal(homeDeRol(ROLES.ADMIN), '/dashboard')
  assert.equal(homeDeRol(ROLES.CAJERO), '/dashboard')
  assert.equal(homeDeRol(undefined), '/dashboard')
})
```

- [ ] **Step 4: Correr y verificar que falla**

Run: `cd frontend && node --test src/lib/roles.test.js`
Expected: FAIL — `homeDeRol is not a function` y `ROLES.DATA_ENTRY` undefined.

- [ ] **Step 5: Implementar en `lib/roles.js`**

```javascript
export const ROLES = {
  SUPER:      'super_admin',
  DCSMART:    'dcsmart',
  ADMIN:      'admin',
  EXTERNO:    'externo',
  CAJERO:     'cajero',
  DATA_ENTRY: 'data_entry',
}
```

`data_entry` **no** entra en `ROLES_OPERATIVOS` ni en `ROLES_TODOS`: esas listas
significan "opera la app" y él sólo carga. Como `puedeCrearCajas` se apoyaba en
`ROLES_TODOS`, se le agrega su propia lista para no ensanchar el significado de
`ROLES_TODOS`:

```javascript
// Crear cajas lo puede hacer el cajero (es su tarea) y data_entry (es su unica
// tarea). No se ensancha ROLES_TODOS, que significa "todos los que operan".
export const ROLES_CREAN_CAJAS = [...ROLES_TODOS, ROLES.DATA_ENTRY]
export const puedeCrearCajas = (rol) => incluye(ROLES_CREAN_CAJAS, rol)
```

Y el home por rol, que reemplaza el `/reportes` hardcodeado de `ProtectedRoute`:

```javascript
// A donde va cada rol cuando entra, o cuando intenta una ruta que no le
// corresponde. Los roles restringidos a una sola pantalla tienen la suya; el
// resto va al dashboard.
//
// Antes esto era un <Navigate to="/reportes"> hardcodeado dentro de
// ProtectedRoute, que con un segundo rol restringido dejaba de servir.
const HOME_POR_ROL = {
  reportes:   '/reportes',
  data_entry: '/cargar',
}
export const HOME_POR_DEFECTO = '/dashboard'
export function homeDeRol(rol) {
  return HOME_POR_ROL[rol] ?? HOME_POR_DEFECTO
}

// Roles que NO operan la app: se los saca de las pantallas operativas.
export const ROLES_RESTRINGIDOS = Object.keys(HOME_POR_ROL)
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `cd frontend && node --test src/lib/roles.test.js`
Expected: PASS, incluyendo los tests que ya existían.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/crear-rol-data-entry.cjs frontend/src/lib/roles.js \
        frontend/src/lib/roles.test.js
git commit -m "feat(roles): rol data_entry y home por rol en vez del redirect hardcodeado"
```

---

## Task 9: Pantallas de carga para Data Entry (frontend)

**Files:**
- Create: `frontend/src/pages/cajas/CajaCreatePanel.jsx` (extraído de `CajaList.jsx:1269-1612`)
- Create: `frontend/src/pages/cargar/Cargar.jsx`
- Create: `frontend/src/pages/cajas/CajaNueva.jsx`
- Delete: `frontend/src/pages/cajas/CajaForm.jsx` (código muerto, no ruteado)
- Modify: `frontend/src/pages/cajas/CajaList.jsx` (importar el panel extraído)
- Modify: `frontend/src/components/ProtectedRoute.jsx` (usar `homeDeRol`)
- Modify: `frontend/src/App.jsx` (rutas `/cargar` y `/cajas/nueva`)
- Modify: `frontend/src/components/Sidebar.jsx` (nav de `data_entry`)

**Interfaces:**
- Consumes: `homeDeRol`, `ROLES`, `ROLES_RESTRINGIDOS` de la Task 8.
- Produces: `<CajaCreatePanel activeLocal locales onCreated onClose />` — misma interfaz que tenía dentro de `CajaList`, sin cambios.

- [ ] **Step 1: Extraer `CajaCreatePanel` a su propio archivo**

Mover el bloque `function CajaCreatePanel({ activeLocal, locales, onCreated, onClose })`
(líneas 1269-1612 de `CajaList.jsx`) a `frontend/src/pages/cajas/CajaCreatePanel.jsx`,
con `export default`. Llevarse también los helpers que usa y que hoy viven arriba en
`CajaList.jsx`: los íconos (`IcoPlus`, `IcoTrash`…) y `fmt$`/`fmt$2` si los usa.

Verificar qué usa exactamente antes de mover:
Run: `sed -n '1269,1612p' frontend/src/pages/cajas/CajaList.jsx | grep -oE "\b(Ico[A-Za-z]+|fmt\$2?|toUtcIsoFromDateTimeLocal|detallesApi|movimientosApi|metodosApi|cajasApi)\b" | sort -u`

Los helpers que queden usados por las **dos** pantallas se dejan en un módulo
compartido en vez de duplicarse.

En `CajaList.jsx`, reemplazar el bloque por el import:

```jsx
import CajaCreatePanel from './CajaCreatePanel.jsx'
```

- [ ] **Step 2: Verificar que el alta desde el listado sigue funcionando**

Esto es un refactor sin cambio de comportamiento, así que hay que probarlo antes de
seguir. Levantar el frontend, entrar a Cajas como `super_admin`, "Nueva Caja", cargar
una caja con **al menos un detalle y un movimiento** y guardar.

Expected: la caja se crea con su detalle y su movimiento, igual que antes.

- [ ] **Step 3: Commit del refactor, solo**

Se commitea aparte del feature: si algo se rompe, el `git bisect` señala el refactor
y no la pantalla nueva.

```bash
git add frontend/src/pages/cajas/CajaCreatePanel.jsx frontend/src/pages/cajas/CajaList.jsx
git commit -m "refactor(cajas): extraer el panel de alta de CajaList a su propio archivo"
```

- [ ] **Step 4: Borrar el `CajaForm.jsx` muerto**

Confirmar primero que nadie lo importa:
Run: `grep -rn "CajaForm" frontend/src/`
Expected: sólo el propio archivo. Si aparece algún import, parar y revisar.

```bash
git rm frontend/src/pages/cajas/CajaForm.jsx
git commit -m "chore(cajas): borrar CajaForm, codigo muerto que no estaba ruteado"
```

- [ ] **Step 5: Crear la página de alta de caja standalone**

Crear `frontend/src/pages/cajas/CajaNueva.jsx`. Envuelve el panel extraído en una
página propia, para los roles que no pueden entrar al listado:

```jsx
import { useNavigate } from 'react-router-dom'
import CajaCreatePanel from './CajaCreatePanel.jsx'
import { useAppStore } from '../../store/appStore.js'
import { useAuthStore } from '../../store/authStore.js'
import { homeDeRol } from '../../lib/roles.js'

// Alta de caja como pantalla completa. Existe porque data_entry no puede entrar a
// /cajas (no tiene `view` en el modulo), asi que no puede abrir el panel de alta
// desde el listado como el resto de los roles.
export default function CajaNueva() {
  const navigate = useNavigate()
  const { activeApp, activeLocal } = useAppStore()
  const role = useAppStore((s) => s.activeApp?.role)
  const locales = activeApp?.locales ?? []

  // Al terminar, cada rol vuelve a donde puede: data_entry a /cargar, el resto
  // al detalle de la caja que acaba de crear.
  const volver = (nuevoId) => {
    const home = homeDeRol(role)
    if (home !== '/dashboard') navigate(home)
    else if (nuevoId) navigate(`/cajas/${nuevoId}`)
    else navigate('/cajas')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Nueva caja</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <CajaCreatePanel
            activeLocal={activeLocal}
            locales={locales}
            onCreated={volver}
            onClose={() => volver(null)}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Crear la landing de carga**

Crear `frontend/src/pages/cargar/Cargar.jsx`:

```jsx
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore.js'

// Home del rol data_entry: las dos unicas cosas que puede hacer, en grande.
export default function Cargar() {
  const navigate = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)

  const OPCIONES = [
    { to: '/pagos/nuevo',  titulo: 'Cargar pago',  sub: 'Factura, comprobante o nota de crédito' },
    { to: '/cajas/nueva',  titulo: 'Cargar caja',  sub: 'Turno con sus detalles y movimientos' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Cargar</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {OPCIONES.map(o => (
          <button
            key={o.to}
            className="card"
            style={{ textAlign: 'left', cursor: 'pointer', border: 'none' }}
            onClick={() => navigate(o.to)}
          >
            <div className="card-body">
              <div className="card-title" style={{ fontSize: 18 }}>{o.titulo}</div>
              <div className="rep-kpi-sub">{o.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Usar `homeDeRol` en `ProtectedRoute`**

Reemplazar `frontend/src/components/ProtectedRoute.jsx` por:

```jsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useAppStore } from '../store/appStore.js'
import { homeDeRol, HOME_POR_DEFECTO } from '../lib/roles.js'

// `roles`: si se pasa, solo esos roles (de la app activa) pueden entrar.
// `globalRoles`: independiente de la app activa -- evalúa TODAS las
//   asignaciones de rol del usuario (para zonas globales como Admin).
// `reportesOnly`: exige que la app activa tenga el permiso real de Reportes
//   (activeApp.can_reportes), no un nombre de rol.
// `excludeRoles`: si el rol de la app activa está en esta lista, se lo manda a
//   SU home en vez de dejarlo pasar (ver homeDeRol en lib/roles.js). Antes esto
//   redirigía a /reportes fijo, que con un segundo rol restringido no servía.
export default function ProtectedRoute({
  children, requireApp = true, roles = null,
  globalRoles = null, reportesOnly = false, excludeRoles = null
}) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const activeApp = useAppStore((s) => s.activeApp)

  if (!token) return <Navigate to="/login" replace />

  if (globalRoles) {
    const userRoleNames = (user?.user_app_roles ?? []).map(r => r.role?.nombre)
    if (!globalRoles.some(r => userRoleNames.includes(r))) return <Navigate to={HOME_POR_DEFECTO} replace />
    return children
  }

  if (requireApp && !activeApp) return <Navigate to="/select-app" replace />
  if (excludeRoles && excludeRoles.includes(activeApp?.role)) {
    return <Navigate to={homeDeRol(activeApp?.role)} replace />
  }
  if (reportesOnly && !activeApp?.can_reportes) return <Navigate to={HOME_POR_DEFECTO} replace />
  if (roles && !roles.includes(activeApp?.role)) return <Navigate to={homeDeRol(activeApp?.role)} replace />
  return children
}
```

- [ ] **Step 8: Rutas y guards en `App.jsx`**

`OperativeGuard` tiene que excluir a los dos roles restringidos, no sólo a `reportes`:

```jsx
import { ROLES, ROLES_DC, ROLES_OPERATIVOS, ROLES_RESTRINGIDOS } from './lib/roles.js'

// Dashboard/Cajas/Pagos: requieren app activa, pero los roles restringidos a una
// sola pantalla (reportes, data_entry) no entran -- se los manda a su home.
function OperativeGuard({ children }) {
  return <ProtectedRoute requireApp excludeRoles={ROLES_RESTRINGIDOS}>{children}</ProtectedRoute>
}
```

Agregar los lazy imports y las rutas:

```jsx
const Cargar    = lazyWithReload(() => import('./pages/cargar/Cargar.jsx'))
const CajaNueva = lazyWithReload(() => import('./pages/cajas/CajaNueva.jsx'))
```

```jsx
          <Route path="cargar"      element={<Guard roles={[ROLES.DATA_ENTRY]}><Cargar /></Guard>} />
          <Route path="cajas/nueva" element={<Guard roles={[...ROLES_OPERATIVOS, ROLES.CAJERO, ROLES.DATA_ENTRY]}><CajaNueva /></Guard>} />
```

**Ojo con el orden de las rutas:** `cajas/nueva` tiene que ir **antes** de
`cajas/:id`, si no `:id` la captura y se intenta abrir una caja con id "nueva".

Y `pagos/nuevo` (que ya existe en la línea 140) hoy usa `OperativeGuard`, que ahora
excluye a `data_entry`. Cambiarla para que lo deje pasar:

```jsx
          <Route path="pagos/nuevo" element={<Guard roles={[...ROLES_OPERATIVOS, ROLES.CAJERO, ROLES.DATA_ENTRY]}><PagoForm /></Guard>} />
```

- [ ] **Step 9: Nav de `data_entry` en el sidebar**

En `frontend/src/components/Sidebar.jsx`, generalizar el `isReportesOnly` de la
línea 282-290:

```jsx
  const role = activeApp?.role
  const isGlobal = role === 'super_admin' || role === 'dcsmart'

  // Los roles restringidos ven solo su propia navegacion, no el menu operativo.
  const NAV_RESTRINGIDA = {
    reportes:   NAV_MAIN.filter(i => i.key === 'reportes'),
    data_entry: [
      { to: '/cargar',      label: 'Cargar',       Icon: IcoPagos },
      { to: '/pagos/nuevo', label: 'Cargar pago',  Icon: IcoPagos },
      { to: '/cajas/nueva', label: 'Cargar caja',  Icon: IcoCaja },
    ],
  }

  const mainItems = NAV_RESTRINGIDA[role] ?? NAV_MAIN.filter(visibleFor)
```

- [ ] **Step 10: Probar el circuito de Data Entry de punta a punta**

Crear un usuario de prueba con rol `data_entry` en una app con un local, y verificar:

1. Al entrar, cae en `/cargar`.
2. Carga un pago completo y se guarda.
3. Carga una caja con detalle y movimiento, y se guarda.
4. Escribir `/pagos` a mano lo devuelve a `/cargar`.
5. Escribir `/cajas` a mano lo devuelve a `/cargar`.
6. Escribir `/reportes` a mano lo devuelve a `/cargar`.
7. Forzar `GET /api/pagos` con su token responde **403**.
8. El sidebar sólo muestra Avisos y las dos entradas de carga.

- [ ] **Step 11: Verificar que no se rompió ningún otro rol**

Entrar como `super_admin` y como `cajero` y comprobar que Cajas, Pagos y el alta
siguen funcionando igual, y que el rol `reportes` sigue cayendo en `/reportes`.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/cargar/Cargar.jsx frontend/src/pages/cajas/CajaNueva.jsx \
        frontend/src/components/ProtectedRoute.jsx frontend/src/App.jsx \
        frontend/src/components/Sidebar.jsx
git commit -m "feat(roles): pantallas de carga para el perfil data_entry"
```

---

## Cierre

- [ ] **Correr toda la suite del backend**

Run: `cd backend && npm test`
Expected: 0 fallas.

- [ ] **Correr los tests del frontend**

Run: `cd frontend && node --test src/lib/*.test.js`
Expected: 0 fallas.

- [ ] **Revisar el diff completo antes del PR**

Run: `git diff dev...DEV-60 --stat`

Chequear que no entró nada que no sea de estas cuatro tareas, y que ningún archivo
quedó con la codificación de los acentos roseada (pasa si se editó con
`Set-Content` de PowerShell 5.1):

Run: `git diff dev...DEV-60 | grep -c '[ÃÂ]'`
Expected: `0`

- [ ] **No pushear sin permiso**

El PR se abre sólo cuando el usuario lo pide explícitamente. Un merge a `dev`
redeploya el backend de producción.
