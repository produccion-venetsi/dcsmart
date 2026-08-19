// La guía que acompaña a la carga de una caja, al costado y siempre visible.
//
// No es un tutorial que se lee una vez: es la referencia que uno mira mientras
// carga, cuando duda de qué va en un campo. Por eso vive al lado del
// formulario y no en un modal ni en una página aparte.
//
// El contenido sale de lib/ayudaCaja.js, la misma fuente que alimenta el "?"
// de cada campo, para que no puedan decir cosas distintas.

import { useState } from 'react'
import { BLOQUES_CAJA, AYUDA_CAMPOS } from '../lib/ayudaCaja.js'

function Chevron({ abierto }) {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s var(--ease)' }} aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

// Qué campos explica cada bloque. Se nombran acá y no en ayudaCaja porque es
// una decisión de esta pantalla: qué conviene tener a mano mientras se carga.
const CAMPOS_POR_BLOQUE = {
  venta: ['total', 'fiscal', 'comensales', 'tickets'],
  cobros: ['cobro', 'fiado'],
  efectivo: ['efectivo', 'gasto', 'movimiento'],
}

export default function GuiaCaja() {
  const [abierto, setAbierto] = useState('cobros')

  return (
    <aside className="card" style={{ position: 'sticky', top: '1rem' }}>
      <div className="card-body">
        <div className="card-title" style={{ marginBottom: 4 }}>Cómo se arma una caja</div>
        <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--t3)', margin: '0 0 12px' }}>
          Tres preguntas, en este orden. Si las tres cierran, la caja está bien cargada.
        </p>

        {BLOQUES_CAJA.map((b, i) => {
          const activo = abierto === b.id
          return (
            <div key={b.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', paddingTop: i ? 10 : 0, marginTop: i ? 10 : 0 }}>
              <button
                type="button"
                onClick={() => setAbierto(activo ? null : b.id)}
                aria-expanded={activo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0,
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: activo ? 'var(--gold)' : 'var(--t1)', font: 'inherit', fontSize: 12.5, fontWeight: 700,
                }}
              >
                <Chevron abierto={activo} />
                <span style={{ flex: 1 }}>{i + 1}. {b.titulo}</span>
              </button>

              {activo && (
                <div style={{ paddingLeft: 20, marginTop: 6 }}>
                  <p style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--t2)', margin: '0 0 8px' }}>{b.ayuda}</p>
                  {(CAMPOS_POR_BLOQUE[b.id] ?? []).map((campo) => {
                    const a = AYUDA_CAMPOS[campo]
                    if (!a) return null
                    return (
                      <div key={campo} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)' }}>{a.titulo}</div>
                        <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--t3)' }}>
                          {a.que}
                          {a.ojo && <span style={{ display: 'block', color: 'var(--amber)', marginTop: 2 }}>{a.ojo}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>Si no cuadra</div>
          <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--t3)', margin: 0 }}>
            Tocá <strong>¿Por qué?</strong> en el cartel de arriba: dice la cuenta que se hizo y qué conviene mirar primero.
          </p>
        </div>
      </div>
    </aside>
  )
}
