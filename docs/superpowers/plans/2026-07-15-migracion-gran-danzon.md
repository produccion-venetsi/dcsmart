# Migración Gran Danzón — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar cajas y pagos del local Gran Danzón (`d77f7288`) desde los CSV recibidos a la base
real de DCSmart, con resolución en cascada de proveedores/rubcat contra el catálogo existente.

**Architecture:** Un único script Node (`migraciones/import-gran-danzon.cjs`, CommonJS, sin
dependencias nuevas — mismo patrón que `import-nuevos-locales.cjs`), con modo `--dry-run` para
verificar conteos antes de escribir en la base real. No es parte de la app `dcsmart` (vive en la
carpeta `migraciones/`, que no es un repo git ni tiene test runner propio) — la verificación es por
conteos de dry-run y queries SQL directas, mismo patrón ya usado en las migraciones anteriores (878,
ATTE/GRIS GRIS).

**Tech Stack:** Node.js (CommonJS), `@prisma/client` (ya instalado en `dcsmart/backend`, el script se
corre con ese `node_modules`), Cloud SQL vía `cloud-sql-proxy` en el puerto 5433.

## Global Constraints

- Montos siempre positivos en la base; la dirección va en un campo aparte (`ingresa_egreso`,
  `DetalleTipo.clasificacion`), nunca en el signo del número.
- IDs reusados tal cual del CSV cuando el modelo lo permite (`Pago.id`); IDs nuevos se generan con
  `randomUUID()` (`Caja.id`) o los genera Prisma (`Proveedor.id` nuevo, `@default(uuid())`).
- `prisma db push` es el mecanismo de schema en este repo (no hay `prisma/migrations`).
- No pushear/mergear a `master` sin confirmación explícita del usuario (no aplica directamente a este
  plan — no toca `master` — pero la corrida real sí escribe en la base compartida real de producción).
- Antes de correr contra la base real: túnel `cloud-sql-proxy.exe --gcloud-auth --port 5433
  dc-smart-mvp:us-central1:dcsmart-mvp-insta` debe estar activo, y `dcsmart/backend/.env` debe
  apuntar a `localhost:5433`.

---

## Mapa de archivos

```
migraciones/
├── import-gran-danzon.cjs         (nuevo — script completo de esta migración)
└── PENDIENTES_GRAN_DANZON.md      (nuevo — generado por el script en su corrida final)

dcsmart/backend/prisma/schema.prisma   (modificar: agrega FF y NCB al enum TipoPago)
```

---

### Task 1: Schema — agrega `FF` y `NCB` al enum `TipoPago`

**Files:**
- Modify: `dcsmart/backend/prisma/schema.prisma`

**Interfaces:**
- Produces: valores de enum `TipoPago.FF` y `TipoPago.NCB`, consumidos por Task 4 (`fasePagos`) al
  validar la columna `TIPO` del CSV de pagos.

- [ ] **Step 1: Agregar los valores al enum**

En `dcsmart/backend/prisma/schema.prisma`, buscar el enum `TipoPago` (ver líneas 399-416 actuales) y
agregar `FF` y `NCB` (en cualquier posición del enum, antes del `@@map`):

```prisma
enum TipoPago {
  A
  B
  C
  CM
  DC_1 @map("DC (1)")
  DC_2 @map("DC (2)")
  DDJJ
  FF
  LF
  M
  NCA
  NCB
  NDA
  ND
  STK
  X

  @@map("tipo_pago")
}
```

- [ ] **Step 2: Aplicar el schema a la base y regenerar el cliente**

Con el túnel `cloud-sql-proxy` activo en el puerto 5433 y `dcsmart/backend/.env` apuntando ahí:

```bash
cd dcsmart/backend
npx prisma db push
npx prisma generate
```
Expected: `Your database is now in sync with your Prisma schema.` y `Generated Prisma Client`. Si
falla `generate` por archivo bloqueado, parar cualquier proceso `node` corriendo el backend local
antes de reintentar.

- [ ] **Step 3: Commit**

```bash
cd dcsmart
git add backend/prisma/schema.prisma
git commit -m "Migración Gran Danzón: agrega FF y NCB al enum TipoPago"
```

---

### Task 2: Script — utilidades de CSV, catálogo de métodos, y resolución de proveedores/rubcat

**Files:**
- Create: `migraciones/import-gran-danzon.cjs`

**Interfaces:**
- Consumes: `@prisma/client` (`dcsmart/backend/node_modules`), `migraciones/.remap-rubcat.json`
  (remap de códigos duplicados de 878), `migraciones/migraciones-nuevas/gran-danzon/*.csv`.
- Produces: funciones `parseCSV`, `loadCSV`, `parseMonto`, `parseFechaDMY`, `parsePeriodoMY`,
  `extractEmailAndDate`, `normalizar`, `ensureUser(email, cache)`, `ensureMetodosPago(labels)`,
  `resolverProveedor(raw, state)` (recibe `{idSet: Set<string>, byNombreNorm: Map, byRazonNorm: Map,
  creadosNorm: Map}`, devuelve `string|null` — el `id_proveedor` a usar), `resolverRubcat(raw, remap,
  rubcatIds)` (devuelve `string|null`) — todas consumidas por Task 3 (`faseCajas`) y Task 4
  (`fasePagos`).

- [ ] **Step 1: Crear el archivo con parsers, catálogos y config**

Crear `migraciones/import-gran-danzon.cjs`:

```js
// Migración de Gran Danzón (cajas + pagos), local único d77f7288.
// Resuelve proveedores/rubcat contra el catálogo ya migrado con 878 (no crea
// catálogos rubcat nuevos): lo que no matchea queda con id_proveedor/id_rubcat
// en null (proveedores se crean automáticamente, rubcat queda pendiente,
// ver PENDIENTES_GRAN_DANZON.md).
//
// Uso:
//   node import-gran-danzon.cjs --dry-run     (no escribe nada, solo reporta)
//   node import-gran-danzon.cjs cajas          (inserta cajas)
//   node import-gran-danzon.cjs pagos          (inserta pagos)
//   node import-gran-danzon.cjs all            (cajas + pagos)
'use strict'
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const BASE_DIR = 'C:/Users/agusl/Repos/dcsmart-apps/migraciones'
const DRY_RUN = process.argv.includes('--dry-run')

const GD_LOCAL_ID = 'd77f7288'
const GD_APP_ID = 'de65e614-453c-4fa1-9fbd-9757ee1daa68'
const CAJA_FILE = 'migraciones-nuevas/gran-danzon/GRDANZON-PAGOS - Copia de CAJA_MIGRADOS.csv'
const PAGOS_FILE = 'migraciones-nuevas/gran-danzon/GRDANZON-PAGOS - Copia de PAGOS_MIGRADOS.csv'

// ── CSV parser (RFC4180 básico, idéntico a import-nuevos-locales.cjs) ──────
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

function loadCSV(fullPath) {
  const text = fs.readFileSync(fullPath, 'utf8')
  const rows = parseCSV(text)
  const header = rows[0].map((h) => h.trim())
  const data = rows.slice(1).filter((r) => r.length === header.length && r.some(Boolean))
  const idx = (name) => {
    const i = header.indexOf(name)
    if (i === -1) throw new Error(`Columna no encontrada: "${name}" en ${fullPath}`)
    return i
  }
  return { header, data, idx }
}

// ── Parsers de campo (idénticos a import-nuevos-locales.cjs) ───────────────
function parseMonto(str) {
  if (str == null) return null
  let s = String(str).trim()
  if (!s) return null
  let neg = false
  if (s.startsWith('-')) { neg = true; s = s.slice(1).trim() }
  s = s.replace(/\$/g, '').trim()
  if (s.startsWith('-')) { neg = true; s = s.slice(1).trim() }

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    const dotCount = (s.match(/\./g) || []).length
    if (dotCount === 1) {
      const decimales = s.split('.')[1].length
      if (decimales === 3) s = s.replace(/\./g, '')
    } else if (dotCount > 1) {
      s = s.replace(/\./g, '')
    }
  }
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return neg ? -n : n
}

function parseFechaDMY(str) {
  if (!str) return null
  const s = String(str).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const [, d, mo, y, h = '0', mi = '0', se = '0'] = m
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se))
}

function parsePeriodoMY(str) {
  if (!str) return null
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return new Date(Date.UTC(+m[2], +m[1] - 1, 1))
}

function extractEmailAndDate(str) {
  if (!str) return { email: null, date: null }
  const s = String(str).trim()
  const parts = s.split('/').map((p) => p.trim())
  const last = parts[parts.length - 1]
  const emailMatch = last.match(/[^\s]+@[^\s]+/)
  if (emailMatch) {
    const email = emailMatch[0].toLowerCase()
    const rest = s.slice(0, s.lastIndexOf('/')).trim()
    const date = parseFechaDMY(rest)
    return { email, date }
  }
  if (/^[^\s]+@[^\s]+$/.test(s)) return { email: s.toLowerCase(), date: null }
  return { email: null, date: null }
}

async function ensureUser(email, cache) {
  if (!email) return null
  const key = email.toLowerCase()
  if (cache.has(key)) return cache.get(key)
  if (DRY_RUN) { cache.set(key, { id: null }); return { id: null } }
  let user = await prisma.user.findUnique({ where: { email: key } })
  if (!user) {
    user = await prisma.user.create({
      data: { email: key, nombre: `(migración) ${key}`, password_hash: null, activo: false }
    })
    console.log(`  usuario creado: ${key}`)
  }
  cache.set(key, user)
  return user
}

// Normaliza para matchear nombres que difieren solo en mayúsculas/acentos/separadores.
function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// ── Catálogos ────────────────────────────────────────────────────────────
const METODO_MAP = {
  'TRANSFERENCIA': 'Transferencia',
  'EFECTIVO': 'Efectivo',
  'INTERCOMPANY': 'Intercompany',
  'MP': 'Mercado Pago',
  'CUENTA CTE': 'Cuenta Cte.',
  'TARJETA DE CREDITO': 'Tarjeta crédito',
  'DEBITO AUTOMATICO': 'Débito Automático',
  'NOTA DE CREDITO': 'Nota de Crédito',
  'E-CHEQUE': 'E-Cheque'
}
const TIPO_MAP = { 'DC (1)': 'DC_1', 'DC (2)': 'DC_2' }
const VALID_TIPOS = new Set(['A', 'B', 'C', 'CM', 'DC_1', 'DC_2', 'DDJJ', 'FF', 'LF', 'M', 'NCA',
  'NCB', 'NDA', 'ND', 'STK', 'X'])
const ESTADO_MAP = { 'CAJA': 'CAJA', 'CUENTA CTE': 'CUENTA_CTE', 'MP PDP': 'MP_PDP', 'PDP': 'PDP' }
const TIPO_TURNO_MAP = { 'Mañana': 'MANANA', 'Manana': 'MANANA', 'Tarde': 'TARDE', 'Dia': 'TARDE',
  'Noche': 'NOCHE', 'Trasnoche': 'TRASNOCHE', 'Evento': 'EVENTO', 'Otros': 'OTROS' }

// Columnas de detalle de caja: todas clasificación 'ingreso' -- este local no
// tiene ninguna columna tipo "Gastos" (a diferencia de ATTE/GRIS GRIS).
const CAJA_DETALLE_COLS = [
  ['LAPOS/PAYWAY', 'ingreso'], ['MP LINK', 'ingreso'], ['MP QR', 'ingreso'],
  ['MP POINT DEBITO', 'ingreso'], ['MP POINT CREDITO', 'ingreso'],
  ['MP INTEGRACION APP', 'ingreso'], ['PIX', 'ingreso'], ['RAPPI', 'ingreso'],
  ['PEDIDOS YA', 'ingreso'], ['TRANSFERENCIA', 'ingreso']
]

// ── Registro de pendientes (para PENDIENTES_GRAN_DANZON.md) ─────────────
const pendientes = {
  proveedoresCreados: [], // [{raw, id}] -- proveedores nuevos creados automáticamente
  rubcat: new Map(),      // código RC / etiqueta faltante -> [{op}]
  tipos: new Map(),       // valor TIPO no válido -> [{op}]
}
function registrarPendiente(mapa, key, info) {
  if (!mapa.has(key)) mapa.set(key, [])
  mapa.get(key).push(info)
}

async function ensureDetalleTipos(appId, cols) {
  const map = {}
  for (const [nombre, clasificacion] of cols) {
    if (DRY_RUN) { map[nombre] = `dry-${nombre}`; continue }
    const dt = await prisma.detalleTipo.upsert({
      where: { nombre_id_app: { nombre, id_app: appId } },
      create: { nombre, id_app: appId, clasificacion },
      update: {}
    })
    map[nombre] = dt.id
  }
  return map
}

async function ensureMetodosPago(csvLabelsEncontrados) {
  const existentes = await prisma.metodoPago.findMany({ select: { id: true, nombre: true } })
  const porNombreNorm = new Map(existentes.map((m) => [normalizar(m.nombre), m]))

  const map = {}
  for (const csvLabel of csvLabelsEncontrados) {
    if (METODO_MAP[csvLabel]) {
      const nombre = METODO_MAP[csvLabel]
      let m = porNombreNorm.get(normalizar(nombre))
      if (!m && !DRY_RUN) {
        m = await prisma.metodoPago.upsert({ where: { nombre }, create: { nombre }, update: {} })
        porNombreNorm.set(normalizar(nombre), m)
      }
      map[csvLabel] = m ? m.id : null
      if (!m) console.log(`  ⚠ método de pago "${nombre}" (mapeado desde "${csvLabel}") NO existe en la base`)
      continue
    }
    const existenteNorm = porNombreNorm.get(normalizar(csvLabel))
    if (existenteNorm) { map[csvLabel] = existenteNorm.id; continue }
    if (DRY_RUN) { map[csvLabel] = `dry-metodo-${normalizar(csvLabel)}`; console.log(`  [dry-run] método de pago nuevo a crear: "${csvLabel}"`); continue }
    const creado = await prisma.metodoPago.upsert({ where: { nombre: csvLabel }, create: { nombre: csvLabel }, update: {} })
    porNombreNorm.set(normalizar(csvLabel), creado)
    map[csvLabel] = creado.id
    console.log(`  método de pago nuevo creado: "${csvLabel}"`)
  }
  return map
}

// Resuelve id_proveedor en cascada: 1) match directo por id, 2) por nombre
// normalizado, 3) por razon_social normalizada, 4) crea un Proveedor nuevo.
// `state`: { idSet: Set<string>, byNombreNorm: Map<string,string>,
// byRazonNorm: Map<string,string>, creadosNorm: Map<string,string> }
async function resolverProveedor(raw, state) {
  if (!raw) return null
  if (state.idSet.has(raw)) return raw
  const norm = normalizar(raw)
  if (state.byNombreNorm.has(norm)) return state.byNombreNorm.get(norm)
  if (state.byRazonNorm.has(norm)) return state.byRazonNorm.get(norm)
  if (state.creadosNorm.has(norm)) return state.creadosNorm.get(norm)

  if (DRY_RUN) {
    const fakeId = `dry-prov-${norm}`
    state.creadosNorm.set(norm, fakeId)
    pendientes.proveedoresCreados.push({ raw, id: fakeId })
    return fakeId
  }
  const nuevo = await prisma.proveedor.create({ data: { nombre: raw, activo: true } })
  state.creadosNorm.set(norm, nuevo.id)
  state.idSet.add(nuevo.id)
  pendientes.proveedoresCreados.push({ raw, id: nuevo.id })
  return nuevo.id
}

// Resuelve id_rubcat: match directo por id, si no vía el remap de duplicados
// de 878 (.remap-rubcat.json). Si no matchea nada, queda pendiente (null).
function resolverRubcat(raw, remap, rubcatIds) {
  if (!raw) return null
  if (rubcatIds.has(raw)) return raw
  const remapped = remap.get(raw)
  if (remapped && rubcatIds.has(remapped)) return remapped
  return null
}

async function insertBatched(model, rows, label) {
  if (DRY_RUN) { console.log(`  [dry-run] ${label}: ${rows.length} filas listas para insertar`); return rows.length }
  const BATCH = 500
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const lote = rows.slice(i, i + BATCH)
    const r = await prisma[model].createMany({ data: lote, skipDuplicates: true })
    total += r.count
  }
  console.log(`  ${label}: ${total} insertados`)
  return total
}

module.exports = {
  parseCSV, loadCSV, parseMonto, parseFechaDMY, parsePeriodoMY, extractEmailAndDate, normalizar,
  ensureUser, ensureDetalleTipos, ensureMetodosPago, resolverProveedor, resolverRubcat,
  insertBatched, registrarPendiente, pendientes, GD_LOCAL_ID, GD_APP_ID, CAJA_FILE, PAGOS_FILE,
  BASE_DIR, DRY_RUN, TIPO_MAP, VALID_TIPOS, ESTADO_MAP, TIPO_TURNO_MAP, CAJA_DETALLE_COLS, prisma
}
```

- [ ] **Step 2: Verificar que el archivo carga sin errores de sintaxis**

```bash
cd migraciones
node -e "require('./import-gran-danzon.cjs'); console.log('OK: módulo carga sin errores')"
```
Expected: `OK: módulo carga sin errores`.

- [ ] **Step 3: Probar `resolverProveedor` y `resolverRubcat` con datos reales (dry-run manual)**

Con el túnel `cloud-sql-proxy` activo en 5433:

```bash
cd migraciones
node -e "
const m = require('./import-gran-danzon.cjs');
(async () => {
  const proveedores = await m.prisma.proveedor.findMany({ select: { id: true, nombre: true, razon_social: true } });
  const state = {
    idSet: new Set(proveedores.map(p => p.id)),
    byNombreNorm: new Map(proveedores.filter(p => p.nombre).map(p => [m.normalizar(p.nombre), p.id])),
    byRazonNorm: new Map(proveedores.filter(p => p.razon_social).map(p => [m.normalizar(p.razon_social), p.id])),
    creadosNorm: new Map()
  };
  console.log('TSGWWOJO ->', await m.resolverProveedor('TSGWWOJO', state));   // debe ser 'TSGWWOJO' (match directo)
  console.log('Baraghost ->', await m.resolverProveedor('Baraghost', state)); // debe ser '2967fa89' (match por nombre)
  console.log('FEMSA ->', await m.resolverProveedor('FEMSA', state));         // debe ser '2d007639' (match por razon_social)

  const remap = new Map(JSON.parse(require('fs').readFileSync(m.BASE_DIR + '/.remap-rubcat.json', 'utf8')));
  const rubcatIds = new Set((await m.prisma.rubCat.findMany({ select: { id: true } })).map(r => r.id));
  console.log('RC-0110 ->', m.resolverRubcat('RC-0110', remap, rubcatIds)); // debe ser 'RC-0005' (via remap)
  console.log('RC-0098 ->', m.resolverRubcat('RC-0098', remap, rubcatIds)); // debe ser null (sin resolver)
  await m.prisma.\$disconnect();
})();
"
```
Expected: `TSGWWOJO -> TSGWWOJO`, `Baraghost -> 2967fa89`, `FEMSA -> 2d007639`, `RC-0110 -> RC-0005`,
`RC-0098 -> null`. Si alguno no matchea así, revisar la lógica de `normalizar`/las queries antes de
seguir — este paso NO escribe en la base (solo lee), es seguro re-correrlo.

- [ ] **Step 4: Commit**

```bash
cd migraciones
git add import-gran-danzon.cjs 2>/dev/null || true
```
Nota: `migraciones/` no es un repo git (confirmado al inicio de la sesión) — este `git add` va a
fallar con "not a git repository", lo cual es esperado; el archivo queda guardado en disco sin
control de versiones, igual que el resto de los scripts de esa carpeta (`import.cjs`,
`import-nuevos-locales.cjs`). No hace falta ningún otro paso de commit para este archivo.

---

### Task 3: Fase Cajas

**Files:**
- Modify: `migraciones/import-gran-danzon.cjs` (agrega la función `faseCajas` y el dispatch en `main`)

**Interfaces:**
- Consumes: `loadCSV`, `parseMonto`, `parseFechaDMY`, `extractEmailAndDate`, `ensureUser`,
  `ensureDetalleTipos`, `insertBatched`, `TIPO_TURNO_MAP`, `CAJA_DETALLE_COLS`, `GD_LOCAL_ID`,
  `GD_APP_ID`, `CAJA_FILE`, `BASE_DIR` (todos de Task 2).
- Produces: función `faseCajas(userCache)` — inserta `Caja`, `CajaDetalle`, `Audit` (tabla `cajas`).

- [ ] **Step 1: Agregar `faseCajas` al final de `import-gran-danzon.cjs`, antes de `module.exports`**

```js
// ── FASE: CAJAS ─────────────────────────────────────────────────────────
async function faseCajas(userCache) {
  console.log('\n=== CAJAS: Gran Danzón ===')
  const { data, idx } = loadCSV(path.join(BASE_DIR, CAJA_FILE))
  const detalleTipoMap = await ensureDetalleTipos(GD_APP_ID, CAJA_DETALLE_COLS)

  const iEmail = idx('Dirección de correo electrónico'), iFecha = idx('Fecha'), iTurno = idx('Turno'),
        iNombre = idx('Nombre'), iFiscal = idx('Fiscal'), iTotalVentas = idx('TotalVentas'),
        iEfectivo = idx('Efectivo'), iDif = idx('Dif de caja'), iCubiertos = idx('Cubiertos'),
        iFoto = idx('FOTO CIERRE'), iNotas = idx('Notas/obs'), iAuditada = idx('Auditada'),
        iLocal = idx('Local')

  const emailsUnicos = new Set()
  data.forEach((row) => {
    const { email } = extractEmailAndDate(row[iEmail]); if (email) emailsUnicos.add(email)
  })
  for (const email of emailsUnicos) await ensureUser(email, userCache)
  console.log(`  usuarios resueltos: ${emailsUnicos.size}`)

  const cajasRows = [], detallesRows = [], auditsRows = []
  let sinLocal = 0, sinFecha = 0

  for (const row of data) {
    if (row[iLocal] !== GD_LOCAL_ID) { sinLocal++; continue }
    const fechaInicio = parseFechaDMY(row[iFecha])
    if (!fechaInicio) { sinFecha++; continue }

    const { email: creatorEmail } = extractEmailAndDate(row[iEmail])
    const creador = creatorEmail ? userCache.get(creatorEmail) : null

    const dif = parseMonto(row[iDif])
    let observaciones = row[iNotas] || null
    if (dif && dif !== 0) {
      observaciones = (observaciones ? observaciones + ' | ' : '') + `Dif de caja: ${dif}`
    }

    const turnoRaw = row[iTurno]
    const tipoTurno = turnoRaw ? (TIPO_TURNO_MAP[turnoRaw] || null) : null
    if (turnoRaw && !tipoTurno) console.log(`  ⚠ Turno "${turnoRaw}" sin mapeo a TipoTurno -- queda sin tipo_turno`)

    const cajaId = randomUUID()
    cajasRows.push({
      id: cajaId,
      fecha_inicio: fechaInicio,
      tipo_turno: tipoTurno,
      cajero: row[iNombre] || null,
      total: parseMonto(row[iTotalVentas]),
      efectivo: parseMonto(row[iEfectivo]),
      fiscal: parseMonto(row[iFiscal]),
      comensales: row[iCubiertos] ? parseInt(row[iCubiertos]) || null : null,
      tickets: null,
      observaciones,
      foto_url: row[iFoto] || null,
      id_local: GD_LOCAL_ID,
      created_by: creador ? creador.id : null
    })

    for (const [col] of CAJA_DETALLE_COLS) {
      const monto = parseMonto(row[idx(col)])
      if (!monto) continue
      detallesRows.push({ id_caja: cajaId, id_tipo: detalleTipoMap[col], nombre: col, monto: Math.abs(monto) })
    }

    if (row[iAuditada] === 'TRUE' || row[iAuditada] === 'True') {
      auditsRows.push({
        id_registro: cajaId, tabla: 'cajas', tipo: 'auditoria_caja', accion: 'auditado',
        aprobado: true, vigente: true, audit_dc: false,
        id_user: null, fecha: fechaInicio
      })
    }
  }

  await insertBatched('caja', cajasRows, 'cajas')
  await insertBatched('cajaDetalle', detallesRows, 'caja_detalles')
  await insertBatched('audit', auditsRows, 'audits (cajas)')
  console.log(`cajas: ${cajasRows.length} (${sinLocal} de otro local, ${sinFecha} sin fecha válida, omitidas), auditadas: ${auditsRows.length}`)
}

module.exports.faseCajas = faseCajas
```

- [ ] **Step 2: Correr en modo dry-run y verificar los conteos**

```bash
cd migraciones
node -e "
const m = require('./import-gran-danzon.cjs');
(async () => { await m.faseCajas(new Map()); await m.prisma.\$disconnect(); })();
" -- --dry-run
```
Nota: para que `process.argv.includes('--dry-run')` detecte la flag corriendo con `node -e`, hay que
pasarla después de `--`: el comando de arriba ya lo hace. Expected: log `usuarios resueltos: N`,
`[dry-run] cajas: ~907 filas listas para insertar` (menos las que no matcheen `Local`/fecha inválida),
`[dry-run] caja_detalles: ...`, `[dry-run] audits (cajas): ...`, sin ninguna escritura real (dry-run
no toca la base).

- [ ] **Step 3: Confirmar que no se escribió nada real**

```bash
cd dcsmart/backend
node -e "
import('@prisma/client').then(async ({PrismaClient}) => {
  const prisma = new PrismaClient();
  const count = await prisma.caja.count({ where: { id_local: 'd77f7288' } });
  console.log('cajas de Gran Danzón en la base:', count);
  await prisma.\$disconnect();
});
"
```
Expected: `cajas de Gran Danzón en la base: 0` (el dry-run no debe haber insertado nada).

---

### Task 4: Fase Pagos

**Files:**
- Modify: `migraciones/import-gran-danzon.cjs` (agrega la función `fasePagos` y el dispatch en `main`)

**Interfaces:**
- Consumes: `loadCSV`, `parseMonto`, `parseFechaDMY`, `parsePeriodoMY`, `extractEmailAndDate`,
  `ensureUser`, `ensureMetodosPago`, `resolverProveedor`, `resolverRubcat`, `registrarPendiente`,
  `pendientes`, `insertBatched`, `TIPO_MAP`, `VALID_TIPOS`, `ESTADO_MAP`, `GD_LOCAL_ID`,
  `PAGOS_FILE`, `BASE_DIR` (todos de Task 2).
- Produces: función `fasePagos(remap, proveedorState, rubcatIds, metodoIdByLabel, userCache)` —
  inserta `Pago`, `Impuesto`, `Audit` (tabla `pagos`).

- [ ] **Step 1: Agregar `fasePagos` al final de `import-gran-danzon.cjs`, después de `faseCajas`**

```js
// ── FASE: PAGOS ─────────────────────────────────────────────────────────
async function fasePagos(remap, proveedorState, rubcatIds, metodoIdByLabel, userCache) {
  console.log('\n=== PAGOS: Gran Danzón ===')
  const { data, idx } = loadCSV(path.join(BASE_DIR, PAGOS_FILE))

  const iId = idx('ID'), iNroOrd = idx('Numero de Orden'), iFecha = idx('FECHA FACTURA'),
        iProv = idx('RAZON SOCIAL'), iRubcat = idx('RUBRO/CATEGORIA'), iTipo = idx('TIPO'),
        iPv = idx('PV'), iNro = idx('Nro'),
        iIva27 = idx('IVA 27%'), iIva10 = idx('IVA 10%'), iIva21 = idx('IVA 21%'),
        iPercIva = idx('Perc. IVA'), iPercIibb = idx('Perc. IIBB'), iImpInternos = idx('Imp. Internos'),
        iRetenciones = idx('Retenciones'),
        iNeto = idx('Importe Neto'), iDescuento = idx('Descuento'), iImporte = idx('IMPORTE'),
        iCmv = idx('CMV_IMPORTE'),
        iForma = idx('Forma de pago'), iVenc = idx('Fecha vencimiento factura'), iObs = idx('OBSERVACIONES'),
        iPagado = idx('PAGADO'), iFdp = idx('FDP'), iEstado = idx('ESTADO OP'),
        iFoto = idx('Foto Factura'), iUser = idx('user'), iPeriodo = idx('PERIODO'),
        iPdf = idx('PDF'), iIdPdp = idx('ID_PDP'), iAud = idx('AUD'), iLocal = idx('App_ID')

  let sinLocal = 0

  const emailsUnicos = new Set()
  data.forEach((row) => { const { email } = extractEmailAndDate(row[iUser]); if (email) emailsUnicos.add(email) })
  for (const email of emailsUnicos) await ensureUser(email, userCache)
  console.log(`  usuarios resueltos: ${emailsUnicos.size}`)

  const pagosRows = [], impuestosRows = [], auditsRows = []

  for (const row of data) {
    if (row[iLocal] !== GD_LOCAL_ID) { sinLocal++; continue }

    const pagoId = row[iId]
    const nroOrdRaw = row[iNroOrd]

    const idProveedor = await resolverProveedor(row[iProv] || null, proveedorState)

    let idRubcat = row[iRubcat] || null
    if (idRubcat) {
      const resuelto = resolverRubcat(idRubcat, remap, rubcatIds)
      if (!resuelto) registrarPendiente(pendientes.rubcat, idRubcat, { op: nroOrdRaw || pagoId })
      idRubcat = resuelto
    }

    const tipoRaw = row[iTipo]
    const tipoNorm = tipoRaw ? tipoRaw.trim().toUpperCase() : null
    const tipoMapped = tipoNorm ? (TIPO_MAP[tipoNorm] || tipoNorm) : null
    const idTipo = tipoMapped && VALID_TIPOS.has(tipoMapped) ? tipoMapped : null
    if (tipoRaw && !idTipo) {
      registrarPendiente(pendientes.tipos, tipoRaw, { op: nroOrdRaw || pagoId })
    }

    const idMetodo = row[iForma] ? (metodoIdByLabel[row[iForma]] || null) : null
    const estadoOp = row[iEstado] ? (ESTADO_MAP[row[iEstado]] || null) : null

    const { email: creatorEmail } = extractEmailAndDate(row[iUser])
    const creador = creatorEmail ? userCache.get(creatorEmail) : null
    const fecha = parseFechaDMY(row[iFecha])

    const importeRaw = parseMonto(row[iImporte])
    const ingresaEgreso = importeRaw != null && importeRaw < 0

    let observaciones = row[iObs] || null
    const cmv = parseMonto(row[iCmv])
    if (cmv) observaciones = (observaciones ? observaciones + ' | ' : '') + `CMV: ${cmv}`

    pagosRows.push({
      id: pagoId,
      nro_ord: nroOrdRaw ? parseInt(nroOrdRaw) || null : null,
      fecha,
      id_proveedor: idProveedor,
      id_rubcat: idRubcat,
      id_tipo: idTipo,
      pv: row[iPv] ? parseInt(row[iPv]) || null : null,
      nro: row[iNro] && /^\d+$/.test(row[iNro]) ? BigInt(row[iNro]) : null,
      importe_neto: parseMonto(row[iNeto]) != null ? Math.abs(parseMonto(row[iNeto])) : null,
      descuento: parseMonto(row[iDescuento]),
      importe: importeRaw != null ? Math.abs(importeRaw) : null,
      ingresa_egreso: ingresaEgreso,
      id_metodo: idMetodo,
      cashflow: parseFechaDMY(row[iVenc]),
      observaciones,
      pagado: row[iPagado] === 'True' || row[iPagado] === 'TRUE',
      fecha_pago: parseFechaDMY(row[iFdp]),
      estado_op: estadoOp,
      foto_url: row[iFoto] || null,
      pdf_url: row[iPdf] || null,
      periodo: parsePeriodoMY(row[iPeriodo]),
      id_pdp: row[iIdPdp] || null,
      id_local: GD_LOCAL_ID,
      created_by: creador ? creador.id : null
    })

    const impuestosCols = [
      ['IVA27', iIva27], ['IVA10', iIva10], ['IVA21', iIva21],
      ['PERCEPCION', iPercIva], ['PERCEPCION', iPercIibb],
      ['IMP_INTERNOS', iImpInternos], ['RETENCION', iRetenciones]
    ]
    for (const [tipoImp, colIdx] of impuestosCols) {
      const monto = parseMonto(row[colIdx])
      if (!monto) continue
      impuestosRows.push({ id_pago: pagoId, tipo: tipoImp, monto })
    }

    if (row[iAud] === 'True' || row[iAud] === 'TRUE') {
      auditsRows.push({
        id_registro: pagoId, tabla: 'pagos', tipo: 'auditoria_pago', accion: 'auditado',
        aprobado: true, vigente: true, audit_dc: false,
        id_user: creador ? creador.id : null, fecha
      })
    }
  }

  await insertBatched('pago', pagosRows, 'pagos')
  await insertBatched('impuesto', impuestosRows, 'impuestos')
  await insertBatched('audit', auditsRows, 'audits (pagos)')
  console.log(`pagos: ${pagosRows.length} (${sinLocal} de otro local, omitidos)`)
  console.log(`impuestos: ${impuestosRows.length}, pagos auditados: ${auditsRows.length}`)
}

module.exports.fasePagos = fasePagos
```

- [ ] **Step 2: Correr en modo dry-run y verificar los conteos**

```bash
cd migraciones
node -e "
const m = require('./import-gran-danzon.cjs');
(async () => {
  const remap = new Map(JSON.parse(require('fs').readFileSync(m.BASE_DIR + '/.remap-rubcat.json', 'utf8')));
  const proveedores = await m.prisma.proveedor.findMany({ select: { id: true, nombre: true, razon_social: true } });
  const proveedorState = {
    idSet: new Set(proveedores.map(p => p.id)),
    byNombreNorm: new Map(proveedores.filter(p => p.nombre).map(p => [m.normalizar(p.nombre), p.id])),
    byRazonNorm: new Map(proveedores.filter(p => p.razon_social).map(p => [m.normalizar(p.razon_social), p.id])),
    creadosNorm: new Map()
  };
  const rubcatIds = new Set((await m.prisma.rubCat.findMany({ select: { id: true } })).map(r => r.id));
  const { data, idx } = m.loadCSV(m.BASE_DIR + '/' + m.PAGOS_FILE);
  const iForma = idx('Forma de pago');
  const formasDePago = new Set();
  data.forEach((row) => { if (row[iForma]) formasDePago.add(row[iForma]) });
  const metodoIdByLabel = await m.ensureMetodosPago(formasDePago);
  await m.fasePagos(remap, proveedorState, rubcatIds, metodoIdByLabel, new Map());
  console.log('proveedores nuevos (dry-run):', m.pendientes.proveedoresCreados.length);
  console.log('rubcat sin resolver (dry-run):', m.pendientes.rubcat.size);
  console.log('tipos sin resolver (dry-run):', m.pendientes.tipos.size);
  await m.prisma.\$disconnect();
})();
" -- --dry-run
```
Expected: `[dry-run] pagos: ~16467 filas listas para insertar`, `impuestos: ...`, `audits (pagos): ...`,
`proveedores nuevos (dry-run): ~N` (proveedores que no matchean nada), `rubcat sin resolver (dry-run):
60` (10 códigos + 50 etiquetas de texto libre, según el análisis de la spec), `tipos sin resolver
(dry-run): 0` (FF y NCB ya están en `VALID_TIPOS`, y `c`/`cm` se normalizan a mayúscula). Si `tipos
sin resolver` da más de 0, revisar qué valor nuevo apareció antes de seguir.

- [ ] **Step 3: Confirmar que no se escribió nada real**

```bash
cd dcsmart/backend
node -e "
import('@prisma/client').then(async ({PrismaClient}) => {
  const prisma = new PrismaClient();
  const count = await prisma.pago.count({ where: { id_local: 'd77f7288' } });
  console.log('pagos de Gran Danzón en la base:', count);
  await prisma.\$disconnect();
});
"
```
Expected: `pagos de Gran Danzón en la base: 0`.

---

### Task 5: Reporte de pendientes y orquestador `main`

**Files:**
- Modify: `migraciones/import-gran-danzon.cjs` (agrega `escribirReportePendientes` y `main`)

**Interfaces:**
- Consumes: `pendientes`, `faseCajas`, `fasePagos`, `resolverProveedor`, `ensureMetodosPago`,
  `loadCSV`, `BASE_DIR`, `GD_LOCAL_ID`, `GD_APP_ID` (todos de Tasks 2-4).
- Produces: `migraciones/PENDIENTES_GRAN_DANZON.md` (al correr el script completo), entry point
  ejecutable `node import-gran-danzon.cjs [cajas|pagos|all] [--dry-run]`.

- [ ] **Step 1: Agregar `escribirReportePendientes` y `main` al final del archivo**

```js
function escribirReportePendientes() {
  const lines = []
  lines.push('# Pendientes de la migración Gran Danzón')
  lines.push('')
  lines.push(`Generado ${new Date().toISOString()} por import-gran-danzon.cjs.`)
  lines.push('')
  lines.push(`## Proveedores nuevos creados automáticamente (${pendientes.proveedoresCreados.length})`)
  lines.push('')
  lines.push('Se crearon con el nombre tal cual vino del CSV, sin CUIT/razón social/rubcat -- revisar')
  lines.push('si corresponde completar esos datos a mano.')
  lines.push('')
  for (const { raw, id } of pendientes.proveedoresCreados) {
    lines.push(`- "${raw}" -> \`${id}\``)
  }
  lines.push('')
  lines.push(`## RubCat sin resolver (${pendientes.rubcat.size} valores distintos)`)
  lines.push('')
  lines.push('Estos pagos se cargaron igual, pero con `id_rubcat` en null -- hay que completarlos a')
  lines.push('mano cuando se consiga el dato real (código RC correcto, o rubro+categoría a crear).')
  lines.push('')
  for (const [valor, usos] of pendientes.rubcat) {
    lines.push(`- \`${valor}\`: ${usos.length} pago(s) — ${usos.map(u => `OP-${u.op}`).join(', ')}`)
  }
  lines.push('')
  lines.push(`## Valores de TIPO no reconocidos (${pendientes.tipos.size} distintos)`)
  lines.push('')
  for (const [tipo, usos] of pendientes.tipos) {
    lines.push(`- \`${tipo}\`: ${usos.length} pago(s) — ${usos.map(u => `OP-${u.op}`).join(', ')}`)
  }
  lines.push('')
  fs.writeFileSync(path.join(BASE_DIR, 'PENDIENTES_GRAN_DANZON.md'), lines.join('\n'))
  console.log('\nReporte de pendientes escrito en PENDIENTES_GRAN_DANZON.md')
}

async function main() {
  const fase = process.argv[2] === '--dry-run' ? 'all' : (process.argv[2] || 'all')
  console.log(DRY_RUN ? '*** MODO DRY-RUN: no se escribe nada en la base ***' : '*** MODO REAL: esto va a escribir en la base ***')

  const remap = new Map(JSON.parse(fs.readFileSync(path.join(BASE_DIR, '.remap-rubcat.json'), 'utf8')))
  const proveedores = await prisma.proveedor.findMany({ select: { id: true, nombre: true, razon_social: true } })
  const proveedorState = {
    idSet: new Set(proveedores.map((p) => p.id)),
    byNombreNorm: new Map(proveedores.filter((p) => p.nombre).map((p) => [normalizar(p.nombre), p.id])),
    byRazonNorm: new Map(proveedores.filter((p) => p.razon_social).map((p) => [normalizar(p.razon_social), p.id])),
    creadosNorm: new Map()
  }
  const rubcatIds = new Set((await prisma.rubCat.findMany({ select: { id: true } })).map((r) => r.id))

  const { data, idx } = loadCSV(path.join(BASE_DIR, PAGOS_FILE))
  const iForma = idx('Forma de pago')
  const formasDePago = new Set()
  data.forEach((row) => { if (row[iForma]) formasDePago.add(row[iForma]) })
  const metodoIdByLabel = await ensureMetodosPago(formasDePago)
  const userCache = new Map()

  if (fase === 'cajas' || fase === 'all') await faseCajas(userCache)
  if (fase === 'pagos' || fase === 'all') await fasePagos(remap, proveedorState, rubcatIds, metodoIdByLabel, userCache)

  escribirReportePendientes()
  console.log('\nListo.')
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) }).finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Correr el script completo en modo dry-run**

```bash
cd migraciones
node import-gran-danzon.cjs --dry-run
```
Expected: corre las fases de cajas y pagos en dry-run (mismos conteos que Tasks 3 y 4), termina con
`Reporte de pendientes escrito en PENDIENTES_GRAN_DANZON.md` y `Listo.`, sin errores.

- [ ] **Step 3: Revisar el contenido del reporte generado**

```bash
cat migraciones/PENDIENTES_GRAN_DANZON.md | head -40
```
Expected: secciones de proveedores nuevos, rubcat sin resolver (~60 valores) y tipos sin resolver
(0 valores, ya cubiertos por el enum). Confirmar que los números coinciden con los de Tasks 3 y 4.

---

### Task 6: Corrida real contra la base de producción y verificación

**Files:**
- (ninguno — solo ejecución del script ya completo de Tasks 2-5)

**Interfaces:**
- Consumes: el script completo `migraciones/import-gran-danzon.cjs` (Tasks 2-5).
- Produces: filas reales de `Caja`, `CajaDetalle`, `CajaMovimiento` (ninguno en este caso, no hay
  columna de movimientos en el CSV de Gran Danzón), `Pago`, `Impuesto`, `Audit`, `Proveedor` (nuevos)
  en la base compartida real; `migraciones/PENDIENTES_GRAN_DANZON.md` final.

- [ ] **Step 1: Confirmar que el túnel a Cloud SQL está activo**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5433 || echo "sin respuesta HTTP (esperado, es un puerto Postgres, no HTTP) -- confirmar con una query real:"
cd dcsmart/backend && node -e "
import('@prisma/client').then(async ({PrismaClient}) => {
  const prisma = new PrismaClient();
  await prisma.\$queryRaw\`SELECT 1\`;
  console.log('conexión OK');
  await prisma.\$disconnect();
});
"
```
Expected: `conexión OK`. Si falla, levantar el túnel: `./cloud-sql-proxy.exe --gcloud-auth --port
5433 dc-smart-mvp:us-central1:dcsmart-mvp-insta` (en background) y reintentar.

- [ ] **Step 2: Correr la migración real (cajas primero, para poder verificar antes de seguir)**

```bash
cd migraciones
node import-gran-danzon.cjs cajas
```
Expected: `cajas: ~907 (...), auditadas: ~N`, sin errores.

- [ ] **Step 3: Verificar las cajas insertadas con una query directa**

```bash
cd dcsmart/backend
node -e "
import('@prisma/client').then(async ({PrismaClient}) => {
  const prisma = new PrismaClient();
  const count = await prisma.caja.count({ where: { id_local: 'd77f7288' } });
  const detalles = await prisma.cajaDetalle.count({ where: { caja: { id_local: 'd77f7288' } } });
  console.log('cajas:', count, '| detalles:', detalles);
  const sample = await prisma.caja.findFirst({ where: { id_local: 'd77f7288' }, include: { detalles: true } });
  console.log(JSON.stringify(sample, null, 2));
  await prisma.\$disconnect();
});
"
```
Expected: `cajas: ~907` (según lo confirmado en Task 3), detalles > 0, y la muestra impresa tiene
`fiscal`/`total`/`efectivo` con valores numéricos razonables (no `null` en la mayoría) y `id_local:
"d77f7288"`.

- [ ] **Step 4: Correr la migración real de pagos**

```bash
cd migraciones
node import-gran-danzon.cjs pagos
```
Expected: `pagos: ~16467 (...)`, `impuestos: ...`, `pagos auditados: ...`, sin errores. Este paso
también reescribe `PENDIENTES_GRAN_DANZON.md` con los datos reales (no dry-run) — confirmar que los
proveedores nuevos creados y los rubcat sin resolver quedaron documentados.

- [ ] **Step 5: Verificar los pagos insertados con una query directa**

```bash
cd dcsmart/backend
node -e "
import('@prisma/client').then(async ({PrismaClient}) => {
  const prisma = new PrismaClient();
  const count = await prisma.pago.count({ where: { id_local: 'd77f7288' } });
  const sinRubcat = await prisma.pago.count({ where: { id_local: 'd77f7288', id_rubcat: null } });
  const sinProveedor = await prisma.pago.count({ where: { id_local: 'd77f7288', id_proveedor: null } });
  console.log('pagos:', count, '| sin rubcat:', sinRubcat, '| sin proveedor:', sinProveedor);
  const sample = await prisma.pago.findFirst({ where: { id_local: 'd77f7288' }, include: { impuestos: true, proveedor: true } });
  console.log(JSON.stringify(sample, null, 2));
  await prisma.\$disconnect();
});
"
```
Expected: `pagos: ~16467`, `sin rubcat: ~60` (los que quedaron pendientes según la spec), `sin
proveedor: 0` (todos los proveedores se resuelven, ya sea por match o creación automática — a
diferencia de rubcat no debería haber ninguno en null salvo que la celda `RAZON SOCIAL` viniera
vacía en el CSV original).

- [ ] **Step 6: Confirmar que `PENDIENTES_GRAN_DANZON.md` quedó con datos reales (no `dry-`)**

```bash
grep -c "dry-" migraciones/PENDIENTES_GRAN_DANZON.md || echo "0 (esperado)"
```
Expected: `0` — ningún id con prefijo `dry-` debe quedar en el reporte final (esos solo aparecen en
modo `--dry-run`, la corrida real de Step 4 los reemplaza por IDs reales de Prisma).

---

## Self-Review

**Cobertura del spec:**
- Resolución de proveedores en cascada (id → nombre → razón social → crear nuevo) → Task 2
  (`resolverProveedor`) + Task 4 (uso en `fasePagos`). ✓
- Resolución de rubcat (id → remap de 878 → pendiente) → Task 2 (`resolverRubcat`) + Task 4. ✓
- Enum `TipoPago` con `FF`/`NCB` nuevos, normalización de `c`/`cm` a mayúscula → Task 1 (schema) +
  Task 4 (`tipoNorm`). ✓
- Métodos de pago nuevos (`CHEQUE AL DÍA`, `CHEQUE DIFERIDO`, `MORATORIA`) sin cambios de código,
  autocreados → Task 2 (`ensureMetodosPago`, ya genérico). ✓
- Mapeo de columnas de caja (`Fiscal`/`TotalVentas`/`Efectivo`/`Cubiertos`, sin `Tickets`/`AuditUser`)
  → Task 3. ✓
- Columnas de detalle de caja (10 columnas, todas `ingreso`, `Mov Stock` descartada) → Task 3
  (`CAJA_DETALLE_COLS` en Task 2, sin `Mov Stock`). ✓
- Corrección de nombres de columna en pagos (`PDF`, `App_ID`) → Task 4. ✓
- `CMV_IMPORTE` anexado a `observaciones` → Task 4. ✓
- Columnas ignoradas (`Exento`, `UserAud`, `Aud_ARCA`, `Imprime`, `lastupdate`, `Timestamp`, `Orden`)
  → Task 4 (simplemente no se referencian, no hace falta código explícito para "ignorarlas"). ✓
- Reporte de pendientes (`PENDIENTES_GRAN_DANZON.md`) → Task 5. ✓
- Corrida real + verificación → Task 6. ✓

**Placeholder scan:** sin TBD/TODO. Todo el código de cada step está completo y es el código real a
escribir, no un resumen.

**Consistencia de tipos:** `resolverProveedor` devuelve `string|null` (Task 2), usado directamente
como `id_proveedor` en `fasePagos` (Task 4) sin transformación — consistente. `resolverRubcat`
devuelve `string|null` (Task 2), usado igual en `fasePagos`. `pendientes.proveedoresCreados` es un
array de `{raw, id}` en todos los puntos donde se llena (Task 2, dentro de `resolverProveedor`) y se
lee igual en `escribirReportePendientes` (Task 5). `pendientes.rubcat`/`pendientes.tipos` son
`Map<string, Array<{op}>>` consistentes entre `registrarPendiente` (Task 2), su uso en `fasePagos`
(Task 4) y su lectura en `escribirReportePendientes` (Task 5).
