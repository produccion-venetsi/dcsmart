import { useEffect, useMemo, useRef, useState } from 'react'
import { resumenSeleccion } from '../lib/filtros.js'

// A partir de cuántas opciones fijas aparece el buscador.
const UMBRAL_BUSCADOR = 8

export default function MultiSelect({
  value = [],
  onChange,
  options,
  fetchOptions,
  placeholder = 'Todos',
  minCharsRemoto = 2,
}) {
  const [open, setOpen]       = useState(false)
  const [search, setSearch]   = useState('')
  const [remotas, setRemotas] = useState([])
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  const esRemoto   = typeof fetchOptions === 'function'
  const searchable = esRemoto || (options?.length ?? 0) > UMBRAL_BUSCADOR

  // fetchOptions suele llegar como arrow inline; guardarla en un ref evita que
  // el efecto se vuelva a disparar en cada render del padre.
  const fetchRef = useRef(fetchOptions)
  useEffect(() => { fetchRef.current = fetchOptions })

  // Cierra al click afuera y con Escape. El stopPropagation evita que el mismo
  // Escape cierre además el panel de filtros que contiene al control.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey  = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // Al cerrar se limpia la búsqueda: si no, al reabrir se repite el fetch (o
  // el filtro local) con la query vieja en vez de arrancar en blanco.
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  // Búsqueda remota con debounce de 300 ms (mismo valor que Combobox.jsx).
  useEffect(() => {
    if (!esRemoto || !open) return
    const q = search.trim()
    if (q.length < minCharsRemoto) { setRemotas([]); setLoading(false); return }
    let vivo = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchRef.current(q)
        .then(r => { if (vivo) setRemotas(r || []) })
        .catch(() => { if (vivo) setRemotas([]) })
        .finally(() => { if (vivo) setLoading(false) })
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [search, open, esRemoto, minCharsRemoto])

  const visibles = useMemo(() => {
    if (esRemoto) return remotas
    const q = search.trim().toLowerCase()
    const base = options || []
    return q ? base.filter(o => String(o.label).toLowerCase().includes(q)) : base
  }, [esRemoto, remotas, options, search])

  // Lo ya elegido se muestra siempre arriba, aunque no esté en el resultado de
  // la búsqueda -- si no, no habría forma de destildarlo.
  const lista = useMemo(() => {
    const fuera = value.filter(v => !visibles.some(o => o.value === v.value))
    return [...fuera, ...visibles]
  }, [value, visibles])

  const estaElegido = (opt) => value.some(v => v.value === opt.value)

  const toggle = (opt) => {
    onChange(estaElegido(opt)
      ? value.filter(v => v.value !== opt.value)
      : [...value, { value: opt.value, label: opt.label }])
  }

  // "Todos" marca lo que está a la vista; con búsqueda remota eso es el
  // resultado actual, no el catálogo entero.
  const marcarTodos = () => onChange(lista.map(o => ({ value: o.value, label: o.label })))
  const marcarNinguno = () => onChange([])

  const hayNada = lista.length === 0
  const esperandoTexto = esRemoto && search.trim().length < minCharsRemoto

  return (
    <div className="multiselect-wrap" ref={ref}>
      <button
        type="button"
        className={`filter-select multiselect-trigger${value.length > 0 ? ' has-value' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={value.length > 0 ? value.map(v => v.label).join(', ') : placeholder}
      >
        <span className="multiselect-resumen">{resumenSeleccion(value, placeholder)}</span>
        {value.length > 0 && <span className="multiselect-count">{value.length}</span>}
      </button>

      {open && (
        <div className="combobox-dropdown multiselect-panel">
          {searchable && (
            <input
              type="text"
              className="multiselect-search"
              placeholder={esRemoto ? 'Escribí para buscar…' : 'Buscar…'}
              value={search}
              autoFocus
              onChange={e => setSearch(e.target.value)}
            />
          )}

          <div className="multiselect-lista">
            {loading && lista.length === 0
              ? <div className="combobox-inline-empty">Buscando…</div>
              : esperandoTexto && value.length === 0
                ? <div className="combobox-inline-empty">Escribí al menos {minCharsRemoto} letras para buscar</div>
                : hayNada
                  ? <div className="combobox-inline-empty">Sin resultados</div>
                  : lista.map(opt => (
                      <label key={opt.value} className="multiselect-option">
                        <input type="checkbox" checked={estaElegido(opt)} onChange={() => toggle(opt)} />
                        <span>{opt.label}</span>
                      </label>
                    ))
            }
          </div>

          <div className="multiselect-footer">
            <button type="button" onClick={marcarTodos} disabled={hayNada}>Todos</button>
            <button type="button" onClick={marcarNinguno} disabled={value.length === 0}>Ninguno</button>
          </div>
        </div>
      )}
    </div>
  )
}
