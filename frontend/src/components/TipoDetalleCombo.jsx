import { useState, useRef, useEffect } from 'react'

// Selector de "nombre" de un detalle de caja con búsqueda + nombre libre.
// - Filtra el catálogo de DetalleTipo (tipos) por lo que se escribe.
// - Si el texto coincide con un tipo y se elige, setea id_tipo (y el nombre
//   se deriva del tipo en el backend).
// - Si no coincide con ninguno, se usa el texto como nombre libre (id_tipo null).
//
// onChange(idTipo, nombre): idTipo es el id del DetalleTipo elegido o null;
// nombre es el texto libre cuando no hay tipo (ignorado por el backend si hay
// idTipo). Reusa los estilos .combobox-* / .form-input-wrap.
export default function TipoDetalleCombo({ tipos = [], idTipo = '', nombre = '', onChange, placeholder = 'Buscar o escribir…' }) {
  const tipoSel = idTipo ? tipos.find(t => t.id === idTipo) : null
  const [text, setText] = useState(tipoSel?.nombre ?? nombre ?? '')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Re-sincronizar cuando cambia el valor externo (ej. al abrir la edición de
  // otro detalle sin desmontar el componente).
  useEffect(() => {
    const sel = idTipo ? tipos.find(t => t.id === idTipo) : null
    setText(sel?.nombre ?? nombre ?? '')
  }, [idTipo, nombre, tipos])

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const q = text.trim().toLowerCase()
  const matches = (q ? tipos.filter(t => t.nombre.toLowerCase().includes(q)) : tipos).slice(0, 40)
  const exact = tipos.some(t => t.nombre.toLowerCase() === q)

  const pickTipo = (t) => { onChange(t.id, t.nombre); setText(t.nombre); setOpen(false) }
  const pickLibre = () => { onChange(null, text.trim()); setOpen(false) }

  return (
    <div className="combobox-wrap" ref={ref}>
      <div className="form-input-wrap">
        <input
          type="text"
          placeholder={placeholder}
          value={text}
          autoComplete="off"
          onChange={e => { setText(e.target.value); setOpen(true); onChange(null, e.target.value) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (
        <div className="combobox-dropdown">
          {matches.map(t => (
            <button key={t.id} type="button" className="combobox-option" onClick={() => pickTipo(t)}>
              {t.nombre}
            </button>
          ))}
          {q && !exact && (
            <button type="button" className="combobox-option" onClick={pickLibre}
              style={{ fontStyle: 'italic', color: 'var(--gold-bright)' }}>
              + usar “{text.trim()}” (nombre libre)
            </button>
          )}
          {matches.length === 0 && !q && (
            <div className="combobox-inline-empty">Escribí para buscar</div>
          )}
          {matches.length === 0 && q && exact && (
            <div className="combobox-inline-empty">Sin más coincidencias</div>
          )}
        </div>
      )}
    </div>
  )
}
