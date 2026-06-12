# Migración de cajas históricas — `migracion_cajas.sql`

Carga las cajas históricas exportadas de `CAJAS_MIX.xlsx` (10 locales, una pestaña
por local) a las tablas `cajas` y `caja_detalles` de DCSmart.

- **105 cajas** y **353 detalles** en total.
- Envuelto en `BEGIN; ... COMMIT;`. IDs generados (`uuid4`), FK `caja_detalles.id_caja`
  ya enlazadas a la caja correspondiente.
- `id_local` referencia `locales.id` **existentes** (el `Idlocal` del Excel coincide
  uno a uno con `locales.id`).

## Mapeo de locales

| Hoja | id_local | Local (DB) | id_app | Familia | origin |
|---|---|---|---|---|---|
| TIAMO | `546ergft` | TI AMO | `4cac67f8…` | A | DCSMART |
| GRISGRIS | `LTRXNBIR` | GRIS GRIS | `5e601e7b…` | A | DCSMART |
| CAPRICHITO | `54676ergft` | CAPRICCHIO | `4cac67f8…` | A | DCSMART |
| SORELLINA | `546eFGHF` | SORELLINA | `4cac67f8…` | A | DCSMART |
| CONDARCO | `ltuibyvty` | CONDARCO | `38989f4a…` | A | DCSMART |
| ACUARIO | `BUFGOGEG` | ACUARIO | `aaf7583b…` | A | DCSMART |
| ADA | `sdfghjfvfd` | ADA | `ae3e76bb…` | A | DCSMART |
| ATTE | `kjhggtrer` | ATTE | `f08e97f9…` | A | DCSMART |
| LUCERO | `J45J3822` | LUCERO | `527b644d…` | B | TAPTAP |
| MAFIA | `HFIUOE76` | MAFIA | `3dc9836c…` | B | TAPTAP |

## Dos familias de planilla

**Familia A — cierre manual (AppSheet/DCSmart):** TIAMO, GRISGRIS, CAPRICHITO,
SORELLINA, CONDARCO, ACUARIO, ADA, ATTE. Tienen sólo `Fecha` (sin hora) + `Turno`
(Día/Noche) y una tira variable de columnas de medios de pago/conceptos.

**Familia B — POS externo (TapTap):** LUCERO, MAFIA. Traen `Inicio`/`Cierre`
(datetimes reales), `Turno #`, `Autor`, desglose por canal y ajustes.
Se detecta automáticamente por la presencia de las columnas `Inicio` + `Cierre`.

## Mapeo de columnas → `cajas`

| Campo `cajas` | Familia A | Familia B |
|---|---|---|
| `fecha_inicio` | `Fecha` (a las 00:00) | `Inicio` (datetime real) |
| `fecha_cierre` | `NULL` | `Cierre` (datetime real) |
| `nro_turno` | `'999'` (fijo) | `Turno #` |
| `cajero` | `Nombre` | `Autor` |
| `total` | `Venta Bruta` / `Total Ventas` | `Total` |
| `efectivo` | `Cash` / `Efectivo` | `Total efectivo` |
| `fiscal` | `Importe Z` | `Ventas fiscal` |
| `comensales` | `Cubiertos` / `Comensales` | `Comensales` |
| `tickets` | `Ordenes` | — (no hay) |
| `foto_url` | `FOTO CIERRE` | `Foto` |
| `observaciones` | `Notas/obs` + tags | `Notas admin` + tags |
| `origin` | `DCSMART` | `TAPTAP` |

**Tags dentro de `observaciones`** (porque `cajas` no tiene esos campos):
`[auditada: SI|NO]`, en Familia A `[turno: Día|Noche]`, en Familia B
`[user_audit: …]`.

## `caja_detalles`

Cada columna monetaria que **no** es encabezado ni derivada, con monto ≠ 0, genera
una fila: `nombre` = nombre exacto de la columna, `monto` = valor parseado,
`tipo = NULL`, `id_tipo = NULL`, `id_metodo = NULL`.

**Columnas descartadas (derivadas / auxiliares):** `Dif de caja`, `Total Digitales`,
`DIF Caja Calculada` / `Dif Calculada`, `Prom/Cub`, `AVION`, `Z - Digitales` /
`TotalZ_Digitales`, `APPS` / `APP`, `Tarjetas`, `Porc_AVION`, `Prom_orden`,
`EFECTIVO TEORICO`, `Related BUZONs`, `Foto Sistema`, `No fiscal`, `Total cobros`,
`PorCobrarTurnoAnterior`, `A cobrar mesa`, `Time`, `last_user`, `Ultima edicion`,
`Audituser`, `nota_tap`, `Detalle movimientos` (ignorado por ahora), `id` externo.

> Verifiqué la aritmética: `Venta Bruta = Cash + medios de pago`, y las descartadas
> son re-cálculos (`AVION = Cash`, `Tarjetas = LAPOS`, `Total Digitales = total − cash`,
> etc.). Por eso no se migran: se recalculan en la app.

### Nombres de detalle presentes (para crear `detalle_tipos`)

Clasificación **sugerida** — usala si decidís poblar `detalle_tipos` / setear `tipo`:

| `nombre` de detalle | categoría sugerida |
|---|---|
| LAPOS/PAYWAY, Tarjeta de debito, Tarjeta de credito, MP POINT DEBITO, MP POINT CREDITO, Mp Point Debito, Mp Point Credito, Total tarjetas | MEDIO_PAGO (tarjetas) |
| MP LINK, MP QR, Mp Qr, MP Prepaga, PREPAGA | MEDIO_PAGO (digital) |
| Transferencia, Transferencias, TRANSFERENCIA | MEDIO_PAGO (transferencia) |
| Rappi, Pedidos Ya, App3, Total web, Total takeaway, Total salon, Mostrador | CANAL |
| Gastos, GASTOS, Descuentos, Contraordenes, Recargos, Contingencias | EGRESO / AJUSTE |

## Reglas de parseo

- Montos en es-AR (`"$ 1.670.200,00"`) y numéricos nativos → `Decimal`.
  (MAFIA viene como texto, LUCERO como número; ambos contemplados.)
- `%` y celdas vacías → `NULL` (no generan detalle).
- Fechas: `datetime` nativo, o strings `d/m/Y`.

## Pendientes para Claude Code

1. **`caja_detalles.tipo` / `id_tipo`:** quedan en `NULL`. Si se confirma el enum
   `tipo_detalle_caja` o se crea la tabla `detalle_tipos` (por app), backfillear con
   la clasificación de arriba (`UPDATE caja_detalles SET …`).
2. **`id_metodo`:** opcionalmente enlazar los detalles de tipo MEDIO_PAGO a
   `metodos_pago` (matching por `nombre`).
3. **`cajas` no tiene `audit`** → el estado auditada está en `observaciones`. Si se
   agrega columna `audit`/`audit_date`/`user_audit` a `cajas`, migrar desde ahí.
4. **`Detalle movimientos` (LUCERO/MAFIA):** son UUIDs de un POS externo, ignorados.
   Cuando exista la integración, reprocesar.
5. **Familia B** usa `Inicio`/`Cierre`/`Turno #` reales. Si se quiere uniformidad con
   Familia A (`nro_turno='999'`, `fecha_cierre=NULL`), ajustar el generador.
6. **Idempotencia:** el script no borra. Para re-correr, truncar primero o filtrar por
   `origin`/`id_local`.

## Cómo correr

```bash
psql "$DATABASE_URL" -f migracion_cajas.sql
# o vía Cloud SQL Auth Proxy
```
