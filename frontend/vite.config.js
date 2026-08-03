import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { construirVersion } from './src/lib/version.js'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// Cantidad de commits, que es de dónde sale el patch de la versión (ver
// src/lib/version.js). Si git no está disponible se devuelve null y la versión
// cae a la de package.json.
//
// Los workflows de deploy hacen checkout con `fetch-depth: 0`: sin eso el
// checkout es shallow, el conteo da 1 y la versión no se movería nunca.
function cantidadDeCommits() {
  try {
    return execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    })
  } catch {
    return null
  }
}

const APP_VERSION = construirVersion(pkg.version, cantidadDeCommits())

export default defineConfig({
  define: {
    // Versión de la app, disponible en el código como __APP_VERSION__. El major
    // y el minor salen de package.json; el patch es la cantidad de commits.
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' y no 'autoUpdate': la app registra el service worker por su
      // cuenta (ver components/ActualizarApp.jsx) para poder decidir CUÁNDO
      // recargar. Con 'autoUpdate' + el registro automático que inyectaba el
      // plugin, el SW nuevo tomaba control de una pestaña que seguía corriendo
      // el JS viejo y nadie la recargaba nunca: por eso hacía falta
      // Ctrl+Shift+R después de cada deploy.
      registerType: 'prompt',
      // El plugin ya no inyecta su registerSW.js: lo hace ActualizarApp.
      injectRegister: null,
      manifest: {
        name: 'DCSmart',
        short_name: 'DCSmart',
        description: 'Sistema de gestión DCSmart',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/favicos/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/favicos/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/favicos/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/favicos/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // skipWaiting NO va acá: el SW nuevo espera, y es ActualizarApp quien
        // le dice cuándo activarse (y recarga la página en el mismo acto). Con
        // skipWaiting acá, el SW nuevo se activaba solo mientras la pestaña
        // seguía ejecutando el bundle viejo -- ese desfasaje es el que hacía
        // fallar la carga de chunks que ya no existían tras el deploy.
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // El shell (index.html) NUNCA se sirve desde el precache: siempre se
        // pide a la red (con fallback al cache si no hay conexión). Es lo que
        // ancla los bundles hasheados, así que servir uno viejo dejaba la app
        // cargando JS/CSS obsoletos tras un deploy.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-shell',
              networkTimeoutSeconds: 3
            }
          },
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 300 }
            }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
