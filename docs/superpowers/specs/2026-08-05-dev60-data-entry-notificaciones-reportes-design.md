# DEV-60 — Perfil Data Entry, aviso al desauditar, y KPIs de Reportes

Fecha: 2026-08-05
Branch: `DEV-60` (worktree `.claude/worktrees/DEV-60`), un solo PR a `dev`.

Cuatro tareas independientes que el usuario decidió llevar juntas en una branch. Se
mantienen como cuatro commits separados para que cada una se pueda leer y revertir
sola.

---

## Decisiones tomadas antes de diseñar

| Tema | Decisión |
|---|---|
| Canal del aviso al desauditar | Campanita dentro de la app. **No** mail. |
| Formularios que ve Data Entry | Pagos y Cajas. No arqueos, no proveedores. |
| Torta de rubros | Ingresos y egresos **separados** (dos tortas). |
| Tarjeta de descuadre | Desvío **absoluto** + cuántas cajas descuadran. |
| Alta de caja para Data Entry | **A1**: extraer el panel de alta a un componente compartido. |

Restricción que condicionó A: **los permisos son por módulo, no por fila.** No existe
"editar lo que yo cargué". Con `edit` pero sin `view`, el formulario de edición no
puede cargar el registro (`GET /pagos/:id` pide `view`); con `view`, aparece la tabla.
Por eso Data Entry es **solo-crear**. Permisos por fila quedan fuera de alcance.

---

## A — Perfil Data Entry

### Qué es

Un rol que solo ve formularios de carga. Espeja el rol `reportes` que ya existe
(0 usuarios, único permiso `reportes:view`) y al que `ProtectedRoute` ya encierra en
una sola pantalla.

### Backend

Rol nuevo `data_entry` en `roles`, con estos `role_permissions`:

| módulo | V | C | E | D | por qué |
|---|---|---|---|---|---|
| `pagos` | | ✓ | | | carga la factura, no ve la tabla |
| `caja` | | ✓ | | | crea el turno, no ve el listado |
| `caja_movimientos` | | ✓ | | | los movimientos se cargan junto con la caja |
| `proveedores` | ✓ | | | | poblar el combo de proveedor |
| `rubros` | ✓ | | | | poblar el combo de rubro/categoría |
| `categorias` | ✓ | | | | ídem |
| `metodos_pago` | ✓ | | | | poblar el combo de método |

No hace falta ningún cambio en `plugins/permissions.js`: `can('pagos','view')` ya
devuelve 403 solo. El frontend es cosmética; la verdad la sigue diciendo el backend.

`GET /pagos/contexto-local/:id_local` ya pide `pagos:create` (no `locales:view`), así
que el formulario de pago arranca sin tocar nada.

**Cómo se aplica en producción:** con un script puntual que haga `upsert` del rol y
sus `role_permissions`. **Nunca con `seed.js`**, que borra todos los usuarios reales.

### Frontend

1. `ROLES.DATA_ENTRY = 'data_entry'` en `lib/roles.js`.

2. **Extraer `CajaCreatePanel`** (hoy en `pages/cajas/CajaList.jsx`, líneas 1269-1612)
   a `pages/cajas/CajaCreatePanel.jsx`. Ya es un componente autocontenido con
   interfaz limpia (`activeLocal, locales, onCreated, onClose`), así que es un movimiento
   de archivo, no una reescritura. `CajaList` lo importa; la pantalla nueva de Data Entry
   también. Una sola definición del alta.

   El `pages/cajas/CajaForm.jsx` que existe hoy es **código muerto** (no está ruteado en
   `App.jsx`) y está atrasado: le faltan `tipo_turno`, detalles y movimientos. Se borra.

3. Página nueva `pages/cargar/Cargar.jsx` en `/cargar`: dos botones grandes, "Cargar
   pago" y "Cargar caja". Es el home de Data Entry.

4. Ruta nueva `/cajas/nueva` que renderiza `CajaCreatePanel` como página. Al guardar,
   Data Entry vuelve a `/cargar` (no a `/cajas`, que no puede ver); el resto vuelve al
   listado.

5. **Refactor chico del redirect por rol.** Hoy `ProtectedRoute` tiene hardcodeado
   `<Navigate to="/reportes">` para el rol `reportes`. Con un segundo rol restringido eso
   deja de escalar, así que se reemplaza por `homeDeRol(rol)` en `lib/roles.js`:
   `reportes` → `/reportes`, `data_entry` → `/cargar`, el resto → `/dashboard`.
   `excludeRoles` pasa a redirigir a `homeDeRol` en vez de a una ruta fija.

6. `Sidebar`: para `data_entry`, solo las dos entradas de carga.

7. Helpers de `lib/roles.js`, explícito para que ninguno quede indefinido:
   `puedeCrearCajas(data_entry)` → **true** (es su tarea);
   `puedeOperar`, `puedeEditar`, `puedeExportar`, `esRolDc`, `puedeBorrarPagos`,
   `puedeBorrarCajas`, `puedeBorrarMovimientos` → **false**.
   `data_entry` **no** entra en `ROLES_TODOS` ni en `ROLES_OPERATIVOS`: `ROLES_TODOS`
   alimenta `puedeCrearCajas`, así que se agrega `data_entry` a esa función con su
   propia lista en vez de ensanchar `ROLES_TODOS`, que se usa como "todos los que
   operan".

### Criterio de éxito

- Un usuario `data_entry` entra y cae en `/cargar`.
- Puede crear un pago y una caja completas (con detalles y movimientos).
- Escribir `/pagos` o `/cajas` a mano lo devuelve a `/cargar`.
- `GET /api/pagos` le responde 403 aunque fuerce la llamada.
- Los tests de `lib/roles.test.js` cubren el rol nuevo en cada helper.

---

## B — Campanita al desauditar

### Modelo

```prisma
model Notificacion {
  id          String   @id @default(uuid())
  id_user     String              // destinatario
  tipo        String              // 'desauditado' (único por ahora)
  titulo      String
  cuerpo      String?
  tabla       String?             // 'pagos' | 'cajas', para armar el link
  id_registro String?
  id_local    String?
  leida       Boolean  @default(false)
  created_at  DateTime @default(now())

  user User @relation(fields: [id_user], references: [id])

  @@index([id_user, leida])
  @@index([id_user, created_at])
  @@map("notificaciones")
}
```

Y la contra-relación en `model User`: `notificaciones Notificacion[]`. Sin eso Prisma
no valida el esquema.

`id_user` lleva índice propio por el `@@index([id_user, leida])`, así que no repite el
problema de FK sin índice del PR #114.

Se descartó reusar `audits` con una tabla de "leídas": `audits` no tiene concepto de
destinatario y ya es polimórfica; encimarle otra responsabilidad la vuelve ilegible.

**Riesgo de esquema:** no hay base de dev, `db push` va contra producción. Crear una
tabla nueva es aditivo y no toca datos existentes, pero igual hay que correr
`prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` y **leer
el SQL** antes de aplicar. Los índices se crean con `CREATE INDEX CONCURRENTLY`.

### Quién recibe

El usuario que había auditado el registro, tomado del último evento `auditado` de
`audits` para ese `tabla` + `id_registro`. Reglas:

- Si el que desaudita **es** el auditor previo, no se emite nada.
- Si no hay auditor previo, no se emite y se loguea.
- Un fallo al emitir **nunca** puede hacer fallar el desauditar: va en `try/catch` con
  log, igual que `logActivity` en `routes/pagos.js`.

### Dónde se emite

- `PATCH /api/pagos/:id/audit` cuando la transición es a `desauditado`.
- `PATCH /api/cajas/:id/audit` ídem.
- La cascada de `PATCH /:id/audit-dc`: cuando arrastra el circuito normal a
  `desauditado`, emite igual. Una notificación por evento, no dos.

Lógica pura en `lib/notificacionDesauditado.js`: recibe el historial de `audits` del
registro y quién está desauditando, y devuelve el destinatario o `null`. Testeada.
La escritura queda en un helper de ruta, no en la lib pura.

### Endpoints

- `GET /api/notificaciones` — las mías; devuelve `{ data, no_leidas }`. No leídas primero,
  después por fecha desc. Paginado con `limit` por defecto 20.
- `PATCH /api/notificaciones/:id/leida` — marca una. 404 si no es del usuario.
- `PATCH /api/notificaciones/leer-todas` — marca todas las mías.

Solo pide `authenticate`: son datos del propio usuario, no de un módulo.

### Frontend

Campanita en el header (`components/Layout.jsx`) con el contador de no leídas y un
dropdown. Click en un ítem: marca leída y navega al pago o la caja. Polling cada 60s
con `setInterval`, sin websockets. Se pausa si la pestaña está oculta
(`document.hidden`) para no pegarle a la API de fondo.

### Criterio de éxito

- A desaudita un pago que B había auditado → B ve la campanita en 1 y el ítem linkea al pago.
- A desaudita algo que A mismo auditó → no llega nada.
- Si la tabla `notificaciones` falla, el desauditar igual funciona.
- El contador baja al leer y `leer-todas` lo pone en cero.

---

## C — KPIs de Reportes / Pagos

Extiende `GET /api/reportes/pagos`. Hoy devuelve `total_gastos` (egresos) pero **no**
total de ingresos, y su `total_efectivo` **mezcla las dos direcciones** — eso es un bug
de definición que se corrige acá.

### Definiciones, fijadas explícitamente

- **Dirección**: `ingresa_egreso === true` → ingreso; `false` → egreso. Los montos son
  siempre positivos, la dirección va aparte.
- **En efectivo**: el método de pago cuyo nombre matchea `/efectivo/i`. Se **reusa
  `esEfectivo` de `lib/cuadreCaja.js`** (se exporta), no se escribe una segunda regla.
- **Resto de las formas**: total de la dirección menos su efectivo. Incluye los pagos
  sin método asignado — no desaparecen.
- **Rubro**: `rubcat.rubro.nombre`; `"Sin rubro"` cuando es null.
- **Fecha**: el selector que ya existe (`fecha` / `fecha_pago` / `cashflow` / `periodo`).

### Respuesta nueva

```
total_ingresos, total_egresos
efectivo:  { ingresos, egresos }
resto:     { ingresos, egresos }
rubros:    { ingresos: [{ nombre, total }], egresos: [{ nombre, total }] }
```

Se mantienen los campos actuales para no romper la pantalla existente.

Cálculo en `lib/direccionPagos.js`, puro: recibe las filas
`{ importe, ingresa_egreso, metodo_pago, rubcat }` y devuelve el agregado. Testeado con
casos de importe null, método null y rubro null.

### Frontend

`pages/reportes/ReportePagos.jsx`: cuatro tarjetas (Total Ingresos, Total Egresos, En
efectivo con sus dos cifras, Resto de las formas con sus dos cifras) y dos tortas de
rubros.

**Componente nuevo `components/Donut.jsx`**: N gajos con `conic-gradient` + leyenda,
reusando las clases `.rep-donut-*` de `reportes.css` que ya existen. El donut actual de
`ReporteCajas` es de 2 gajos fijos y no sirve para N. Al implementar la torta hay que
leer primero la skill `dataviz` (paleta, accesibilidad, orden de gajos, agrupar la cola
en "Otros").

---

## D — KPIs de Reportes / Cajas

Extiende `GET /api/reportes/cajas`. `total_cajas` (hoy `countZ`) y `total_efectivo` ya
se calculan; se agregan:

- **`total_detalles`**: suma de `caja_detalles.monto` de las cajas del rango.
- **`descuadre`**: `{ absoluto, cantidad_cajas }`.
- **`desglose_detalles`**: dos niveles, clasificación → nombre del tipo.

### Descuadre

Se **reusa `calcularCuadre` de `lib/cuadreCaja.js`** por caja y se agrega. Una sola
definición de la diferencia de caja en todo el sistema — que es justamente el bug que ese
módulo vino a arreglar. Reglas:

- `absoluto` = suma de `Math.abs(diferencia)`, solo de las cajas con `total` cargado.
- `cantidad_cajas` = cuántas tienen `cuadra === false`, con la tolerancia de $1 que ya
  está fijada en `TOLERANCIA`.
- Las cajas sin `total` no entran en ninguno de los dos y se cuentan aparte como
  `sin_total`, para que la tarjeta pueda aclarar que hay cajas sin comparar.

Agregación en `lib/descuadreAgregado.js`, puro y testeado.

### Desglose de detalles

Mismo criterio que `frontend/src/lib/desgloses.js`: nivel 1 la clasificación efectiva
(normalizando las históricas `ingreso`, `medio_pago`, `canal`, `egreso`, `otro`,
`calculo` con `ROL_POR_CLASIFICACION`), nivel 2 el nombre del tipo. Así el número del
reporte coincide con el que se ve abriendo la caja.

Se calcula en el backend trayendo los detalles del rango y agrupando, no en SQL: la
normalización de clasificaciones ya vive en JS y duplicarla en SQL es pedir que
divergan. Con `caja_detalles_id_caja_idx` (aplicado el 2026-08-05) el costo es bajo:
un mes de LOS GALGOS son ~90 cajas y ~630 detalles.

### Frontend

`pages/reportes/ReporteCajas.jsx`: tarjetas de total de cajas, total efectivo, total
detalles y descuadre, más la tabla de desglose de detalles.

---

## Testing

Convención del repo: lógica pura en `lib/*.js` con `*.test.js` al lado y `node --test`.
Libs nuevas o tocadas:

| lib | qué fija |
|---|---|
| `lib/direccionPagos.js` | dirección, efectivo vs resto, rubros; nulls en importe/método/rubro |
| `lib/descuadreAgregado.js` | absoluto vs neto, tolerancia de $1, cajas sin total |
| `lib/notificacionDesauditado.js` | destinatario, auto-desauditoría, sin auditor previo |
| `frontend/src/lib/roles.js` | `data_entry` en cada helper y en `homeDeRol` |

Verificación manual mínima antes del PR: levantar el backend contra la base real y
comprobar que los endpoints nuevos responden 200; crear un usuario `data_entry` de
prueba y recorrer el circuito de carga.

---

## Fuera de alcance

- Permisos por fila ("editar lo que yo cargué").
- Mail: se eligió campanita.
- Notificaciones de otro tipo que no sea `desauditado`.
- `buildScopeOr` de `routes/auditorias.js`, que materializa todos los ids del scope
  igual que el `buildAuditFilter` que se arregló en el PR #114. Es el mismo antipatrón y
  conviene arreglarlo, pero no es de este PR.
- Websockets o push del navegador.

## Riesgos

1. **`db push` va contra producción** (no hay base de dev). La tabla nueva es aditiva,
   pero hay que leer el SQL del `migrate diff` antes de aplicar.
2. **Alta del rol en producción**: con script puntual de `upsert`, nunca con `seed.js`.
3. **Data Entry no puede corregir**. Si carga algo mal, necesita a otro. Es consecuencia
   de que los permisos sean por módulo; si molesta en la práctica, el siguiente paso es
   permisos por fila, que es un subsistema aparte.
4. **`CajaList.jsx` tiene 2014 líneas.** Extraer `CajaCreatePanel` la baja a ~1670 y no
   debería cambiar comportamiento, pero es el archivo más cargado del frontend y hay que
   probar el alta desde el listado después de mover el componente.
