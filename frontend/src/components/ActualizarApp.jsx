import { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

// Avisa (y aplica) cuando hay una versión nueva desplegada.
//
// Historia, porque explica por qué el código es más defensivo de lo que
// parecería necesario:
//
// 1. Antes había que hacer Ctrl+Shift+R después de cada deploy. El service
//    worker se registraba con un script mínimo, así que el SW nuevo se
//    instalaba pero nadie recargaba la pestaña.
// 2. Al arreglar eso, el aviso aparecía pero el botón "Actualizar" no hacía
//    nada: `updateSW(true)` le manda SKIP_WAITING al SW que está esperando y
//    recarga la página SOLO cuando llega el evento de cambio de control. Si ese
//    evento no llega -- pasa cuando el SW anterior ya había tomado control por
//    su cuenta -- la promesa no resuelve nunca y el botón queda muerto.
//
// Por eso ahora la recarga no depende del evento: se pide la actualización y se
// recarga igual pasado un momento. Un reload de más es gratis; uno de menos
// deja a la persona mirando un botón que no responde.
const INTERVALO_CHEQUEO_MS = 60_000
// Cuánto se le da al service worker para recargar por su cuenta antes de
// forzarlo. Alcanza para el camino feliz sin que se note la espera.
const ESPERA_ANTES_DE_FORZAR_MS = 1500

const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null

function IcoUpdate() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
    </svg>
  )
}

export default function ActualizarApp() {
  const [disponible, setDisponible] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const aplicarRef = useRef(null)
  const registrationRef = useRef(null)

  // Pide la versión nueva y recarga. La recarga se programa ANTES de llamar a
  // updateSW: si esa promesa no resuelve, el timeout ya está en marcha y la
  // página se actualiza igual.
  const aplicar = useCallback(() => {
    if (aplicando) return
    setAplicando(true)
    setTimeout(() => window.location.reload(), ESPERA_ANTES_DE_FORZAR_MS)
    try { aplicarRef.current?.(true) } catch { /* se recarga igual */ }
  }, [aplicando])

  useEffect(() => {
    let intervalo = null

    aplicarRef.current = registerSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        if (!registration) return
        registrationRef.current = registration
        // Preguntar YA, sin esperar el primer minuto: si el deploy pasó
        // mientras la app estaba cerrada, el aviso aparece al abrirla y no
        // "en algún momento" después.
        registration.update().catch(() => {})
        // El navegador solo busca actualizaciones al navegar o cada 24hs, que
        // con la app abierta todo el día es demasiado tarde.
        intervalo = setInterval(() => { registration.update().catch(() => {}) }, INTERVALO_CHEQUEO_MS)
      },
      onNeedRefresh() { setDisponible(true) },
    })

    // El cleanup va acá y no adentro de onRegisteredSW: lo que devuelve ese
    // callback lo ignora el plugin, así que el interval quedaba corriendo.
    return () => { if (intervalo) clearInterval(intervalo) }
  }, [])

  // Volver a la pestaña es el otro momento natural para preguntar: alguien que
  // deja la app abierta en segundo plano toda la tarde se entera al volver, sin
  // depender de dónde cayó el intervalo.
  useEffect(() => {
    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        // Se va: si ya hay versión nueva, se aplica ahora. Nadie está
        // escribiendo, y al volver ya está actualizada sin haber visto nada.
        if (disponible) aplicar()
      } else {
        registrationRef.current?.update().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }, [disponible, aplicar])

  if (!disponible) return null

  return (
    <div className="actualizar-app" role="status">
      <IcoUpdate />
      <span className="actualizar-app-txt">
        Hay una versión nueva de DCSmart.
        {VERSION && <span className="actualizar-app-ver"> Tenés la v{VERSION}.</span>}
      </span>
      <button type="button" className="btn btn-sm btn-primary" onClick={aplicar} disabled={aplicando}>
        {aplicando ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  )
}
