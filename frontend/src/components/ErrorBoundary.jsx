import { Component } from 'react'

// Red de seguridad: si un componente tira un error al renderizar (por ejemplo
// un chunk que no cargó tras un deploy), en vez de desmontar todo y dejar la
// pantalla en blanco/azul, mostramos una tarjeta con opción de recargar.
export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary capturó un error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <h2 className="error-boundary-title">Algo salió mal</h2>
            <p className="error-boundary-msg">
              Puede que haya una versión nueva de la app. Recargá la página para continuar.
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Recargar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
