# Arreglos de la reunión con Anaxi — diseño

**Fecha:** 2026-07-31
**Branch:** `DEV-46-arreglos-reunion-anaxi`
**Origen:** reunión del 31/07/2026 10:53 con Anaxi Melgarejo (notas en `arreglos y propuestas/`)
**Validación acordada:** martes 04/08/2026, 12:00-15:00, con Anaxi

## Contexto

Anaxi arma mensualmente los reportes de ventas y el informe financiero (P&L) de
cada local. Hoy consolida datos a mano en Excel y los pasa a Canva/PowerPoint. La
reunión giró sobre reducir ese trabajo manual y corregir números que no le
cuadraban.

De los puntos que salieron, este spec cubre **solo los de la app de gestión**. El
reporte mensual automático vive en `dcsmart-analisis` y queda fuera: se rediseña
cuando Anaxi comparta el archivo con todos los locales, que es su propio próximo
paso. Ojo que la branch `MAIN-03-reporte-ventas-mensuales` de ese repo ya tiene 18
commits sin mergear que cubren parte del pedido (P&L mensual con capa de carga
manual, que responde justo al pedido de "modificaciones manuales que no toquen la
base").

## Alcance

Cinco cambios, en orden de valor para la validación del martes:

1. Deuda que resta los ingresos (bug de número, el más visible)
2. Filtros de fecha múltiples e independientes
3. Cortar la precarga automática de rubro desde el proveedor
4. Reporte de facturas cargadas fuera de término
5. Exportar sin exigir rango de fechas, con tope de cantidad

## 1. Deuda: egresos − ingresos

### Problema

El KPI de deuda del tablero suma todos los pagos impagos sin mirar la dirección
del movimiento, así que las notas de crédito y cualquier otro ingreso impago
**aumentan** la deuda en lugar de reducirla. Anaxi lo detectó al no poder cuadrar
el saldo con proveedores.

### Evidencia

`backend/src/routes/reportes.js:253-257` agrega `pagado: false` sin filtrar por
`ingresa_egreso` ni por tipo. La lógica correcta ya existe 40 líneas más abajo
(`reportes.js:293`, `TIPOS_NO_DEUDA = ['NCA','NCB']`) pero solo se aplica al
desglose de pendientes, no al KPI. Por eso `total_adeudado` no coincide con la
suma de `pendientes_*` del mismo endpoint.

Medido contra producción el 31/07/2026:

| | monto |
|---|---|
| Egresos impagos | 148.883.513,00 |
| Ingresos impagos | 3.570.484,74 |
| KPI actual (suma todo) | 152.453.997,74 |
| Con egresos − ingresos | 145.313.028,26 |

El tablero sobreestima la deuda en **7.140.969,48** — el doble de los ingresos
impagos, porque los suma en vez de restarlos.

### Diseño

La fórmula es **suma de egresos impagos menos suma de ingresos impagos**, usando
`ingresa_egreso` como única fuente de dirección. Sin listas de tipos de
comprobante.

El número se calcula **sobre el conjunto ya filtrado**, no sobre todo el local:
respeta exactamente los mismos filtros que la tabla y que el `total_importe` que
lo acompaña (proveedor, rubro, período, tipo, etc.). Es lo que hace falta para el
caso de Anaxi, que es filtrar por un proveedor y ver cuánto se le debe. Dicho de
otro modo: `total_deuda` es la deuda de lo que hay en pantalla, no la deuda total
de la empresa.

Se eligió así, y no excluyendo `NCA`/`NCB` por tipo, porque la convención del
proyecto es monto siempre positivo con la dirección en un campo aparte —
verificado: **cero** filas con `importe < 0` en las 28.920 de `pagos`. Una nota de
crédito cargada como ingreso resta sola, sin que el código tenga que saber que es
una nota de crédito.

El cálculo va a una función pura en `backend/src/lib/deuda.js` con tests, y la
llaman los dos endpoints. Hoy la lógica está duplicada y descoordinada entre
`reportes.js:253` y `reportes.js:293`, que es exactamente la causa de que el KPI y
su propio desglose no coincidan.

**Dónde aparece:**
- `GET /pagos/summary` (`pagos.js:313`) suma un `total_deuda` al lado del
  `total_importe` que ya devuelve. Es el cuadro resumen de la lista de pagos
  filtrada, que es donde Anaxi filtra por proveedor. Es literalmente lo que pidió:
  "además del total de importe, un campo de total deuda".
- `GET /reportes/pagos` (`reportes.js:217`) corrige `total_adeudado` con la misma
  función.

### Deuda conocida que este cambio NO resuelve

Ocho notas de crédito están cargadas como **egreso** en vez de ingreso (5 `NCA` +
3 `NCB`). De esas, 2 están impagas por **451.238,33**, y con esta fórmula van a
seguir sumando deuda: en la base son indistinguibles de una factura. Se decidió
no corregir el dato ni agregar una excepción por tipo, así que el número queda con
un error conocido de 451.238,33 sobre 145 millones (0,3%).

También hay 1 pago impago de 144.595 con `id_tipo` en `NULL`, y 2 `DC (1)` impagos
cargados como ingreso por 1.789.952,46 que van a restar deuda — revisar con Anaxi
el martes si ese es el comportamiento esperado para ese tipo.

### Aviso a dar

El número del tablero **baja** de 152,4 a 145,3 millones. Hay que decírselo a
Anaxi en el mail para que no lo lea como datos perdidos.

## 2. Filtros de fecha múltiples

### Problema

Hoy se puede filtrar por un solo campo de fecha a la vez: un dropdown "Tipo de
fecha" más un rango `desde`/`hasta`. Anaxi necesita cruzar fecha de factura con
período (y a veces con fecha de creación) para encontrar facturas cargadas fuera
de término, y hoy eso le lleva varias pasadas.

### Diseño

**UI:** filas dinámicas. Cada fila es campo + desde + hasta, con un botón
"+ agregar fecha" y una cruz para quitar. Los rangos se combinan con **AND**, con
un rótulo visible que lo diga.

**Contrato de la API:** tres query params CSV paralelos y posicionales:

```
?campo_fecha=fecha,periodo&desde=2026-07-01,2026-06-01&hasta=2026-07-31,2026-06-30
```

Esta forma se eligió porque es **retrocompatible bit a bit**: un solo valor en
cada param es exactamente el formato actual, así que los links viejos y los
presets guardados siguen funcionando sin migración. Reusa `parseCsvParam`
(`backend/src/lib/queryParams.js`) tal cual, que es la convención que ya usan
`id_tipo`, `id_metodo`, `estado_op` y `tipo_turno`. La alternativa de un param con
separador interno (`?rangos=fecha:2026-07-01:...`) exigía un parser nuevo y rompía
el formato viejo.

**Backend:** el único lugar a tocar es el bloque de fecha de `buildPagosWhere`
(`pagos.js:222-230`), que hoy arma una sola clave top-level `[campoFecha]:
{gte,lte}`. Pasa a armar `AND: [{...}, {...}]` — necesario porque si se eligen dos
rangos sobre el mismo campo las claves colisionarían. El `qFilter` de la búsqueda
por texto ya inyecta un `OR` top-level (`pagos.js:188-197`), y un `AND` hermano no
choca con él.

Cada campo conserva su interpretación de zona horaria: `fecha`, `periodo` y
`cashflow` son días calendario y su rango va en UTC; `fecha_pago` y `created_at`
son instantes reales y van con offset `-03:00`, si no lo cargado de noche
(21-24hs ART) cae en el día UTC siguiente. Ver `CAMPOS_FECHA_INSTANTE`
(`pagos.js:143`).

La construcción del where de fechas se extrae a una función pura en
`backend/src/lib/` con tests, porque hoy `buildPagosWhere` no tiene ninguno.

**Alcance:** solo `buildPagosWhere`, o sea `GET /pagos` (lista y export) y
`GET /pagos/summary`. Son sus únicos dos consumidores. Todo `reportes.js` queda
con el contrato viejo: su UI (`Reportes.jsx`) tiene un único rango compartido
entre las cuatro pestañas, y cambiarlo impactaría cajas, CMV y balance sin que
nadie lo haya pedido.

Nota: los dos handlers destructuran los query params a mano
(`pagos.js:245-252` y `314-318`) y los re-pasan al builder, así que un param
nuevo se agrega en **tres** lugares.

### Compatibilidad de los presets guardados

Los presets viven en `FiltroPreset.filtros`, columna `Json` nativa, y el backend
es passthrough: acepta cualquier objeto y no valida el shape
(`filtro_presets.js:51-56`, con un comentario que dice explícitamente que el shape
es del frontend y va a cambiar). **El backend no necesita ningún cambio.**

El riesgo está en el frontend. `applyPreset` (`PagoList.jsx:1187-1195`) hace un
spread ciego del objeto guardado, así que un preset viejo con
`{campo_fecha, desde, hasta}` no rompe, pero deja esas claves como zombies en el
estado. Y eso tiene tres consecuencias concretas:

- `activeFilterCount` (`PagoList.jsx:1122`) contaría `desde`/`hasta` zombies e
  inflaría el badge de filtros activos sin que filtren nada.
- El gate del export (`:1377`) y el del cuadro resumen (`:1001`, `:1395`) leerían
  los zombies y se habilitarían con un filtro que ya no aplica.

Se sigue el patrón de compatibilidad que el repo ya usa para los multi-valor: una
función pura `normalizarRangos(guardado)` en `frontend/src/lib/filtros.js`, al
lado de `normalizarMulti`, que acepta la unión de los formatos históricos y
devuelve el canónico. Se la llama **explícitamente después** del spread en
`applyPreset` para que el spread no gane, y a diferencia de los multi-valor —
donde la clave coincide — acá hay que **borrar** `campo_fecha`, `desde` y `hasta`
del objeto resultante, o el problema de las claves zombie queda.

Cero migración de datos: el formato viejo solo se lee, siempre se escribe el
nuevo. Igual que `normalizarMulti` (`filtros.js:13-29`).

## 3. Cortar la precarga de rubro desde el proveedor

### Problema

Al elegir un proveedor, el formulario de pago autocompleta su rubro/categoría.
Anaxi pidió eliminarlo: arrastra clasificaciones equivocadas y quien carga no
revisa el campo ya lleno.

### Diseño

Se saca la precarga en los dos lugares donde ocurre:

- `PagoForm.jsx:448` — al elegir proveedor en el combobox.
- `PagoForm.jsx:270` — al abrir un pago nuevo en un local que tiene proveedor
  fijo configurado.

El `id_rubcat` del proveedor **sigue guardado y configurable**; solo deja de
autocompletar. Se eligió el cambio mínimo y reversible en dos líneas, en lugar de
quitar también el campo del formulario de proveedor, para poder volver atrás si
Anaxi cambia de opinión el martes.

El cashflow calculado con el plazo del proveedor **no se toca**: no lo cuestionó y
resuelve un problema real.

La lectura de factura por IA no asigna rubro — solo extrae `razon_social_emisor`
como texto (`backend/src/lib/leerFactura.js:132,241`), no elige proveedor ni
categoría. El pedido de Anaxi de "no automatizar razones sociales ni categorías"
ya está cumplido de ese lado.

## 4. Reporte de facturas fuera de término

### Lo que ya existe (y no hay que rehacer)

**El aviso de período cerrado ya está implementado**, y con mejor criterio que el
que se había propuesto en la reunión:

- `frontend/src/lib/dates.js:100-151` — `DIAS_PERIODO_VIEJO = 20`,
  `diasDesdeFinDePeriodo()` y `periodoDemasiadoViejo()`, con tests en
  `dates.test.js`.
- La antigüedad se mide desde el **fin del mes del período**, no desde el día
  ingresado. Es la decisión correcta: 97,8% de los pagos con período tienen día 1,
  y medir desde el día ingresado haría que toda factura del mes corriente avisara
  a partir del día 20.
- `PagoForm.jsx:827-838` — aviso ámbar inline debajo del campo Período.
- `PagoForm.jsx:611-621` — **modal de confirmación al guardar**, con `showConfirm`
  del `uiStore`. Cancelar aborta; confirmar guarda igual.

O sea: el comportamiento "avisa y pide confirmar" que se definió como objetivo
**ya es el comportamiento actual**. El umbral de 20 días se mantiene; la propuesta
inicial de 5 días de gracia era peor y se descarta.

### Lo que falta

**El reporte.** Nada compara `created_at` contra `periodo` en ninguna parte del
sistema: ni en `reportes.js` (que no menciona `created_at`), ni en ningún
endpoint o componente.

Un endpoint nuevo que liste los pagos cuyo `created_at` cae en el rango
consultado pero cuyo `periodo` es de un mes anterior. Se calcula comparando las
dos columnas que ya existen: **cero modelo de datos nuevo**.

Se reusa `periodoDemasiadoViejo` como criterio, para que el reporte y el aviso del
formulario digan lo mismo. Eso implica mover esa lógica a un módulo compartido o
duplicarla con tests que garanticen paridad — el repo ya tiene precedente de esto
(hay un test que verifica que "la copia del frontend da el mismo número que la del
backend" para el cuadre de arqueo).

### Límite conocido

El aviso es **puramente frontend**: no hay ninguna validación de `periodo` en el
backend (`pagos.js:569` guarda `periodo` sin chequear nada, idem el PUT en `:658`).
Se puede saltear mandando el request directo a la API. No se agrega validación
backend en este alcance porque el objetivo acordado es advertir, no bloquear —
pero queda anotado: si en algún momento se necesita que no se pueda saltear,
requiere lógica nueva del lado del servidor.

## 5. Exportar sin exigir fechas, con tope

### Problema

El botón "Exportar Excel" está deshabilitado si no hay rango de fechas
(`PagoList.jsx:1377`, `!(filters.desde && filters.hasta)`). Anaxi necesita
consultar por proveedor sin acotar por fecha.

### Diseño

Se saca la exigencia de rango. En su lugar: si **no hay ningún filtro de fecha
puesto** y el total supera **300** pagos, el botón queda deshabilitado con un
mensaje que dice cuántos hay y que hay que acotar. Con rango de fechas, sin tope,
como hoy.

El umbral va en una constante para poder moverlo sin buscar en el código.

No hace falta ninguna llamada nueva: `total` ya viene del backend en cada carga de
la lista (`pagos.js:306`) y está en el estado del componente
(`PagoList.jsx:872`), en el mismo scope del render que decide el `disabled`.

**Cuidado con dos cosas:**

- `total` es 0 durante el primer load y **conserva el valor anterior durante los
  refetches** (el effect de `:977-994` no lo resetea). Un gate ingenuo
  `total === 0` daría un falso deshabilitado en el primer paint y un falso
  habilitado durante un refetch. Hay que combinarlo con `loading` (`:873`).
- El gate `desde && hasta` está en **tres** lugares, no uno: el export (`:1377`),
  el disparo del `/summary` (`:1001`) y el render del cuadro resumen (`:1395`).
  El comentario de `:997-999` dice explícitamente "mismo gate que el CSV". Los
  tres hay que actualizarlos de forma coherente.

## Bug preexistente encontrado (fuera de alcance, anotado)

`GET /reportes/pagos` tiene la whitelist de campos de fecha **duplicada** de
`pagos.js` y desincronizada:

- `reportes.js:219-220` lista `['fecha','fecha_pago','cashflow','periodo']` —
  **le falta `created_at`**, que sí está en `pagos.js:135`.
- `reportes.js:245` calcula el sufijo de zona como
  `campoFecha === 'fecha_pago' ? '-03:00' : 'Z'`, así que **no trata `created_at`
  como instante**, a diferencia de `CAMPOS_FECHA_INSTANTE` (`pagos.js:143`).

Consecuencia: filtrar el tablero por fecha de creación no funciona igual que
filtrar la lista de pagos por lo mismo. No se arregla en este alcance para no
mezclar, pero es candidato natural a unificar cuando se extraiga la construcción
del where de fechas a `lib/` (punto 2).

En la misma línea: `GET /pagos/stats` (`pagos.js:344`) y `GET /pagos/chart`
(`:397`) tienen su propia lógica de fecha hardcodeada a `fecha` y no usan
`buildPagosWhere`, así que ignoran los filtros multi-valor que el resto ya
soporta.

## Testing

Siguiendo el patrón del repo — lógica pura en `lib/` con tests de `node:test`, y
la convención de nombres `test('<nombreFuncion>: <caso en español>', ...)`:

| Módulo nuevo | Qué cubre |
|---|---|
| `backend/src/lib/deuda.js` | egresos − ingresos; NC como ingreso resta; NC como egreso suma (caso conocido); ingresos impagos no inflan; importes nulos |
| `backend/src/lib/` (where de fechas) | un rango (igual que antes); varios rangos con AND; dos rangos sobre el mismo campo; zona horaria por campo; sin fechas |
| `frontend/src/lib/filtros.js` → `normalizarRangos` | formato viejo `{campo_fecha, desde, hasta}`; formato nuevo; solo desde; solo hasta; vacío/null/ausente; que no queden claves legacy |

Los casos de compatibilidad se nombran por su origen histórico, como ya hace
`filtros.test.js` ("string suelto de un preset viejo", "el formato nuevo pasa
igual").

Verificación manual antes de la validación del martes: comparar el nuevo
`total_deuda` contra el cálculo a mano de Anaxi para un proveedor y un período
donde ella ya tenga el número, que es exactamente lo que dijo que iba a hacer para
confiar en la herramienta.

## Fuera de alcance

- Reporte mensual automático y export/envío por mail → `dcsmart-analisis`, cuando
  llegue el archivo de ejemplo de Anaxi
- Corregir las 8 notas de crédito cargadas como egreso
- Validación de período en el backend
- Unificar las whitelists divergentes de `reportes.js`
- El mail a Anaxi comunicando los cambios (no es código, pero es un próximo paso
  asignado y conviene mandarlo junto con el deploy)
