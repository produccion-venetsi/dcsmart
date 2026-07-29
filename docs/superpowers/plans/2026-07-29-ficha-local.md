# Ficha de configuración del local — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar la ficha del local con logo, enlaces, tipo de local, mail de recepción de facturas e identidad fiscal leída del proveedor vinculado.

**Architecture:** Cinco columnas nullable nuevas en `locales` más un enum `TipoLocal`. La identidad fiscal no se duplica: se lee del `Proveedor` que apunta `Local.id_proveedor`, campo que ya existía y ya se consumía en `PagoForm` pero no tenía UI. El logo se sube a GCS por multipart y se sirve por un proxy autenticado del backend, calcando el patrón de los adjuntos de pagos. La validación de URLs y mail vive en un módulo puro testeado.

**Tech Stack:** Fastify 4, Prisma 5, PostgreSQL (Cloud SQL), React 18 + Vite, `@google-cloud/storage`, `node --test`.

Spec: `docs/superpowers/specs/2026-07-29-ficha-local-design.md`

## Global Constraints

- ESModules, `async/await`, nunca callbacks.
- Nombres de columnas en `snake_case`; tablas en plural.
- Todos los IDs son UUID v4.
- Tests con el runner nativo: `node --test` desde `backend/`.
- Comentarios y textos de UI en español, sin tildes en los mensajes de commit.
- **No correr `prisma db push` como parte de este plan.** No hay base de dev separada: `deploy-dev.yml` y `deploy.yml` apuntan a la misma Cloud SQL de producción. El plan deja el SQL generado para revisión humana.
- `logo_url` nunca se acepta desde el cliente en POST/PUT: se escribe solo desde las rutas de logo.

---

### Task 1: Esquema — columnas nuevas y enum `TipoLocal`

**Files:**
- Modify: `backend/prisma/schema.prisma:29-50` (model `Local`)
- Modify: `backend/prisma/schema.prisma` (enum nuevo, junto a `TipoTurno`)

**Interfaces:**
- Consumes: nada.
- Produces: `Local.logo_url`, `Local.maps_url`, `Local.menu_url`, `Local.mail_facturas`, `Local.tipo_local`; enum `TipoLocal` con valores `GASTRONOMIA | INDUMENTARIA | ARQUITECTURA | INMOBILIARIO | MULTIMEDIA`.

- [ ] **Step 1: Agregar las columnas al model `Local`**

```prisma
model Local {
  id            String     @id @default(uuid())
  nombre        String
  direccion     String?
  telefono      String?
  activo        Boolean    @default(true)
  id_app        String
  id_proveedor  String?
  logo_url      String?
  maps_url      String?
  menu_url      String?
  mail_facturas String?
  tipo_local    TipoLocal?
  created_at    DateTime   @default(now())
  updated_at    DateTime   @updatedAt
  // ...relaciones sin cambios
}
```

- [ ] **Step 2: Agregar el enum, al lado de `TipoTurno`**

```prisma
enum TipoLocal {
  GASTRONOMIA  @map("Gastronomía")
  INDUMENTARIA @map("Indumentaria")
  ARQUITECTURA @map("Arquitectura")
  INMOBILIARIO @map("Inmobiliario")
  MULTIMEDIA   @map("Multimedia")

  @@map("tipo_local")
}
```

Los `@map` legibles siguen el patrón de `TipoTurno`: `dcsmart-analisis` lee esta misma base sin contrato compartido.

- [ ] **Step 3: Verificar que el esquema es válido y generar el cliente**

Run: `cd backend; npx prisma validate; npx prisma generate`
Expected: "The schema at prisma\schema.prisma is valid" y "Generated Prisma Client".

- [ ] **Step 4: Generar el SQL del cambio para revisión, sin aplicarlo**

Run:
```bash
cd backend
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script > ../docs/superpowers/plans/2026-07-29-ficha-local.sql
```
Expected: un `.sql` con `CREATE TYPE tipo_local` y cinco `ALTER TABLE locales ADD COLUMN`. Si aparece cualquier `DROP` o algo de `multimoneda`, **detenerse y avisar** — significa que la base está desincronizada del esquema.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma docs/superpowers/plans/2026-07-29-ficha-local.sql
git commit -m "feat(schema): campos de ficha del local y enum TipoLocal"
```

---

### Task 2: `lib/localFicha.js` — validación de URLs y mail

**Files:**
- Create: `backend/src/lib/localFicha.js`
- Test: `backend/src/lib/localFicha.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizarUrl(texto) -> { ok: true, value: string|null } | { ok: false, error: string }`
  - `validarMail(texto) -> { ok: true, value: string|null } | { ok: false, error: string }`

- [ ] **Step 1: Escribir el test que falla**

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarUrl, validarMail } from './localFicha.js'

test('normalizarUrl deja null lo vacio', () => {
  for (const v of ['', '   ', null, undefined]) {
    assert.deepEqual(normalizarUrl(v), { ok: true, value: null })
  }
})

test('normalizarUrl prefija https cuando falta el esquema', () => {
  assert.deepEqual(normalizarUrl('maps.google.com/?q=878'),
    { ok: true, value: 'https://maps.google.com/?q=878' })
})

test('normalizarUrl respeta http y https', () => {
  assert.equal(normalizarUrl('https://a.com/x').value, 'https://a.com/x')
  assert.equal(normalizarUrl('http://a.com/x').value,  'http://a.com/x')
})

test('normalizarUrl recorta espacios', () => {
  assert.equal(normalizarUrl('  https://a.com  ').value, 'https://a.com/')
})

test('normalizarUrl rechaza esquemas peligrosos', () => {
  for (const v of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
    const r = normalizarUrl(v)
    assert.equal(r.ok, false, `deberia rechazar ${v}`)
  }
})

test('normalizarUrl rechaza basura sin host', () => {
  assert.equal(normalizarUrl('no es una url').ok, false)
})

test('validarMail deja null lo vacio', () => {
  assert.deepEqual(validarMail('  '), { ok: true, value: null })
})

test('validarMail acepta un mail normal y lo normaliza', () => {
  assert.deepEqual(validarMail('  Facturas@Local.COM '),
    { ok: true, value: 'facturas@local.com' })
})

test('validarMail rechaza lo que no es mail', () => {
  for (const v of ['facturas', 'facturas@', '@local.com', 'a b@local.com']) {
    assert.equal(validarMail(v).ok, false, `deberia rechazar ${v}`)
  }
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend; node --test src/lib/localFicha.test.js`
Expected: FAIL — no existe el módulo `./localFicha.js`.

- [ ] **Step 3: Implementación mínima**

```javascript
// Validacion de los campos de texto libre de la ficha del local. Vive aca y no
// en la ruta porque el frontend renderiza maps_url y menu_url como <a href>:
// dejar pasar un "javascript:" seria un XSS almacenado, asi que el filtro de
// esquema es del backend y no cosmetico.

const ESQUEMAS_OK = new Set(['http:', 'https:'])

export function normalizarUrl(texto) {
  const limpio = String(texto ?? '').trim()
  if (!limpio) return { ok: true, value: null }

  // Sin esquema asumimos https -- es lo que la gente pega desde el navegador.
  const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(limpio) ? limpio : `https://${limpio}`

  let url
  try {
    url = new URL(conEsquema)
  } catch {
    return { ok: false, error: 'No parece una URL valida' }
  }
  if (!ESQUEMAS_OK.has(url.protocol)) {
    return { ok: false, error: 'Solo se aceptan enlaces http o https' }
  }
  if (!url.hostname.includes('.')) {
    return { ok: false, error: 'No parece una URL valida' }
  }
  return { ok: true, value: url.toString() }
}

export function validarMail(texto) {
  const limpio = String(texto ?? '').trim().toLowerCase()
  if (!limpio) return { ok: true, value: null }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    return { ok: false, error: 'No parece un mail valido' }
  }
  return { ok: true, value: limpio }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd backend; node --test src/lib/localFicha.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/localFicha.js backend/src/lib/localFicha.test.js
git commit -m "feat(locales): validacion de urls y mail de la ficha del local"
```

---

### Task 3: `lib/gcsPaths.js` — extraer los helpers de GCS de `pagos.js`

**Files:**
- Create: `backend/src/lib/gcsPaths.js`
- Test: `backend/src/lib/gcsPaths.test.js`
- Modify: `backend/src/routes/pagos.js:126-137` (borrar `sanitizeFolderName`, importar) y `:928-931` (usar `parseGsPath`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `sanitizeFolderName(nombre) -> string` (nunca vacío: cae en `'general'`)
  - `parseGsPath(gsPath) -> { bucket, filePath } | null`
  - `contentTypePorExt(ext) -> string`

- [ ] **Step 1: Escribir el test que falla**

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeFolderName, parseGsPath, contentTypePorExt } from './gcsPaths.js'

test('sanitizeFolderName saca acentos y espacios', () => {
  assert.equal(sanitizeFolderName('Gran Danzón'), 'gran-danzon')
})

test('sanitizeFolderName neutraliza path traversal', () => {
  const r = sanitizeFolderName('../../etc')
  assert.ok(!r.includes('..'), `no deberia tener .. : ${r}`)
  assert.ok(!r.includes('/'),  `no deberia tener / : ${r}`)
})

test('sanitizeFolderName cae en general si queda vacio', () => {
  assert.equal(sanitizeFolderName(''),    'general')
  assert.equal(sanitizeFolderName(null),  'general')
  assert.equal(sanitizeFolderName('///'), 'general')
})

test('parseGsPath separa bucket y path', () => {
  assert.deepEqual(parseGsPath('gs://mi-bucket/locales/878/logo.png'),
    { bucket: 'mi-bucket', filePath: 'locales/878/logo.png' })
})

test('parseGsPath devuelve null si no es gs://', () => {
  for (const v of ['https://a.com/x.png', '', null, 'gs://solo-bucket']) {
    assert.equal(parseGsPath(v), null, `deberia ser null: ${v}`)
  }
})

test('contentTypePorExt mapea las imagenes y el pdf', () => {
  assert.equal(contentTypePorExt('png'),  'image/png')
  assert.equal(contentTypePorExt('webp'), 'image/webp')
  assert.equal(contentTypePorExt('jpg'),  'image/jpeg')
  assert.equal(contentTypePorExt('pdf'),  'application/pdf')
  assert.equal(contentTypePorExt('raro'), 'application/octet-stream')
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend; node --test src/lib/gcsPaths.test.js`
Expected: FAIL — no existe `./gcsPaths.js`.

- [ ] **Step 3: Implementación mínima**

```javascript
// Helpers de rutas de Google Cloud Storage. Estaban dentro de routes/pagos.js;
// se extrajeron cuando los locales necesitaron subir el logo con el mismo
// criterio de carpetas y el mismo proxy de lectura.

// El nombre del local se usa como carpeta en GCS -- se sanitiza para evitar
// que caracteres raros (o un intento de path traversal via "../") rompan
// la ruta del archivo dentro del bucket.
export function sanitizeFolderName(nombre) {
  const limpio = String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return limpio || 'general'
}

export function parseGsPath(gsPath) {
  if (typeof gsPath !== 'string' || !gsPath.startsWith('gs://')) return null
  const sinEsquema = gsPath.slice('gs://'.length)
  const corte      = sinEsquema.indexOf('/')
  if (corte <= 0 || corte === sinEsquema.length - 1) return null
  return { bucket: sinEsquema.slice(0, corte), filePath: sinEsquema.slice(corte + 1) }
}

const CONTENT_TYPES = {
  png:  'image/png',
  webp: 'image/webp',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  pdf:  'application/pdf',
}

export function contentTypePorExt(ext) {
  return CONTENT_TYPES[String(ext || '').toLowerCase()] || 'application/octet-stream'
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd backend; node --test src/lib/gcsPaths.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Hacer que `pagos.js` use el módulo**

En `backend/src/routes/pagos.js`: agregar `import { sanitizeFolderName, parseGsPath } from '../lib/gcsPaths.js'`, borrar la función local `sanitizeFolderName` y reemplazar el parseo inline del handler `/:id/attachment`:

```javascript
    const parsed = parseGsPath(gsPath)
    if (!parsed) return reply.code(404).send({ error: 'Sin adjunto' })
    const { bucket: bucketName, filePath } = parsed
```

El cálculo de `contentType` de ese handler se deja como está: distingue por `type` (`pdf` vs `foto`), no solo por extensión.

- [ ] **Step 6: Verificar que no rompí `pagos.js`**

Run: `cd backend; node --check src/routes/pagos.js; node --test src/lib/`
Expected: sin salida del `--check` y todos los tests de `lib/` en PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/gcsPaths.js backend/src/lib/gcsPaths.test.js backend/src/routes/pagos.js
git commit -m "refactor(gcs): extraer helpers de rutas de storage a lib/gcsPaths"
```

---

### Task 4: Rutas de `locales.js` — campos nuevos y proveedor en el join

**Files:**
- Modify: `backend/src/routes/locales.js` (completo)

**Interfaces:**
- Consumes: `normalizarUrl`, `validarMail` (Task 2).
- Produces: `GET /api/locales` y `GET /api/locales/:id` devuelven `proveedor` embebido; `POST`/`PUT` aceptan `id_proveedor`, `maps_url`, `menu_url`, `mail_facturas`, `tipo_local`.

- [ ] **Step 1: Importar los validadores y extraer el chequeo de visibilidad repetido**

Al tope del archivo:

```javascript
import { normalizarUrl, validarMail } from '../lib/localFicha.js'
```

Y reemplazar los tres usos sueltos de `isSuperAdmin` por un helper único:

```javascript
const PROVEEDOR_SELECT = {
  id: true, nombre: true, razon_social: true, cuit: true,
  banco: true, cbu: true, alias: true,
}

async function esSuperAdmin(fastify, userId) {
  const role = await fastify.db.userAppRole.findFirst({
    where: { id_user: userId, role: { nombre: 'super_admin' } }
  })
  return !!role
}
```

- [ ] **Step 2: Agregar el proveedor al `include` de los dos GET**

```javascript
      include: {
        app:       { select: { id: true, nombre: true, slug: true } },
        proveedor: { select: PROVEEDOR_SELECT },
      },
```

En `GET /:id` el `include` de `app` es completo (`app: true`) porque el handler lee `local.app.solo_super_admin`; agregarle `proveedor: { select: PROVEEDOR_SELECT }` al lado.

- [ ] **Step 3: Parsear y validar el cuerpo en un solo lugar**

```javascript
const TIPOS_LOCAL = new Set([
  'GASTRONOMIA', 'INDUMENTARIA', 'ARQUITECTURA', 'INMOBILIARIO', 'MULTIMEDIA'
])

// Devuelve { error } o { data } listo para Prisma. `logo_url` se ignora a
// proposito: solo las rutas de logo lo escriben, asi un cliente no puede
// apuntar el logo a un gs:// arbitrario.
function parseFicha(body) {
  const data = {}

  for (const [campo, valor] of [['maps_url', body.maps_url], ['menu_url', body.menu_url]]) {
    if (valor === undefined) continue
    const r = normalizarUrl(valor)
    if (!r.ok) return { error: `${campo}: ${r.error}` }
    data[campo] = r.value
  }

  if (body.mail_facturas !== undefined) {
    const r = validarMail(body.mail_facturas)
    if (!r.ok) return { error: `mail_facturas: ${r.error}` }
    data.mail_facturas = r.value
  }

  if (body.tipo_local !== undefined) {
    const t = body.tipo_local || null
    if (t && !TIPOS_LOCAL.has(t)) return { error: `tipo_local invalido: ${t}` }
    data.tipo_local = t
  }

  if (body.id_proveedor !== undefined) data.id_proveedor = body.id_proveedor || null

  return { data }
}
```

- [ ] **Step 4: Usar `parseFicha` en POST y PUT**

```javascript
    const { nombre, id_app, direccion, telefono, activo } = request.body
    if (!nombre || !id_app) return reply.code(400).send({ error: 'nombre e id_app son requeridos' })
    const ficha = parseFicha(request.body)
    if (ficha.error) return reply.code(400).send({ error: ficha.error })
    try {
      const local = await fastify.db.local.create({
        data: { nombre, id_app, direccion, telefono, activo: activo ?? true, ...ficha.data }
      })
```

En el PUT, igual: `data: { nombre, direccion, telefono, activo, ...ficha.data }`. En ambos, mapear `P2003` a 400 con `'App o proveedor no existe'`.

- [ ] **Step 5: Verificar sintaxis**

Run: `cd backend; node --check src/routes/locales.js`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/locales.js
git commit -m "feat(locales): campos de ficha en la api y proveedor en el join"
```

---

### Task 5: Rutas de logo

**Files:**
- Modify: `backend/src/routes/locales.js`

**Interfaces:**
- Consumes: `sanitizeFolderName`, `parseGsPath`, `contentTypePorExt` (Task 3).
- Produces: `POST /api/locales/:id/logo` (multipart, campo `file`) → `{ ok, url }`; `GET /api/locales/:id/logo` → stream; `DELETE /api/locales/:id/logo` → `{ ok }`.

- [ ] **Step 1: Registrar multipart y el cliente de Storage en el plugin**

```javascript
import { Storage } from '@google-cloud/storage'
import multipart from '@fastify/multipart'
import { sanitizeFolderName, parseGsPath, contentTypePorExt } from '../lib/gcsPaths.js'
import { normalizarUrl, validarMail } from '../lib/localFicha.js'

const EXT_LOGO  = new Set(['png', 'jpg', 'jpeg', 'webp'])
const MAX_LOGO  = 2 * 1024 * 1024

export default async function localesRoutes(fastify) {
  await fastify.register(multipart, { limits: { fileSize: MAX_LOGO } })
  const gcs = new Storage()
```

`svg` queda fuera a propósito: se serviría con su propio Content-Type y puede contener script.

- [ ] **Step 2: `POST /:id/logo`**

```javascript
  fastify.post('/:id/logo', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'edit')]
  }, async (request, reply) => {
    const local = await fastify.db.local.findUnique({
      where: { id: request.params.id },
      select: { id: true, nombre: true, app: { select: { solo_super_admin: true } } }
    })
    if (!local) return reply.code(404).send({ error: 'Local no encontrado' })
    if (local.app.solo_super_admin && !(await esSuperAdmin(fastify, request.user.id))) {
      return reply.code(404).send({ error: 'Local no encontrado' })
    }

    const bucket = process.env.GCS_BUCKET_NAME
    if (!bucket) return reply.code(500).send({ error: 'GCS_BUCKET_NAME no configurado' })

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'No se recibio archivo' })

    const ext = String(data.filename || '').split('.').pop().toLowerCase()
    if (!EXT_LOGO.has(ext)) {
      return reply.code(400).send({ error: `Tipo de archivo no permitido (.${ext}). Usa PNG, JPG o WEBP` })
    }

    const folder   = sanitizeFolderName(local.nombre)
    const filename = `locales/${folder}/logo-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const file     = gcs.bucket(bucket).file(filename)
    try {
      await new Promise((resolve, reject) => {
        const stream = file.createWriteStream({ metadata: { contentType: data.mimetype } })
        data.file.pipe(stream).on('error', reject).on('finish', resolve)
      })
    } catch (err) {
      if (data.file.truncated) {
        return reply.code(400).send({ error: 'El logo supera los 2 MB' })
      }
      fastify.log.error({ err, filename }, 'GCS logo upload error')
      return reply.code(502).send({ error: 'No se pudo subir el logo' })
    }
    if (data.file.truncated) {
      return reply.code(400).send({ error: 'El logo supera los 2 MB' })
    }

    const url = `gs://${bucket}/${filename}`
    await fastify.db.local.update({ where: { id: local.id }, data: { logo_url: url } })
    return { ok: true, url }
  })
```

- [ ] **Step 3: `GET /:id/logo`**

```javascript
  fastify.get('/:id/logo', { preHandler: viewHandler }, async (request, reply) => {
    const local = await fastify.db.local.findUnique({
      where: { id: request.params.id },
      select: { logo_url: true, app: { select: { solo_super_admin: true } } }
    })
    if (!local) return reply.code(404).send({ error: 'Local no encontrado' })
    if (local.app.solo_super_admin && !(await esSuperAdmin(fastify, request.user.id))) {
      return reply.code(404).send({ error: 'Local no encontrado' })
    }
    const parsed = parseGsPath(local.logo_url)
    if (!parsed) return reply.code(404).send({ error: 'Sin logo' })

    reply.header('Content-Type', contentTypePorExt(parsed.filePath.split('.').pop()))
    reply.header('Cache-Control', 'private, max-age=300')

    const stream = gcs.bucket(parsed.bucket).file(parsed.filePath).createReadStream({
      userProject: process.env.GCS_PROJECT_ID,
    })
    stream.on('error', (err) => {
      fastify.log.error({ err, logo: local.logo_url }, 'GCS logo stream error')
      if (!reply.sent) reply.code(502).send({ error: 'No se pudo obtener el logo' })
    })
    return reply.send(stream)
  })
```

- [ ] **Step 4: `DELETE /:id/logo`**

```javascript
  // Limpia la referencia, no borra el objeto en GCS: mismo criterio que los
  // adjuntos de pagos -- nada irreversible desde la UI.
  fastify.delete('/:id/logo', {
    preHandler: [fastify.authenticate, fastify.can('locales', 'edit')]
  }, async (request, reply) => {
    try {
      await fastify.db.local.update({
        where: { id: request.params.id },
        data:  { logo_url: null }
      })
      return { ok: true }
    } catch (err) {
      if (err.code === 'P2025') return reply.code(404).send({ error: 'Local no encontrado' })
      throw err
    }
  })
```

- [ ] **Step 5: Verificar sintaxis y que el server levanta el módulo**

Run: `cd backend; node --check src/routes/locales.js`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/locales.js
git commit -m "feat(locales): subida, lectura y borrado del logo del local"
```

---

### Task 6: Frontend — api, labels y drawer

**Files:**
- Modify: `frontend/src/api/locales.js`
- Create: `frontend/src/lib/tiposLocal.js`
- Modify: `frontend/src/pages/admin/Locales.jsx`

**Interfaces:**
- Consumes: las rutas de Task 4 y 5.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Ampliar `api/locales.js`**

```javascript
import client from './client.js'

export const localesApi = {
  list:   (params)   => client.get('/locales', { params }),
  get:    (id)       => client.get(`/locales/${id}`),
  create: (data)     => client.post('/locales', data),
  update: (id, data) => client.put(`/locales/${id}`, data),
  remove: (id)       => client.delete(`/locales/${id}`),

  uploadLogo: (id, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post(`/locales/${id}/logo`, fd)
  },
  removeLogo: (id) => client.delete(`/locales/${id}/logo`),
  // El bucket es privado: el <img> apunta al proxy del backend, no a GCS.
  logoSrc: (id) => `${client.defaults.baseURL}/locales/${id}/logo`,
}
```

- [ ] **Step 2: Crear `lib/tiposLocal.js`**

```javascript
// Los valores son los del enum TipoLocal de Prisma; las etiquetas, lo que ve
// el usuario. En la base quedan guardados con acento (ver @map del schema).
export const TIPOS_LOCAL = [
  { value: 'GASTRONOMIA',  label: 'Gastronomía'  },
  { value: 'INDUMENTARIA', label: 'Indumentaria' },
  { value: 'ARQUITECTURA', label: 'Arquitectura' },
  { value: 'INMOBILIARIO', label: 'Inmobiliario' },
  { value: 'MULTIMEDIA',   label: 'Multimedia'   },
]

export const labelTipoLocal = (value) =>
  TIPOS_LOCAL.find(t => t.value === value)?.label || '—'
```

- [ ] **Step 3: Drawer a 620px con los cuatro bloques**

En `Locales.jsx`:
- `EMPTY` pasa a incluir `id_proveedor: ''`, `maps_url: ''`, `menu_url: ''`, `mail_facturas: ''`, `tipo_local: ''`.
- `openEdit(l)` carga esos campos y guarda el proveedor embebido en un estado `provSelected` para que el `Combobox` muestre su nombre.
- `<DrawerPanel width={620}>`.
- Un subcomponente `Seccion({ titulo, children })` que renderiza el título del bloque, para no repetir estilos inline.
- Bloque IDENTIFICACIÓN: logo + Grupo (label "Grupo", el select de apps que ya existe) + Nombre fantasía + Tipo de local (`TIPOS_LOCAL.map`) + el UUID con botón de copiar (solo en edición).
- Bloque FISCAL: `Combobox` de proveedor + los datos en lectura o el texto de ayuda si no hay ninguno.
- Bloque ENLACES: `maps_url`, `menu_url` (`type="url"`).
- Bloque CONTACTO: dirección, teléfono, `mail_facturas` (`type="email"`), checkbox Activo.

El `Combobox` se alimenta igual que en `PagoForm.jsx:379`:

```javascript
  const fetchProveedores = (search) =>
    proveedoresApi.list({ search, activo: 'true', limit: 60 }).then(r => r.data.data)
```

Copiar el id:

```javascript
  const copiarId = async () => {
    try {
      await navigator.clipboard.writeText(selected.id)
      notify('ID copiado', 'success')
    } catch {
      notify('No se pudo copiar', 'error')
    }
  }
```

- [ ] **Step 4: Logo en el drawer**

El upload necesita un `:id`, así que en el alta queda deshabilitado con la leyenda "Guardá el local para poder subir el logo". En edición: preview vía `localesApi.logoSrc(id)` (con un `key` que cambie después de subir, para saltear el caché del navegador), botón de subir y botón de quitar.

```javascript
  const [logoVer, setLogoVer] = useState(0)   // invalida el cache del <img>
  const [logoBusy, setLogoBusy] = useState(false)

  const subirLogo = async (file) => {
    if (!file || !selected) return
    setLogoBusy(true)
    try {
      await localesApi.uploadLogo(selected.id, file)
      setLogoVer(v => v + 1)
      setSelected(s => ({ ...s, logo_url: 'gs://pendiente' }))
      notify('Logo actualizado', 'success')
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error al subir el logo', 'error') }
    finally { setLogoBusy(false) }
  }
```

- [ ] **Step 5: Tabla — logo miniatura, columna Tipo y "Grupo"**

El header pasa de `App` a `Grupo`; se agrega `<th>Tipo</th>`; la celda del nombre muestra el logo en 26x26 junto al texto cuando el local tiene `logo_url`. Ajustar el `colSpan` del empty state de 6 a 7 y el `length` de las columnas del skeleton.

- [ ] **Step 6: Verificar que el frontend compila**

Run: `cd frontend; npm run build`
Expected: build exitoso, sin errores de sintaxis ni imports faltantes.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/locales.js frontend/src/lib/tiposLocal.js frontend/src/pages/admin/Locales.jsx
git commit -m "feat(locales): ficha ampliada del local en el drawer de admin"
```

---

## Verificación final

- [ ] `cd backend; node --test src/lib/` → todos los tests en PASS.
- [ ] `cd backend; node --check src/routes/locales.js src/routes/pagos.js` → sin salida.
- [ ] `cd frontend; npm run build` → exitoso.
- [ ] El `.sql` generado en Task 1 revisado: solo `CREATE TYPE` y `ADD COLUMN`.

## Lo que queda fuera y hay que hacer a mano

- **Aplicar el esquema.** El `db push` toca la base de producción (no hay dev separada) y `CLAUDE.md` avisa que `MultiMoneda` puede estar sin aplicar. Requiere decisión humana con el `.sql` a la vista.
- **Verificación en la app corriendo:** necesita `cloud-sql-proxy` en el puerto 5433 (el 5432 está tomado por el servicio de Windows) y credenciales de GCS.
