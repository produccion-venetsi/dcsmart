// Las líneas de una caja: UNA lista en vez de "Detalles" y "Movimientos".
//
// La separación vieja obligaba a saber de antemano si lo que ibas a cargar era
// un detalle o un movimiento -- una pregunta sobre la base de datos, no sobre
// la caja. Acá se elige QUÉ PASÓ ("me lo pagaron", "pagué algo de la caja") y
// el sistema sabe qué hacer con eso.
//
// Las líneas se agrupan por lo que le hacen a la cuenta, con el subtotal de
// cada grupo a la vista: es la forma de ver por qué el cuadre da lo que da.

import { useState } from 'react'
import { CATEGORIAS, GRUPOS, labelCategoria, claseCategoria, grupoDe, categoria } from '../lib/categoriasLinea.js'
import { opcionesMetodos } from '../lib/metodosSelect.js'

const fmt$ = (n) =>
  `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}

const VACIO = { categoria: 'COBRO', monto: '', id_metodo: '', nombre: '', observaciones: '' }

export default function LineasCaja({ lineas = [], metodos = [], tipos = [], onAgregar, onBorrar, readOnly = false }) {
  const [form, setForm] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)

  const cat = categoria(form.categoria)

  const agregar = async () => {
    if (!form.monto || guardando) return
    setGuardando(true)
    try {
      await onAgregar({
        categoria: form.categoria,
        monto: parseFloat(form.monto),
        id_metodo: form.id_metodo || null,
        nombre: form.nombre || null,
        observaciones: form.observaciones || null,
      })
      setForm({ ...VACIO, categoria: form.categoria })
    } finally { setGuardando(false) }
  }

  // Enter agrega la línea en vez de mandar el formulario de la caja entera.
  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return
    if (!['INPUT', 'SELECT'].includes(e.target.tagName)) return
    e.preventDefault()
    agregar()
  }

  return (
    <div>
      {GRUPOS.map((g) => {
        const delGrupo = lineas.filter((l) => grupoDe(l.categoria) === g.id)
        if (!delGrupo.length) return null
        const subtotal = delGrupo.reduce((a, l) => a + Number(l.monto ?? 0), 0)
        return (
          <div key={g.id} style={{ marginBottom: '1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--gold-bright)' }}>
                  {g.titulo}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--t3)', marginLeft: 8 }}>{g.ayuda}</span>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt$(subtotal)}</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  {delGrupo.map((l) => (
                    <tr key={l.id}>
                      <td style={{ width: 150 }}>
                        <span className={`badge ${claseCategoria(l.categoria)}`}>{labelCategoria(l.categoria)}</span>
                      </td>
                      <td>
                        {l.metodo_pago?.nombre || l.detalle_tipo?.nombre || l.nombre || <span className="td-muted">—</span>}
                        {l.observaciones && <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{l.observaciones}</div>}
                      </td>
                      <td className="td-number" style={{ width: 130 }}>{fmt$(l.monto)}</td>
                      {!readOnly && (
                        <td style={{ width: 44 }}>
                          <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => onBorrar(l.id)} aria-label="Borrar línea">
                            <IcoTrash />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {!lineas.length && (
        <p className="form-hint" style={{ margin: '0 0 0.8rem' }}>
          Todavía no cargaste ninguna línea. Empezá por cómo te pagaron.
        </p>
      )}

      {!readOnly && (
        <div onKeyDown={onKeyDown} style={{ border: '1px dashed var(--glass-border)', borderRadius: 14, padding: '13px 15px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 11 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">¿Qué pasó?</label>
              <div className="form-input-wrap">
                <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                  {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Método</label>
              <div className="form-input-wrap">
                <select value={form.id_metodo} onChange={(e) => setForm({ ...form, id_metodo: e.target.value })}>
                  <option value="">Sin método</option>
                  {opcionesMetodos(metodos, form.id_metodo).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Monto *</label>
              <div className="form-input-wrap">
                <input type="number" step="0.01" min="0" placeholder="0.00" value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Detalle</label>
              <div className="form-input-wrap">
                <input placeholder="Opcional" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
            </div>
          </div>

          {/* La ayuda de la categoría elegida, acá y no en un tooltip: es lo que
              evita que un retiro se cargue como gasto. */}
          {cat && <p className="form-hint" style={{ margin: '9px 0 0' }}>{cat.ayuda}</p>}

          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={agregar} disabled={!form.monto || guardando}>
              <IcoPlus /> {guardando ? 'Agregando…' : 'Agregar línea'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
