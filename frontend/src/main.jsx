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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
