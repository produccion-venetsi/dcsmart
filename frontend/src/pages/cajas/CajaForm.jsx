import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cajasApi } from '../../api/cajas.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { toUtcIsoFromDateTimeLocal } from '../../lib/dates.js'

function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  )
}

const EMPTY = {
  nro_turno: '', fecha_inicio: '', fecha_cierre: '', cajero: '',
  total: '', efectivo: '', fiscal: '', comensales: '', tickets: '',
  observaciones: '', foto_url: '',
}

export default function CajaForm() {
  const navigate    = useNavigate()
  const { activeApp, activeLocal } = useAppStore()
  const notify = useUiStore((s) => s.notify)
  const locales = activeApp?.locales ?? []

  const [form,    setForm]    = useState(EMPTY)
  const [localId, setLocalId] = useState(activeLocal?.id ?? '')
  const [saving,  setSaving]  = useState(false)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const targetLocalId = activeLocal?.id ?? localId

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!targetLocalId) { notify('Seleccioná un local', 'error'); return }
    setSaving(true)
    try {
      const res = await cajasApi.create({
        ...form,
        fecha_inicio: toUtcIsoFromDateTimeLocal(form.fecha_inicio),
        fecha_cierre: toUtcIsoFromDateTimeLocal(form.fecha_cierre),
        id_local: targetLocalId,
      })
      notify('Caja creada', 'success')
      navigate('/cajas')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/cajas')}>
        <IcoBack /> Volver a Cajas
      </button>

      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Nueva Caja</h1>
          {activeLocal && <span className="local-badge">Local: {activeLocal.nombre}</span>}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 800 }}>
        <div className="card">
          <div className="card-body">
            <div className="card-title">Datos del turno</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>

              {!activeLocal && locales.length > 0 && (
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="form-label">Local *</label>
                  <div className="form-input-wrap">
                    <select required value={localId} onChange={e => setLocalId(e.target.value)}>
                      <option value="">Seleccioná un local…</option>
                      {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Fecha Inicio *</label>
                <div className="form-input-wrap">
                  <input type="datetime-local" required value={form.fecha_inicio} onChange={e => setF('fecha_inicio', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Fecha Cierre</label>
                <div className="form-input-wrap">
                  <input type="datetime-local" value={form.fecha_cierre} onChange={e => setF('fecha_cierre', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nro Turno</label>
                <div className="form-input-wrap">
                  <input type="number" min="1" step="1" placeholder="1" value={form.nro_turno} onChange={e => setF('nro_turno', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Cajero</label>
                <div className="form-input-wrap">
                  <input placeholder="Nombre del cajero" value={form.cajero} onChange={e => setF('cajero', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
            <div className="card-title">Importes</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Total</label>
                <div className="form-input-wrap">
                  <input type="number" step="0.01" placeholder="0.00" value={form.total} onChange={e => setF('total', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Efectivo</label>
                <div className="form-input-wrap">
                  <input type="number" step="0.01" placeholder="0.00" value={form.efectivo} onChange={e => setF('efectivo', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Fiscal</label>
                <div className="form-input-wrap">
                  <input type="number" step="0.01" placeholder="0.00" value={form.fiscal} onChange={e => setF('fiscal', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Comensales</label>
                <div className="form-input-wrap">
                  <input type="number" placeholder="0" value={form.comensales} onChange={e => setF('comensales', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tickets</label>
                <div className="form-input-wrap">
                  <input type="number" placeholder="0" value={form.tickets} onChange={e => setF('tickets', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">URL Foto</label>
                <div className="form-input-wrap">
                  <input type="url" placeholder="https://..." value={form.foto_url} onChange={e => setF('foto_url', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Observaciones</label>
                <div className="form-input-wrap form-textarea-wrap">
                  <textarea rows={3} value={form.observaciones} onChange={e => setF('observaciones', e.target.value)} placeholder="Notas opcionales..." />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</>
              : 'Crear Caja'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/cajas')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
