import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore.js'

function IcoPago() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}
function IcoCaja() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  )
}

// Home del perfil data_entry: las dos unicas cosas que puede hacer, en grande.
//
// No es un dashboard: ese perfil no ve tablas ni totales, asi que una pantalla con
// metricas seria una pantalla vacia. Son dos botones.
const OPCIONES = [
  { to: '/pagos/nuevo', titulo: 'Cargar pago', sub: 'Factura, comprobante o nota de crédito', Icon: IcoPago },
  { to: '/cajas/nueva', titulo: 'Cargar caja', sub: 'Turno con sus detalles y movimientos',    Icon: IcoCaja },
]

export default function Cargar() {
  const navigate = useNavigate()
  const activeLocal = useAppStore((s) => s.activeLocal)

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Cargar</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
      </div>

      <div className="cargar-grid">
        {OPCIONES.map(({ to, titulo, sub, Icon }) => (
          <button key={to} type="button" className="cargar-opcion" onClick={() => navigate(to)}>
            <span className="cargar-opcion-ico"><Icon /></span>
            <span className="cargar-opcion-texto">
              <span className="cargar-opcion-titulo">{titulo}</span>
              <span className="cargar-opcion-sub">{sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
