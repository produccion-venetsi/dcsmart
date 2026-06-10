# Logos Oficiales y Favicons — Plan de Implementación

> **Para agentes:** USA el skill `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea.

**Goal:** Reemplazar el branding actual (ícono SVG inline + texto) con los logos oficiales de la app, y corregir la configuración de favicons y PWA.

**Architecture:** Se crea un componente `AppLogo` reutilizable que sirve la imagen correcta según `variant`. Los tres componentes de branding (Sidebar, Login, AppSelector) lo usan. Los favicons se registran en `index.html` con rutas correctas a `public/favicos/`, y `vite.config.js` se actualiza para el manifest PWA.

**Tech Stack:** React 19, Vite 8 + vite-plugin-pwa, CSS existente del proyecto.

---

## Estructura de archivos

| Acción | Archivo |
|--------|---------|
| Crear | `frontend/src/components/AppLogo.jsx` |
| Modificar | `frontend/src/components/Sidebar.jsx` (líneas 7-15 y 173-180) |
| Modificar | `frontend/src/pages/Login.jsx` (líneas 52-60 y 147-152) |
| Modificar | `frontend/src/pages/AppSelector.jsx` (líneas 38-46 y 136-141) |
| Modificar | `frontend/index.html` |
| Modificar | `frontend/vite.config.js` |
| Modificar | `frontend/public/favicos/site.webmanifest` |
| Modificar | `frontend/src/styles/app.css` (clases `.sidebar-brand-*`) |
| Modificar | `frontend/src/pages/auth.css` (clases `.auth-brand .mark/wm` y `.sel-brand .mark/wm`) |
| Modificar | `frontend/src/App.css` (eliminar `.logo` huérfana) |

---

## Tarea 1: Crear `AppLogo` component

**Archivos:**
- Crear: `frontend/src/components/AppLogo.jsx`

- [ ] **Paso 1: Crear el componente**

```jsx
export default function AppLogo({ variant = 'horizontal', className = '' }) {
  return (
    <img
      src={`/logos/DCSMART-APP-${variant}.svg`}
      alt="DCSmart"
      className={`app-logo${className ? ' ' + className : ''}`}
    />
  )
}
```

- [ ] **Paso 2: Verificar que el archivo SVG es accesible**

Con el servidor de Vite corriendo (`npm run dev` en `frontend/`), abrir en el navegador:
```
http://localhost:5173/logos/DCSMART-APP-horizontal.svg
```
Esperado: se muestra el SVG del logo horizontal.

- [ ] **Paso 3: Commit**

```bash
git add frontend/src/components/AppLogo.jsx
git commit -m "feat: add AppLogo component"
```

---

## Tarea 2: Actualizar Sidebar.jsx

**Archivos:**
- Modificar: `frontend/src/components/Sidebar.jsx`

- [ ] **Paso 1: Agregar import de AppLogo al principio del archivo**

Buscar la línea (aprox línea 4):
```js
import { useUiStore } from '../store/uiStore.js'
```
Añadir debajo:
```js
import AppLogo from './AppLogo.jsx'
```

- [ ] **Paso 2: Eliminar la función `IcoLayers` (aprox líneas 7-15)**

Eliminar el bloque completo:
```jsx
function IcoLayers() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  )
}
```

- [ ] **Paso 3: Reemplazar el bloque de brand (aprox líneas 173-180)**

Reemplazar:
```jsx
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">
          <IcoLayers />
        </div>
        <div className="sidebar-brand-text">
          <b>DCSmart</b>
          <span>Backoffice</span>
        </div>
```
Con:
```jsx
      <div className="sidebar-brand">
        <AppLogo variant="horizontal" />
```

- [ ] **Paso 4: Actualizar CSS de `.sidebar-brand` en `frontend/src/styles/app.css`**

Localizar las reglas `.sidebar-brand-mark`, `.sidebar-brand-text`, `.sidebar-brand-text b`, `.sidebar-brand-text span` y eliminarlas.

Actualizar `.sidebar-brand` para centrar el logo:
```css
.sidebar-brand {
  padding: 20px 16px 16px;
  display: flex;
  align-items: center;
}

.sidebar-brand .app-logo {
  height: 28px;
  width: auto;
  display: block;
}
```

- [ ] **Paso 5: Verificar visualmente en el navegador**

El sidebar debe mostrar el logo horizontal en lugar del ícono + texto.

- [ ] **Paso 6: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/styles/app.css
git commit -m "feat: replace Sidebar brand with official logo"
```

---

## Tarea 3: Actualizar Login.jsx

**Archivos:**
- Modificar: `frontend/src/pages/Login.jsx`

- [ ] **Paso 1: Agregar import de AppLogo**

Buscar los imports al inicio del archivo y añadir:
```js
import AppLogo from '../components/AppLogo.jsx'
```

- [ ] **Paso 2: Eliminar la función `IconLayers` local (aprox líneas 52-60)**

Eliminar el bloque completo:
```jsx
function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  )
}
```

- [ ] **Paso 3: Reemplazar el bloque `.auth-brand` (aprox líneas 147-152)**

Reemplazar:
```jsx
          <div className="auth-brand">
            <div className="mark"><IconLayers /></div>
            <div className="wm">
              <b>DCSmart</b>
              <span>Backoffice</span>
            </div>
```
Con:
```jsx
          <div className="auth-brand">
            <AppLogo variant="horizontal" />
```

- [ ] **Paso 4: Actualizar CSS en `frontend/src/pages/auth.css`**

Localizar y eliminar las reglas:
```css
.auth-brand .mark { ... }
.auth-brand .wm { ... }
.auth-brand .wm b { ... }
.auth-brand .wm span { ... }
```

Actualizar `.auth-brand`:
```css
.auth-brand {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 28px;
}

.auth-brand .app-logo {
  height: 40px;
  width: auto;
  display: block;
}
```

- [ ] **Paso 5: Verificar visualmente en el navegador**

La pantalla de login debe mostrar el logo horizontal centrado.

- [ ] **Paso 6: Commit**

```bash
git add frontend/src/pages/Login.jsx frontend/src/pages/auth.css
git commit -m "feat: replace Login brand with official logo"
```

---

## Tarea 4: Actualizar AppSelector.jsx

**Archivos:**
- Modificar: `frontend/src/pages/AppSelector.jsx`

- [ ] **Paso 1: Agregar import de AppLogo**

```js
import AppLogo from '../components/AppLogo.jsx'
```

- [ ] **Paso 2: Eliminar la función `IconLayers` local (aprox líneas 38-46)**

Eliminar el bloque completo:
```jsx
function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  )
}
```

- [ ] **Paso 3: Reemplazar el bloque `.sel-brand` (aprox líneas 136-141)**

Reemplazar:
```jsx
        <div className="sel-brand">
          <div className="mark"><IconLayers /></div>
          <div className="wm">
            <b>DCSmart</b>
            <span>Backoffice</span>
          </div>
```
Con:
```jsx
        <div className="sel-brand">
          <AppLogo variant="horizontal" />
```

- [ ] **Paso 4: Actualizar CSS `.sel-brand` en `frontend/src/pages/auth.css`**

Localizar y eliminar las reglas:
```css
.sel-brand .mark { ... }
.sel-brand .wm { ... }
.sel-brand .wm b { ... }
.sel-brand .wm span { ... }
```

Actualizar `.sel-brand`:
```css
.sel-brand {
  display: flex;
  align-items: center;
}

.sel-brand .app-logo {
  height: 32px;
  width: auto;
  display: block;
}
```

- [ ] **Paso 5: Verificar visualmente**

La pantalla de selección de app debe mostrar el logo horizontal en el header.

- [ ] **Paso 6: Commit**

```bash
git add frontend/src/pages/AppSelector.jsx frontend/src/pages/auth.css
git commit -m "feat: replace AppSelector brand with official logo"
```

---

## Tarea 5: Corregir `index.html` y favicons

**Archivos:**
- Modificar: `frontend/index.html`

- [ ] **Paso 1: Reemplazar el contenido completo de `index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DCSmart</title>
    <link rel="icon" type="image/x-icon" href="/favicos/favicon.ico" />
    <link rel="icon" type="image/svg+xml" href="/favicos/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicos/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicos/favicon-16x16.png" />
    <link rel="apple-touch-icon" href="/favicos/apple-touch-icon.png" />
    <link rel="manifest" href="/favicos/site.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Paso 2: Corregir `site.webmanifest`**

Archivo: `frontend/public/favicos/site.webmanifest`

Reemplazar contenido por:
```json
{
  "name": "DCSmart",
  "short_name": "DCSmart",
  "description": "Sistema de gestión DCSmart",
  "icons": [
    { "src": "/favicos/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicos/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#1e40af",
  "background_color": "#ffffff",
  "display": "standalone"
}
```

- [ ] **Paso 3: Verificar en el navegador**

Abrir DevTools → pestaña Application → Manifest. Debe mostrar nombre "DCSmart" e íconos cargados correctamente.

- [ ] **Paso 4: Commit**

```bash
git add frontend/index.html frontend/public/favicos/site.webmanifest
git commit -m "fix: correct favicon links and webmanifest"
```

---

## Tarea 6: Corregir `vite.config.js` y limpiar CSS huérfano

**Archivos:**
- Modificar: `frontend/vite.config.js`
- Modificar: `frontend/src/App.css`

- [ ] **Paso 1: Actualizar rutas de íconos PWA en `vite.config.js`**

Reemplazar el bloque `icons`:
```js
icons: [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
]
```
Con:
```js
icons: [
  { src: '/favicos/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/favicos/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/favicos/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/favicos/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
]
```

- [ ] **Paso 2: Eliminar clase `.logo` huérfana de `App.css`**

En `frontend/src/App.css` localizar y eliminar:
```css
  .logo {
    height: 18px;
  }
```

- [ ] **Paso 3: Verificar build**

```bash
cd frontend && npm run build
```
Esperado: build exitoso sin errores. Verificar que en `dist/manifest.webmanifest` los íconos apunten a `/favicos/`.

- [ ] **Paso 4: Commit final**

```bash
git add frontend/vite.config.js frontend/src/App.css
git commit -m "fix: update PWA icon paths and remove orphaned CSS"
```
