# Implementación de Logos Oficiales y Favicons

**Fecha:** 2026-06-10  
**Estado:** Aprobado

## Objetivo

Reemplazar el branding actual (ícono SVG inline `IconLayers` + texto) por las imágenes oficiales del logo en todos los componentes, y corregir la configuración de favicons y PWA.

## Componente `AppLogo` (nuevo)

Crear `src/components/AppLogo.jsx` con prop `variant="horizontal"|"vertical"`.  
Renderiza `<img src="/logos/DCSMART-APP-{variant}.svg" alt="DCSmart" />` con clase CSS para control de tamaño.

## Cambios en componentes existentes

| Componente | Cambio |
|---|---|
| `src/components/Sidebar.jsx` | Reemplazar bloque `.sidebar-brand` (IconLayers + texto) con `<AppLogo variant="horizontal" />` |
| `src/pages/Login.jsx` | Reemplazar bloque `.auth-brand` (IconLayers + texto) con `<AppLogo variant="horizontal" />` |
| `src/pages/AppSelector.jsx` | Reemplazar bloque `.sel-brand` (IconLayers + texto) con `<AppLogo variant="horizontal" />` |

## Favicons y PWA

### `index.html`
Agregar:
```html
<link rel="icon" type="image/x-icon" href="/favicos/favicon.ico" />
<link rel="icon" type="image/svg+xml" href="/favicos/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicos/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicos/favicon-16x16.png" />
<link rel="apple-touch-icon" href="/favicos/apple-touch-icon.png" />
<link rel="manifest" href="/favicos/site.webmanifest" />
<title>DCSmart</title>
```
Eliminar la línea `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` actual.

### `vite.config.js`
Actualizar rutas de íconos PWA:
```js
icons: [
  { src: '/favicos/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/favicos/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/favicos/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/favicos/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
]
```

### `public/favicos/site.webmanifest`
Corregir campos vacíos y rutas:
```json
{
  "name": "DCSmart",
  "short_name": "DCSmart",
  "icons": [
    { "src": "/favicos/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicos/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#1e40af",
  "background_color": "#ffffff",
  "display": "standalone"
}
```

## CSS

Añadir a `App.css` (o al CSS del Sidebar/Login según corresponda):
```css
.app-logo { height: 32px; width: auto; display: block; }
```
Remover la clase `.logo` huérfana de `App.css`.

## Archivos a NO modificar
- Los archivos en `public/logos/` y `public/favicos/` — solo se referencian, no se mueven
- `dist/` — generado por build, no editar manualmente
