// Edición de caja en pantalla completa.
//
// Reutiliza el MISMO CajaEditPanel del listado, no una copia: la única
// diferencia es dónde vive. El drawer quedaba corto para un formulario con
// detalles de tres tipos y el cuadre en vivo; acá tiene todo el ancho.
import { useNavigate, useParams } from 'react-router-dom'
import { CajaEditPanel } from './CajaList.jsx'

export default function CajaEditar() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Editar caja</h1>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <CajaEditPanel
            cajaId={id}
            onSaved={() => navigate(`/cajas/${id}`)}
            onBack={() => navigate(`/cajas/${id}`)}
          />
        </div>
      </div>
    </div>
  )
}
