# Integración TapTap unificada — diseño

## Contexto

Hoy existen ~11-14 locales usando TapTap (Tognis Cafe, Tognis Pizza, Mafia, Latino Tacuari 84/185,
La Fuerza, Latino Paseo Colón, Lucero, Raix, Roma, Farmacia Lezama, Picsa, Bebop, Casona Azopardo),
cada uno con su **propio Google Apps Script** (copiado y ligeramente distinto entre sí) que:

1. Corre con un trigger diario a las 5am.
2. Llama a `https://function-dc-getturnos-.../` con `?groupid=X&maxid=Y` para traer los turnos
   nuevos desde el último sincronizado.
3. Escribe los datos en dos pestañas de un Google Sheet (`TURNOS_CAJA`, `DETALLE_MOVIMIENTOS`),
   fuera de DCSMART.

Se revisaron dos variantes reales (Tognis: itera todas las cajas del turno pero con IDs random;
Aldos/Picsa/Bebop: solo procesa `cash[0]`, pero con IDs determinísticos que evitan duplicar al
re-correr — buena idea a rescatar). Se armó también un ejemplo real de respuesta de la API
(Latino Paseo Colón) que reveló que cada caja trae **15 arrays de movimiento** (`inicial`, `final`,
`ajustes`, `diffs`, `retiros`, `alivios`, `vaciados`, `transfers`, `ingresos`, `egresos`,
`proveedores`, `empleados`, `clientes`, `cobranzas`, `gastos`), de los cuales los scripts viejos
solo usaban 5-7.

## Objetivo

Un solo script (`taptap-sync`) que reemplaza todos los Apps Script, corriendo como **Cloud Run Job +
Cloud Scheduler** (5am diario, igual horario que hoy), escribiendo directo en Postgres vía Prisma —
sin Google Sheets de por medio.

## Config de locales

Array hardcodeado en el repo (`groupId → id_local` de DCSMART), fácil de extender:

```js
const LOCALES_TAPTAP = [
  { groupId: 'tognicafetap',     id_local: '6cda1b66' },  // TOGNIS-CAFE
  { groupId: 'tognipizza',       id_local: '6cda1b67' },  // TOGNIS-PIZZA
  { groupId: 'mafia',            id_local: 'HFIUOE76' },  // MAFIA
  { groupId: 'latinotacuari84',  id_local: 'KHBJON43545' },
  { groupId: 'latinotacuari185', id_local: 'KHBJON435' },
  { groupId: 'lafuerza',         id_local: 'd77f7289' },
  { groupId: 'latinopaseocolon', id_local: 'FGHDVTV' },
  { groupId: 'clublucero',       id_local: 'J45J3822' },
  { groupId: 'raix',             id_local: '5401bfa7' },
  { groupId: 'romadelabasto',    id_local: 'e5b7eb5f' },
  { groupId: 'farmacialezama',   id_local: 'e1bea49b-d306-47f2-bcc8-1ffd9cda41d9' },
  { groupId: 'picsa',            id_local: 'KSYVVXZN' },
  { groupId: 'bebop',            id_local: 'UYPLAVIG' },
  { groupId: 'casonaazopardo',   id_local: 'POIUYTR' },
]
```

## Cambios de schema (Prisma)

1. `Caja.id_externo String?` — guarda `turno.id` (numérico de TapTap). Permite calcular el máximo
   turno sincronizado por local con una query (`MAX(id_externo) WHERE id_local=? AND origin='TAPTAP'`)
   en vez de leer una hoja de cálculo, y sirve de clave natural de idempotencia: si ya existe una
   `Caja` con ese `id_local` + `id_externo`, se saltea el turno completo (no se tocan sus movimientos
   ni detalles).
2. `TipoMovimiento`: agregar `EGRESO` (hoy solo tiene INICIAL/INGRESO/GASTO/COBRO/RETIRO/VACIADO).
   Actualizar también `SIGN_BY_TIPO` en `CajaList.jsx` (frontend) para que reste del balance
   (`EGRESO: -1`), igual que GASTO/RETIRO/VACIADO.

## Mapeo de datos

### `Caja` (una fila por turno)

| Campo | Origen |
|---|---|
| `id_externo` | `turno.id` |
| `nro_turno` | `header.secuenciador` |
| `fecha_inicio` / `fecha_cierre` | `header.desde` / `header.hasta` |
| `cajero` | `header.autor` |
| `total` | `sales.totalmonto` |
| `efectivo` | `sales.cobrosefectivomonto` |
| `fiscal` | `fiscal.totalmonto` |
| `comensales` | `sales.ventassaloncantidad` |
| `origin` | `TAPTAP` |
| `id_local` | resuelto por config |
| `observaciones` | `header.note` + `fiscal.nofiscal` + `audit.descuentos/contraordenes/recargos` (solo si no son 0, mismo criterio que "Dif de caja" en 878) |

### `CajaMovimiento` (por cada caja dentro de `info.cash[]`, TODAS las cajas del turno)

| TapTap (`cash[i].*`) | `tipo` | Notas |
|---|---|---|
| `inicial[]` | INICIAL | |
| `cobranzas[]` | COBRO | |
| `gastos[]` | GASTO | |
| `retiros[]` | RETIRO | monto viene negativo en el JSON, se guarda `Math.abs` |
| `vaciados[]` | VACIADO | ídem, negativo en el JSON |
| `ingresos[]` | INGRESO | |
| `egresos[]` | EGRESO *(nuevo)* | |

`id_metodo`: se resuelve `item.monedaname` (Efectivo, MP Point, PedidosYa, Rappi, Tarjeta,
MercadoPago, Transfer, etc.) contra `MetodoPago` existente con matching normalizado
(minúsculas/sin acentos, mismo criterio que se usó para ATTE/GRIS GRIS), creando los que falten.
`cantidad` = `item.groupCount`.

`final[]` es una foto del saldo final (no un movimiento) — no se persiste como `CajaMovimiento`,
se ignora (o se usa solo para logging/validación si hace falta más adelante).

### `CajaDetalle` (catálogo `DetalleTipo` por app)

**Siempre se crean** (aunque sean 0, para comparar turno a turno):

| Campo (`sales.*`) | `DetalleTipo.nombre` |
|---|---|
| `ventasdeliverymonto` | Delivery |
| `ventastakeawaymonto` | Takeaway |
| `ventassalonmonto` | Salón |
| `ventaswebmonto` | Web |
| `cobrostarjetasmonto` | Tarjetas |
| `cobrosctactemonto` | Cta Cte |

**Se crean solo si tienen datos** (nada de filas vacías):

- `sales.abiertasmonto` → "Mesas Abiertas"
- `sales.cobrarmonto` → "A Cobrar"
- `ajustes[]`, `diffs[]`, `alivios[]`, `transfers[]`, `proveedores[]`, `empleados[]`, `clientes[]`
  (por caja, si el array no está vacío) → informativos, no participan del balance de
  `CajaMovimiento`. Nombre compuesto `"{tipo} · {detalle} · {nombre caja}"` para trazabilidad.

## Idempotencia y logging

- Antes de procesar un turno: `SELECT 1 FROM cajas WHERE id_local=? AND id_externo=?` — si existe,
  se saltea completo (turno + movimientos + detalles se crean atómicamente juntos, nunca a medias).
- `maxId` por local = `MAX(id_externo)` en vez de leer una hoja.
- Se reemplaza `Logger.log` (que se pierde) por una tabla nueva `TapTapSyncRun` (id, started_at,
  finished_at, resultado por local en JSON: turnos nuevos, errores) — separada de `Audit` (que es
  para auditoría de pagos/cajas individuales, no para corridas de un job) — para poder revisar el
  resultado de cada corrida sin entrar a Cloud Logging.
- Un local que falla (error de red, API caída, etc.) no bloquea a los demás — mismo criterio que
  los scripts viejos (`try/catch` por local dentro del loop).

## Infraestructura

- Nuevo Cloud Run Job `taptap-sync` (imagen propia, Dockerfile simple con `node` + Prisma Client
  generado — mismo patrón que `dcsmart-analisis/etl`).
- Cloud Scheduler dispara el Job una vez al día a las 5am (America/Argentina/Buenos Aires).
- Usa el mismo `DATABASE_URL`/Cloud SQL que el backend de gestión (misma instancia, mismo schema).

## Fuera de alcance de esta primera versión

- Backfill histórico completo (se sincroniza desde el `maxid` actual hacia adelante, no se
  re-importan turnos viejos que ya estén en las hojas de cálculo — eso sería una migración de datos
  aparte, similar a ATTE/GRIS GRIS, si se decide más adelante).
- Reconciliación fina de `proveedores`/`empleados`/`clientes` (quedan como detalle informativo
  plano por ahora, sin vincular a `Proveedor`/`User` reales de DCSMART).
