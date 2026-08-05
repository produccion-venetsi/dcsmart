import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { avisosApi } from '../../api/notificaciones.js'
import { useUiStore } from '../../store/uiStore.js'

// A donde lleva cada aviso segun de que habla. Un pago se abre en su formulario de
// edicion (es donde se ve el estado de auditoria); una caja, en su detalle.
function destinoDe(aviso) {
  if (!aviso?.id_registro) return null
  if (aviso.tabla === 'pagos') return `/pagos/${aviso.id_registro}/editar`
  if (aviso.tabla === 'cajas') return `/cajas/${aviso.id_registro}`
  return null
}

function fechaCorta(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

export default function Avisos() {
  const navigate = useNavigate()
  const notify = useUiStore((s) => s.notify)
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(() => {
    avisosApi.list({ limit: 100 })
      .then((r) => setAvisos(r.data?.data ?? []))
      .catch(() => notify('No se pudieron cargar los avisos', 'error'))
      .finally(() => setLoading(false))
  }, [notify])

  useEffect(() => { cargar() }, [cargar])

  const abrir = async (aviso) => {
    // Se marca leido antes de navegar, pero un fallo no bloquea: peor caso el
    // aviso queda sin leer y el contador no baja.
    if (!aviso.leida) {
      try { await avisosApi.marcarLeida(aviso.id) } catch { /* se navega igual */ }
    }
    const destino = destinoDe(aviso)
    if (destino) navigate(destino)
    else cargar()
  }

  const leerTodas = async () => {
    try {
      await avisosApi.leerTodas()
      cargar()
    } catch { notify('No se pudieron marcar como leídos', 'error') }
  }

  const noLeidas = avisos.filter((a) => !a.leida).length

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Avisos</h1>
          {noLeidas > 0 && <span className="local-badge">{noLeidas} sin leer</span>}
        </div>
        {noLeidas > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={leerTodas}>
            Marcar todo como leído
          </button>
        )}
      </div>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : avisos.length === 0 ? (
        <div className="card">
          <div className="card-body">
            No tenés avisos. Acá te van a llegar cuando alguien revierta una auditoría tuya.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body aviso-lista">
            {avisos.map((a) => (
              <button
                key={a.id}
                type="button"
                className={'aviso-item' + (a.leida ? '' : ' sin-leer')}
                onClick={() => abrir(a)}
              >
                <span className="aviso-punto" aria-hidden={a.leida ? 'true' : undefined} />
                <span className="aviso-titulo">{a.titulo}</span>
                <span className="aviso-fecha">{fechaCorta(a.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
