// Qué disponibilidades tiene activas un local: la lista que el arqueo le va a
// pedir. Vive en la ficha del local porque es parte de darlo de alta —cuando
// se abre el local se sabe qué cuentas tiene—, y se corrige acá cuando cambian.
//
// Cada tilde guarda sola. Es configuración, no un formulario: enterrarla detrás
// del botón "Actualizar" del panel invita a tildar y salir sin guardar.

import { useEffect, useState } from 'react'
import { disponibilidadesApi } from '../api/disponibilidades.js'
import { agruparDisponibilidades, FAMILIAS_DISPONIBILIDAD } from '../lib/disponibilidades.js'
import { useUiStore } from '../store/uiStore.js'

// `puedeAdministrar` viene en false solo si algún día esto se muestra fuera del
// panel de administración: la pantalla de Locales ya está detrás de su guard.
export default function DisponibilidadesLocal({ localId, puedeAdministrar = true }) {
  const notify = useUiStore(s => s.notify)
  const [catalogo, setCatalogo] = useState(null) // null = cargando
  const [activas, setActivas] = useState(new Set())
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState(null) // null = el formulario está cerrado

  useEffect(() => {
    if (!localId) return
    const ctrl = new AbortController()
    Promise.all([
      disponibilidadesApi.catalogo(false, ctrl.signal, localId),
      disponibilidadesApi.delLocal(localId, ctrl.signal),
    ])
      .then(([cat, loc]) => {
        setCatalogo(cat.data.tipos || [])
        setActivas(new Set((loc.data.disponibilidades || []).map(d => d.id)))
      })
      .catch(() => { if (!ctrl.signal.aborted) setCatalogo([]) })
    return () => ctrl.abort()
  }, [localId])

  const guardar = async (ids) => {
    const previas = activas
    setActivas(ids)          // optimista: la tilde responde al toque
    setGuardando(true)
    try {
      await disponibilidadesApi.fijarLocal(localId, [...ids])
    } catch (err) {
      setActivas(previas)    // y vuelve atrás si el server la rechaza
      notify(err.response?.data?.error || 'No se pudo guardar la lista', 'error')
    } finally { setGuardando(false) }
  }

  const alternar = (id) => {
    const ids = new Set(activas)
    ids.has(id) ? ids.delete(id) : ids.add(id)
    guardar(ids)
  }

  const crear = async () => {
    const nombre = nuevo.nombre.trim()
    if (!nombre) return
    setGuardando(true)
    try {
      const { data } = await disponibilidadesApi.crear({ nombre, familia: nuevo.familia, id_local: localId })
      setCatalogo(prev => [...prev, data])
      setNuevo(null)
      // Una cuenta que alguien acaba de crear parada en la ficha de un local es
      // para ese local: se activa sola en vez de pedir un segundo clic.
      await guardar(new Set([...activas, data.id]))
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo crear la disponibilidad', 'error')
      setGuardando(false)
    }
  }

  if (!localId) {
    return <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>Guardá el local para elegir sus disponibilidades.</p>
  }
  if (catalogo === null) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem' }}><span className="spinner" /></div>
  }

  const grupos = agruparDisponibilidades(catalogo)

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--t3)', margin: '0 0 10px', lineHeight: 1.5 }}>
        La plata del local que no está en el cajón. Lo que tildes acá es lo que el arqueo va a pedir cargar,
        y se guarda solo. {activas.size ? `${activas.size} activadas.` : 'Ninguna activada todavía.'}
      </p>

      {grupos.map(g => (
        <div key={g.familia} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--t3)', marginBottom: 4 }}>
            {g.nombre}
          </div>
          {g.tipos.map(t => (
            <label key={t.id} className="checkbox-wrap" style={{ display: 'flex', padding: '3px 0' }}>
              <input
                type="checkbox"
                checked={activas.has(t.id)}
                disabled={!puedeAdministrar || guardando}
                onChange={() => alternar(t.id)}
              />
              <span className="checkbox-label">{t.nombre}</span>
            </label>
          ))}
        </div>
      ))}

      {puedeAdministrar && (nuevo ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginTop: 8 }}>
          <div className="form-input-wrap" style={{ flex: 2, minWidth: 0 }}>
            <input
              autoFocus
              maxLength={60}
              placeholder="Nombre de la cuenta (BBVA, MP QR…)"
              value={nuevo.nombre}
              onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crear() } }}
            />
          </div>
          <div className="form-input-wrap" style={{ flex: 1, minWidth: 0 }}>
            <select value={nuevo.familia} onChange={e => setNuevo({ ...nuevo, familia: e.target.value })}>
              {FAMILIAS_DISPONIBILIDAD.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-sm btn-primary" onClick={crear} disabled={guardando || !nuevo.nombre.trim()}>Crear</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setNuevo(null)} disabled={guardando}>Cancelar</button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setNuevo({ nombre: '', familia: 'banco' })}>
          Agregar una cuenta al grupo
        </button>
      ))}

      {/* La cuenta nueva queda disponible para TODOS los locales del grupo: se
          dice acá y no después, cuando ya aparece en la ficha del vecino. */}
      {puedeAdministrar && nuevo && (
        <p style={{ fontSize: 11, color: 'var(--t3)', margin: '6px 0 0' }}>
          Se agrega al catálogo del grupo — va a poder activarse en cualquier local, no solo en este.
        </p>
      )}
    </>
  )
}
