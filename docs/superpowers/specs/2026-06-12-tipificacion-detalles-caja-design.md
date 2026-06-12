# Tipificación y normalización de detalles de caja

**Fecha:** 2026-06-12
**Estado:** Diseño aprobado — pendiente de revisión final

## Contexto

La migración de cajas históricas (`migracion_cajas.sql`) cargó **353 `caja_detalles`** con su
`nombre` tomado crudo del Excel (`MP QR`, `LAPOS/PAYWAY`, `Total salon`, etc.) y con
`id_tipo = NULL` / `tipo = NULL`. Es decir: los detalles existen y funcionan por su texto libre,
pero **no están tipificados** ni vinculados al catálogo `detalle_tipos`.

Además, los nombres vienen **sin normalizar**: hay variantes de casing y plural del mismo concepto
entre locales (`MP QR` vs `Mp Qr`, `Transferencia`/`Transferencias`/`TRANSFERENCIA`,
`Gastos`/`GASTOS`, `MP POINT CREDITO`/`Mp Point Credito`).

Hoy `detalle_tipos` solo contiene 5 tipos genéricos (`Salon`, `Delivery`, `Barra`, `Mostrador`,
`Online`) replicados app-wide en cada app, sin ninguna clasificación.

## Objetivo

1. Introducir una **clasificación** de 4 categorías para los tipos del catálogo.
2. Definir un **catálogo canónico normalizado** a partir de los 29 nombres crudos migrados.
3. **Backfillear** los 353 detalles: vincular `id_tipo`, derivar `tipo`, y normalizar `nombre`.
4. Ajustar backend y frontend para soportar la clasificación de aquí en adelante.

## Modelo de datos

La clasificación vive en el **tipo del catálogo** (`detalle_tipos`), no en cada detalle suelto.
Así, un tipo creado una vez (p. ej. "Salon" = canal) es reutilizable en cualquier caja de
cualquier local de esa app.

### `detalle_tipos` (cambio)
- Nuevo campo `clasificacion String @default("otro")`.
- Valores válidos: `canal` | `medio_pago` | `calculo` | `otro`. Validado en backend
  (no enum de Postgres, para poder sumar categorías a futuro sin migración).
- Alcance sigue siendo **app-wide** (`id_local = NULL`) para todos los tipos del backfill.
  El soporte de tipos acotados a un local ya existe y se conserva.

### `caja_detalles` (sin cambio de estructura)
- El campo `tipo` (ya existente) pasa a ser **copia derivada** de la `clasificacion` del tipo
  elegido. Se completa al asignar un `id_tipo`.

## Catálogo canónico y clasificación

Mapeo `nombre crudo → {canónico, clasificacion}`. Los canónicos nuevos usan tildes correctas.
Los tipos preexistentes se **reusan tal cual** (se les completa `clasificacion`).

### medio_pago
| Nombre(s) crudo(s) | Canónico |
|---|---|
| `MP POINT DEBITO`, `Mp Point Debito` | MP Point Débito |
| `MP POINT CREDITO`, `Mp Point Credito` | MP Point Crédito |
| `MP QR`, `Mp Qr` | MP QR |
| `MP LINK` | MP Link |
| `PREPAGA`, `MP Prepaga` | Prepaga |
| `LAPOS/PAYWAY` | LAPOS/PAYWAY |
| `Tarjeta de credito` | Tarjeta de Crédito |
| `Tarjeta de debito` | Tarjeta de Débito |
| `Transferencia`, `Transferencias`, `TRANSFERENCIA` | Transferencia |

### canal
| Nombre(s) crudo(s) | Canónico |
|---|---|
| `Rappi` | Rappi |
| `Pedidos Ya` | Pedidos Ya |
| `App3` | App3 |
| `Mostrador` | Mostrador *(reusa tipo existente)* |
| `Total salon` | Salon *(reusa tipo existente)* |
| `Total web` | Web *(canal nuevo)* |
| `Total takeaway` | Takeaway *(canal nuevo)* |

### calculo
| Nombre crudo | Canónico |
|---|---|
| `Total tarjetas` | Total Tarjetas |

### otro
| Nombre(s) crudo(s) | Canónico |
|---|---|
| `Gastos`, `GASTOS` | Gastos |
| `Descuentos` | Descuentos |
| `Contraordenes` | Contraórdenes |
| `Contingencias` | Contingencias |

**Preexistentes** (se les setea `clasificacion = canal`): `Salon`, `Delivery`, `Barra`,
`Mostrador`, `Online`. Se mantienen sin tilde (nombres ya establecidos).

Los 2 detalles con `nombre = null` (de la caja de prueba previa a la migración) no se tocan.

## Apps involucradas (alcance del backfill)

Cada canónico se crea/reusa una vez por app donde aparece (catálogo app-wide, `@@unique([nombre, id_app])`):

| App (prefijo) | Locales | Nombres crudos presentes |
|---|---|---|
| `4cac67f8` | TI AMO, CAPRICCHIO, SORELLINA | MP QR, LAPOS/PAYWAY, Tarjeta de credito, Tarjeta de debito, Transferencias, Gastos, Rappi, Pedidos Ya, MP LINK |
| `5e601e7b` | GRIS GRIS | MP POINT DEBITO, MP QR, MP POINT CREDITO, PREPAGA |
| `38989f4a` | CONDARCO | MP POINT DEBITO, MP QR, MP POINT CREDITO, LAPOS/PAYWAY |
| `f08e97f9` | ATTE | MP POINT DEBITO, MP QR, MP POINT CREDITO, App3, Mostrador, TRANSFERENCIA, GASTOS |
| `aaf7583b` | ACUARIO | MP POINT DEBITO, MP QR, MP POINT CREDITO, PREPAGA |
| `ae3e76bb` | ADA | Mp Qr, Transferencia, MP Prepaga, Mp Point Credito, Mp Point Debito |
| `527b644d` | LUCERO | Total salon, Total tarjetas, Descuentos, Contraordenes, Total takeaway, Contingencias |
| `3dc9836c` | MAFIA | Total salon, Total tarjetas, Descuentos, Contraordenes, Total web |

> Estos prefijos se confirman en tiempo de ejecución vía `caja.local.id_app`; el script no
> hardcodea ids de app, los resuelve por la caja de cada detalle.

## Backfill

Script Node con Prisma (no SQL crudo, para reusar el catálogo con seguridad). Idempotente.

Para cada `caja_detalle` con `id_tipo = NULL` y `nombre ≠ null`:
1. Resolver `nombre crudo → {canónico, clasificacion}` desde el mapa.
2. Resolver `id_app` vía `caja.local.id_app`.
3. `upsert` del `detalle_tipo` por `(nombre canónico, id_app)`:
   - si no existe → crear app-wide con su `clasificacion`;
   - si existe → reusar y completar `clasificacion` si está vacía.
4. Actualizar el detalle: `id_tipo = tipo.id`, `tipo = tipo.clasificacion`, `nombre = canónico`.

Adicional: `UPDATE` de `clasificacion = canal` en los 5 tipos genéricos preexistentes.

Si aparece un `nombre` crudo no contemplado en el mapa, el script lo **reporta y omite** (no
inventa clasificación) — log explícito, sin truncar silenciosamente.

## Cambios de código

- **`backend/prisma/schema.prisma`**: `DetalleTipo.clasificacion String @default("otro")` + migración.
- **`backend/src/routes/detalle_tipos.js`**: POST y PUT aceptan y validan `clasificacion`
  ∈ {canal, medio_pago, calculo, otro} (400 si es inválida).
- **`backend/src/routes/caja_detalles.js`**: en POST, si viene `id_tipo`, derivar `tipo` de la
  `clasificacion` del tipo (ignorar `tipo` del body para mantener consistencia).
- **`frontend/src/pages/admin/DetalleTipos.jsx`**: selector de clasificación en el form de
  crear/editar + columna "Clasificación" en la tabla.
- **Frontend del detalle de caja**: al elegir un tipo del catálogo, su clasificación queda
  registrada en el detalle.

## Testing / verificación

- Tras el backfill: 0 detalles migrados con `id_tipo = NULL` (salvo los 2 `null` de prueba);
  todos los `tipo` ∈ las 4 categorías; cada `nombre` ∈ el set canónico.
- Re-correr el script no crea duplicados ni cambia conteos (idempotencia).
- Backend: POST de tipo con `clasificacion` inválida → 400.

## Fuera de alcance (YAGNI)

- Override de clasificación por detalle individual.
- Vincular `id_metodo` (medios de pago) a `metodos_pago` — pendiente separado del README.
- Reprocesar `Detalle movimientos` de LUCERO/MAFIA (UUIDs de POS externo).
