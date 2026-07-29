# Ficha de configuración del local — diseño

**Fecha:** 2026-07-29
**Branch:** DEV-39
**Estado:** pendiente de revisión del usuario

## Problema

La pantalla `admin/Locales.jsx` solo permite cargar `nombre`, `direccion`, `telefono`, `activo` y el grupo (`id_app`). Falta todo lo demás que identifica a un local: su logo, su identidad fiscal, los enlaces públicos (Google Maps, carta) y la casilla a la que los proveedores le mandan las facturas.

## Alcance

**Entra:** los campos de la ficha del local.

**No entra** (specs siguientes, decidido explícitamente):

- Módulos activos por local.
- Tabla de bancos y cuentas (alias/CBU) propia.
- Índices de unidad de negocio.
- Tipos de movimiento de caja configurables (hoy son un `enum` de Prisma usado por caja, arqueo y reportes; convertirlos en tabla es un cambio transversal).
- Usuarios: ya existe (`admin/Users.jsx` + `routes/users.js`).

## Decisiones de diseño

| Tema | Decisión |
|---|---|
| Identidad fiscal | Se lee del `Proveedor` vinculado vía `Local.id_proveedor`. Cada local tiene su proveedor propio, que sale de la tabla `proveedores` — no es una entidad aparte. No se duplican `razon_social` ni `cuit` en `locales`. |
| `idlocal` | **No se muestra.** Primero se resolvió como el UUID en modo lectura con botón de copiar, pero al verlo en pantalla se descartó: un UUID crudo en la ficha es ruido para quien la usa. Sin cambio de esquema. |
| Logo | Upload multipart a GCS, servido por un proxy autenticado del backend. Mismo patrón que los adjuntos de pagos; el bucket sigue privado. |
| Tipo de local | `enum` de Prisma con cinco valores, uno por local. Consistente con `TipoTurno` / `TipoPago` / `EstadoOp`. |
| Mail recepción facturas | Se guarda, se valida como email y se muestra. El sistema no lee ni escribe esa casilla. |
| Layout | El `DrawerPanel` que ya existe, ensanchado a 620px, con los campos agrupados en cuatro bloques. Sin ruta nueva. |
| Nomenclatura | El label pasa a decir "Grupo" solo en la pantalla de Locales. El resto de la interfaz sigue diciendo "App". `id_app` y `X-App-Id` no se tocan. |

### Sobre `Local.id_proveedor`

El campo ya existía en el esquema y **ya se lee**: `PagoForm.jsx:250-260` lo usa para pre-llenar proveedor, rubcat y cashflow al crear un pago nuevo en ese local. Lo que faltaba era una UI para setearlo — hasta ahora solo se podía escribir por consola o por migración.

Ese doble uso (identidad fiscal del local + proveedor por defecto al cargar pagos) es intencional y no se separa en dos columnas: el proveedor vinculado *es* el local dentro de la tabla de proveedores.

**Consecuencia a tener presente:** al vincular un proveedor a un local desde esta pantalla, los pagos nuevos de ese local van a arrancar pre-llenados con ese proveedor. Es el comportamiento que ya existe, no uno nuevo, pero pasa a ser alcanzable desde la UI.

## Esquema

```prisma
model Local {
  // ... campos actuales
  logo_url      String?    // gs://<bucket>/locales/<folder>/logo-<ts>.<ext>
  maps_url      String?
  menu_url      String?
  mail_facturas String?
  tipo_local    TipoLocal?
  // id_proveedor: ya existe; pasa a ser editable
}

enum TipoLocal {
  GASTRONOMIA  @map("Gastronomía")
  INDUMENTARIA @map("Indumentaria")
  ARQUITECTURA @map("Arquitectura")
  INMOBILIARIO @map("Inmobiliario")
  MULTIMEDIA   @map("Multimedia")

  @@map("tipo_local")
}
```

Los `@map` con acentos siguen el patrón de `TipoTurno`: `dcsmart-analisis` lee esta misma base sin contrato compartido, así que el valor almacenado tiene que ser legible por sí mismo.

Todas las columnas son nullable, así que el cambio es aditivo: ningún local existente queda inválido.

## Backend

### `routes/locales.js`

- `GET /` — agregar `proveedor` al `include` (`select` de `id`, `nombre`, `razon_social`, `cuit`, `banco`, `cbu`, `alias`). Evita un request extra al abrir el drawer.
- `GET /:id` — igual.
- `POST /` y `PUT /:id` — aceptar `id_proveedor`, `maps_url`, `menu_url`, `mail_facturas`, `tipo_local`. Normalizar y validar antes de escribir. `tipo_local` fuera del enum → 400. `logo_url` **no** se acepta por acá: se escribe solo desde las rutas de logo, así el `gs://` nunca llega del cliente.
- `POST /:id/logo` — multipart, `preHandler: can('locales', 'edit')`. Máximo 2MB, extensiones `png`, `jpg`, `jpeg`, `webp`. Escribe en `locales/<folder>/logo-<ts>-<rand>.<ext>` y guarda el `gs://` en `logo_url`. `svg` queda fuera a propósito: se sirve con su propio Content-Type y puede contener script.
- `GET /:id/logo` — `can('locales', 'view')`, stream desde GCS con `Cache-Control: private, max-age=300`. 404 si no hay logo.
- `DELETE /:id/logo` — limpia `logo_url`. No borra el objeto en GCS (mismo criterio que los adjuntos de pagos: nada de borrados irreversibles desde la UI).

### Extracciones a `lib/`

Dos cosas que hoy están duplicadas o encerradas y que este trabajo necesita desde dos lados:

- `sanitizeFolderName` vive dentro de `routes/pagos.js`. Pasa a `lib/gcsPaths.js` junto con un helper `parseGsPath(gsPath) -> { bucket, filePath }` (hoy ese parseo está inline en `pagos.js:928-931`). `pagos.js` importa desde ahí.
- `isSuperAdmin` + el chequeo de `app.solo_super_admin` está repetido en tres handlers de `locales.js`. Pasa a un helper local del archivo, `assertLocalVisible(fastify, userId, local)`.

### `lib/localFicha.js` (nuevo, con tests)

Funciones puras, testeadas con `node --test` igual que `lib/snapshotLabels.test.js`:

- `normalizarUrl(texto)` — `''`/`null` → `null`; sin esquema → prefija `https://`; acepta solo `http:` y `https:` (rechaza `javascript:`, `data:` y cualquier otro esquema); devuelve `{ ok, value, error }`.
- `validarMail(texto)` — `''` → `null`; formato básico; `{ ok, value, error }`.

El frontend renderiza `maps_url` y `menu_url` como `<a href>`, por eso la validación de esquema es del backend y no solo cosmética.

## Frontend

### `admin/Locales.jsx`

Drawer a 620px, cuatro bloques:

```
IDENTIFICACIÓN
  [logo 96x96]   Grupo *            (select, label "Grupo")
                 Nombre fantasía *  (era "Nombre")
                 Tipo de local      (select del enum)

FISCAL
  Proveedor vinculado   (Combobox con búsqueda)
    Razón social / CUIT / Banco / CBU / Alias   → lectura
    [Editar en Proveedores]                     → link
  (sin proveedor vinculado, en lugar de los datos fiscales:
   "Vinculá el proveedor propio del local para ver acá su
    razón social, CUIT y datos bancarios.")

ENLACES
  Google Maps    (url)
  Menú / carta   (url)

CONTACTO
  Dirección · Teléfono · Mail recepción facturas
  [x] Activo
```

- El selector de proveedor reusa `components/Combobox.jsx` con `fetchItems = proveedoresApi.list({ search, activo: 'true', limit: 60 })` — el mismo patrón de `PagoForm.jsx:379`. Sin creación inline: se vincula o se desvincula, y para crear uno nuevo está la pantalla de Proveedores.
- El bloque de logo: preview, botón de subir, botón de quitar. Mientras el local no existe (alta), el upload queda deshabilitado con la leyenda "guardá el local para poder subir el logo" — la ruta necesita un `:id`.
- Tabla: logo miniatura junto al nombre, columna nueva "Tipo", y el header "App" pasa a "Grupo".
- `lib/tiposLocal.js` con el mapa valor→label para los `<select>` y la tabla.

### `api/locales.js`

Agregar `uploadLogo(id, file)`, `removeLogo(id)` y `logoSrc(id)` (la URL del proxy, para el `<img>`).

## Manejo de errores

- Extensión o tamaño de logo inválidos → 400 con el motivo, y `notify(...)` en la UI.
- Falla de stream de GCS → 502, mismo criterio que `pagos.js:944-947`.
- `GCS_BUCKET_NAME` sin configurar → 500 explícito.
- URL o mail inválidos → 400 con el nombre del campo; el drawer no se cierra y no se pierde lo tipeado.
- Proveedor inexistente en `id_proveedor` → 400 (`P2003`).

## Testing

- `lib/localFicha.test.js` — casos de `normalizarUrl` (vacío, sin esquema, `http`, `https`, `javascript:`, `data:`, basura) y de `validarMail`.
- `lib/gcsPaths.test.js` — `sanitizeFolderName` (acentos, `../`, vacío) y `parseGsPath`.
- Las rutas no tienen tests de integración en este proyecto; la verificación es manual, corriendo la app y cargando un local completo.

## Riesgos

**El `db push` toca producción.** No hay base de dev separada: `deploy-dev.yml` y `deploy.yml` despliegan al mismo Cloud Run contra la misma Cloud SQL. Antes de aplicar el cambio de esquema hay que correr `prisma migrate diff` y leer el SQL, porque `CLAUDE.md` advierte que el modelo `MultiMoneda` puede no estar aplicado todavía — un `db push` a ciegas aplicaría eso también, sin que sea parte de este trabajo.

**El pre-llenado de pagos.** Vincular proveedores desde esta pantalla activa un comportamiento que hasta ahora estaba dormido por falta de UI (ver arriba). Conviene probarlo con un local antes de cargar los demás.

## Orden de trabajo

1. Esquema: columnas + enum, `prisma generate`, revisar el diff de SQL antes de push.
2. `lib/gcsPaths.js` + `lib/localFicha.js` con sus tests; `pagos.js` pasa a importar de ahí.
3. Rutas: campos nuevos en POST/PUT, `include` del proveedor, tres rutas de logo.
4. `api/locales.js` + `lib/tiposLocal.js`.
5. Drawer y tabla.
6. Verificación manual en la app.
