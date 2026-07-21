# Filtro de tipo de fecha + resumen agregado en Pagos

## Contexto

Hoy la pantalla de Pagos (`PagoList.jsx`) exporta un CSV que se usa para armar reportes en Excel/Sheets. El filtro de fecha actual (`desde`/`hasta`) solo filtra sobre el campo `fecha` (fecha del comprobante), pero el modelo `Pago` tiene otros campos de fecha relevantes para reportes: `fecha_pago`, `cashflow` y `periodo`. Además, para saber el total de un rango filtrado hay que descargar el CSV y sumarlo aparte.

## Objetivo

1. Permitir elegir **qué campo de fecha** filtrar (Fecha, Fecha de Pago, Cashflow, Período), no solo `fecha`.
2. Evitar exportar el CSV "a lo loco" (todos los pagos, sin acotar) — exigir que se elija un tipo de fecha + rango antes de habilitar la descarga.
3. Mostrar un cuadro resumen (total de importes + suma por cada tipo de impuesto) de **todos** los pagos que matchean el filtro actual, no solo los de la página visible — para que muchos reportes ya no necesiten abrir el CSV.

## Alcance

Incluye:
- Nuevo selector "Tipo de fecha" en los filtros de `PagoList.jsx`.
- Backend: parametrizar el filtro `desde/hasta` por campo (`fecha` | `fecha_pago` | `cashflow` | `periodo`).
- Gate de exportación CSV: deshabilitado hasta que tipo de fecha + desde + hasta estén completos.
- Nuevo endpoint de resumen agregado (`GET /api/pagos/summary`) y su UI (tarjetas de total).

Fuera de alcance:
- Cambios a las columnas/formato del CSV en sí.
- Cambios a la paginación de la tabla.
- Nuevos campos de fecha en el modelo.

## Diseño

### 1. Selector de tipo de fecha (frontend)

En `FILTER_INIT` se agrega `campo_fecha: 'fecha'` (default, para no cambiar el comportamiento actual si no se toca el filtro).

En la barra de filtros, junto a los inputs `desde`/`hasta` existentes, un `<select>`:

```
Fecha | Fecha de Pago | Cashflow | Período
```

que mapea a los valores `fecha | fecha_pago | cashflow | periodo`. Un único par de inputs `desde`/`hasta` (tipo `date`, día completo) sirve para las 4 opciones — incluyendo Período, que aunque representa un mes acepta fecha completa igual que hoy.

`buildParams` agrega `campo_fecha: filters.campo_fecha` a la query siempre que haya `desde` o `hasta`.

### 2. Backend — filtro paramétrico

En `backend/src/routes/pagos.js`, el handler de `GET /api/pagos` (list) recibe `campo_fecha` del query (default `'fecha'`, whitelist estricta: `['fecha', 'fecha_pago', 'cashflow', 'periodo']` — cualquier otro valor se ignora y cae al default). El bloque que hoy arma:

```js
...(desde || hasta ? {
  fecha: {
    ...(desde ? { gte: new Date(desde) } : {}),
    ...(hasta ? { lte: new Date(hasta + 'T23:59:59.999') } : {})
  }
} : {})
```

pasa a usar el campo dinámico:

```js
...(desde || hasta ? {
  [campoFechaValido]: {
    ...(desde ? { gte: new Date(desde) } : {}),
    ...(hasta ? { lte: new Date(hasta + 'T23:59:59.999') } : {})
  }
} : {})
```

Mismo tratamiento en el endpoint que ya usa `desde/hasta` para exportar (comparte el `where` con `list` vía `limit: 0`, según `PagoList.jsx`), así el CSV exportado respeta el mismo campo de fecha elegido.

### 3. Gate de exportación CSV

El botón "Exportar CSV" ya existe (`exportCsv` en `PagoList.jsx`). Se deshabilita (`disabled`) mientras no estén completos `filters.campo_fecha` (siempre tiene default) + `filters.desde` + `filters.hasta`. Tooltip: "Elegí un tipo de fecha y un rango (desde/hasta) para poder exportar". Nota: como `campo_fecha` siempre tiene un valor por default, la condición real de habilitación es simplemente `desde && hasta`.

### 4. Endpoint de resumen agregado

Nuevo `GET /api/pagos/summary` en `pagos.js`, con el **mismo preHandler de auth/permisos** que `list` y aceptando los mismos query params de filtro (`id_local, desde, hasta, campo_fecha, id_tipo, id_rub, id_cat, audit, ingresa_egreso, id_metodo, id_proveedores, id_rubcats, q`, etc.) para construir el mismo `where` que ya arma `list` — se extrae la construcción del `where` a una función compartida para no duplicar lógica entre `list` y `summary`.

Devuelve:
```json
{
  "total_importe": 123456.78,
  "por_impuesto": { "IVA21": 1000, "RETENCION": 200 }
}
```

- `total_importe`: `prisma.pago.aggregate({ where, _sum: { importe: true } })`.
- `por_impuesto`: agregación de `Impuesto` filtrando por los pagos que matchean `where`. Como `Impuesto` no tiene los mismos campos que `Pago`, se resuelve con `prisma.impuesto.groupBy({ by: ['tipo'], where: { pago: where }, _sum: { monto: true } })` (relación `pago` en el modelo `Impuesto` referenciando `Pago`).

### 5. UI del resumen

En `PagoList.jsx`, arriba de la tabla (debajo de la barra de filtros), una fila de tarjetas que se muestra **solo cuando `filters.desde && filters.hasta`** (mismo gate que el CSV):

- Tarjeta "Total Importe" con `fmt$(total_importe)`.
- Una tarjeta por cada tipo de impuesto presente en `por_impuesto` (se omiten los que no tengan pagos en el rango).

Se recalcula con un `useEffect` que dispara sobre los mismos `buildParams` que ya disparan la carga de la tabla (mismo array de dependencias), llamando a `pagosApi.summary(buildParams(1))` (sin paginar, análogo al patrón usado para `exportCsv`).

### 6. Manejo de errores

- Si `summary` falla, se muestra `notify('Error al cargar el resumen', 'error')` y las tarjetas no se renderizan (no bloquea el resto de la pantalla).
- Igual que hoy, no hay validación adicional de fechas inválidas — se apoya en el `<input type="date">` nativo.

## Testing

- Backend: request manual (o script) a `/api/pagos/summary` con distintos filtros (con y sin `campo_fecha`) verificando que el `where` sea el correcto y las sumas coincidan con una query directa a la base.
- Frontend: probar en el navegador que:
  - Cambiar el tipo de fecha cambia qué pagos aparecen filtrados.
  - El botón CSV está deshabilitado sin `desde`/`hasta` y se habilita al completarlos.
  - El resumen aparece/desaparece según el gate y sus totales coinciden con sumar manualmente el CSV exportado con el mismo filtro.
