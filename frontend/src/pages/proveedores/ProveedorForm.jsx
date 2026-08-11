import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { proveedoresApi } from '../../api/proveedores.js'
import { useUiStore } from '../../store/uiStore.js'
import { TIPOS_LOCAL } from '../../lib/tiposLocal.js'
import CampoCuit from '../../components/CampoCuit.jsx'
import Combobox from '../../components/Combobox.jsx'
import { rubcatApi } from '../../api/rubcat.js'

function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  )
}

const EMPTY = {
  nombre: '', razon_social: '', cuit: '', banco: '', cbu: '', alias: '',
  direccion_url: '', detalle_direc: '', telefono: '', mail_contacto: '',
  mail_envio: '', tag: '', cuenta: '', observaciones: '', tipo_local: '', tipo: '',
  plazo: '', activo: true, tipos_afines: [], es_general: false, id_rubcat: ''
}

export default function ProveedorForm() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const notify      = useUiStore((s) => s.notify)
  const isEditing   = Boolean(id)

  const [form,    setForm]    = useState(EMPTY)
  // El rubcat elegido, para que el combobox pueda mostrar "Rubro / Categoria". Sin
  // esto el campo abriria vacio al editar y pareceria que el proveedor no tiene rubro.
  const [rubcatSel, setRubcatSel] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isEditing) {
      proveedoresApi.get(id)
        // tipos_afines puede venir null en registros viejos; el render hace
        // .includes() sobre el array, asi que se normaliza al cargar.
        .then(({ data }) => {
          setForm({
            ...EMPTY, ...data,
            tipos_afines: data.tipos_afines ?? [],
            es_general:   data.es_general   ?? false,
            id_rubcat:    data.id_rubcat    ?? '',
          })
          // El GET ya trae `rubcat` con su rubro y categoría: es lo que el combobox
          // muestra. Sin esto el campo abre vacío al editar y parece que el proveedor
          // no tuviera rubro cargado.
          setRubcatSel(data.rubcat ?? null)
        })
        .catch(() => notify('Error al cargar proveedor', 'error'))
    }
  }, [id])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { notify('El nombre es requerido', 'error'); return }
    setLoading(true)
    try {
      if (isEditing) {
        await proveedoresApi.update(id, form)
        notify('Proveedor actualizado', 'success')
      } else {
        await proveedoresApi.create(form)
        notify('Proveedor creado', 'success')
      }
      navigate('/proveedores')
    } catch (err) {
      notify(err.response?.data?.error || 'Error al guardar', 'error')
    } finally { setLoading(false) }
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/proveedores')}>
        <IcoBack /> Volver a Proveedores
      </button>

      <div className="page-head">
        <h1 className="page-title">{isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Datos principales */}
        <div className="form-panel">
          <div className="form-panel-title">Datos principales</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <div className="form-input-wrap">
                <input type="text" required placeholder="Nombre del proveedor" value={form.nombre} onChange={e => set('nombre', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Razón Social</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Razón social" value={form.razon_social} onChange={e => set('razon_social', e.target.value)} />
              </div>
            </div>
            {/* Verifica el digito verificador y ofrece el generico si no pasa:
                muchas facturas llegan sin CUIT legible y la salida real es cargar el
                generico, no quedarse trabado. */}
            <CampoCuit value={form.cuit} onChange={(v) => set('cuit', v)} id="prov-cuit" />
            {/* Rubro / categoria del proveedor. El backend ya lo aceptaba en el POST y
                el PUT (id_rubcat) y el formulario no lo ofrecia, asi que solo se podia
                cargar desde el alta rapida del formulario de pagos.

                Es el que el formulario de pagos usa para sugerir el rubro al elegir el
                proveedor, asi que tenerlo bien ahorra un paso en cada op. */}
            <div className="form-group">
              <label className="form-label">Rubro / Categoría</label>
              <Combobox
                value={form.id_rubcat}
                displayValue={rubcatSel ? `${rubcatSel.rubro?.nombre} / ${rubcatSel.categoria?.nombre}` : ''}
                getKey={rc => rc.id}
                getLabel={rc => `${rc.rubro?.nombre} / ${rc.categoria?.nombre}`}
                onSelect={rc => { setRubcatSel(rc); set('id_rubcat', rc.id) }}
                onClear={() => { setRubcatSel(null); set('id_rubcat', '') }}
                fetchItems={(search) => rubcatApi.list({ search }).then(r => r.data)}
                placeholder="Buscar rubro / categoría…"
              />
              <p className="form-hint" style={{ margin: '4px 0 0' }}>
                Con esto cargado, al elegir el proveedor en una op se sugiere el rubro solo.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Tag</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Etiqueta" value={form.tag} onChange={e => set('tag', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Plazo de Pago <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(días)</span></label>
              <div className="form-input-wrap">
                <input type="number" min="0" step="1" placeholder="Ej: 30" value={form.plazo} onChange={e => set('plazo', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Datos bancarios */}
        <div className="form-panel">
          <div className="form-panel-title">Datos bancarios</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Banco</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Nombre del banco" value={form.banco} onChange={e => set('banco', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">CBU</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="CBU" value={form.cbu} onChange={e => set('cbu', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Alias</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Alias de transferencia" value={form.alias} onChange={e => set('alias', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cuenta</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Número de cuenta bancaria" value={form.cuenta} onChange={e => set('cuenta', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Contacto */}
        <div className="form-panel">
          <div className="form-panel-title">Contacto</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="+54 11 ..." value={form.telefono} onChange={e => set('telefono', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Email Contacto</label>
              <div className="form-input-wrap">
                <input type="email" placeholder="contacto@empresa.com" value={form.mail_contacto} onChange={e => set('mail_contacto', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Email Envío</label>
              <div className="form-input-wrap">
                <input type="email" placeholder="facturas@empresa.com" value={form.mail_envio} onChange={e => set('mail_envio', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Dirección</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Calle, número o link de Maps..." value={form.direccion_url} onChange={e => set('direccion_url', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Detalle Dirección</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Calle, número, piso..." value={form.detalle_direc} onChange={e => set('detalle_direc', e.target.value)} />
              </div>
            </div>
          </div>
          <label className="checkbox-wrap">
            <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} />
            <span className="checkbox-label">Proveedor activo</span>
          </label>
        </div>

        {/* Otros datos */}
        <div className="form-panel">
          <div className="form-panel-title">Otros datos</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Ej: PROVEEDOR" value={form.tipo} onChange={e => set('tipo', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de Local</label>
              <div className="form-input-wrap">
                <input type="text" placeholder="Ej: GASTRONOMICO" value={form.tipo_local} onChange={e => set('tipo_local', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">¿Para qué tipo de local sirve?</label>
              <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.45 }}>
                Solo ordena el buscador: los proveedores que aplican al local aparecen primero.
                Nunca se esconde ninguno, así que si no estás seguro dejalo sin marcar.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.1rem' }}>
                {TIPOS_LOCAL.map((t) => (
                  <label key={t.value} className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={form.tipos_afines.includes(t.value)}
                      disabled={form.es_general}
                      onChange={(e) => set(
                        'tipos_afines',
                        e.target.checked
                          ? [...form.tipos_afines, t.value]
                          : form.tipos_afines.filter((v) => v !== t.value)
                      )}
                    />
                    <span className="checkbox-label">{t.label}</span>
                  </label>
                ))}
              </div>
              <label className="checkbox-wrap" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={form.es_general}
                  onChange={(e) => set('es_general', e.target.checked)}
                />
                <span className="checkbox-label">
                  Servicio general — sirve a cualquier rubro (Aysa, Metrogas, AFIP, bancos)
                </span>
              </label>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Observaciones</label>
              <div className="form-input-wrap form-textarea-wrap">
                <textarea rows={2} placeholder="Notas opcionales..." value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading
              ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</>
              : isEditing ? 'Actualizar Proveedor' : 'Crear Proveedor'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/proveedores')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
