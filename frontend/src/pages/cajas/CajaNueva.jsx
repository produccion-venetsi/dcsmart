import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import CajaCreatePanel from './CajaCreatePanel.jsx'
import PanelCuadre from '../../components/PanelCuadre.jsx'
import { useAppStore } from '../../store/appStore.js'
import { homeDeRol, HOME_POR_DEFECTO } from '../../lib/roles.js'

// Alta de caja como pantalla completa.
//
// Existe porque `data_entry` no puede entrar a /cajas (no tiene `view` en el
// modulo), asi que no puede abrir el panel de alta desde el listado como el resto
// de los roles. Usa el MISMO componente que el listado, no una copia.
export default function CajaNueva() {
  const navigate = useNavigate()
  const [cuadre, setCuadre] = useState(null)
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

      {/* El layout del diseño B+C: formulario a la izquierda, el cuadre
          SIEMPRE visible en su columna sticky. En celular (ver .bc-* en
          app.css) el panel pasa arriba como banner compacto. */}
      <div className="bc-grid">
        <div className="card bc-form">
          <div className="card-body">
            <CajaCreatePanel
              activeLocal={activeLocal}
              locales={locales}
              onCreated={volver}
              onClose={() => volver(null)}
              onCuadre={setCuadre}
            />
          </div>
        </div>
        <div className="bc-lado">
          <PanelCuadre cuadre={cuadre} />
        </div>
      </div>
    </div>
  )
}
