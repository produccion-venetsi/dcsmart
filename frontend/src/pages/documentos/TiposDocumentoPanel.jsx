// Administración de los tipos de documento.
//
// Vive en un panel dentro de Documentos y no en una pantalla de Admin aparte a propósito:
// el momento en que uno descubre que falta un tipo es cuando está cargando un documento.
// Mandarlo a otra sección y hacerlo volver es perder lo que estaba escribiendo.
//
// Los tipos son globales (los comparten todos los grupos), así que **solo los edita DC**
// (super_admin / dcsmart): un admin de un grupo renombrando un tipo se lo cambia a los
// demás. El backend rechaza con 403 igual; acá se esconden los controles para no ofrecer
// botones que van a fallar, y el panel queda de solo lectura para el resto.

import { useEffect, useState } from 'react'
import { documentosApi } from '../../api/documentos.js'
import { useUiStore } from '../../store/uiStore.js'
import IconoDocumento from '../../components/IconoDocumento.jsx'
import CampoTexto from '../../components/CampoTexto.jsx'
import { CLAVES_ICONO } from '../../lib/documentos.js'

// Los íconos para elegir. Está afuera del componente a propósito: definido adentro,
// React lo trata como un componente distinto en cada render y desmonta los botones
// mientras se usan.
function SelectorIcono({ iconos, valor, onElegir }) {
  const lista = iconos?.length ? iconos : CLAVES_ICONO.map(c => ({ clave: c, label: c }))
  return (
    <div role="radiogroup" aria-label="Ícono" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {lista.map(ic => (
        <button
          key={ic.clave}
          type="button"
          role="radio"
          aria-checked={valor === ic.clave}
          title={ic.label}
          onClick={() => onElegir(ic.clave)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
            // El elegido se marca con borde Y fondo, no solo con color: un cambio de
            // color solo no se distingue en una fila de doce íconos iguales.
            background: valor === ic.clave ? 'rgba(255,255,255,0.10)' : 'transparent',
            border: `1px solid ${valor === ic.clave ? 'var(--t1)' : 'var(--glass-border)'}`,
            color: valor === ic.clave ? 'var(--t1)' : 'var(--t3)',
          }}
        >
          <IconoDocumento clave={ic.clave} size={17} />
        </button>
      ))}
    </div>
  )
}

export default function TiposDocumentoPanel({ onCambio, puedeEditar = false }) {
  const notify = useUiStore(s => s.notify)
  const showConfirm = useUiStore(s => s.showConfirm)

  const [tipos, setTipos] = useState([])
  const [iconos, setIconos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  // Alta
  const [nombre, setNombre] = useState('')
  const [icono, setIcono] = useState('documento')

  // Edición: el id del que se está editando, o null.
  const [editando, setEditando] = useState(null)
  const [editNombre, setEditNombre] = useState('')
  const [editIcono, setEditIcono] = useState('documento')

  // `todos=1` trae también los desactivados: sin verlos no se pueden reactivar, y crear
  // uno con el mismo nombre da 409 sin explicación visible.
  const traerTipos = () =>
    documentosApi.tipos({ todos: 1 })
      .then(({ data }) => setTipos(data ?? []))
      .catch(err => notify(err.response?.data?.error || 'Error al cargar los tipos', 'error'))
      .finally(() => setCargando(false))

  // Se recarga tras cada cambio. El spinner solo se muestra en la carga inicial (el
  // estado arranca en `true`): en una recarga la lista ya está en pantalla y hacerla
  // desaparecer para volver a dibujarla parpadea.
  const cargar = () => traerTipos()

  useEffect(() => {
    // La petición va directo, sin pasar por una función que setee estado en el cuerpo
    // del effect: eso dispara renders en cascada. Los setState de acá viven en los
    // callbacks, que corren después.
    traerTipos()
    // La lista de íconos válidos sale del backend, que es quien la valida.
    documentosApi.iconos()
      .then(({ data }) => setIconos(data ?? []))
      // Si falla, se usan las claves que el componente sabe dibujar.
      .catch(() => setIconos(CLAVES_ICONO.map(c => ({ clave: c, label: c }))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const avisar = () => { cargar(); onCambio?.() }

  const crear = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      await documentosApi.crearTipo({ nombre: nombre.trim(), icono })
      notify('Tipo creado', 'success')
      setNombre('')
      setIcono('documento')
      avisar()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear el tipo', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const empezarEdicion = (t) => {
    setEditando(t.id)
    setEditNombre(t.nombre)
    setEditIcono(t.icono)
  }

  const guardarEdicion = async () => {
    if (!editNombre.trim()) return
    setGuardando(true)
    try {
      await documentosApi.editarTipo(editando, { nombre: editNombre.trim(), icono: editIcono })
      notify('Tipo actualizado', 'success')
      setEditando(null)
      avisar()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const alternarActivo = async (t) => {
    // Desactivar no esconde los documentos que ya lo usan: deja de ofrecerse al cargar
    // uno nuevo. Se dice, porque "desactivar" suena a que algo se va a ocultar.
    const msg = t.activo
      ? `¿Desactivar "${t.nombre}"? Deja de ofrecerse al cargar, y los ${t._count?.documentos ?? 0} documentos que ya lo usan se siguen viendo.`
      : `¿Volver a habilitar "${t.nombre}"?`
    if (!(await showConfirm(msg))) return
    try {
      await documentosApi.editarTipo(t.id, { activo: !t.activo })
      avisar()
    } catch (err) {
      notify(err.response?.data?.error || 'Error al cambiar el estado', 'error')
    }
  }

  const borrar = async (t) => {
    if (!(await showConfirm(`¿Borrar el tipo "${t.nombre}"?`))) return
    try {
      await documentosApi.borrarTipo(t.id)
      notify('Tipo borrado', 'success')
      avisar()
    } catch (err) {
      // El backend contesta 409 con el motivo (tiene documentos): se muestra tal cual,
      // porque dice exactamente qué hacer.
      notify(err.response?.data?.error || 'Error al borrar el tipo', 'error')
    }
  }

  return (
    <div>
      <p className="form-hint" style={{ marginBottom: '1rem' }}>
        {puedeEditar
          ? 'Los tipos son los mismos para todos los grupos: lo que cambiés acá lo ve todo el mundo.'
          : 'Los tipos son los mismos para todos los grupos, así que los administra DCSmart. Acá se ven, no se editan.'}
      </p>

      {/* ── Alta: solo DC ── */}
      {puedeEditar && (
      <form onSubmit={crear} style={{ marginBottom: '1.5rem' }}>
        <CampoTexto
          id="tipo-nombre"
          label="Nuevo tipo"
          value={nombre}
          onChange={setNombre}
          max={60}
          placeholder="Habilitación"
          ayuda="En singular, como se lee en la tabla."
          disabled={guardando}
        />
        <div style={{ marginTop: 8 }}>
          <label className="form-label" style={{ display: 'block', marginBottom: 5 }}>Ícono</label>
          <SelectorIcono iconos={iconos} valor={icono} onElegir={setIcono} />
        </div>
        <button type="submit" className="btn btn-sm btn-primary" style={{ marginTop: 10 }} disabled={guardando || !nombre.trim()}>
          {guardando ? 'Guardando…' : 'Agregar tipo'}
        </button>
      </form>
      )}

      {/* ── Lista ── */}
      <div className="drawer-section-title">Tipos existentes</div>
      {cargando ? (
        <p className="form-hint">Cargando…</p>
      ) : tipos.length === 0 ? (
        <p className="form-hint">Todavía no hay ninguno. Creá el primero arriba.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tipos.map(t => (
            <li
              key={t.id}
              style={{
                padding: '0.55rem 0.6rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--glass-border)',
                borderRadius: 8,
                // Un tipo desactivado se ve apagado, pero legible: hay que poder leerlo
                // para reactivarlo.
                opacity: t.activo ? 1 : 0.6,
              }}
            >
              {puedeEditar && editando === t.id ? (
                <div>
                  <CampoTexto
                    id={`tipo-edit-${t.id}`}
                    label="Nombre"
                    value={editNombre}
                    onChange={setEditNombre}
                    max={60}
                    disabled={guardando}
                    autoFocus
                  />
                  <div style={{ marginTop: 8 }}>
                    <label className="form-label" style={{ display: 'block', marginBottom: 5 }}>Ícono</label>
                    <SelectorIcono iconos={iconos} valor={editIcono} onElegir={setEditIcono} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={guardarEdicion} disabled={guardando}>
                      Guardar
                    </button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditando(null)} disabled={guardando}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ color: 'var(--t3)', display: 'flex' }}>
                    <IconoDocumento clave={t.icono} size={17} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>
                      {t.nombre}
                      {!t.activo && <span className="badge badge-muted" style={{ marginLeft: 6 }}>inactivo</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                      {t._count?.documentos
                        ? `${t._count.documentos} documento${t._count.documentos > 1 ? 's' : ''}`
                        : 'sin documentos'}
                    </div>
                  </div>
                  {puedeEditar && (
                    <>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => empezarEdicion(t)}>
                        Editar
                      </button>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => alternarActivo(t)}>
                        {t.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </>
                  )}
                  {/* Borrar solo se ofrece si no tiene documentos: el backend lo rechaza
                      igual, pero un botón que siempre falla es un botón mentiroso. */}
                  {puedeEditar && !t._count?.documentos && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => borrar(t)}
                      aria-label={`Borrar ${t.nombre}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
