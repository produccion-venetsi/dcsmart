import { useNavigate } from 'react-router-dom'
import CajaCreatePanel from './CajaCreatePanel.jsx'
import GuiaCaja from '../../components/GuiaCaja.jsx'
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
  // resto al listado con el detalle de la caja nueva abierto.
  //
  // Va a /cajas?caja=<id> y no a /cajas/<id>: esa ruta renderiza CajaDetail.jsx,
  // otra pantalla de detalle a la que no linkea nada de la app y que muestra menos
  // que el drawer del listado.
  const volver = (nuevoId) => {
    const home = homeDeRol(role)
    if (home !== HOME_POR_DEFECTO) { navigate(home); return }
    navigate(nuevoId ? `/cajas?caja=${nuevoId}` : '/cajas')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Nueva caja</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
      </div>

      {/* Dos columnas en pantalla ancha: el formulario a la izquierda y la guía
          al costado, siempre a la vista. En celular la guía baja al final, que
          es donde molesta menos: ahí la referencia es el "?" de cada campo. */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '3 1 min(560px, 100%)' }}>
          <div className="card-body">
            <CajaCreatePanel
              activeLocal={activeLocal}
              locales={locales}
              onCreated={volver}
              onClose={() => volver(null)}
            />
          </div>
        </div>
        <div style={{ flex: '1 1 min(280px, 100%)', maxWidth: 360 }}>
          <GuiaCaja />
        </div>
      </div>
    </div>
  )
}
