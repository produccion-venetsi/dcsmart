# Integración Fudo — diseño

## Contexto

Fudo es el punto de venta de GRIS GRIS. Igual que con TapTap, se quiere que las cajas entren solas a
DCSmart en vez de cargarse a mano. La diferencia de fondo, y lo que define todo este diseño, es que
**Fudo no expone cierres de turno**.

TapTap devuelve el turno ya cerrado y armado (`info.header`, `sales`, `cash`, `fiscal`, `audit`), y el
job lo mapea casi uno a uno. La API pública de Fudo (`v1alpha1`) publica entidades sueltas:

| Existe | No existe |
|---|---|
| `/sales` — ventas, con `payments`, `items`, `discounts`, `commercialDocuments`, `cashRegister` | `/shifts` — no se pueden listar turnos |
| `/payments` — cobros, con método y `paidAt` | `/cash-registers` — no se pueden listar cajas |
| `/expenses` — gastos, con `cashRegister` y `useInCashCount` | ningún endpoint de arqueo, apertura ni cierre |
| `/payment-methods`, `/customers`, `/products`, `/users` | total de items en la paginación |

Hay un `filter[shiftId]` en `/sales`, pero el turno **no es legible desde la venta**: no aparece en
`attributes`, ni en `include`, ni en `fields`. Se puede filtrar por un turno cuyo id ya se conozca,
pero no enumerarlos ni saber a cuál pertenece una venta. Agrupar por turno de Fudo, entonces, no es
viable con la API pública.

**Consecuencia:** el job no trae cajas, las construye agregando ventas de una ventana de tiempo.

## Objetivo

Un Cloud Run Job diario (`fudo-sync`) que arma una `Caja` por local y por día comercial a partir de
las ventas cerradas de Fudo, con sus cobros desagregados por método de pago.

## Decisiones tomadas

1. **Una caja por día comercial**, de 06:00 a 06:00 hora Argentina. Una noche que termina a las 3 AM
   queda en el día que le corresponde. La ventana se dejará configurable por local.
2. **Inicial, retiros y vaciados se cargan a mano.** Fudo no los expone (viven en su arqueo, que la
   API no publica), así que la caja nace con los cobros y el encargado completa el resto desde
   DCSmart. El job nunca pisa esos movimientos (ver *Reproceso*).

## Hallazgos verificados contra la API real

Todo lo que sigue se comprobó con la cuenta de GRIS GRIS, no se dedujo del spec:

1. **Autenticación**: `POST https://auth.fu.do/api` con `{apiKey, apiSecret}` devuelve
   `{token, exp}`. El token dura **24 horas** y `exp` es epoch en segundos. Hay que cachearlo y
   renovarlo; TapTap no tenía autenticación.
2. **El `kind` de los métodos de pago no existe.** El spec promete
   `kind: CASH | CREDIT-CARD | …`, pero la API devuelve solo `name`, `active`, `code`, `position`.
   El mapeo va por **`code`**: `cash`, `house-account`, `credit-card`, `payway`, `mp`, `mp qr`.
3. **`fields[payment]` no está permitido en `/sales`** (400), solo en `/payments`. Por eso desde la
   venta se usa `amount`, que además es lo correcto para la caja: `receivedAmount` incluiría el
   vuelto.
4. **El `total` de la venta ya viene neto de descuentos.** Comprobado: una venta con 10% off
   devuelve `total: 64.800` sobre $72.000. No hay que restar descuentos aparte.
5. **`filter[saleState]=in.(CLOSED)` funciona** y deja afuera las anuladas, que de todos modos
   vienen en $0 y sin cobros.
6. **`/expenses` filtra por fecha sin hora**: `filter[date]=and(gte.2026-08-13,lte.2026-08-14)`.
   Con hora devuelve 400. Es el único filtro del sistema que no acepta timestamp.
7. **La paginación no informa el total.** Se piden páginas hasta que una devuelva menos ítems que
   `page[size]`.
8. **No hay total fiscal.** Se deduce sumando las ventas que tienen `commercialDocuments` asociados.

## Config de locales

Son 14 locales en Fudo, cada uno con su propia cuenta y por lo tanto **su propio par de
credenciales** — la API no tiene concepto de sucursal, así que no hay forma de leer varios locales
con un solo token. Mismo patrón que `LOCALES_TAPTAP`: un array en el repo, con la ventana horaria
por local y el nombre del secret del que sale cada credencial.

| Local en Fudo | `id_local` en DCSmart | App |
|---|---|---|
| Acuario | `BUFGOGEG` | GRUPO ACUARIO |
| Ada | `sdfghjfvfd` | GRUPO ADA |
| Loreto | `dadea6bc-c4ef-43fd-8a2b-94268bcd96d7` | LORETO |
| Condarco | `ltuibyvty` | GRUPO CONDARCO |
| Gris Gris | `LTRXNBIR` | GRUPO GRIS GRIS |
| 878 | `6cda1b45` (878COOP) | GRUPO 878 |
| Ti Amo | `546ergft` | GRUPO PRITANY |
| Sorellina | `546eFGHF` | GRUPO PRITANY |
| Caprichito | **falta** — no existe en la base | — |
| TITA - LA ISLA | `O12UIE2U` (TITA) | GRUPO TITA |
| TITA - CHACARITA | `OR8GO56T` (TITA-CH) | GRUPO TITA |
| victor | `WMIJEWEX` | GRUPO 3MONOS |
| La Uat | `XPKLVUKP` | GRUPO 3MONOS |
| Tres Monos | `QHOBGKXW` | GRUPO 3MONOS |

```js
const LOCALES_FUDO = [
  { nombre: 'GRIS GRIS', id_local: 'LTRXNBIR', horaCorte: 6, secret: 'fudo-grisgris' },
  // …
]
```

Pendientes de la config: las credenciales de los 13 locales que faltan (hoy solo se tiene la de
GRIS GRIS), el alta de Caprichito, y confirmar que el 878 de la lista es `878COOP` y no `878 BAR`
(que está inactivo).

Las credenciales van como secrets de Cloud Run, nunca en el repo.

## Cambios de schema (Prisma)

1. `Origin.FFUDO` **ya existe** en el enum — no hay que tocar la base para eso.
2. Modelo nuevo `FudoSyncRun`, calcado de `TapTapSyncRun` (id, started_at, finished_at, resultado
   JSON por local, ok). Tabla nueva: no toca ninguna existente ni afecta a `dcsmart-analisis`.

No se agrega `origin` a `CajaMovimiento`: la separación entre lo que escribe el job y lo que carga
la gente se resuelve por tipo de movimiento (ver *Reproceso*).

## Mapeo de datos

### `Caja` (una fila por local y día comercial)

| Campo | Origen |
|---|---|
| `id_externo` | la fecha del día comercial (`2026-08-13`) — clave natural junto a `id_local` + `origin` |
| `fecha_inicio` / `fecha_cierre` | los bordes de la ventana (06:00 y 06:00 del día siguiente) |
| `cajero` | `closedBy` de las ventas: el usuario que cerró más ventas del día |
| `total` | suma de `total` de las ventas cerradas (ya neto de descuentos) |
| `efectivo` | suma de los cobros con `code = cash` |
| `fiscal` | suma de los totales de las ventas que tienen documento comercial |
| `comensales` | suma de `people` |
| `tickets` | cantidad de ventas cerradas |
| `origin` | `FFUDO` |
| `nro_turno` / `tipo_turno` | `null` — Fudo no tiene turnos |
| `observaciones` | día comercial sincronizado y, si hubo, cuántas ventas anuladas se excluyeron |

### `CajaMovimiento`

Un movimiento `COBRO` por método de pago, con `cantidad` = cuántos cobros de ese método.

| `code` de Fudo | `MetodoPago` de DCSmart |
|---|---|
| `cash` | Efectivo |
| `mp` | Mercado Pago |
| `mp qr` | Mercado Pago QR |
| `credit-card` | Credito |
| `debit-card` | Debito |
| `payway` | PayWay |
| `house-account` | *(no genera movimiento — ver abajo)* |

Todos existen ya en `metodos_pago`: el job **no crea métodos nuevos**. Si aparece un `code` sin
equivalente, la corrida de ese local falla con un error explícito en vez de crear un duplicado —
que es lo que ensució la tabla con TapTap.

`house-account` (Cta. Cte.) **no es plata que entra a la caja**: es una venta anotada en la cuenta
corriente del cliente. No genera `CajaMovimiento`; va como `CajaDetalle`.

Los gastos de `/expenses` con `useInCashCount` generarían movimientos `GASTO`, pero GRIS GRIS no
carga ninguno (0 en los últimos 90 días). Se implementa igual, porque no cuesta y otro local puede
usarlo.

### `CajaDetalle`

**Siempre se crean**, aunque den 0, igual que TapTap, y con los mismos nombres que ya usa GRIS GRIS
para que las columnas sean comparables entre locales:

| Detalle | Origen |
|---|---|
| Salon | ventas con `saleType = EAT-IN` |
| Mostrador | ventas con `saleType = TAKEAWAY` |
| Delivery | ventas con `saleType = DELIVERY` |
| Online | reservado — Fudo no tiene un equivalente directo, queda en 0 |
| Tarjetas | cobros con `code` de tarjeta (`credit-card`, `debit-card`, `payway`) |
| Cta Cte | cobros con `code = house-account` |

## Reproceso e idempotencia

A diferencia de TapTap (que avanza por `maxid` y nunca vuelve atrás), un día ya cerrado en Fudo
puede recibir una venta tardía o una anulación. Por eso:

- El job re-procesa **los últimos 3 días** en cada corrida, además del día que cerró.
- Al re-escribir una caja existente reemplaza **únicamente** los movimientos `COBRO` y `GASTO` y los
  detalles. **Nunca toca `INICIAL`, `RETIRO` ni `VACIADO`**, que son los que cargó el encargado.
  Ese es el contrato que hace convivir el job con la carga manual.
- La caja se identifica por `id_local` + `id_externo` + `origin = FFUDO`.
- Un local que falla no bloquea a los demás (`try/catch` por local), igual que TapTap.

## Infraestructura

- `backend/src/jobs/fudo-sync.js` (orquestación) con la lógica pura separada en
  `backend/src/jobs/fudo/`: `auth.js` (token con caché y renovación), `api.js` (paginación y
  filtros), `mapping.js` (transformación pura, testeable con fixtures sin red ni Prisma).
- `backend/Dockerfile.fudo-sync` e `infra/02_fudo_sync_deploy.sh`, espejo de los de TapTap.
- Cloud Scheduler diario a las 7am (America/Argentina/Buenos Aires), una hora después del corte de
  las 06:00 para que el día esté cerrado.
- Mismo `DATABASE_URL` / Cloud SQL que el backend.

## Validación previa

Se compararon 17 días (25/07 al 13/08) entre lo que devuelve Fudo y lo que GRIS GRIS carga a mano:

- **16 de 17 días coinciden al peso** en el total de la caja.
- El efectivo coincide exacto en 11 de 17.
- El único total que no cierra es el 13/08 (−$14.000, −0,4%), y esa caja manual está a medio cargar
  (tickets y comensales en cero).
- Las diferencias de efectivo (26/07 −$8.880, 28/07 +$109.500, 29/07 +$100, 30/07 −$54.580,
  31/07 −$13.300, 13/08 −$3.000) son de reparto entre métodos, no de ventas: el total de esos días
  cierra exacto. Quedan para revisar con el local.

Esto valida la ventana de 06:00 a 06:00 y el mapeo de `total`, `efectivo` y `tickets`.

Las 17 cajas se cargaron en `testing-local-01` (app TESTING) con `origin = FFUDO` para inspección
visual. Son de prueba: hay que borrarlas antes de dar por cerrada la integración.

## Fuera de alcance

- **Backfill histórico.** Se sincroniza desde la fecha de arranque hacia adelante. Traer meses
  anteriores es una migración aparte (aunque el job, siendo por rango de fechas, la haría fácil).
- **Cuenta corriente real.** Los cobros `house-account` quedan como detalle plano, sin vincularse al
  `Cliente` de DCSmart vía `CajaDetalle.id_cliente`. Se puede enganchar después, cuando se vea con
  qué frecuencia lo usa el local.
- **Ítems y productos.** No se importa el detalle de qué se vendió; la caja es agregada.
- **Propinas y costos de servicio.** GRIS GRIS no los usa (0 en todo el período medido). Si otro
  local los usa, hay que decidir si suman a la caja o van como detalle.
