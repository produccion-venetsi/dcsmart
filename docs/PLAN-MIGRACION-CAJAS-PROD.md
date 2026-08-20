# Plan de migración a producción — Modelo simple de cajas (DEV-82)

**Estado: BORRADOR para revisar. Nada de esto se ejecuta sin el OK explícito del usuario.**
Fecha del relevamiento: 2026-08-19, medido contra producción en solo lectura.

---

## 0. Qué se migra

Dos cosas distintas, con órdenes distintos:

1. **Código** (front + back de DEV-82): detalle/alta/edición a pantalla completa,
   panel de cuadre, tres estados de descuadre, informativos agrupados, cuadre
   leído SIEMPRE desde detalles (con fallback a movimientos).
2. **Datos**: los 32.391 movimientos de prod se convierten a detalles de tres
   tipos (`cobro` / `gasto` / `informativo`) y se borran; los 41.206 detalles
   existentes se normalizan a tipo explícito. **El método de pago deja de ser
   una FK: pasa a ser el NOMBRE del detalle** ("MP Point", "Vaciado · Crédito").

## 1. Estado real medido (2026-08-19)

- **La base de prod se llama `postgres`** en la instancia `dcsmart-mvp-insta`
  (¡no `dcsmart`! — esa base no existe; todo script debe apuntar a `postgres`).
- **14.809 cajas**: 8.822 DCSMART · 5.935 TAPTAP · 52 FFUDO. 68 locales.
- **32.391 movimientos** a convertir:
  | tipo | n | conversión |
  |---|---|---|
  | COBRO | 14.460 | `cobro` con nombre = método (efectivo → `informativo`, ya está en el campo Efectivo) |
  | VACIADO | 11.902 | `informativo` "Vaciado · \<método\>" |
  | RETIRO | 3.390 | `informativo` "Retiro" |
  | GASTO | 1.763 | `gasto` "Gasto · \<método\>" |
  | INICIAL | 696 | `informativo` "Fondo inicial" |
  | INGRESO | 180 | `informativo` "Ingreso" |
- **32.126 movimientos tienen `cantidad`** (el groupCount de TapTap). Se preserva
  en la conversión — ya está contemplado en el convertidor y verificado en test.
- **41.206 detalles existentes**: 29.472 sin tipo explícito (a normalizar por
  `rolDeDetalle`), 11.734 ya lo tienen (el backend actual ya escribe explícito).

### Rarezas detectadas (revisar ANTES de convertir)

- **61 movimientos sin método** → el nombre saldría genérico ("Cobro", "Gasto",
  "Vaciado"). Listarlos y revisarlos a mano.
- **8 movimientos en $0** y **2.569 detalles en $0** (mayormente "Descuentos: 0"
  de TapTap — probablemente OK, pero muestrear).
- **14 detalles con monto negativo** — violan la regla "montos siempre positivos,
  dirección aparte". Listarlos y corregirlos a mano antes.
- **3 detalles sin nombre ni tipo de catálogo** → quedarían "Sin nombre".
- **Catálogo con clasificaciones legacy**: ingreso (54), otro (35), canal (7),
  medio_pago (4), egreso (2). `rolDeDetalle` las mapea, pero el caso Don Aldo
  ("Tarjetas" medio_pago que es resumen) ya mostró que hay excepciones.

### Fudo y el nro de turno (lo de 3MONOS) — RESUELTO 2026-08-19

No era solo 3MONOS: ninguna caja FFUDO de prod tenía `nro_turno` (las 52, en
los 11 locales). La nota de DEV-69 ("la API no expone turnos") estaba MAL:
**sí existe `/cash-counts`** — el cierre de caja que el local ve en su sistema,
con id secuencial (ese ES el número), `openedAt`/`closedAt` reales, fondo
inicial (`init`) y hasta el arqueo contado (`realLeftover`). Verificado contra
3MONOS: un cierre por día comercial, ids #4134…#4145 correlativos.

Hecho:
- `fudo-sync.js` ahora pide los cash-counts del día y asigna `nro_turno` (y las
  horas REALES de apertura/cierre cuando el día tiene un solo cierre, en vez de
  la ventana artificial 06:00→06:00).
- `scripts/backfill-turnos-fudo.js` completa las cajas existentes: probado
  contra la copia, 6/6 de 3MONOS matchearon su turno real (#4139–#4144).
- Para el backfill en prod hacen falta las credenciales de los 10 locales
  (están en las tarjetas de Trello); el script saltea los que no tengan las
  suyas en el entorno, así que se puede correr por tandas.
- Idea a futuro (NO en esta migración): usar `realLeftover` como arqueo real y
  `init` como fondo inicial — hoy Fudo no aporta ninguno de los dos.

### Esquema

Único diff relevante en las tablas de caja: a prod le falta
**`caja_detalles.cantidad`** (ya aplicada en `dcsmart_test`). Es una columna
aditiva y opcional: el backend viejo no la pide, agregarla no rompe nada.
Antes de tocar: correr `prisma migrate diff --from-schema-datasource
--to-schema-datamodel` contra prod y LEER el SQL completo (puede haber más diffs
de otras branches mergeadas a dev).

## 2. Trabajo de código previo — HECHO 2026-08-19

1. ✅ **Los syncs escriben detalles.** `taptap-sync.js` y `fudo-sync.js` ya no
   crean `CajaMovimiento`: los cobros/gastos nacen como detalles de tres tipos,
   con la MISMA regla compartida (`src/lib/movimientoADetalle.js`, con tests).
   El método de pago es el nombre del detalle; la cantidad (groupCount) viaja
   igual. Los detalles fijos (canales, Tarjetas, Cta Cte) llevan tipo explícito
   tomado de la clasificación del catálogo — así una reclasificación del
   catálogo ("Metodo desconocido" es informativo en ACUARIO) moldea los syncs
   futuros.
2. ✅ **Convertidor idempotente por caja.** Cada caja se convierte en SU
   transacción (crear detalles + borrar movimientos + validar que las sumas
   cierren); re-correr retoma por las que aún tienen movimientos. Con guard:
   producción exige `--prod` + `CONFIRMO_PROD=si` + URL a la base `postgres`.
3. ✅ **Fudo nro_turno** (sección anterior): sync + backfill.
4. **El reproceso de Fudo (ventana de 4 días) convierte solo**: al actualizar
   una caja vieja borra sus movimientos COBRO/GASTO legacy y escribe detalles.
5. (Ya estaba en DEV-82: el cuadre tiene fallback a movimientos, así que el
   código nuevo funciona con datos sin convertir. El código viejo NO funciona
   con datos convertidos — esto fija el orden del despliegue.)

### Pendiente de código

- **Nada bloqueante.** Queda la verificación del ensayo general (sección 4).

## 3. Backup y rollback

**Antes de tocar nada:**

1. **Snapshot Cloud SQL on-demand** de `dcsmart-mvp-insta` (consola web o
   `gcloud sql backups create` — OJO: el token de gcloud local está vencido,
   hace falta `gcloud auth login` o hacerlo desde la consola).
2. **pg_dump completo** de la base `postgres` vía el proxy local
   (pg_dump 17 está instalado): `pg_dump -h localhost -p 5433 -d postgres -Fc -f
   backup-prod-AAAAMMDD.dump`. Guardar fuera del repo.
3. **Dump quirúrgico** solo de las tablas afectadas (`cajas`, `caja_movimientos`,
   `caja_detalles`) en formato SQL plano — para poder restaurar SOLO eso sin
   pisar pagos/usuarios/todo lo demás que siguió moviéndose.
4. **Probar el restore**: levantar el dump completo en el Postgres local (5432)
   y verificar conteos. Un backup no probado no es un backup.

**Rollback si algo sale mal después de convertir:**
- La conversión NO toca la tabla `cajas` (solo `caja_detalles` y
  `caja_movimientos`). El rollback quirúrgico es: `TRUNCATE caja_detalles,
  caja_movimientos` + restore de esas dos tablas desde el dump del paso 3 +
  redeploy del código anterior. Perdería solo los detalles cargados a mano entre
  la migración y el rollback (ventana corta si se verifica enseguida).
- El snapshot de Cloud SQL queda como último recurso (restaura TODO, incluidas
  otras bases de la instancia — solo ante catástrofe).

## 4. Ensayo general (obligatorio antes de prod)

Correr el pipeline COMPLETO contra una copia FULL de prod (no la muestra de
20/local):

1. Copia completa de `postgres` → `dcsmart_test` (o al Postgres local).
2. Aplicar columna `cantidad`.
3. Convertidor prod (nuevo, por caja) → medir tiempos.
4. Calibración greedy en dry-run → **revisar la lista de reclasificaciones a
   mano local por local** (regla del usuario: la clasificación no se
   autocompleta; acá se aplica masivamente, así que la lista se aprueba antes).
5. Extraer descuentos TapTap de observaciones.
6. **Validaciones** (sección 6) + comparar % de cuadre antes/después por local.

## 5. Orden del día D (una vez aprobado el ensayo)

El orden lo fija esta asimetría: **el código nuevo tolera datos viejos
(fallback), el código viejo NO tolera datos nuevos** (el cuadre TAPTAP
desplegado lee movimientos; si se borran antes del deploy, todas las cajas
TapTap descuadran en vivo). Además `dev` y `master` despliegan AL MISMO backend.

1. **Backups** (sección 3) — la mañana del día D, después del sync de las 5am.
2. **Columna `cantidad` en prod** (migrate diff leído + aplicado). Aditiva: el
   backend viejo sigue andando igual.
3. **Deploy del código**: PR DEV-82 → `dev` (verificar base branch del PR).
   Eso ya redeploya el backend de prod. `master` (frontend live) cuando el
   usuario lo diga, con confirmación explícita.
4. **Verificar la app con datos SIN convertir** (el fallback hace que todo se
   vea igual que hoy): listado, detalle, alta, edición, cuadres de una muestra
   TapTap/Fudo/manual, arqueo de un local.
5. **Conversión de datos** (convertidor prod, por caja). Estimado ~15k
   transacciones chicas; se puede pausar/reanudar por la idempotencia.
6. **Validaciones** (sección 6). Si algo no da: STOP, evaluar rollback.
7. **Calibración**: aplicar la lista YA aprobada en el ensayo (no re-decidir en
   caliente).
8. **Descuentos TapTap** desde observaciones.
9. **Backfill Fudo nro_turno** (según lo decidido).
10. **Verificación final**: % cuadre por local vs. baseline del ensayo; revisar
    a la mañana siguiente que el sync de las 5am haya escrito DETALLES.

## 6. Validaciones post-conversión (van en el script, no a ojo)

- Por cada caja: `∑ monto(movimientos que tenía)` == `∑ monto(detalles nuevos)`.
  Se captura el "antes" en una tabla temporal previa a convertir.
- `COUNT(movimientos convertidos)` == `COUNT(detalles creados)`.
- Cantidades preservadas: 32.126 detalles nuevos con `cantidad NOT NULL`.
- `caja_movimientos` queda en 0 filas.
- Ningún detalle con tipo fuera de {cobro, gasto, informativo}.
- Distribución de estados de cuadre (correcto/menor/incorrecto) por local ==
  la del ensayo (misma foto de datos ⇒ mismos números; cualquier diferencia es
  un bug del pipeline).

## 7. Después (no bloquea, no olvidar)

- `dcsmart-analisis` (reportería del jefe) lee esta misma base SIN contrato:
  si consulta `caja_movimientos`, se queda sin datos el día D. **Avisar y
  revisar ese repo antes.**
- Rutas legacy `caja_movimientos` del backend: quedan por compatibilidad,
  decidir cuándo se retiran.
- AppSheet DC-CAJA MAYOR y la API pública TapTap: verificar que nada de eso
  escriba movimientos.
- Los ~40 "falta plata sin firma" y locales pendientes de revisión fina
  (ATTE, Latino Paseo, Don Aldo) siguen su curso aparte.
