// El detalle de caja en pantalla completa.
//
// Reemplaza a la vieja CajaDetail.jsx, que era una copia paralela del drawer y
// ya había divergido (mostraba solo movimientos, sin detalles, sin permisos).
// Esta página monta el MISMO CajaDetailPanel del listado: una sola fuente de
// verdad para cómo se ve una caja.

import { useNavigate, useParams } from 'react-router-dom'
import { CajaDetailPanel } from './CajaList.jsx'
import { cajasApi } from '../../api/cajas.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { puedeEditar, puedeBorrarCajas, esRolDc } from '../../lib/roles.js'

function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

export default function CajaVer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const showPrompt = useUiStore((s) => s.showPrompt)
  const role = useAppStore((s) => s.activeApp)?.role

  const handleDelete = async (cajaId, e) => {
    e?.stopPropagation()
    // Mismo criterio que el listado: se pide el motivo, no un sí/no.
    const motivo = await showPrompt(
      'Se va a eliminar esta caja con todos sus detalles. No se puede deshacer.',
      { title: 'Eliminar caja', placeholder: 'Por qué se elimina (opcional)' }
    )
    if (motivo === null) return
    try {
      await cajasApi.remove(cajaId, motivo)
      notify('Caja eliminada', 'success')
      navigate('/cajas')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al eliminar la caja', 'error')
    }
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/cajas')}>
        <IcoBack /> Volver a Cajas
      </button>
      <div className="card" style={{ marginTop: '0.75rem' }}>
        <div className="card-body">
          <CajaDetailPanel
            cajaId={id}
            canEdit={puedeEditar(role)}
            canDelete={puedeBorrarCajas(role)}
            canAuditDc={esRolDc(role)}
            onEdit={() => navigate(`/cajas/${id}/editar`)}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  )
}
