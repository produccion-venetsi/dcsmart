# Frontend de Arqueo — diseño

## Contexto

El backend de Arqueo ya está completo (branch `DEV-20`): modelos `Arqueo`/`ArqueoDetalle`, rutas
`POST /api/arqueo` (crea y calcula la comprobación), `GET /api/arqueo?id_local=X` (historial),
`GET /api/arqueo/:id` (detalle), módulo de permisos `arqueo` ya aplicado. Falta toda la parte de UI.

## Objetivo

Una pantalla de historial de arqueos por local, y un formulario de carga con preview en vivo de la
comprobación antes de guardar (para poder corregir los montos si algo no cuadra, sin tener que crear
y luego editar).

## Backend — endpoint nuevo de preview

`GET /api/arqueo/preview?id_local=X&fecha=Y` — reusa exactamente la misma lógica ya escrita en
`arqueo.js` (`getArqueoAnterior`, `calcularIngresos`, `calcularGastos`) pero **no persiste nada**.
Devuelve `{ total_ultimo_arqueo, ingresos, gastos }`. El frontend calcula `total` (suma de los 3
montos que la persona tipeó) y `comprobación` (`(total + total_ultimo_arqueo) - (ingresos + gastos)`)
client-side, sin llamadas de red adicionales por cada cambio de monto. Al confirmar el arqueo, se
llama al `POST /api/arqueo` ya existente, que recalcula todo server-side de forma independiente (no
confía en los números que mandó el cliente para `total_ultimo_arqueo`/`ingresos`/`gastos`, solo en
los 3 montos contados físicamente).

Mismo criterio de permisos que el resto de `arqueo.js`: `fastify.can('arqueo', 'view')` (ver el
preview requiere poder ver arqueos, no crear — el mismo usuario que va a crear ya tiene `view`
también, ya que `admin`/`cajero` tienen `[view, create]` ambos en `true`).

## Frontend

### Página `ArqueoList.jsx` (ruta `/arqueo`)

Historial de arqueos del local activo, ordenado más reciente primero (ya viene así de
`GET /api/arqueo`): fecha, caja fuerte, cofre, adición, total, comprobación (con indicador visual —
verde/cuadra si es 0, rojo/no cuadra si es distinto de 0), botón "Ver detalle" (abre otro panel con
el desglose completo incluyendo los `ArqueoDetalle`). Botón "Nuevo arqueo" en la cabecera.

### Formulario de carga (`DrawerPanel`, mismo componente ya usado en Cajas/Pagos/PDP)

- 3 campos de monto: caja fuerte, cofre, adición.
- Sección de detalles opcionales (MP, Rappi, etc.): mismo patrón ya existente en `CajaList.jsx`
  (selector de `DetalleTipo` del local activo + monto, se van acumulando en una lista local del
  formulario — no se crean contra el backend hasta que se confirma el arqueo completo, igual que los
  "pendientes" del flujo de creación de Cajas).
- Mientras se tipean los 3 montos, se llama a `GET /api/arqueo/preview` (una vez, al abrir el panel,
  con la fecha actual) para traer `total_ultimo_arqueo`/`ingresos`/`gastos`, y se muestra en vivo
  (sin más llamadas de red) el `total` y la `comprobación` resultante a medida que la persona tipea.
- Al confirmar: se manda `{ id_local, fecha, caja_fuerte, cofre, adicion, detalles: [...] }` al
  `POST /api/arqueo` real. Se cierra el panel y se recarga el historial.

## Permisos en la UI

Entrada de sidebar y acciones de creación visibles solo si el rol activo tiene el permiso
correspondiente (mismo patrón ya usado en el resto de la app — `admin`/`cajero`/`dcsmart`/
`super_admin` ven y pueden crear; no hay rol con solo `view` para `arqueo` en la matriz actual, así
que no hace falta un estado "solo lectura" especial en esta primera versión).

## Fuera de alcance

- Editar o borrar un arqueo ya creado (no hay endpoints para esto en el backend tampoco).
- Desglose por denominación de billete/moneda (ya fuera de alcance desde la spec de backend).
