import { useEffect, useState } from 'react'
import { detalleTiposApi } from '../../api/detalleTipos.js'
import { useUiStore } from '../../store/uiStore.js'
import { useAppStore } from '../../store/appStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'

function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    </svg>
  )
}
function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

const CLASIFICACIONES = [
  { value: 'canal',      label: 'Canal' },
  { value: 'medio_pago', label: 'Medio de pago' },
  { value: 'calculo',    label: 'Cálculo' },
  { value: 'otro',       label: 'Otro' }
]
const EMPTY = { nombre: '', id_local: '', clasificacion: 'otro', activo: true }

export default function DetalleTipos() {
  const notify    = useUiStore((s) => s.notify)
  const activeApp = useAppStore((s) => s.activeApp)
  const isAdmin   = ['admin', 'super_admin'].includes(activeApp?.role)

  const locales = activeApp?.locales ?? []

  const [tipos,     setTipos]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState(EMPTY)
  const [saving,    setSaving]    = useState(false)

  const load = () => {
    setLoading(true)
    detalleTiposApi.list()
      .then(({ data }) => setTipos(data))
      .catch(() => notify('Error al cargar tipos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openCreate = () => { setSelected(null); setForm(EMPTY); setPanelOpen(true) }
  const openEdit   = (t) => { setSelected(t); setForm({ nombre: t.nombre, id_local: t.id_local || '', clasificacion: t.clasificacion || 'otro', activo: t.activo }); setPanelOpen(true) }
  const closePanel = () => setPanelOpen(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setSaving(true)
    try {
      if (selected) {
        await detalleTiposApi.update(selected.id, { nombre: form.nombre, clasificacion: form.clasificacion, activo: form.activo })
        notify('Tipo actualizado', 'success')
      } else {
        await detalleTiposApi.create({ nombre: form.nombre, id_local: form.id_local || null, clasificacion: form.clasificacion })
        notify('Tipo creado', 'success')
      }
      setPanelOpen(false)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar tipo de detalle?')) return
    try { await detalleTiposApi.remove(id); notify('Eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  const getScopeLabel = (t) => {
    if (!t.id_local) return 'Todos los locales'
    return t.local?.nombre || t.id_local
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Tipos de Detalle</h1>
          <p className="page-sub">Categorías para los detalles de caja</p>
        </div>
        {isAdmin && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openCreate}><IcoPlus /> Nuevo Tipo</button>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Clasificación</th>
              <th>Alcance</th>
              <th>Estado</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="skel-row">
                  {Array.from({ length: isAdmin ? 5 : 4 }, (_, j) => (
                    <td key={j}><span className="skel" style={{ width: `${50 + (j * 17 + i * 13) % 40}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {tipos.map((t) => (
                  <tr
                    key={t.id}
                    className={isAdmin ? 'row-clickable' : ''}
                    onClick={isAdmin ? () => openEdit(t) : undefined}
                  >
                    <td className="td-primary">{t.nombre}</td>
                    <td className="td-muted">{(CLASIFICACIONES.find(c => c.value === t.clasificacion)?.label) || 'Otro'}</td>
                    <td className="td-muted">{getScopeLabel(t)}</td>
                    <td>
                      <span className={`badge ${t.activo ? 'badge-green' : 'badge-muted'}`}>
                        {t.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="td-actions">
                          <button className="btn btn-sm btn-danger btn-icon" onClick={(e) => handleDelete(t.id, e)}>
                            <IcoTrash />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {tipos.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>
                      Sin tipos de detalle
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <DrawerPanel
          open={panelOpen}
          onClose={closePanel}
          title={selected ? `Editar — ${selected.nombre}` : 'Nuevo Tipo de Detalle'}
          width={400}
        >
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <div className="form-input-wrap">
                <input required placeholder="MP QR, Total Digitales…" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Clasificación *</label>
              <div className="form-input-wrap">
                <select value={form.clasificacion} onChange={e => setForm({ ...form, clasificacion: e.target.value })}>
                  {CLASIFICACIONES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            {!selected && locales.length > 1 && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Local</label>
                <div className="form-input-wrap">
                  <select value={form.id_local} onChange={e => setForm({ ...form, id_local: e.target.value })}>
                    <option value="">Todos los locales</option>
                    {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </div>
              </div>
            )}
            {selected && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="checkbox-wrap">
                  <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
                  <span className="checkbox-label">Activo</span>
                </label>
              </div>
            )}
            <div className="form-actions" style={{ marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : selected ? 'Actualizar' : <><IcoPlus /> Crear Tipo</>}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closePanel}>Cancelar</button>
            </div>
          </form>
        </DrawerPanel>
      )}
    </div>
  )
}
