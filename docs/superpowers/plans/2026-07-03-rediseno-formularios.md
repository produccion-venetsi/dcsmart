# Rediseño de Formularios (Bloque 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los date/select de todos los formularios abran su picker clickeando en cualquier parte del campo, reemplazar el input de archivo nativo por un dropzone reutilizable (con upload real de fotos también en Cajas, que hoy no lo tiene), y reordenar el form de Pagos para agrupar campos relacionados y aprovechar mejor el espacio.

**Architecture:** Un listener de click a nivel de documento (montado una sola vez en `Layout.jsx`) intercepta clicks sobre `.form-input-wrap` y abre el picker del input/select interno — arreglo compartido, sin tocar cada formulario. Un componente nuevo `AdjuntoUpload` (dropzone) reemplaza los inputs de archivo nativos, reutilizado en Pagos (foto + PDF, sin exclusión mutua) y Cajas (solo foto). Cajas gana upload real de fotos (hoy es un campo de URL manual): nuevo endpoint de subida + endpoint de stream de adjuntos, mismo patrón que ya usa Pagos.

**Tech Stack:** Fastify + `@fastify/multipart` + `@google-cloud/storage` (backend), React + Vite (frontend), sin librerías nuevas.

## Global Constraints

- ESModules, `async/await` siempre — nunca callbacks.
- El fix de date/select debe aplicarse **una sola vez, a nivel compartido** — no tocar cada formulario individualmente.
- Cajas solo tiene `foto_url` en el modelo (`backend/prisma/schema.prisma`) — no hay `pdf_url` para cajas, no se agrega.
- Pagos permite cargar foto Y PDF simultáneamente, sin exclusión mutua — el código actual de `PagoForm.jsx` ya sube ambos de forma independiente (`handleSubmit`, líneas 260-279 del archivo original), no requiere cambio de lógica de negocio, solo de UI.
- No existe suite de tests automatizada en este proyecto — la verificación es manual (build + backend con curl + navegador).
- El patrón de subida/stream de archivos a reutilizar para Cajas es el que ya usa `backend/src/routes/pagos.js` (`POST /upload` líneas 582-604, `GET /:id/attachment` líneas ~499-534 del archivo actual).

---

## Task 1: Fix compartido — date/select clickeables en cualquier parte

**Files:**
- Modify: `frontend/src/components/Layout.jsx`

**Interfaces:**
- Produces: comportamiento global — cualquier `.form-input-wrap` que contenga un `<input type="date">`, `<input type="datetime-local">` o `<select>` se vuelve clickeable en toda su superficie. No expone ninguna función ni componente nuevo — es un side-effect global montado una vez.

- [ ] **Step 1: Agregar el listener global en `Layout.jsx`**

En `frontend/src/components/Layout.jsx`, dentro de `export default function Layout() {`, después de las líneas `const notifications = useUiStore((s) => s.notifications)` / `const removeNotification = useUiStore((s) => s.removeNotification)`, agregar:

```javascript
  // Los inputs de fecha/select dentro de .form-input-wrap se abren clickeando
  // en cualquier parte del campo, no solo en el icono/flecha nativa.
  useEffect(() => {
    const handler = (e) => {
      if (e.target.closest('input, select, textarea, button, a')) return
      const wrap = e.target.closest('.form-input-wrap')
      if (!wrap) return
      const field = wrap.querySelector('input[type="date"], input[type="datetime-local"], select')
      if (!field) return
      if (typeof field.showPicker === 'function') {
        try { field.showPicker(); return } catch { /* algunos navegadores lo rechazan sin gesto directo */ }
      }
      field.focus()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])
```

`useEffect` ya está importado en este archivo (agregado en un trabajo previo para el modal de prompt) — confirmar que la línea 1 sea `import { useState, useEffect } from 'react'`.

- [ ] **Step 2: Verificación manual**

Run: `cd frontend && npm run build` — debe compilar sin errores.

Con el frontend corriendo (`npm run dev`), abrir el form de Nuevo Pago:
1. Clickear en el padding de un input de fecha (no en el ícono de calendario) → debe abrirse el date picker nativo.
2. Clickear en el padding de un `<select>` (por ejemplo "Rubro / Categoría", no en la flechita) → debe desplegar las opciones.
3. Confirmar que clickear un botón, un link, o directamente el texto de un input normal (no date/select) sigue funcionando igual que antes (el listener no debe interferir con inputs de texto/número).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout.jsx
git commit -m "feat(forms): date/select clickeables en cualquier parte del input (fix compartido)"
```

---

## Task 2: Componente `AdjuntoUpload` (dropzone reutilizable)

**Files:**
- Create: `frontend/src/components/AdjuntoUpload.jsx`
- Modify: `frontend/src/styles/app.css` (agregar estilos del dropzone)

**Interfaces:**
- Produces: `<AdjuntoUpload label accept value file onFileSelected onRemove uploading />` — componente presentacional puro, sin llamadas a APIs adentro. Las Tareas 5 (Pagos) y 4 (Cajas) lo consumen con esta firma exacta.

- [ ] **Step 1: Crear `frontend/src/components/AdjuntoUpload.jsx`**

```jsx
import { useRef, useState } from 'react'

function IcoUpload() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}
function IcoPdfFile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
function IcoX() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function fmtSize(bytes) {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Dropzone reutilizable para un adjunto (imagen o PDF). Sin lógica de negocio:
// el caller decide cuándo subir el archivo (normalmente al enviar el form) y
// qué guardar como url final.
//
// - label: texto del campo ("Foto", "PDF")
// - accept: mismo valor que el atributo `accept` de <input type="file">
// - value: url ya guardada (edición) | null/undefined
// - file: File recién elegido, aún sin subir (creación/reemplazo) | null
// - onFileSelected(file): se llama al elegir o soltar un archivo nuevo
// - onRemove(): se llama al quitar el archivo actual (value o file)
// - uploading: true mientras se está subiendo (deshabilita quitar/reemplazar)
export default function AdjuntoUpload({ label, accept, value, file, onFileSelected, onRemove, uploading }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const hasContent = Boolean(file || value)
  const isImage = file ? file.type.startsWith('image/') : Boolean(accept?.includes('image'))
  const previewSrc = file ? URL.createObjectURL(file) : (isImage ? value : null)
  const displayName = file ? file.name : value?.split('/').pop()

  const openPicker = () => inputRef.current?.click()

  const handleFiles = (files) => {
    const f = files?.[0]
    if (f) onFileSelected(f)
  }

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {!hasContent ? (
        <div
          className={`adjunto-dropzone${dragOver ? ' drag-over' : ''}`}
          onClick={openPicker}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        >
          <IcoUpload />
          <div className="adjunto-dropzone-main">Arrastrá un archivo o hacé click</div>
          <div className="adjunto-dropzone-sub">{accept?.includes('pdf') ? 'JPG, PNG o PDF' : 'JPG, PNG'}</div>
        </div>
      ) : (
        <div className="adjunto-filled">
          <div className="adjunto-thumb">
            {isImage && previewSrc ? <img src={previewSrc} alt={label} /> : <IcoPdfFile />}
          </div>
          <div className="adjunto-info">
            <div className="adjunto-name">{displayName}</div>
            {file && <div className="adjunto-sub">{fmtSize(file.size)}</div>}
          </div>
          {uploading ? (
            <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
          ) : (
            <button type="button" className="adjunto-remove" onClick={onRemove} title="Quitar archivo">
              <IcoX />
            </button>
          )}
        </div>
      )}
      {hasContent && !uploading && (
        <span className="adjunto-replace" onClick={openPicker}>Reemplazar archivo</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Agregar los estilos del dropzone en `frontend/src/styles/app.css`**

Agregar al final del archivo (o junto a otros estilos de formulario, cerca de `.form-group`/`.form-input-wrap`):

```css
/* ── AdjuntoUpload (dropzone de foto/PDF) ── */
.adjunto-dropzone {
  border: 2px dashed var(--glass-border);
  border-radius: 14px;
  padding: 28px 16px;
  text-align: center;
  color: var(--t3);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: border-color 0.2s var(--ease), background 0.2s var(--ease);
}
.adjunto-dropzone:hover,
.adjunto-dropzone.drag-over {
  border-color: var(--gold);
  background: rgba(255, 255, 255, 0.05);
}
.adjunto-dropzone svg { color: var(--gold); margin-bottom: 8px; }
.adjunto-dropzone-main { font-size: 13px; font-weight: 600; color: var(--t1); }
.adjunto-dropzone-sub { font-size: 11.5px; margin-top: 3px; }

.adjunto-filled {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border-hi);
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
}
.adjunto-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  flex-shrink: 0;
  background: linear-gradient(135deg, #3a4a5c, #22303e);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gold-bright);
  overflow: hidden;
}
.adjunto-thumb img { width: 100%; height: 100%; object-fit: cover; }
.adjunto-info { flex: 1; min-width: 0; }
.adjunto-name {
  font-size: 12.5px;
  color: var(--t1);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.adjunto-sub { font-size: 11px; color: var(--t3); margin-top: 1px; }
.adjunto-remove {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--red-bg);
  border: 1px solid var(--red-border);
  color: var(--red);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.adjunto-replace {
  font-size: 11px;
  color: var(--gold-bright);
  text-decoration: underline;
  cursor: pointer;
  margin-top: 6px;
  display: inline-block;
}
```

Todas las variables usadas (`--glass-border`, `--gold`, `--gold-bright`, `--t1`, `--t3`, `--border-hi`, `--red`, `--red-bg`, `--red-border`, `--ease`) ya existen en `:root` de `frontend/src/styles/app.css` (líneas 11-61) — no hace falta agregar ninguna.

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run build` — debe compilar sin errores (todavía no hay ningún caller — se usa en las Tareas 4 y 5).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AdjuntoUpload.jsx frontend/src/styles/app.css
git commit -m "feat(forms): agregar componente AdjuntoUpload (dropzone reutilizable)"
```

---

## Task 3: Backend — upload real de fotos para Cajas

**Files:**
- Modify: `backend/src/routes/caja.js`

**Interfaces:**
- Consumes: `@fastify/multipart`, `@google-cloud/storage` (ya son dependencias del proyecto, usadas en `backend/src/routes/pagos.js`).
- Produces: `POST /api/cajas/upload` → `{ ok: true, url: 'gs://...' }`. `GET /api/cajas/:id/attachment` → stream del archivo (requiere que `caja.foto_url` empiece con `gs://`, si no, 404). La Tarea 4 (frontend) consume ambos.

- [ ] **Step 1: Agregar imports y registrar multipart en `caja.js`**

Al principio de `backend/src/routes/caja.js`, reemplazar la primera línea (`export default async function cajaRoutes(fastify) {`) por:

```javascript
import multipart from '@fastify/multipart'
import { Storage } from '@google-cloud/storage'

export default async function cajaRoutes(fastify) {
  await fastify.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
  const gcs = new Storage()

```

(el resto del archivo sigue igual, esto solo agrega las dos líneas de import arriba de todo, y las dos líneas de registro/instancia justo después de abrir la función `cajaRoutes`, antes de `const viewHandler = ...`).

- [ ] **Step 2: Agregar `POST /upload` y `GET /:id/attachment`**

Agregar estos dos endpoints nuevos, después del handler `PUT /:id` y antes del comentario `// ── DELETE /:id ──` (mismo lugar donde ya viven `PATCH /:id/audit` y `GET /:id/audit-history` de un trabajo previo):

```javascript
  // ── POST /upload ───────────────────────────────────────────────────────
  fastify.post('/upload', { preHandler: [fastify.authenticate, fastify.appContext] }, async (request, reply) => {
    const { id_local } = request.query
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'No se recibió archivo' })
    const bucket = process.env.GCS_BUCKET_NAME
    if (!bucket) return reply.code(500).send({ error: 'GCS_BUCKET_NAME no configurado' })

    let folder = 'general'
    if (id_local) {
      const local = await fastify.db.local.findUnique({ where: { id: id_local }, select: { nombre: true } })
      if (local?.nombre) folder = local.nombre
    }

    const ext      = data.filename.split('.').pop().toLowerCase()
    const filename = `${folder}/fotos-caja/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const file     = gcs.bucket(bucket).file(filename)
    await new Promise((resolve, reject) => {
      const stream = file.createWriteStream({ metadata: { contentType: data.mimetype } })
      data.file.pipe(stream).on('error', reject).on('finish', resolve)
    })
    return { ok: true, url: `gs://${bucket}/${filename}` }
  })

  // ── GET /:id/attachment ────────────────────────────────────────────────
  // Streams la foto de una caja desde GCS a través del backend (un navegador
  // no puede cargar una URL gs:// directamente). Ver GET /pagos/:id/attachment
  // en pagos.js para el mismo patrón.
  fastify.get('/:id/attachment', { preHandler: viewHandler }, async (request, reply) => {
    const caja = await fastify.db.caja.findUnique({
      where: { id: request.params.id },
      select: { foto_url: true, id_local: true }
    })
    if (!caja) return reply.code(404).send({ error: 'Caja no encontrada' })
    if (!request.allowedLocalIds.includes(caja.id_local)) {
      return reply.code(403).send({ error: 'Sin acceso' })
    }

    const gsPath = caja.foto_url
    if (!gsPath?.startsWith('gs://')) return reply.code(404).send({ error: 'Sin adjunto' })

    const withoutScheme = gsPath.replace('gs://', '')
    const slashIdx      = withoutScheme.indexOf('/')
    const bucketName    = withoutScheme.slice(0, slashIdx)
    const filePath      = withoutScheme.slice(slashIdx + 1)

    const ext         = filePath.split('.').pop().toLowerCase()
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'

    reply.header('Content-Type', contentType)
    reply.header('Cache-Control', 'private, max-age=300')

    const stream = gcs.bucket(bucketName).file(filePath).createReadStream({
      userProject: process.env.GCS_PROJECT_ID,
    })
    stream.on('error', (err) => {
      fastify.log.error({ err, gsPath }, 'GCS stream error')
      if (!reply.sent) reply.code(502).send({ error: 'No se pudo obtener el archivo' })
    })
    return reply.send(stream)
  })

```

- [ ] **Step 3: Verificación manual con curl**

Run: `cd backend && npm run dev` (con el Cloud SQL Auth Proxy corriendo).

Con un token de usuario (`POST /api/auth/login`) y el header `X-App-Id` correspondiente a la app del local:

```bash
# Subir una foto de prueba (reemplazar /ruta/a/foto.jpg por un archivo real)
curl -s -X POST "http://localhost:3000/api/cajas/upload?id_local=<ID_LOCAL>" \
  -H "Authorization: Bearer $TOKEN" -H "X-App-Id: $APP_ID" \
  -F "file=@/ruta/a/foto.jpg"
# Expected: {"ok":true,"url":"gs://<bucket>/<local>/fotos-caja/....jpg"}

# Guardar esa url en una caja existente (usar PUT /cajas/:id con foto_url)
curl -s -X PUT "http://localhost:3000/api/cajas/<CAJA_ID>" \
  -H "Authorization: Bearer $TOKEN" -H "X-App-Id: $APP_ID" -H "Content-Type: application/json" \
  -d '{"foto_url":"gs://<bucket>/<local>/fotos-caja/....jpg"}'

# Traer el adjunto a través del backend
curl -s -o /tmp/foto-descargada.jpg "http://localhost:3000/api/cajas/<CAJA_ID>/attachment" \
  -H "Authorization: Bearer $TOKEN" -H "X-App-Id: $APP_ID"
# Expected: se descarga el archivo, /tmp/foto-descargada.jpg es una imagen válida
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/caja.js
git commit -m "feat(cajas): agregar upload real de fotos (POST /upload, GET /:id/attachment)"
```

---

## Task 4: Frontend — Cajas usa `AdjuntoUpload` con upload real

**Files:**
- Modify: `frontend/src/api/cajas.js`
- Create: `frontend/src/components/CajaFotoViewer.jsx`
- Modify: `frontend/src/pages/cajas/CajaList.jsx` (`CajaCreatePanel`, `CajaEditPanel`, `CajaDetailPanel`)

**Interfaces:**
- Consumes: `AdjuntoUpload` (Tarea 2), `POST /cajas/upload` y `GET /cajas/:id/attachment` (Tarea 3).
- Produces: `cajasApi.upload(formData, idLocal)`. `<CajaFotoViewer cajaId fotoUrl size />` — muestra la foto de una caja ya guardada, soportando tanto `gs://` (vía backend) como URLs `https://` legacy (directo, compatibilidad con datos viejos).

- [ ] **Step 1: Agregar `cajasApi.upload` en `frontend/src/api/cajas.js`**

```javascript
import client from './client.js'

export const cajasApi = {
  list:         (params, signal) => client.get('/cajas',        { params, signal }),
  get:          (id,    signal)  => client.get(`/cajas/${id}`,  { signal }),
  stats:        (params, signal) => client.get('/cajas/stats',  { params, signal }),
  create:       (data)           => client.post('/cajas',        data),
  update:       (id, data)       => client.put(`/cajas/${id}`,   data),
  remove:       (id)             => client.delete(`/cajas/${id}`),
  audit:        (id, data)       => client.patch(`/cajas/${id}/audit`, data),
  auditHistory: (id)             => client.get(`/cajas/${id}/audit-history`),
  upload:       (formData, idLocal) => client.post(`/cajas/upload${idLocal ? `?id_local=${idLocal}` : ''}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}
```

- [ ] **Step 2: Crear `frontend/src/components/CajaFotoViewer.jsx`**

```jsx
import { useState, useEffect } from 'react'
import client from '../api/client.js'

// Muestra la foto de una caja. Si `fotoUrl` es gs:// (subida por el backend
// a partir de esta tarea), la trae vía GET /cajas/:id/attachment (requiere
// auth, no se puede linkear directo). Si es una URL http(s) pegada a mano
// (dato legacy de antes de este cambio), se muestra directo sin pasar por
// el backend.
export default function CajaFotoViewer({ cajaId, fotoUrl, size = 180 }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const isGs = fotoUrl?.startsWith('gs://')

  useEffect(() => {
    if (!isGs || !cajaId) return
    let cancelled = false
    setLoading(true)
    client.get(`/cajas/${cajaId}/attachment`, { responseType: 'blob' })
      .then((res) => { if (!cancelled) setBlobUrl(URL.createObjectURL(res.data)) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cajaId, isGs])

  useEffect(() => () => { blobUrl && URL.revokeObjectURL(blobUrl) }, [blobUrl])

  if (!fotoUrl) return null

  const src = isGs ? blobUrl : fotoUrl
  if (isGs && loading && !blobUrl) {
    return <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
  }
  if (!src) return null

  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img
        src={src}
        alt="Foto caja"
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border-hi)', display: 'block' }}
      />
    </a>
  )
}
```

- [ ] **Step 3: Usar `CajaFotoViewer` en `CajaDetailPanel` (reemplaza el `<img>` directo)**

En `frontend/src/pages/cajas/CajaList.jsx`, buscar el bloque (dentro de `CajaDetailPanel`, cerca de donde se muestra `caja.foto_url`):

```jsx
      {caja.foto_url && (
        <div style={{ marginBottom: '1rem' }}>
          <div className="drawer-section-title">Foto</div>
          <a href={caja.foto_url} target="_blank" rel="noreferrer">
            <img
              src={caja.foto_url}
              alt="Foto caja"
              style={{ width: 180, height: 180, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border-hi)', display: 'block' }}
            />
          </a>
        </div>
      )}
```

Reemplazar por:

```jsx
      {caja.foto_url && (
        <div style={{ marginBottom: '1rem' }}>
          <div className="drawer-section-title">Foto</div>
          <CajaFotoViewer cajaId={caja.id} fotoUrl={caja.foto_url} />
        </div>
      )}
```

Agregar el import junto a los demás, al principio del archivo:

```javascript
import CajaFotoViewer from '../../components/CajaFotoViewer.jsx'
```

- [ ] **Step 4: Ícono de la fila en la tabla principal — no linkear `gs://` directo**

En la fila de `CajaList` (tabla principal), buscar:

```jsx
                    <td>
                      {c.foto_url
                        ? <a href={c.foto_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--gold-bright)' }}><IcoLink /></a>
                        : <span className="td-muted">—</span>}
                    </td>
```

Reemplazar por (una URL `gs://` no es navegable directo desde un link — solo se linkea si es una URL legacy `http(s)`; para las nuevas `gs://` se muestra el ícono sin acción, el usuario abre el detalle para verla vía `CajaFotoViewer`):

```jsx
                    <td>
                      {c.foto_url && !c.foto_url.startsWith('gs://')
                        ? <a href={c.foto_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--gold-bright)' }}><IcoLink /></a>
                        : c.foto_url
                          ? <span className="td-muted" title="Ver en el detalle"><IcoLink /></span>
                          : <span className="td-muted">—</span>}
                    </td>
```

- [ ] **Step 5: `CajaEditPanel` — reemplazar el input de URL por `AdjuntoUpload`**

En `frontend/src/pages/cajas/CajaList.jsx`, dentro de `function CajaEditPanel({ cajaId, onSaved, onBack }) {`:

Agregar estado nuevo junto a `const [saving, setSaving] = useState(false)`:

```javascript
  const [fotoFile,      setFotoFile]      = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)
```

En el `useEffect` que carga la caja (`cajasApi.get(cajaId).then(({ data }) => { ... setForm({...}) })`), agregar `id_local: data.id_local` al objeto que arma `setForm` (se necesita para saber en qué carpeta subir la foto si se reemplaza):

```javascript
      setForm({
        nro_turno:    data.nro_turno    ?? '',
        fecha_inicio: toLocal(data.fecha_inicio),
        fecha_cierre: toLocal(data.fecha_cierre),
        cajero:       data.cajero       ?? '',
        total:        data.total        != null ? String(data.total)        : '',
        efectivo:     data.efectivo     != null ? String(data.efectivo)     : '',
        fiscal:       data.fiscal       != null ? String(data.fiscal)       : '',
        comensales:   data.comensales   != null ? String(data.comensales)   : '',
        tickets:      data.tickets      != null ? String(data.tickets)      : '',
        observaciones: data.observaciones ?? '',
        foto_url:     data.foto_url     ?? '',
        id_local:     data.id_local     ?? '',
      })
```

Reemplazar `handleSubmit` completo por (sube la foto antes de guardar, si se eligió una nueva):

```javascript
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      let foto_url = form.foto_url
      if (fotoFile) {
        setUploadingFoto(true)
        const fd = new FormData()
        fd.append('file', fotoFile)
        const r = await cajasApi.upload(fd, form.id_local)
        foto_url = r.data.url
        setUploadingFoto(false)
      }
      await cajasApi.update(cajaId, {
        nro_turno:    form.nro_turno    || null,
        fecha_cierre: form.fecha_cierre || null,
        cajero:       form.cajero       || null,
        total:        form.total        !== '' ? parseFloat(form.total)      : null,
        efectivo:     form.efectivo     !== '' ? parseFloat(form.efectivo)   : null,
        fiscal:       form.fiscal       !== '' ? parseFloat(form.fiscal)     : null,
        comensales:   form.comensales   !== '' ? parseInt(form.comensales)   : null,
        tickets:      form.tickets      !== '' ? parseInt(form.tickets)      : null,
        observaciones: form.observaciones || null,
        foto_url:     foto_url          || null,
      })
      notify('Caja actualizada', 'success')
      onSaved()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
      setUploadingFoto(false)
    } finally { setSaving(false) }
  }
```

Reemplazar el campo "URL Foto":

```jsx
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">URL Foto</label>
          <div className="form-input-wrap">
            <input type="url" placeholder="https://..." value={form.foto_url} onChange={e => setF('foto_url', e.target.value)} />
          </div>
        </div>
```

por:

```jsx
        <AdjuntoUpload
          label="Foto"
          accept="image/*"
          value={form.foto_url}
          file={fotoFile}
          onFileSelected={setFotoFile}
          onRemove={() => { setF('foto_url', ''); setFotoFile(null) }}
          uploading={uploadingFoto}
        />
```

- [ ] **Step 6: `CajaCreatePanel` — mismo reemplazo**

En `function CajaCreatePanel({ activeLocal, locales, onCreated, onClose }) {`, agregar estado junto a `const [saving, setSaving] = useState(false)`:

```javascript
  const [fotoFile,      setFotoFile]      = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)
```

Reemplazar `handleCreate` completo por:

```javascript
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!targetLocalId) { notify('Seleccioná un local', 'error'); return }
    setSaving(true)
    try {
      let foto_url = form.foto_url
      if (fotoFile) {
        setUploadingFoto(true)
        const fd = new FormData()
        fd.append('file', fotoFile)
        const r = await cajasApi.upload(fd, targetLocalId)
        foto_url = r.data.url
        setUploadingFoto(false)
      }
      const res = await cajasApi.create({ ...form, foto_url, id_local: targetLocalId })
      notify('Caja creada', 'success')
      onCreated(res.data?.id)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
      setUploadingFoto(false)
    } finally { setSaving(false) }
  }
```

Reemplazar el campo "URL Foto":

```jsx
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">URL Foto</label>
          <div className="form-input-wrap">
            <input type="url" placeholder="https://..." value={form.foto_url} onChange={e => setF('foto_url', e.target.value)} />
          </div>
        </div>
```

por:

```jsx
        <AdjuntoUpload
          label="Foto"
          accept="image/*"
          value={form.foto_url}
          file={fotoFile}
          onFileSelected={setFotoFile}
          onRemove={() => { setF('foto_url', ''); setFotoFile(null) }}
          uploading={uploadingFoto}
        />
```

- [ ] **Step 7: Import de `AdjuntoUpload` y `cajasApi`**

Confirmar/agregar en el bloque de imports de `frontend/src/pages/cajas/CajaList.jsx`:

```javascript
import AdjuntoUpload from '../../components/AdjuntoUpload.jsx'
```

(`cajasApi` ya está importado; `CajaFotoViewer` se agregó en el Step 3.)

- [ ] **Step 8: Verificación manual**

Run: `cd frontend && npm run build` — debe compilar sin errores.

Con backend y frontend corriendo:
1. Crear una caja nueva, arrastrar o seleccionar una foto en el dropzone, guardar. Confirmar que la foto se sube y se ve en el detalle.
2. Editar una caja existente, reemplazar la foto por otra, guardar. Confirmar que se actualiza.
3. Abrir una caja que tenga una URL `https://` legacy en `foto_url` (si hay alguna en la base de prueba) y confirmar que se sigue viendo bien (no rompe).
4. En el listado, confirmar que el ícono de la fila no intenta abrir un link roto para fotos `gs://`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/cajas.js frontend/src/components/CajaFotoViewer.jsx frontend/src/pages/cajas/CajaList.jsx
git commit -m "feat(cajas): usar AdjuntoUpload con upload real de fotos en el form"
```

---

## Task 5: Frontend — Pagos usa `AdjuntoUpload` (foto + PDF, ambos permitidos)

**Files:**
- Modify: `frontend/src/pages/pagos/PagoForm.jsx`

**Interfaces:**
- Consumes: `AdjuntoUpload` (Tarea 2). No requiere cambios en `pagosApi` (`pagosApi.upload` ya existe) ni en `handleSubmit` (ya sube foto y PDF de forma independiente, sin exclusión mutua).

- [ ] **Step 1: Importar `AdjuntoUpload`**

En `frontend/src/pages/pagos/PagoForm.jsx`, agregar junto a los demás imports:

```javascript
import AdjuntoUpload from '../../components/AdjuntoUpload.jsx'
```

- [ ] **Step 2: Reemplazar el panel "Adjuntos"**

Reemplazar el bloque completo (el panel `<div className="form-panel"><div className="form-panel-title">Adjuntos</div>...` que contiene los dos `<input type="file">` con sus bloques condicionales de nombre/eliminar) por:

```jsx
        {/* ── Adjuntos ── */}
        <div className="form-panel">
          <div className="form-panel-title">Adjuntos</div>
          <div className="form-grid">
            <AdjuntoUpload
              label="Foto"
              accept="image/*"
              value={form.foto_url}
              file={fotoFile}
              onFileSelected={setFotoFile}
              onRemove={() => { set('foto_url', ''); setFotoFile(null) }}
              uploading={uploadingFoto}
            />
            <AdjuntoUpload
              label="PDF"
              accept=".pdf,application/pdf"
              value={form.pdf_url}
              file={pdfFile}
              onFileSelected={setPdfFile}
              onRemove={() => { set('pdf_url', ''); setPdfFile(null) }}
              uploading={uploadingPdf}
            />
          </div>
        </div>
```

No se toca `handleSubmit`, `fotoFile`, `pdfFile`, `uploadingFoto`, `uploadingPdf` — ya existen y ya funcionan de forma independiente para foto y PDF.

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run build` — debe compilar sin errores.

Con backend y frontend corriendo, en "Nuevo Pago": cargar una foto Y un PDF en el mismo pago (sin guardar todavía), confirmar visualmente que ambos dropzones muestran su archivo de forma independiente (uno no hace desaparecer al otro), guardar, y confirmar en la edición que ambos quedaron guardados.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/pagos/PagoForm.jsx
git commit -m "feat(pagos): usar AdjuntoUpload para foto y PDF (ambos permitidos)"
```

---

## Task 6: Reordenar el form de Pagos (agrupación + espacios)

**Files:**
- Modify: `frontend/src/pages/pagos/PagoForm.jsx`

**Interfaces:**
- No produce ni consume interfaces nuevas — es un reordenamiento visual puro dentro del mismo archivo, sobre el JSX ya existente. Depende de que la Tarea 5 ya haya reemplazado el panel de Adjuntos (para no pisar ese cambio), así que se ejecuta después.

- [ ] **Step 1: Reordenar el panel "Información del Pago"**

Reemplazar el contenido completo del `<div className="form-grid">` dentro del panel "Información del Pago" (el bloque que va desde el selector de Local condicional hasta el checkbox de "Pago periódico") por este orden — proveedor deja de ocupar toda la fila (se saca `gridColumn: '1 / -1'` de su `form-group`), y las 4 fechas (Fecha Factura, Período, Cashflow, Fecha de Pago) se juntan acá:

```jsx
          <div className="form-grid">

            {/* selector de local — solo cuando no hay local activo */}
            {!activeLocal && locales.length > 0 && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Local *</label>
                <div className="form-input-wrap">
                  <select required value={form.id_local} onChange={e => set('id_local', e.target.value)}>
                    <option value="">Seleccioná un local…</option>
                    {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* combobox de proveedor — ya no ocupa la fila entera */}
            <div className="form-group combobox-wrap" ref={provRef}>
              <label className="form-label">Proveedor</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  placeholder="Buscar proveedor…"
                  value={provSearch}
                  autoComplete="off"
                  onChange={e => { setProvSearch(e.target.value); setProvOpen(true) }}
                  onFocus={() => setProvOpen(true)}
                />
                {form.id_proveedor && (
                  <button
                    type="button"
                    onClick={clearProveedor}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                    title="Quitar proveedor"
                  >×</button>
                )}
              </div>
              {provOpen && (
                <div className="combobox-dropdown">
                  {filteredProvs.length === 0
                    ? <span className="combobox-option empty">Sin resultados</span>
                    : filteredProvs.slice(0, 60).map(p => (
                      <button key={p.id} type="button" className="combobox-option" onClick={() => selectProveedor(p)}>
                        {p.nombre}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Rubro / Categoría</label>
              <div className="form-input-wrap">
                <select value={form.id_rubcat} onChange={e => set('id_rubcat', e.target.value)}>
                  <option value="">Sin clasificar</option>
                  {visibleRubcats.map(rc => (
                    <option key={rc.id} value={rc.id}>
                      {rc.rubro?.nombre} / {rc.categoria?.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Método de Pago</label>
              <div className="form-input-wrap">
                <select value={form.id_metodo} onChange={e => set('id_metodo', e.target.value)}>
                  <option value="">Sin método</option>
                  {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>

            {/* fechas, todas juntas */}
            <div className="form-group">
              <label className="form-label">Fecha Factura *</label>
              <div className="form-input-wrap">
                <input type="date" required value={form.fecha} onChange={e => set('fecha', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Período</label>
              <div className="form-input-wrap">
                <input type="date" value={form.periodo} onChange={e => set('periodo', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cashflow</label>
              <div className="form-input-wrap">
                <input
                  type="date"
                  value={form.cashflow}
                  onChange={e => set('cashflow', e.target.value)}
                  title={provPlazo ? `Calculado: fecha + ${provPlazo} días` : 'Fecha estimada de pago'}
                />
              </div>
              {provPlazo && (
                <span style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, display: 'block' }}>
                  Plazo: {provPlazo} días
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de Pago</label>
              <div className="form-input-wrap">
                <input type="date" value={form.fecha_pago} onChange={e => set('fecha_pago', e.target.value)} />
              </div>
            </div>

            {/* comprobante: campos angostos, entran cómodos en una fila */}
            <div className="form-group">
              <label className="form-label">Tipo de Comprobante</label>
              <div className="form-input-wrap">
                <select value={form.id_tipo} onChange={e => set('id_tipo', e.target.value)}>
                  <option value="">—</option>
                  {['A','B','C','CM','DC_1','DC_2','DDJJ','M','NCA','NDA','STK'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <div className="form-input-wrap">
                <select value={form.estado_op} onChange={e => set('estado_op', e.target.value)}>
                  {ESTADO_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Punto de Venta</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00000"
                  maxLength={5}
                  value={form.pv}
                  onChange={e => set('pv', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  onBlur={e => { if (e.target.value) set('pv', padLeft(e.target.value, 5)) }}
                  style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Nro Comprobante</label>
              <div className="form-input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00000000"
                  maxLength={8}
                  value={form.nro}
                  onChange={e => set('nro', e.target.value.replace(/\D/g, '').slice(0, 8))}
                  onBlur={e => { if (e.target.value) set('nro', padLeft(e.target.value, 8)) }}
                  style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}
                />
              </div>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={form.periodico}
                  onChange={e => set('periodico', e.target.checked)}
                  style={{ width: 15, height: 15, cursor: 'pointer' }}
                />
                <span className="form-label" style={{ margin: 0 }}>Pago periódico (recurrente)</span>
              </label>
            </div>

          </div>
```

- [ ] **Step 2: Sacar Cashflow y Fecha de Pago del panel "Montos"**

Reemplazar el `<div className="form-grid">` del panel "Montos" (que hoy tiene Importe Neto, Descuento, Importe Total, Cashflow y Fecha de Pago) por (solo quedan los 3 montos, ya que Cashflow/Fecha de Pago se movieron al Step 1):

```jsx
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Importe Neto</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.importe_neto} onChange={e => set('importe_neto', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descuento</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" value={form.descuento} onChange={e => set('descuento', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Importe Total *</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" placeholder="0.00" required value={form.importe} onChange={e => set('importe', e.target.value)} />
              </div>
            </div>
          </div>
```

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run build` — debe compilar sin errores.

En el navegador, abrir "Nuevo Pago" y confirmar visualmente:
1. Proveedor ya no ocupa una fila entera solo — comparte fila con Rubro/Categoría y Método de Pago (en una pantalla de escritorio de ancho normal).
2. Las 4 fechas (Fecha Factura, Período, Cashflow, Fecha de Pago) están una al lado de la otra.
3. Tipo de Comprobante, Estado, PV y Nro Comprobante entran en una fila sin espacio vacío evidente.
4. El panel "Montos" solo tiene Importe Neto, Descuento e Importe Total.
5. Crear un pago completo de punta a punta (con proveedor, fechas, montos, foto y PDF) y confirmar que se guarda todo correctamente — que el reordenamiento visual no rompió ningún dato.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/pagos/PagoForm.jsx
git commit -m "feat(pagos): reordenar el form para agrupar proveedor/rubro/metodo y juntar las fechas"
```
