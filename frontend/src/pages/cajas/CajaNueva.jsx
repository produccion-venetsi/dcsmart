import { useNavigate } from 'react-router-dom'
import CajaCreatePanel from './CajaCreatePanel.jsx'
import { useAppStore } from '../../store/appStore.js'
import { homeDeRol, HOME_POR_DEFECTO } from '../../lib/roles.js'

// Alta de caja como pantalla completa.
//
// Existe porque `data_entry` no puede entrar a /cajas (no tiene `view` en el
// modulo), asi que no puede abrir el panel de alta desde el listado como el resto
// de los roles. Usa el MISMO componente que el listado, no una copia.
export default function CajaNueva() {
  const navigate = useNavigate()
  const activeApp   = useAppStore((s) => s.activeApp)
  const activeLocal = useAppStore((s) => s.activeLocal)
  const role        = useAppStore((s) => s.activeApp?.role)
  const locales = activeApp?.locales ?? []

  // Al terminar, cada rol vuelve a donde puede: los restringidos a su home, el
  // resto al detalle de la caja que acaba de crear.
  const volver = (nuevoId) => {
    const home = homeDeRol(role)
    if (home !== HOME_POR_DEFECTO) { navigate(home); return }
    navigate(nuevoId ? `/cajas/${nuevoId}` : '/cajas')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Nueva caja</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <CajaCreatePanel
            activeLocal={activeLocal}
            locales={locales}
            onCreated={volver}
            onClose={() => volver(null)}
          />
        </div>
      </div>
    </div>
  )
}
