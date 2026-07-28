# Filtros multiselect (Cajas, Pagos, Reportes)

**Fecha:** 2026-07-28
**Estado:** aprobado, pendiente de plan de implementación

## Problema

Los filtros de la app permiten un solo valor por campo. El caso concreto que lo
disparó: en **Cajas** no se puede pedir "Mañana y Noche" — hay que filtrar de a
un turno y comparar a mano. Lo mismo pasa en Pagos con Tipo de pago, Método y
Estado OP.

Además ya existen dos multiselect en Pagos (Rubros/Cat y Proveedores) hechos a
mano, con UI distinta entre sí y distinta del resto de los filtros. Sumar un
tercer estilo empeoraría la inconsistencia.

## Alcance

| Pantalla | Pasa a multiselect | Queda como está |
|---|---|---|
| Cajas | Tipo de turno | Auditado, Desde, Hasta |
| Pagos | Tipo de pago, Método de pago, Estado OP | Pagado, Auditado, Ingresa/Egresa, CMV, fechas, Rubro y Categoría (selects encadenados) |
| Pagos | Rubros/Cat y Proveedores: migran al componente nuevo sin cambiar su funcionalidad | — |
| Reportes | Tipo de turno (pestaña Cajas) | Resto |

**Los filtros binarios no cambian.** En Auditado, Pagado e Ingresa/Egresa el
select actual ya cubre los tres estados posibles (Todos / Sí / No); un
multiselect de dos opciones agregaría un estado redundante (ambas marcadas =
ninguna marcada) sin ganar nada.

## Decisión: CSV en el query param

Varios valores viajan como `?tipo_turno=Mañana,Noche`.

Es el formato que ya usan `id_rubcats` e `id_proveedores` (`pagos.js:163,176`).
Un solo valor viaja igual que hoy, así que los links viejos y los presets
guardados siguen funcionando sin migración.

Alternativas descartadas:

- **Param repetido** (`?t=A&t=B`): Fastify entrega string o array según cuántos
  vengan; cada handler tendría que normalizar. Rompe con el patrón del repo.
- **JSON en el param**: ilegible en la URL y hay que manejar JSON inválido.

## Componente `MultiSelect`

Archivo nuevo: `frontend/src/components/MultiSelect.jsx`.

```jsx
<MultiSelect
  value={[{ value: 'Mañana', label: 'Mañana' }]}
  onChange={(next) => ...}
  options={TURNO_OPTIONS}        // opciones fijas
  fetchOptions={(q) => Promise}  // …o búsqueda remota (excluyente con options)
  placeholder="Todos los turnos"
/>
```

### Por qué `{value, label}` y no solo ids

Con búsqueda remota (proveedores) el componente no tiene la lista completa
cargada. Si el estado guardara solo el id, al reabrir el panel o al aplicar un
preset no podría mostrar el nombre en el chip. Guardar el label junto al value
evita un cache interno de labels y cualquier resolución diferida. Es el formato
que `id_proveedores` ya usa hoy.

`options` y `fetchOptions` son excluyentes: `options` para listas fijas ya
cargadas, `fetchOptions` para búsqueda contra el backend con debounce de 300 ms
(mismo valor que `Combobox.jsx:58`).

### Comportamiento

- **Cerrado**: labels separados por coma más el contador. Se listan hasta dos
  labels; a partir del tercero, `"Mañana, Noche +2"`. Sin selección, muestra el
  `placeholder`.
- **Abierto**: buscador, lista de checkboxes, y pie con **Todos** / **Ninguno**.
  El buscador aparece si hay más de 8 opciones o si es remoto.
- **Nada seleccionado = sin filtrar.** Equivale al "Todos" del select actual. No
  existe un estado "cero resultados porque el filtro está vacío".
- Cierra al click afuera y con `Escape`. `Enter` no envía el formulario que lo
  contiene.
- Reusa `.combobox-dropdown` y `.combobox-option`, y el alto y estilo de
  `.filter-select`, para entrar en el mismo hueco visual que el select actual.

## Backend

Helper nuevo `backend/src/lib/queryParams.js`:

```js
parseCsvParam('a,b')  // → ['a', 'b']
parseCsvParam('a')    // → ['a']
parseCsvParam('')     // → []
parseCsvParam(undefined) // → []
```

Descarta segmentos vacíos, así que `'a,,b,'` da `['a','b']`.

Cambios por archivo:

- **`caja.js:114` y `caja.js:165`** — `tipo_turno` pasa de
  `{ tipo_turno: enum }` a `{ tipo_turno: { in: [enums] } }`. Afecta `GET /` y
  `GET /stats`, que comparten la forma del `where`.
- **`pagos.js:208,209,212`** — `id_tipo`, `id_metodo` y `estado_op` pasan a
  `{ in: [...] }` dentro de `buildPagosWhere`, que ya alimenta a `GET /` y
  `GET /summary`.
- **`reportes.js:47`** — el `where` de Prisma pasa a `{ in: [...] }`.
- **`reportes.js:79,123,155`** — las tres queries con `$queryRawUnsafe` cambian
  `c.tipo_turno::text = $N` por `c.tipo_turno::text IN ($N, $N+1, …)`, con
  placeholders generados dinámicamente igual que `localPlaceholders`
  (`reportes.js:68`) y un parámetro por etiqueta. Se prefiere esto a
  `= ANY($N::text[])` para no depender de cómo Prisma serializa un array JS a
  un array de Postgres. Se mantiene la distinción ya documentada en
  `reportes.js:72-75`: el SQL crudo compara contra la etiqueta (`"Tarde"`),
  Prisma contra la clave del enum (`TARDE`).

### Limpieza incluida: `tipoTurno.js`

`TIPO_TURNO_MAP` está duplicado en `caja.js:8` y `reportes.js:4`. Como el
cambio toca los dos archivos, se extrae a `backend/src/lib/tipoTurno.js` con
`toTipoTurnoEnum`, `fromTipoTurnoEnum` y `toTipoTurnoEnumList`. Con dos copias,
la conversión a lista se escribiría dos veces, y es exactamente donde se cuelan
los bugs de enum.

No se toca nada más de esos archivos.

## Presets guardados ("Mis filtros")

`filtro_presets.js:51-56` guarda el JSON de filtros sin validar claves, así que
los presets ya creados tienen `id_tipo: "A"` (string) e
`id_rubcats: ["uuid"]` (array de strings).

Al aplicar un preset se normaliza en el frontend, en
`frontend/src/lib/filtros.js`:

- `"A"` → `[{ value: 'A', label: 'A' }]`
- `["uuid1", "uuid2"]` → se resuelven los labels contra las opciones cargadas;
  si un id no está en las opciones, el label queda igual al value
- clave ausente o `null` → `[]`
- ya en formato `[{value,label}]` → se devuelve tal cual

**No hay migración de datos.** Los presets viejos siguen funcionando y, al
guardarse de nuevo, quedan en el formato nuevo.

## Casos borde y errores

- **Contador de filtros activos**: `CajaList.jsx:1568` hace `v !== ''`, que con
  arrays contaría `[]` como filtro activo. Pasa a
  `Array.isArray(v) ? v.length > 0 : v !== ''`. `PagoList.jsx:1121` ya cuenta
  bien los arrays y no se toca.
- **Valor desconocido** (preset con un método de pago borrado): el chip muestra
  el value crudo y el backend no matchea esa fila. No rompe ni tira error.
- **Fallo del fetch remoto**: la lista muestra "Sin resultados"; lo ya
  seleccionado no se pierde.
- **Export a Excel, totales de Cajas y summary de Pagos** arman sus params con
  la misma función que la tabla, así que heredan el multiselect sin cambios
  propios.
- **Orden de los valores** en el CSV es el de selección; no afecta el resultado
  de la query.

## Testing

El repo corre `node --test` (backend y frontend), con tests co-locados y solo
sobre módulos puros de `lib/`. No hay infraestructura para testear componentes
React ni rutas Fastify, y montarla no es parte de este trabajo.

Tests nuevos, siguiendo esa convención:

- `backend/src/lib/queryParams.test.js` — vacío, un valor, varios, comas
  sobrantes, `undefined`.
- `backend/src/lib/tipoTurno.test.js` — label a enum, lista de labels a lista de
  enums, valor desconocido pasa igual, vacío.
- `frontend/src/lib/filtros.test.js` — normalización desde string, desde array
  de strings, desde el formato nuevo, y clave ausente.

Verificación manual en la app corriendo, por pantalla:

1. **Cajas**: seleccionar dos turnos, confirmar que la tabla, los totales y el
   export a Excel devuelven los dos.
2. **Pagos**: dos tipos de pago a la vez; guardar un preset y volver a
   aplicarlo; aplicar un preset creado antes del cambio.
3. **Reportes**: dos turnos, confirmar que las tres secciones (métodos de pago,
   serie semanal, desglose de detalles) filtran igual entre sí.

## Fuera de alcance

- Filtros binarios (Auditado, Pagado, Ingresa/Egresa).
- Filtros de fecha.
- Selects de formularios de alta y edición: solo cambian los de filtrado.
- Persistir filtros en la URL.
- Tests de componentes React.
