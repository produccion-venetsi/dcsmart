import { useEffect, useState } from 'react'
import { rubrosApi, categoriasApi, rubcatApi } from '../../api/rubcat.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'

function IcoEdit() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}
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

function NombreSection({ title, items, onSave, onDelete }) {
  const [form,    setForm]    = useState('')
  const [editing, setEditing] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const notify = useUiStore((s) => s.notify)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.trim()) return
    setSaving(true)
    try {
      await onSave(editing, form.trim())
      setForm(''); setEditing(null)
    } catch (err) {
      notify(err.response?.data?.error || 'Error', 'error')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <form className="form-panel" onSubmit={handleSubmit} style={{ marginBottom: '1rem' }}>
        <div className="form-panel-title">{editing ? `Editar ${title}` : `Nuevo ${title}`}</div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <div className="form-input-wrap">
              <input required placeholder={`Nombre del ${title.toLowerCase()}`} value={form} onChange={e => setForm(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ whiteSpace: 'nowrap' }}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (editing ? 'Actualizar' : <><IcoPlus /> Crear</>)}
          </button>
          {editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setForm('') }}>Cancelar</button>}
        </div>
      </form>

      <div className="table-wrap">
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
          {title}s <span style={{ color: 'var(--t3)', fontWeight: 400 }}>({items.length})</span>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Nombre</th><th></th></tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="row-clickable" onClick={() => { setEditing(item.id); setForm(item.nombre) }}>
                <td className="td-primary">{item.nombre}</td>
                <td>
                  <div className="td-actions">
                    <button className="btn btn-sm btn-danger btn-icon" onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}><IcoTrash /></button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={2} style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>Sin datos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const RC_EMPTY = { id_rub: '', id_cat: '', cuenta: '', tipo: '', costo: '', clasificacion: '' }

export default function RubCat() {
  const notify = useUiStore((s) => s.notify)

  const [rubros,     setRubros]     = useState([])
  const [categorias, setCategorias] = useState([])
  const [rubcat,     setRubcat]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState('rubcat')
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [selectedRc, setSelectedRc] = useState(null)
  const [rcForm,     setRcForm]     = useState(RC_EMPTY)
  const [rcSaving,   setRcSaving]   = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([rubrosApi.list(), categoriasApi.list(), rubcatApi.list()])
      .then(([r, c, rc]) => {
        setRubros(r.data); setCategorias(c.data); setRubcat(rc.data)
      })
      .catch(() => notify('Error al cargar', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const saveRubro = async (id, nombre) => {
    if (id) { await rubrosApi.update(id, { nombre }); notify('Rubro actualizado', 'success') }
    else    { await rubrosApi.create({ nombre });      notify('Rubro creado', 'success') }
    load()
  }
  const delRubro = async (id) => {
    if (!confirm('¿Eliminar rubro?')) return
    try { await rubrosApi.remove(id); notify('Eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }
  const saveCat = async (id, nombre) => {
    if (id) { await categoriasApi.update(id, { nombre }); notify('Categoría actualizada', 'success') }
    else    { await categoriasApi.create({ nombre });      notify('Categoría creada', 'success') }
    load()
  }
  const delCat = async (id) => {
    if (!confirm('¿Eliminar categoría?')) return
    try { await categoriasApi.remove(id); notify('Eliminada', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  const openCreate = () => { setSelectedRc(null); setRcForm(RC_EMPTY); setPanelOpen(true) }
  const openEdit   = (rc) => {
    setSelectedRc(rc)
    setRcForm({ id_rub: rc.id_rub, id_cat: rc.id_cat, cuenta: rc.cuenta || '', tipo: rc.tipo || '', costo: rc.costo || '', clasificacion: rc.clasificacion || '' })
    setPanelOpen(true)
  }
  const closePanel = () => setPanelOpen(false)

  const setRcF = (k, v) => setRcForm(f => ({ ...f, [k]: v }))

  const handleRcSubmit = async (e) => {
    e.preventDefault()
    if (!rcForm.id_rub || !rcForm.id_cat) { notify('Seleccioná rubro y categoría', 'error'); return }
    setRcSaving(true)
    try {
      if (selectedRc) { await rubcatApi.update(selectedRc.id, rcForm); notify('RubCat actualizado', 'success') }
      else            { await rubcatApi.create(rcForm);                  notify('RubCat creado', 'success') }
      setPanelOpen(false)
      load()
    } catch (err) { notify(err.response?.data?.error || 'Error', 'error') }
    finally { setRcSaving(false) }
  }

  const delRc = async (id, e) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar RubCat?')) return
    try { await rubcatApi.remove(id); notify('Eliminado', 'success'); load() }
    catch { notify('Error al eliminar', 'error') }
  }

  const TABS = [
    { key: 'rubcat',     label: 'RubCat' },
    { key: 'rubros',     label: 'Rubros' },
    { key: 'categorias', label: 'Categorías' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Rubros, Categorías y RubCat</h1>
          <p className="page-sub">Clasificación contable de gastos e ingresos</p>
        </div>
        {tab === 'rubcat' && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openCreate}><IcoPlus /> Nuevo RubCat</button>
          </div>
        )}
      </div>

      <div className="selector-pills" style={{ marginBottom: '1.5rem' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={'selector-pill' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}
          >
            {tab === t.key && <span className="selector-pill-dot" />}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <>
          {Array.from({ length: 2 }, (_, s) => (
            <div key={s} className="table-wrap" style={{ marginBottom: '1.5rem' }}>
              <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                <span className="skel" style={{ width: 80, height: 12 }} />
              </div>
              <table className="data-table">
                <tbody>
                  {Array.from({ length: 4 }, (_, i) => (
                    <tr key={i} className="skel-row">
                      <td><span className="skel" style={{ width: `${55 + (i * 13) % 35}%` }} /></td>
                      <td><span className="skel" style={{ width: 60 }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      ) : (
        <>
          {tab === 'rubros' && (
            <NombreSection title="Rubro" items={rubros} onSave={saveRubro} onDelete={delRubro} />
          )}
          {tab === 'categorias' && (
            <NombreSection title="Categoría" items={categorias} onSave={saveCat} onDelete={delCat} />
          )}
          {tab === 'rubcat' && (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
                RubCat <span style={{ color: 'var(--t3)', fontWeight: 400 }}>({rubcat.length})</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rubro</th>
                    <th>Categoría</th>
                    <th>Cuenta</th>
                    <th>Tipo</th>
                    <th>Costo</th>
                    <th>Clasificación</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rubcat.map((rc) => (
                    <tr key={rc.id} className="row-clickable" onClick={() => openEdit(rc)}>
                      <td className="td-primary">{rc.rubro?.nombre || '—'}</td>
                      <td>{rc.categoria?.nombre || '—'}</td>
                      <td className="td-mono">{rc.cuenta || <span className="td-muted">—</span>}</td>
                      <td>{rc.tipo || <span className="td-muted">—</span>}</td>
                      <td>{rc.costo || <span className="td-muted">—</span>}</td>
                      <td>{rc.clasificacion || <span className="td-muted">—</span>}</td>
                      <td>
                        <div className="td-actions">
                          <button className="btn btn-sm btn-danger btn-icon" onClick={(e) => delRc(rc.id, e)}><IcoTrash /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rubcat.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>Sin combinaciones</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <DrawerPanel
        open={panelOpen}
        onClose={closePanel}
        title={selectedRc ? `Editar RubCat` : 'Nuevo RubCat'}
        width={480}
      >
        <form onSubmit={handleRcSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Rubro *</label>
              <div className="form-input-wrap">
                <select required value={rcForm.id_rub} onChange={e => setRcF('id_rub', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Categoría *</label>
              <div className="form-input-wrap">
                <select required value={rcForm.id_cat} onChange={e => setRcF('id_cat', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cuenta</label>
              <div className="form-input-wrap">
                <input placeholder="5.1.01" value={rcForm.cuenta} onChange={e => setRcF('cuenta', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tipo</label>
              <div className="form-input-wrap">
                <input placeholder="Operativo / Fijo" value={rcForm.tipo} onChange={e => setRcF('tipo', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Costo</label>
              <div className="form-input-wrap">
                <input placeholder="Variable / Fijo" value={rcForm.costo} onChange={e => setRcF('costo', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Clasificación</label>
              <div className="form-input-wrap">
                <input placeholder="Costo de Ventas" value={rcForm.clasificacion} onChange={e => setRcF('clasificacion', e.target.value)} />
              </div>
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={rcSaving}>
              {rcSaving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : selectedRc ? 'Actualizar' : <><IcoPlus /> Crear RubCat</>}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closePanel}>Cancelar</button>
          </div>
        </form>
      </DrawerPanel>
    </div>
  )
}
