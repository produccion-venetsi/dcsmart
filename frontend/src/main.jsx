import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import './styles/app.css'
import { aplicarTema, leerPreferencia } from './lib/tema.js'

// El tema se aplica ANTES de montar React: hacerlo en un effect pintaría un primer frame
// oscuro y saltaría a claro (el "flash" del tema).
aplicarTema(
  leerPreferencia(window.localStorage),
  window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? null,
)

if (import.meta.env.VITE_GIT_SHA) console.info('Build:', import.meta.env.VITE_GIT_SHA)

// La rueda del mouse sobre un <input type="number"> enfocado cambia el valor
// (comportamiento nativo del navegador). En los campos de plata eso pisa
// importes sin que nadie lo note: scrolleás la página con el cursor sobre el
// campo y el monto quedó otro. Se bloquea global y para todos los inputs
// numéricos; escribir y las flechitas del teclado siguen funcionando.
// passive: false es obligatorio para poder hacer preventDefault en wheel.
document.addEventListener('wheel', (e) => {
  const t = e.target
  if (t instanceof HTMLInputElement && t.type === 'number' && document.activeElement === t) {
    e.preventDefault()
  }
}, { passive: false })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
