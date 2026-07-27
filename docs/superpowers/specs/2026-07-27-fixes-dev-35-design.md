# Fixes DEV-35 — diseño

## Contexto

Lista de 7 arreglos/mejoras pedidos por el usuario el 2026-07-27, más un octavo que salió al
explorar el repo (el suite de tests del backend no corría). Son ítems **independientes entre sí**:
cada uno se puede implementar, revisar y commitear por separado, y ninguno bloquea a otro.

Seis son solo código. Uno (observaciones en Arqueo) necesita agregar una columna a la base de
producción. Uno (estado CAJA) cambia el comportamiento de un endpoint que mueve plata y es el de
mayor riesgo del lote.

Branch: `DEV-35` desde `dev`.

### Estado del repo relevante para estos cambios

- `EstadoOp` ya incluye `CAJA` (`schema.prisma`, enum `EstadoOp`: `CAJA, CUENTA_CTE, MP_PDP, PDP`).
  No hay que crear el estado, solo definir cuándo se asigna.
- `Pago.observaciones` ya existe. Los ítems 1 y 2 no tocan el esquema.
- `GET /pagos/summary` (`pagos.js:296`) ya devuelve `total_importe` y `por_impuesto` agrupado por
  tipo. El ítem 7 no necesita cálculos nuevos en el backend, solo llevarlos al archivo.
- `model Arqueo` **no** tiene campo `observaciones` — es el único ítem que toca el esquema.
- **No existe `backend/prisma/migrations/`**: el proyecto se maneja con `prisma db push`, sin
  historial de migraciones versionadas. Esto condiciona cómo se aplica el ítem 6 (ver ahí).
- `npm test` en el backend corría **0 tests**: el script apuntaba a `src/test/**/*.test.js`, carpeta
  que no existe, y los dos archivos de test reales (`src/jobs/taptap/*.test.js`) quedaban fuera del
  glob. Ver ítem 8.

---

## 1. Filtro por observaciones en pagos

Campo de filtro **dedicado**, separado del buscador general.

El buscador general (`q` en `buildPagosWhere`, `pagos.js:176-190`) ya cubre OP, proveedor, razón
social, cuenta, rubro y categoría, pero no observaciones. Se elige un filtro aparte y no sumar
`observaciones` a ese `OR` para que una búsqueda por observaciones no traiga además coincidencias
por nombre de proveedor.

**Backend** — nuevo parámetro `observaciones` en `buildPagosWhere`:

```js
...(observaciones ? { observaciones: { contains: observaciones, mode: 'insensitive' } } : {}),
```

Va en el `where` compartido, así que se aplica a la tabla, al resumen y al export sin duplicar la
lógica. Hay **2 llamadores** de `buildPagosWhere` y ambos necesitan el parámetro nuevo en su
destructuring: `GET /` (`:246`) y `GET /summary` (`:307`). El export no es un tercer llamador — usa
`GET /` con `limit=0`.

**Frontend** (`PagoList.jsx`) — entrada en `FILTER_INIT` (`:818`), control de texto en el panel de
filtros, y línea en `buildParams` (`:895`).

Comportamiento esperado: los pagos con `observaciones` en `NULL` o vacío no matchean cuando el
filtro tiene texto.

## 2. Columna Observaciones después de Método

Columna nueva entre **Método** y **Cashflow**, truncada, con el texto completo en tooltip nativo.

**Frontend** (`PagoList.jsx`):

- `<th style={{ minWidth: 140 }}>Observaciones</th>` después del `<th>Método</th>` (`:1519`).
- `<td>` correspondiente después del de método (`:1582`), con
  `maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` y
  `title={p.observaciones || ''}`.
- **`colCount` (`:1206`) está hardcodeado en `18` y pasa a `19`.** Lo usan el skeleton de carga
  (`:1535`) y el `colSpan` del estado vacío (`:1542`); si no se actualiza, ambos quedan desalineados.

Se usa el `title` nativo y no un tooltip propio porque es el patrón que ya usa la app (columnas Aud,
E/I, Foto) y no agrega componentes ni casos de borde de posicionamiento.

**Coherencia con el export:** `PAGO_CSV_COLUMNS` (`:168`) ya tiene `Observaciones`, pero como última
columna, y su comentario declara que son "las mismas columnas que se ven en la tabla". Al mover la
columna en la tabla hay que moverla también en el export —de última a inmediatamente después de
`Método`— o ese comentario deja de ser cierto. Se hace junto con el ítem 7, que ya toca esa lista.

## 3. Estado OP "CAJA" al pagar fuera de PDP

Un pago que se paga **fuera del flujo PDP** queda en `estado_op = CAJA`. Los que vienen del flujo PDP
conservan su estado.

| `estado_op` al momento de pagar | Resultado |
|---|---|
| `CUENTA_CTE` | `CAJA` |
| `NULL` | `CAJA` |
| `PDP` | `PDP` (sin cambio) |
| `MP_PDP` | `MP_PDP` (sin cambio) |

**Backend** — `POST /pagar` (`pagos.js:846`) hoy es un solo `updateMany` que escribe `pagado`,
`fecha_pago` e `id_metodo` y no toca `estado_op`. Pasa a dos `updateMany` dentro de una transacción:

1. Pagos con `estado_op` en `['PDP', 'MP_PDP']` → solo `pagado`, `fecha_pago`, `id_metodo`.
2. El resto → lo mismo + `estado_op: 'CAJA'`.

**Cuidado con los `NULL`:** en Prisma un `notIn: ['PDP', 'MP_PDP']` **no matchea `NULL`**. La segunda
condición tiene que ser un `OR` explícito:

```js
OR: [
  { estado_op: { notIn: ['PDP', 'MP_PDP'] } },
  { estado_op: null }
]
```

Sin eso, los pagos sin estado —justo el caso que el requerimiento quiere cubrir— quedarían afuera.

Ambos `updateMany` mantienen el filtro `id_local: { in: request.allowedLocalIds }` que ya tiene el
endpoint.

**Respuesta del endpoint:** devuelve qué ids quedaron en `CAJA`, para que el frontend no tenga que
duplicar la regla en el patch optimista.

**Frontend** — afecta los dos lugares que llaman a `pagosApi.pagar`:

- `PagoList.jsx:309` (pago individual desde el panel de detalle). `handlePagar` (`:303`) hace
  `onPatch` con `{ pagado, fecha_pago, id_metodo }` y debe incluir el `estado_op` que devuelva el
  endpoint.
- `PdpDashboard.jsx:594` (pago en lote).

**Tests** (ver ítem 8): las cuatro ramas de la tabla de arriba, con foco en el caso `NULL`.

## 4. Actividad: datos de la OP y buscador de OPs

### 4a. Nombres reales en vez de UUIDs

`snapshotRows` (`ActivityLog.jsx:17-38`) muestra los IDs crudos del snapshot: `s.id_proveedor`,
`s.id_rubcat`, `s.id_tipo`, `s.id_metodo`, `s.id_local`. En pantalla se ve un UUID donde debería
decir el nombre.

**Los resuelve el backend** (`activity_log.js`, `GET /`): con los eventos de la página ya cargados,
junta los IDs únicos de todos los snapshots y hace **4 consultas batch** —proveedores, rubcat (con
rubro y categoría), métodos de pago y locales— y devuelve el snapshot enriquecido. Son 4 queries
fijas por página, no un lookup por fila.

Se elige el backend y no mapear en el frontend para tener un solo lugar donde se decide qué mostrar
cuando un ID ya no resuelve, y para no sumarle 4 requests a una pantalla que hoy hace 2.

Reglas de presentación:

- **ID que ya no existe** (el registro fue borrado después del evento): se muestra `— (no existe)`.
  El snapshot es un registro histórico; es mejor decir que el dato ya no está que mostrar un UUID.
- **`id_tipo` es un enum `TipoPago`, no un ID.** `DC_1` → `DC (1)` y `DC_2` → `DC (2)`, que es cómo
  se los nombra en los comprobantes. El resto (`A`, `B`, `C`, `CM`, `DDJJ`, `M`, `NCA`, `NDA`, `STK`)
  se muestra tal cual.
- `id_rubcat` se muestra como `Rubro / Categoría`, igual que en la tabla de pagos.

### 4b. Buscador de OPs

Input que filtra **por número de OP, del lado del servidor**.

Acepta `101` y `OP-101`: se normaliza con el mismo criterio que ya usa pagos
(`qStr.replace(/^op[-\s]*/i, '')`, `pagos.js:179`).

`ActivityLog.snapshot` es una columna `Json` (jsonb en Postgres), así que el filtro va sobre
`snapshot->>'nro_ord'`. Primera opción, filtro nativo de Prisma por `path`:

```js
snapshot: { path: ['nro_ord'], equals: nroOrd }
```

**Fallback si ese filtro no se comporta como se espera:** `$queryRaw` con
`(snapshot->>'nro_ord')::int = $1`. Hay que verificarlo contra la base real al implementar, no darlo
por hecho.

Si lo tipeado no es un número, no se filtra y se avisa en pantalla, en vez de devolver una lista
vacía sin explicación.

El filtro se suma a los que ya existen (desde, hasta, usuario, acción) y se combina con ellos.

## 5. Buscador en Rubro / Categoría / RubCat

Buscador en **las tres pestañas**, filtrando en memoria (los datos ya se cargan completos en
`RubCat.jsx`, `load()` en `:111`).

- **Rubros y Categorías:** el input va dentro de `NombreSection` (`:30`), que es el componente
  compartido por ambas pestañas — se escribe una vez y cubre las dos. Filtra por nombre.
- **RubCat:** input propio en esa pestaña, que filtra simultáneamente por rubro, categoría, cuenta,
  tipo, costo y clasificación.
- El contador del encabezado pasa a mostrar `(N de M)` cuando hay filtro activo, para que no parezca
  que se borraron registros.

## 6. Observaciones en Arqueo

Único ítem que toca el esquema de la base.

**Esquema** — en `model Arqueo`:

```prisma
observaciones String?
```

Nullable: los arqueos existentes quedan con `NULL` y nada se rompe.

**Backend** (`arqueo.js`): `POST /` (`:183`) y `PUT /:id` (`:234`) aceptan y guardan `observaciones`.
No participa de ningún cálculo — no afecta `total`, `ingresos`, `gastos` ni `comprobacion`. `GET /` y
`GET /:id` ya devuelven el objeto completo, así que no requieren cambios.

**Frontend** (`ArqueoList.jsx`) — 4 lugares:

- form de creación (`:89-103`)
- form de edición (`:207-221`)
- detalle del drawer (`:329`)
- tabla (`:446`), truncado con tooltip como en el ítem 2

**Migración — paso separado, con aprobación explícita del usuario.**

Como no hay `prisma/migrations/`, el proyecto viene usando `prisma db push`. **No se usa `db push`
acá**: sincroniza el esquema entero, así que arrastraría el drift pendiente de `MultiMoneda` que
CLAUDE.md marca como no aplicado, más cualquier otra diferencia acumulada — mucho más de lo que este
cambio pide.

Se aplica en su lugar:

```sql
ALTER TABLE arqueos ADD COLUMN observaciones text;
```

Aditivo, nullable, reversible y sin tocar otras tablas. Procedimiento:

1. Mostrar al usuario el `prisma migrate diff` contra la base real, para que vea qué drift hay
   acumulado antes de tocar nada.
2. Esperar confirmación explícita.
3. Aplicar el `ALTER TABLE` por el Cloud SQL Proxy.
4. `prisma generate` local.

No impacta a `dcsmart-analisis`: agregar una columna nunca invalida un `SELECT` existente.

## 7. Exportación con impuestos y totales

El `.xlsx` pasa a tener una columna por tipo de impuesto presente y una fila `TOTAL` al final.

Formato:

```
OP     | Proveedor | Neto    | IVA21  | RETENCION | Importe
OP-101 | Coca-Cola | 1000.00 | 210.00 |      0.00 | 1210.00
OP-102 | Molinos   | 2000.00 | 420.00 |    -50.00 | 2370.00
TOTAL  |           | 3000.00 | 630.00 |    -50.00 | 3580.00
```

**Backend** — `GET /pagos` **no incluye `impuestos`** en su `include` (`:266-272`), así que hoy el
frontend no tiene los montos para exportar. Se agrega un flag explícito `include_impuestos=true` que
solo usa el export (junto con `limit=0`), en vez de sumar `impuestos` al include siempre: la tabla
carga 100 filas por página y no los necesita.

**Frontend** (`PagoList.jsx`, `exportCsv` en `:916`):

- Columnas de impuesto **dinámicas**: solo los tipos presentes en el conjunto exportado. Se insertan
  entre `Neto` e `Importe`, siguiendo el orden del enum `TipoImpuesto`
  (`IVA21, IVA27, IVA10, RETENCION, PERCEPCION`) para que el archivo sea estable entre exports.
- Un pago sin un impuesto dado va en `0`, no vacío, para que la columna sume bien en Excel.
- **Los totales se suman en el frontend sobre las filas ya descargadas**, no con `GET /summary`. Así
  el total del archivo siempre cuadra con las filas del archivo; con `/summary` podrían diferir si se
  crea un pago entre las dos requests.
- Se totalizan las columnas numéricas (`Neto`, `Importe` y cada impuesto). Las de texto y fecha
  quedan vacías en la fila `TOTAL`.

**Limitación conocida:** `downloadExcel` (`lib/excel.js:18`) usa la versión community de SheetJS, que
no aplica estilos de celda. La fila de totales **no puede ir en negrita** — se distingue por la
etiqueta `TOTAL` en la primera columna. Cambiar de librería por esto no se justifica.

`downloadExcel` recibe un parámetro opcional para la fila de totales, manteniendo su firma actual
compatible con los otros exports que ya la usan.

## 8. Glob de tests del backend

En `backend/package.json`:

```json
"test": "node --test"
```

Node 22 descubre los `*.test.js` recursivamente y excluye `node_modules` por su cuenta, sin
necesidad de glob explícito. Verificado: **8 tests, 8 pasan** (los dos archivos de
`src/jobs/taptap/`, que antes quedaban fuera).

Con el suite corriendo se agregan tests para la regla del ítem 3, que es lógica de cuatro ramas
sobre un endpoint que mueve plata.

---

## Riesgos y orden sugerido

**El ítem 3 es el más riesgoso:** cambia `/pagar` para todos los pagos, y como `dev` y `master`
comparten el mismo servicio de Cloud Run, un merge a `dev` lo pone en producción (ver CLAUDE.md,
sección Deploy). Se prueba local contra la base antes de mergear.

**El ítem 6 queda al final**, porque su paso de migración necesita aprobación explícita y no debe
bloquear a los otros seis.

Orden sugerido, de menor a mayor riesgo:

1. Ítem 8 (glob de tests) — habilita la red de seguridad para el resto
2. Ítem 5 (buscador RubCat) — frontend puro, sin backend
3. Ítem 2 (columna observaciones) — frontend puro
4. Ítem 1 (filtro observaciones) — backend + frontend, aditivo
5. Ítem 4 (Actividad) — backend + frontend, aditivo
6. Ítem 7 (exportación) — backend + frontend, aditivo
7. Ítem 3 (estado CAJA) — cambia comportamiento existente, con tests primero
8. Ítem 6 (Arqueo) — requiere migración aprobada

Un commit por ítem, según la convención del proyecto.
