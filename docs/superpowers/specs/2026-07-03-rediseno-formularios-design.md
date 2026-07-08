# Rediseño de formularios (Bloque 2 del backlog de producción)

**Fecha:** 2026-07-03
**Estado:** Aprobado, pendiente de implementación
**Rama:** `DEV-08-production-goal`

## Contexto

Ver `docs/superpowers/plans/backlog-produccion.md` — este spec cubre el Bloque 2 completo: date/select clickeables en cualquier parte, rediseño del input de foto/PDF, y reordenar el form de Pagos para que use mejor el espacio y agrupe campos relacionados.

## Objetivo

1. Que los inputs de fecha y los `<select>` abran su picker/dropdown al clickear en cualquier parte del campo, no solo en el ícono chico — arreglo a nivel del wrapper compartido, beneficia a todos los formularios del sistema.
2. Reemplazar el input de archivo nativo (feo, sin poder quitar el archivo cómodamente) por un componente de dropzone reutilizable, con miniatura, tamaño de archivo, y un botón de eliminar grande y visible.
3. Reordenar el form de Pagos: agrupar proveedor con rubro/categoría y método de pago; juntar las 4 fechas (factura, período, cashflow, fecha de pago) en un mismo bloque; y en general, que cada campo ocupe el ancho que necesita en vez de dejar espacio desperdiciado.

## 1. Date/select clickeables en cualquier parte

**Archivo:** `frontend/src/styles/app.css` (o el archivo de estilos compartido de `.form-input-wrap`) + un pequeño helper de interacción.

- El wrapper `.form-input-wrap` que envuelve `<input type="date">` y `<select>` gana un handler de click a nivel de contenedor: si el click no fue directamente sobre el input/select (por ejemplo, cae en el padding del wrapper), se dispara programáticamente la apertura del picker.
  - Para `<input type="date">`: `inputRef.current.showPicker()` (soportado en navegadores Chromium modernos, que es el target de esta app).
  - Para `<select>`: no existe un `showPicker()` universal con el mismo soporte; se resuelve enfocando el `<select>` y disparando un click sintético sobre él (patrón estándar: `selectRef.current.focus(); selectRef.current.click()`), o alternativamente ampliando el área de click del `<select>` mismo con `position:absolute; inset:0;` dentro del wrapper (más simple, sin necesitar JS) — se define en la tarea de implementación cuál de las dos resulta más prolija visualmente.
- Este cambio se hace **una sola vez** en el wrapper compartido, no por formulario — todos los forms existentes (Pagos, Cajas, y cualquier otro) heredan el fix automáticamente al usar `.form-input-wrap`.

## 2. Componente `AdjuntoUpload` (dropzone)

**Archivo nuevo:** `frontend/src/components/AdjuntoUpload.jsx`

Componente presentacional reutilizable, sin lógica de negocio de pagos/cajas adentro:

```jsx
<AdjuntoUpload
  label="Foto"
  accept="image/*"           // o ".pdf,application/pdf" para el dropzone de PDF
  value={form.foto_url}      // url ya guardada (edición) o null
  file={fotoFile}            // File recién seleccionado, aún sin subir (creación)
  onFileSelected={(file) => setFotoFile(file)}
  onRemove={() => { set('foto_url', ''); setFotoFile(null) }}
  uploading={uploadingFoto}
/>
```

- **Estado vacío:** zona con borde punteado, ícono, texto "Arrastrá un archivo o hacé click" + subtítulo con los tipos aceptados. Soporta drag&drop (`onDragOver`/`onDrop`) y click (input file oculto detrás del dropzone completo).
- **Estado con archivo:** si es imagen, miniatura real (usando `URL.createObjectURL(file)` para el archivo recién elegido, o la URL ya guardada si es edición); si es PDF, ícono de documento. Muestra nombre de archivo (truncado) y tamaño si está disponible. Botón de eliminar circular de 30px (no la "x" de 16px actual), y un link secundario "Reemplazar archivo" que vuelve a abrir el selector.
- **Estado subiendo:** overlay o texto "Subiendo..." mientras `uploading` es `true`.
- Este componente reemplaza los bloques de "Adjuntos" hardcodeados que hoy existen en `PagoForm.jsx` (líneas ~703-760) y el de `CajaForm.jsx`/`CajaCreatePanel` (`foto_url`, el único adjunto que tiene Cajas — el modelo `Caja` no tiene columna de PDF).

**Uso en Pagos:** dos instancias independientes de `AdjuntoUpload` (Foto y PDF), **sin exclusión mutua** — el usuario puede cargar ambos si quiere (decisión explícita del usuario: se abandona la idea de que sean mutuamente excluyentes).

**Uso en Cajas:** una sola instancia de `AdjuntoUpload` con `accept="image/*"` (Cajas solo tiene `foto_url`, no hay campo de PDF en el modelo).

### 2.1 Backend necesario para que Cajas tenga upload real

Hallazgo durante el diseño: a diferencia de Pagos, Cajas **no tiene** hoy un endpoint de subida de archivos — el campo `foto_url` es un input `type="url"` donde se pega manualmente un link (`CajaCreatePanel`/`CajaEditPanel` en `frontend/src/pages/cajas/CajaList.jsx`, líneas ~562 y ~676). Para que el dropzone nuevo tenga sentido en Cajas (no solo se vea lindo, sino que realmente suba el archivo), se agrega:

- **`POST /api/cajas/upload`** en `backend/src/routes/caja.js`, mismo patrón que `POST /api/pagos/upload` (`backend/src/routes/pagos.js:582-604`): recibe un archivo multipart, lo sube a GCS bajo `${folder}/fotos-caja/...` (usa el nombre del local si viene `id_local` en la query, igual que pagos), devuelve `{ ok: true, url: 'gs://...' }`.
- **`GET /api/cajas/:id/attachment`**, mismo patrón que `GET /api/pagos/:id/attachment` (`backend/src/routes/pagos.js`): stream del archivo desde GCS a través del backend, ya que un navegador no puede cargar una URL `gs://` directamente.
- **Frontend:** se agrega `cajasApi.upload(formData, idLocal)` y un componente `CajaFotoViewer.jsx` (mismo rol que `FotoViewer.jsx` de pagos, pero solo con foto) que reemplaza los usos actuales de `<img src={caja.foto_url}>`/`<a href={caja.foto_url}>` directos (en `CajaDetailPanel` y en la fila de `CajaList`) por una vista que pasa por el backend.
- **Compatibilidad con datos existentes:** las cajas que ya tienen una URL `https://` pegada a mano en `foto_url` (dato legacy) deben seguir mostrándose — `CajaFotoViewer` debe detectar si `foto_url` empieza con `gs://` (pasar por el backend) o no (renderizar el link/imagen directo, como hoy).

## 3. Reordenar el form de Pagos

**Archivo:** `frontend/src/pages/pagos/PagoForm.jsx`, panel "Información del Pago" (líneas ~382-533 actuales).

Nuevo orden de campos dentro del panel, con anchos ajustados al contenido real (no todas las columnas del grid del mismo tamaño parejo):

1. Selector de Local (solo cuando no hay local activo) — full width, igual que hoy.
2. **Fila identificación:** Proveedor (combobox, ancho medio — deja de ocupar la fila entera) · Rubro/Categoría · Método de Pago.
3. **Fila fechas (las 4 juntas):** Fecha Factura · Período · Cashflow · Fecha de Pago — hoy Cashflow y Fecha de Pago viven en el panel "Montos", se mueven a este bloque de fechas en "Información del Pago".
4. **Fila comprobante:** Tipo de Comprobante · Estado · PV · Nro Comprobante — estos 4 son angostos, entran cómodos en una sola fila sin desperdiciar espacio.
5. Checkbox "Pago periódico (recurrente)" — full width, igual que hoy.

El panel "Montos" conserva solo Importe Neto, Descuento e Importe Total (ya no Cashflow/Fecha de Pago, que se movieron al bloque de fechas). El resto de los paneles (Impuestos, Multimoneda, Adjuntos, Notas) no cambian de posición, solo Adjuntos cambia de contenido (usa `AdjuntoUpload` en vez del input nativo).

## Fuera de alcance

- Cambios al form de Cajas más allá de adoptar `AdjuntoUpload`/upload real para su campo de foto (el resto del form de Cajas — más campos, cargar detalles/movimientos antes de crear — es el Bloque 4, spec aparte).
- Validación de tamaño máximo de archivo en el frontend (hoy no existe, no se agrega en este spec).

## Testing / verificación

- Verificar que clickear en cualquier parte del input de fecha (no solo el ícono) abra el date picker, en Pagos y en Cajas.
- Verificar que clickear en cualquier parte de un `<select>` (no solo la flechita) abra las opciones.
- Subir una foto y un PDF en un mismo pago (sin edición previa) y confirmar que ambos quedan guardados tras crear el pago.
- Quitar un adjunto ya cargado (editando un pago existente) y confirmar que el botón de eliminar funciona y que se puede volver a subir otro archivo distinto sin recargar la página.
- Confirmar visualmente que el form de Pagos ya no tiene al proveedor ocupando una fila entera, que las 4 fechas están juntas, y que no quedan columnas con espacio vacío evidente.
- Subir una foto real a una caja nueva y confirmar que se ve correctamente en el detalle y en el listado (a través del backend, no como link directo `gs://`).
- Abrir una caja existente que ya tenga una URL `https://` pegada a mano en `foto_url` y confirmar que se sigue mostrando bien (compatibilidad con datos legacy).
