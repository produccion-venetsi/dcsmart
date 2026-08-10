// Alta y edición de un cliente del grupo activo.
//
// El grupo lo pone el backend con el X-App-Id: acá no hay selector de grupo, y un
// cliente no cambia de grupo después de creado.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { clientesApi } from '../../api/clientes.js'
import { useUiStore } from '../../store/uiStore.js'
import CampoTexto from '../../components/CampoTexto.jsx'
import CampoCuit from '../../components/CampoCuit.jsx'

// Largos de los campos de texto. Se muestran como contador y no hay que adivinarlos.
const LARGOS = {
  nombre: 80, razon_social: 120, cuit: 13, telefono: 40, mail: 120, observaciones: 500,
}

const VACIO = {
  nombre: '', razon_social: '', cuit: '', telefono: '', mail: '', observaciones: '', activo: true,
}

export default function ClienteForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const notify = useUiStore((s) => s.notify)
  const editando = Boolean(id)

  const [form, setForm] = useState(VACIO)
  const [cargando, setCargando] = useState(editando)
  const [guardando, setGuardando] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!editando) return
    const ctrl = new AbortController()
    clientesApi.get(id, ctrl.signal)
      .then(({ data }) => setForm({
        nombre: data.nombre ?? '',
        razon_social: data.razon_social ?? '',
        cuit: data.cuit ?? '',
        telefono: data.telefono ?? '',
        mail: data.mail ?? '',
        observaciones: data.observaciones ?? '',
        activo: data.activo,
      }))
      .catch((err) => {
        if (ctrl.signal.aborted) return
        notify(err.response?.data?.error || 'No se pudo cargar el cliente', 'error')
        navigate('/clientes')
      })
      .finally(() => { if (!ctrl.signal.aborted) setCargando(false) })
    return () => ctrl.abort()
  }, [id, editando])

  const submit = async (e) => {
    e.preventDefault()
    // La misma regla que el backend: con los dos vacíos el cliente no se puede ni
    // nombrar en un listado.
    if (!form.nombre.trim() && !form.razon_social.trim()) {
      return notify('Poné el nombre o la razón social', 'error')
    }
    setGuardando(true)
    try {
      if (editando) {
        await clientesApi.update(id, form)
        notify('Cliente actualizado', 'success')
      } else {
        await clientesApi.create(form)
        notify('Cliente creado', 'success')
      }
      navigate('/clientes')
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo guardar', 'error')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return <div className="page"><div className="page-loading"><div className="spinner" /></div></div>
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">{editando ? 'Editar cliente' : 'Nuevo cliente'}</h1>
          <p className="page-sub">
            Con el nombre o la razón social alcanza; el resto sirve para encontrarlo y contactarlo.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="card">
        <div className="card-body" style={{ display: 'grid', gap: '0.9rem', maxWidth: 620 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <CampoTexto
              id="cli-nombre"
              label="Nombre"
              value={form.nombre}
              onChange={(v) => set('nombre', v)}
              max={LARGOS.nombre}
              placeholder="Juan Pérez"
              ayuda="Como lo conocen. Es lo que se ve en los listados."
              autoFocus
            />
            <CampoTexto
              id="cli-razon"
              label="Razón social"
              value={form.razon_social}
              onChange={(v) => set('razon_social', v)}
              max={LARGOS.razon_social}
              placeholder="Pérez y Asociados SRL"
              ayuda="El nombre fiscal, si es distinto."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <CampoCuit
              id="cli-cuit"
              value={form.cuit}
              onChange={(v) => set('cuit', v)}
              max={LARGOS.cuit}
              ayuda="Con o sin guiones: el buscador encuentra las dos formas."
            />
            <CampoTexto
              id="cli-telefono"
              label="Teléfono"
              value={form.telefono}
              onChange={(v) => set('telefono', v)}
              max={LARGOS.telefono}
              placeholder="11 5555-5555"
              ayuda="Para contactarlo por la cuenta."
            />
          </div>

          <CampoTexto
            id="cli-mail"
            label="Mail"
            value={form.mail}
            onChange={(v) => set('mail', v)}
            max={LARGOS.mail}
            placeholder="juan@empresa.com"
            ayuda="A dónde mandarle el estado de cuenta."
          />

          <CampoTexto
            id="cli-observaciones"
            label="Observaciones"
            value={form.observaciones}
            onChange={(v) => set('observaciones', v)}
            multilinea
            minRows={3}
            maxRows={8}
            max={LARGOS.observaciones}
            placeholder="Paga a 30 días, factura a nombre de la SRL"
            ayuda="Lo que hay que saber de este cliente antes de operar con él."
          />

          {editando && (
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="filter-select" value={String(form.activo)} onChange={(e) => set('activo', e.target.value === 'true')}>
                <option value="true">Activo</option>
                <option value="false">Dado de baja</option>
              </select>
              <p className="form-hint">
                Un cliente dado de baja no aparece para cargar ops nuevas, pero conserva su cuenta corriente.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/clientes')} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
