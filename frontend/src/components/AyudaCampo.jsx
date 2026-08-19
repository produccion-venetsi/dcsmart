// La ayuda de un campo: el "?" al lado de la etiqueta.
//
// Se abre al hacer clic (no al pasar el mouse) porque la mitad de la gente
// carga la caja desde el celular, donde no hay hover. Y queda abierta hasta que
// la cierran: un tooltip que desaparece cuando movés el dedo no se alcanza a
// leer.
//
// El texto no vive acá: sale de lib/ayudaCaja.js, que es la misma fuente que
// alimenta el centro de ayuda.

import { useState, useId } from 'react'
import { ayudaDe } from '../lib/ayudaCaja.js'

function IcoAyuda() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export default function AyudaCampo({ campo, children }) {
  const [abierta, setAbierta] = useState(false)
  const id = useId()
  const ayuda = ayudaDe(campo)
  if (!ayuda) return children ?? null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, position: 'relative' }}>
      {children}
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        aria-controls={id}
        aria-label={`Qué va en ${ayuda.titulo}`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, padding: 0, borderRadius: '50%', cursor: 'pointer',
          background: 'transparent', border: 'none',
          color: abierta ? 'var(--gold)' : 'var(--t3)',
        }}
      >
        <IcoAyuda />
      </button>
      {abierta && (
        <span
          id={id}
          role="note"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30,
            width: 'max(240px, 100%)', maxWidth: 320,
            padding: '10px 12px', borderRadius: 12,
            background: 'var(--bg-sticky)', border: '1px solid var(--glass-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
            fontSize: 11.5, lineHeight: 1.5, fontWeight: 400,
            color: 'var(--t2)', textTransform: 'none', letterSpacing: 0,
          }}
        >
          <strong style={{ display: 'block', color: 'var(--t1)', marginBottom: 4 }}>{ayuda.titulo}</strong>
          {ayuda.que}
          {ayuda.ojo && (
            <span style={{ display: 'block', marginTop: 6, color: 'var(--amber)' }}>{ayuda.ojo}</span>
          )}
        </span>
      )}
    </span>
  )
}
