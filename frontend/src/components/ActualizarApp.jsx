import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

// Avisa (y aplica) cuando hay una versión nueva desplegada.
//
// El problema que resuelve: después de cada deploy había que hacer Ctrl+Shift+R
// para ver los cambios. La causa no era el cache de Firebase (el index.html y
// el sw.js ya iban con no-cache) sino que nadie recargaba la pestaña: el
// service worker se registraba con el script mínimo que inyectaba el plugin
// —un `navigator.serviceWorker.register()` pelado— así que el SW nuevo se
// instalaba pero la página seguía corriendo el bundle viejo hasta que la
// persona recargaba a mano.
//
// Ahora:
// 1. Se pregunta por una versión nueva cada minuto, no solo al abrir la app.
//    Quien deja la pestaña abierta todo el día también se entera.
// 2. Si la pestaña está oculta, se actualiza sola: nadie está escribiendo.
// 3. Si está a la vista, se muestra un aviso con un botón. No se recarga de
//    prepo encima de alguien que está cargando una factura.

// Cada cuánto se le pregunta al servidor si hay una versión nueva. Un minuto es
// un HEAD al sw.js: no pesa, y hace que un deploy urgente llegue rápido.
const INTERVALO_CHEQUEO_MS = 60_000

function IcoUpdate() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
    </svg>
  )
}

export default function ActualizarApp() {
  const [disponible, setDisponible] = useState(false)
  // `updateSW` viene de registerSW y no cambia: se guarda en un ref para no
  // volver a registrar el service worker en cada render.
  const aplicarRef = useRef(null)

  useEffect(() => {
    aplicarRef.current = registerSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        if (!registration) return
        // El navegador solo busca actualizaciones al navegar o cada 24hs. Con
        // la app abierta todo el día eso es demasiado tarde.
        const t = setInterval(() => { registration.update().catch(() => {}) }, INTERVALO_CHEQUEO_MS)
        return () => clearInterval(t)
      },
      onNeedRefresh() {
        setDisponible(true)
      },
    })
  }, [])

  // Actualizar en cuanto la pestaña deje de estar a la vista. Cuando la persona
  // vuelve, ya está en la versión nueva y nunca vio un cartel.
  //
  // Lo que se pierde: si había un formulario a medio llenar, se pierde igual
  // que con cualquier recarga. El de pagos guarda borrador y se restaura solo
  // (ver lib/formDraft.js); los demás no.
  useEffect(() => {
    if (!disponible) return

    const actualizarSiEstaOculta = () => {
      if (document.hidden) aplicarRef.current?.(true)
    }
    document.addEventListener('visibilitychange', actualizarSiEstaOculta)
    actualizarSiEstaOculta()
    return () => document.removeEventListener('visibilitychange', actualizarSiEstaOculta)
  }, [disponible])

  if (!disponible) return null

  return (
    <div className="actualizar-app">
      <IcoUpdate />
      <span className="actualizar-app-txt">
        Hay una versión nueva de DCSmart.
      </span>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => aplicarRef.current?.(true)}>
        Actualizar
      </button>
    </div>
  )
}
