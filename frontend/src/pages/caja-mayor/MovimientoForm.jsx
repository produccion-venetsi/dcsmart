// Carga y edición de un movimiento propio de caja mayor: ajustes de saldo,
// préstamos, depósitos que no pasaron por una caja, y el saldo de apertura de un
// local. Las ops que llegan de gestión NO se editan acá (el backend las rechaza):
// su importe y fecha se corrigen en Pagos.

import { useState } from 'react'
import DrawerPanel from '../../components/DrawerPanel.jsx'
import CampoTexto from '../../components/CampoTexto.jsx'
import { cajaMayorApi } from '../../api/cajaMayor.js'
import { useUiStore } from '../../store/uiStore.js'
import { todayInputDate } from '../../lib/dates.js'
import { ESTADOS, LARGOS } from '../../lib/cajaMayor.js'

const soloFecha = (v) => (v ? String(v).slice(0, 10) : '')

export default function MovimientoForm({
  movimiento, localesPorGrupo, monedas, idLocalSugerido, monedaSugerida, onClose, onSaved,
}) {
  const notify = useUiStore((s) => s.notify)
  const editando = Boolean(movimiento?.id)

  const [form, setForm] = useState({
    id_local: movimiento?.id_local ?? idLocalSugerido ?? '',
    origen: movimiento?.origen ?? 'PROPIO',
    moneda: movimiento?.moneda ?? monedaSugerida ?? 'ARS',
    fecha: soloFecha(movimiento?.fecha) || todayInputDate(),
    importe: movimiento?.importe != null ? String(movimiento.importe) : '',
    // Sin default: la dirección la elige quien carga, el sistema no la adivina.
    ingreso: movimiento?.ingreso != null ? String(movimiento.ingreso) : '',
    recibe: movimiento?.recibe ?? '',
    extrae: movimiento?.extrae ?? '',
    fecha_extraccion: soloFecha(movimiento?.fecha_extraccion),
    observaciones: movimiento?.observaciones ?? '',
    estado: movimiento?.estado ?? ESTADOS.ENVIADA,
  })
  const [guardando, setGuardando] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.id_local) return notify('Elegí el local', 'error')
    if (!form.fecha) return notify('Poné la fecha', 'error')
    if (!(Number(form.importe) > 0)) return notify('El importe tiene que ser mayor a cero', 'error')
    if (form.ingreso !== 'true' && form.ingreso !== 'false') {
      return notify('Elegí si entra o sale plata de la caja mayor', 'error')
    }

    const payload = {
      id_local: form.id_local,
      moneda: form.moneda,
      fecha: form.fecha,
      importe: Number(form.importe),
      ingreso: form.ingreso === 'true',
      recibe: form.recibe,
      extrae: form.extrae,
      fecha_extraccion: form.fecha_extraccion || null,
      observaciones: form.observaciones,
    }

    setGuardando(true)
    try {
      if (editando) {
        await cajaMayorApi.editar(movimiento.id, payload)
        notify('Movimiento actualizado', 'success')
      } else {
        await cajaMayorApi.crear({ ...payload, origen: form.origen, estado: form.estado })
        notify(form.origen === 'APERTURA' ? 'Saldo de apertura cargado' : 'Movimiento cargado', 'success')
      }
      await onSaved()
    } catch (err) {
      notify(err.response?.data?.error || 'No se pudo guardar', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <DrawerPanel open onClose={onClose} title={editando ? 'Editar movimiento' : 'Nuevo movimiento de caja mayor'}>
      <form onSubmit={submit} style={{ display: 'grid', gap: '0.9rem' }}>
        {!editando && (
          <div className="form-group">
            <label className="form-label">Tipo de movimiento</label>
            <select className="filter-select" value={form.origen} onChange={e => set('origen', e.target.value)}>
              <option value="PROPIO">Movimiento manual</option>
              <option value="APERTURA">Saldo de apertura del local</option>
            </select>
            {form.origen === 'APERTURA' && (
              <p className="form-hint">
                Es el saldo con el que arranca el local en esta moneda. Solo se puede cargar uno por local.
              </p>
            )}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Local *</label>
          <select
            className="filter-select"
            value={form.id_local}
            onChange={e => set('id_local', e.target.value)}
            disabled={editando}
          >
            <option value="">Elegí el local</option>
            {localesPorGrupo.map(([grupo, items]) => (
              <optgroup key={grupo} label={grupo}>
                {items.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Moneda *</label>
            <select className="filter-select" value={form.moneda} onChange={e => set('moneda', e.target.value)}>
              {monedas.map(m => <option key={m.valor} value={m.valor}>{m.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha *</label>
            <div className="form-input-wrap">
              <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Importe *</label>
            <div className="form-input-wrap">
              <input
                type="number" step="0.01" min="0" inputMode="decimal" placeholder="0,00"
                value={form.importe} onChange={e => set('importe', e.target.value)}
              />
            </div>
            <p className="form-hint">Siempre positivo: la dirección se elige abajo.</p>
          </div>
          <div className="form-group">
            <label className="form-label">Dirección *</label>
            <select className="filter-select" value={form.ingreso} onChange={e => set('ingreso', e.target.value)}>
              <option value="">Elegí…</option>
              <option value="true">↑ Ingreso — entra plata a la caja mayor</option>
              <option value="false">↓ Egreso — sale plata de la caja mayor</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <CampoTexto
            id="cm-recibe"
            label="Recibe"
            value={form.recibe}
            onChange={v => set('recibe', v)}
            max={LARGOS.recibe}
            placeholder="Ana Gómez"
            ayuda="Quién recibe la plata en la caja mayor."
          />
          <CampoTexto
            id="cm-extrae"
            label="Responsable"
            value={form.extrae}
            onChange={v => set('extrae', v)}
            max={LARGOS.extrae}
            placeholder="Ana Gómez"
            ayuda="Quién la sacó del local."
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="cm-fecha-extraccion">Fecha de extracción</label>
          <div className="form-input-wrap">
            <input
              id="cm-fecha-extraccion"
              type="date"
              value={form.fecha_extraccion}
              onChange={e => set('fecha_extraccion', e.target.value)}
              max={todayInputDate()}
            />
          </div>
          <p className="form-hint">
            Cuándo salió la plata del local, si es distinto de la fecha del movimiento.
          </p>
        </div>

        <CampoTexto
          id="cm-observaciones"
          label="Observaciones"
          value={form.observaciones}
          onChange={v => set('observaciones', v)}
          multilinea
          minRows={3}
          maxRows={10}
          max={LARGOS.observaciones}
          placeholder="Retiro del turno noche, entregado en mano"
          ayuda="Para qué fue el movimiento. Es lo que se lee después para entenderlo sin abrir la op."
        />

        {!editando && (
          <div className="form-group">
            <label className="form-label">Estado</label>
            <select className="filter-select" value={form.estado} onChange={e => set('estado', e.target.value)}>
              <option value={ESTADOS.ENVIADA}>Enviada — todavía no se confirmó</option>
              <option value={ESTADOS.RECIBIDA}>Recibida — la plata ya está</option>
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Cargar movimiento'}
          </button>
        </div>
      </form>
    </DrawerPanel>
  )
}
