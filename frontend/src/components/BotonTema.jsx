// El interruptor de tema, y el que lo aplica al <html>.
//
// La lógica (qué tema toca, qué se guarda, qué dice el botón) está en lib/tema.js con
// tests. Acá está el efecto: escribir en el <html> y escuchar al sistema.
//
// Cicla por tres estados —sistema → claro → oscuro→ sistema— y no dos: con un interruptor
// de dos posiciones, quien salió de "seguir al sistema" no puede volver.

import { useEffect, useState } from 'react'
import {
  leerPreferencia, guardarPreferencia, siguienteTema, estadoBoton, aplicarTema,
} from '../lib/tema.js'

function IcoSol() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function IcoLuna() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

// ¿El sistema pide oscuro? `null` si el navegador no sabe responder, que es distinto de
// "pide claro": ver temaEfectivo, que ante la duda deja la app oscura.
function sistemaPrefiereOscuro() {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  const consulta = window.matchMedia('(prefers-color-scheme: dark)')
  // Un navegador sin soporte devuelve `matches: false` para cualquier consulta, que se
  // leería como "prefiere claro". `media` queda en 'not all' cuando no la entiende.
  if (consulta.media === 'not all') return null
  return consulta.matches
}

export default function BotonTema({ colapsado = false }) {
  const [preferencia, setPreferencia] = useState(() =>
    leerPreferencia(typeof window !== 'undefined' ? window.localStorage : null))
  const [prefiereOscuro, setPrefiereOscuro] = useState(sistemaPrefiereOscuro)

  // El tema se aplica en cada cambio de preferencia. No hace falta en el primer render
  // (main.jsx ya lo aplicó), pero repetirlo es inofensivo y cubre el caso de montar el
  // botón en otra pantalla.
  useEffect(() => {
    aplicarTema(preferencia, prefiereOscuro)
  }, [preferencia, prefiereOscuro])

  // Si el sistema cambia mientras la app está abierta (Windows a la noche), y la
  // preferencia es "sistema", la app tiene que acompañar sin recargar.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = (e) => setPrefiereOscuro(e.matches)
    // `addEventListener` en los navegadores actuales; `addListener` en los viejos.
    if (consulta.addEventListener) consulta.addEventListener('change', alCambiar)
    else consulta.addListener?.(alCambiar)
    return () => {
      if (consulta.removeEventListener) consulta.removeEventListener('change', alCambiar)
      else consulta.removeListener?.(alCambiar)
    }
  }, [])

  const estado = estadoBoton(preferencia, prefiereOscuro)

  const alternar = () => {
    const proximo = siguienteTema(preferencia)
    setPreferencia(proximo)
    guardarPreferencia(typeof window !== 'undefined' ? window.localStorage : null, proximo)
  }

  return (
    <button
      type="button"
      className="boton-tema"
      onClick={alternar}
      title={estado.ayuda}
      aria-label={`Tema: ${estado.etiqueta}. ${estado.ayuda}`}
    >
      {estado.icono === 'sol' ? <IcoSol /> : <IcoLuna />}
      {/* Con el sidebar colapsado queda solo el ícono; el título y el aria-label siguen
          diciendo el estado completo. */}
      {!colapsado && <span>{estado.etiqueta}</span>}
    </button>
  )
}
