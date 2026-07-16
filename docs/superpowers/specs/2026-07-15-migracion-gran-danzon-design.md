# Migración Gran Danzón — diseño

## Contexto

El local Gran Danzón (`Local.id = d77f7288`, nombre `GRAN-DANZON`) ya existe en la base, dentro de
una app (`de65e614-453c-4fa1-9fbd-9757ee1daa68`) que comparte con BASA, OHNOLULU y otros locales ya
migrados. Gran Danzón en sí no tiene `Pago` ni `Caja` cargados todavía (tabla rasa para este local).

Se recibieron 2 CSV en `migraciones/migraciones-nuevas/gran-danzon/`:
- `GRDANZON-PAGOS - Copia de CAJA_MIGRADOS.csv` (907 filas de datos)
- `GRDANZON-PAGOS - Copia de PAGOS_MIGRADOS.csv` (16467 filas de datos)

El formato es similar al usado en la migración previa de ATTE/GRIS GRIS (`import-nuevos-locales.cjs`),
pero con diferencias reales encontradas al inspeccionar los datos (ver abajo), que requieren un script
nuevo (no una reutilización directa) y varias decisiones de resolución de catálogo.

## Objetivo

Un script `import-gran-danzon.cjs` (adaptado de `import-nuevos-locales.cjs`) que migre cajas y pagos
de Gran Danzón a la base real, resolviendo proveedores/rubcat contra el catálogo ya existente (migrado
originalmente con 878) con la mayor cobertura posible, dejando pendiente documentado lo que no se
pueda resolver con confianza.

## Proveedores (columna `RAZON SOCIAL` de pagos)

La columna mezcla 3 casos reales (confirmado por inspección directa del CSV y la base):
- Códigos que ya son `Proveedor.id` (ej. `TSGWWOJO`).
- Nombres reales que matchean `Proveedor.nombre` normalizado pero no ningún id (ej. `Baraghost` → ya
  existe con id `2967fa89`).
- Nombres que no matchean nombre ni id, pero sí matchean `Proveedor.razon_social` normalizado (ej.
  `FEMSA` → proveedor ya migrado con nombre "Coca Cola", `razon_social = "FEMSA"`, id `2d007639`).

**Resolución en cascada** (mismo criterio de normalización — minúsculas/sin acentos/sin separadores —
que ya se usa para métodos de pago):
1. Match directo por `Proveedor.id`.
2. Match normalizado por `Proveedor.nombre`.
3. Match normalizado por `Proveedor.razon_social`.
4. Si nada matchea: se crea un `Proveedor` nuevo con ese nombre (sin CUIT/rubcat/etc., solo el nombre),
   igual que se generan usuarios históricos en las migraciones previas.

## RubCat (columna `RUBRO/CATEGORIA` de pagos)

223 valores distintos: 173 con formato código `RC-XXXX` (15711 filas), 50 con formato texto libre tipo
`Fijos / Variables_Baraghost` o `Impositivos_Autónomos` (756 filas).

De los 173 códigos: 143 matchean directo contra `RubCat.id`, 20 más se resuelven vía
`.remap-rubcat.json` (el remap de duplicados calculado durante la migración de 878). **Es seguro
reusar ese remap acá**: Gran Danzón nunca usa el código "ganador" del par en su propia data, así que
no genera un conflicto nuevo (la advertencia de `REGLAS_MIGRACION.md` aplica cuando un local usa
predominantemente el código que ahí quedó "perdedor", que no es el caso).

Quedan sin resolver: 10 códigos `RC-XXXX` inexistentes en cualquier lado, y las 50 etiquetas de texto
libre (756 filas en total). **Se cargan igual, con `id_rubcat: null`**, documentado en
`PENDIENTES_GRAN_DANZON.md` para completar a mano después — no se intenta crear `RubCat` nuevos
automáticamente (requeriría inventar rubro/categoría/cuenta/tipo/costo/clasificación sin tener esos
datos reales en el CSV).

## Enum `TipoPago`

La columna `TIPO` trae `FF` (3 pagos) y `NCB` (8 pagos), valores nuevos con datos reales — se agregan
al enum (mismo criterio que `X`/`ND` en la migración de ATTE/GRIS GRIS). También aparecen `c` y `cm`
en minúscula (1 fila cada uno) — se normalizan a mayúscula (`C`/`CM`) antes de validar contra el enum,
sin necesidad de agregar variantes nuevas.

## Métodos de pago (columna `Forma de pago`)

Sin cambios de código: `CHEQUE AL DÍA`, `CHEQUE DIFERIDO` y `MORATORIA` no matchean ningún método
existente (ni por el diccionario `METODO_MAP` ni por nombre normalizado) y se crean automáticamente
por el mecanismo ya existente (mismo que creó "E-Cheque" en la migración anterior). `CHEQUE` sí
matchea directo (normalizado) contra el método "Cheque" ya existente.

## Cajas

Mapeo de columnas (nombres de columna distintos a ATTE/GRIS GRIS):

| Campo DCSmart | Columna CSV |
|---|---|
| `fiscal` | `Fiscal` |
| `total` | `TotalVentas` |
| `efectivo` | `Efectivo` |
| `comensales` | `Cubiertos` |
| `tickets` | (no existe columna, siempre `null`) |
| `observaciones` | `Notas/obs` + `Dif de caja` (si != 0, igual que 878/ATTE) |
| `tipo_turno` | `Turno` (valores reales: `Noche`, `Evento`, `Dia` → mapean directo con `TIPO_TURNO_MAP` existente, `Dia`→`TARDE`) |
| `id_local` | siempre `d77f7288` (columna `Local` confirmada de un solo valor) |

Auditoría de caja: no hay columna `AuditUser` en este CSV (a diferencia de ATTE/GRIS GRIS), así que
los `Audit` de cajas auditadas (`Auditada = True`) quedan con `id_user: null`, `fecha: fecha_inicio`.

Columnas de detalle (`CajaDetalle`, clasificación `ingreso` — este local no tiene ninguna columna tipo
"Gastos"): `LAPOS/PAYWAY`, `MP LINK`, `MP QR`, `MP POINT DEBITO`, `MP POINT CREDITO`,
`MP INTEGRACION APP`, `PIX`, `RAPPI`, `PEDIDOS YA`, `TRANSFERENCIA`. La columna `Mov Stock` se
descarta (1 sola fila con dato distinto de cero, de 907 — no justifica un `DetalleTipo` nuevo).

## Pagos

Nombres de columna a corregir respecto al script de ATTE/GRIS GRIS (mismo header base, pero con
variaciones reales en este CSV): `PDF` (no `Pdf`), `App_ID` (no `IdLocal`).

`CMV_IMPORTE` (costo de mercadería vendida) trae datos reales en 883 pagos, pero no existe ningún
campo equivalente en el modelo `Pago`. Se anexa como texto a `Pago.observaciones` (ej. `"CMV: 1234.56"`),
mismo patrón ya usado para `Dif de caja` en cajas.

Columnas sin dato real o sin mapeo claro, se ignoran: `Exento` (siempre 0), `UserAud`/`Aud_ARCA`/
`Imprime` (siempre vacías en este CSV), `lastupdate`/`Timestamp`/`Orden` (metadata de la planilla,
sin campo equivalente en el modelo).

## Fuera de alcance

- Resolución manual de los 10 códigos RubCat sin match y las 50 etiquetas de texto libre — queda en
  `PENDIENTES_GRAN_DANZON.md` para completar después.
- Cualquier reconciliación de `CMV_IMPORTE` como dato estructurado (por ahora solo texto informativo).
