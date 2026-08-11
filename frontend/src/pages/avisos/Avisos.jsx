import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { avisosApi } from '../../api/notificaciones.js'
import { authApi } from '../../api/auth.js'
import { useUiStore } from '../../store/uiStore.js'
import { useAppStore } from '../../store/appStore.js'
import { resolverApertura, mensajeDeCambio } from '../../lib/destinoAviso.js'

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
  // Las apps y locales que el usuario maneja: con esto se resuelve si el local del
  // aviso está a su alcance y a qué grupo pertenece.
  const [misApps, setMisApps] = useState([])

  const appActiva = useAppStore((s) => s.activeApp)
  const localActivo = useAppStore((s) => s.activeLocal)
  const setActiveApp = useAppStore((s) => s.setActiveApp)
  const setActiveLocal = useAppStore((s) => s.setActiveLocal)

  const cargar = useCallback(() => {
    avisosApi.list({ limit: 100 })
      .then((r) => setAvisos(r.data?.data ?? []))
      .catch(() => notify('No se pudieron cargar los avisos', 'error'))
      .finally(() => setLoading(false))
  }, [notify])

  useEffect(() => { cargar() }, [cargar])

  // Si falla, `misApps` queda vacío y abrir un aviso de otro local avisa que no hay
  // acceso en vez de mandar a un 403. Se prefiere eso a bloquear la pantalla.
  useEffect(() => {
    authApi.myApps()
      .then((r) => setMisApps(r.data ?? []))
      .catch(() => setMisApps([]))
  }, [])

  const abrir = async (aviso) => {
    const plan = resolverApertura(aviso, { misApps, appActiva, localActivo })

    // Un aviso que no se puede abrir NO se marca leído: si se marcara, el usuario
    // perdería el registro y el aviso de una sola vez, que es lo que pasaba antes.
    if (plan.accion === 'sin-acceso') {
      notify(plan.mensaje, 'error')
      return
    }

    const marcarLeida = async () => {
      if (!aviso.leida) {
        try { await avisosApi.marcarLeida(aviso.id) } catch { /* se abre igual */ }
      }
    }

    if (plan.accion === 'solo-marcar') {
      await marcarLeida()
      cargar()
      return
    }

    // El aviso es de otro local: se mueve el contexto antes de navegar, si no el
    // backend responde 403 (corta por allowedLocalIds) y con cajas el drawer no
    // abre porque el listado filtra por el local activo.
    if (plan.accion === 'cambiar-contexto') {
      // setActiveApp limpia el local, así que el orden importa: primero la app.
      if (plan.cambiaGrupo) setActiveApp(plan.app)
      setActiveLocal(plan.local)
      // Se avisa siempre: el usuario apretó un aviso, no pidió cambiar de local.
      notify(mensajeDeCambio(plan), 'info')
    }

    await marcarLeida()
    navigate(plan.ruta)
  }

  // Marcar hecho / deshacer.
  //
  // Se actualiza la lista en el momento y se revierte si el pedido falla: un checkbox
  // que no responde hasta que vuelve el servidor se siente roto y se clickea dos veces.
  const marcarHecha = async (aviso, hecha) => {
    setAvisos((prev) => prev.map((a) => (a.id === aviso.id
      ? { ...a, hecha, hecha_at: hecha ? new Date().toISOString() : null, leida: hecha ? true : a.leida }
      : a)))
    try {
      await avisosApi.marcarHecha(aviso.id, hecha)
    } catch {
      setAvisos((prev) => prev.map((a) => (a.id === aviso.id ? { ...a, hecha: !hecha } : a)))
      notify('No se pudo marcar el aviso', 'error')
    }
  }

  const leerTodas = async () => {
    try {
      await avisosApi.leerTodas()
      cargar()
    } catch { notify('No se pudieron marcar como leídos', 'error') }
  }

  const noLeidas = avisos.filter((a) => !a.leida).length
  // Lo que falta HACER. Es el numero que importa: leida se marca sola al abrir el
  // aviso, asi que "sin leer" baja con solo mirarlo.
  const pendientes = avisos.filter((a) => !a.hecha).length

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Avisos</h1>
          {pendientes > 0 && <span className="local-badge">{pendientes} sin hacer</span>}
          {noLeidas > 0 && (
            <span className="local-badge" style={{ opacity: 0.7 }}>{noLeidas} sin leer</span>
          )}
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
            No tenés avisos. Acá te van a llegar cuando alguien revierta una auditoría tuya,
            y los vas marcando como hechos a medida que los resolvés.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body aviso-lista">
            {avisos.map((a) => (
              // Fila con tres partes en vez de un solo <button>: un boton no puede
              // contener un checkbox --HTML invalido, y el click del check dispararia
              // tambien el del boton, abriendo el aviso cada vez que se marca.
              <div
                key={a.id}
                className={'aviso-item' + (a.leida ? '' : ' sin-leer') + (a.hecha ? ' hecha' : '')}
              >
                <label
                  className="aviso-check"
                  title={a.hecha ? 'Marcado como hecho — click para desmarcar' : 'Marcar como hecho'}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(a.hecha)}
                    onChange={(e) => marcarHecha(a, e.target.checked)}
                  />
                  <span className="sr-only">Hecho</span>
                </label>

                <button type="button" className="aviso-abrir" onClick={() => abrir(a)}>
                  <span className="aviso-punto" aria-hidden={a.leida ? 'true' : undefined} />
                  <span className="aviso-texto">
                    <span className="aviso-titulo">{a.titulo}</span>
                    {a.cuerpo && <span className="aviso-cuerpo">{a.cuerpo}</span>}
                    {/* De qué local es, cuando no es el que se está mirando: se ve
                        antes de clickear y no después de que cambió el contexto. */}
                    {a.local && a.local.id !== localActivo?.id && (
                      <span className="aviso-cuerpo" style={{ color: 'var(--t3)' }}>
                        {[a.grupo?.nombre, a.local.nombre].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </span>
                </button>

                <span className="aviso-fecha">{fechaCorta(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
