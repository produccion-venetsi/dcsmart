import { useEffect, useRef, useState } from 'react'

export default function Combobox({
  value,
  displayValue,
  getKey,
  getLabel,
  onSelect,
  onClear,
  fetchItems,
  placeholder,
  wrapClassName = '',
  onCreate,            // opcional: (texto) => void. Si se define, muestra
  createLabel = 'crear', // "+ crear «texto»" cuando el texto no matchea nada.
}) {
  const [search, setSearch]     = useState(displayValue || '')
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(false)
  const ref        = useRef(null)
  const debounceId = useRef(null)
  const reqId      = useRef(0)

  useEffect(() => {
    setSearch(displayValue || '')
  }, [displayValue])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const runFetch = (text) => {
    const myReqId = ++reqId.current
    setLoading(true)
    fetchItems(text)
      .then(result => {
        if (myReqId !== reqId.current) return
        setItems(result)
      })
      .finally(() => {
        if (myReqId === reqId.current) setLoading(false)
      })
  }

  useEffect(() => {
    runFetch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onInputChange = (text) => {
    setSearch(text)
    setOpen(true)
    if (debounceId.current) clearTimeout(debounceId.current)
    debounceId.current = setTimeout(() => runFetch(text), 300)
  }

  const handleSelect = (item) => {
    onSelect(item)
    setOpen(false)
  }

  const handleClear = () => {
    setSearch('')
    onClear()
    setOpen(false)
  }

  return (
    <div className={`combobox-wrap ${wrapClassName}`} ref={ref}>
      <div className="form-input-wrap">
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          autoComplete="off"
          onChange={e => onInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="input-clear-btn"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
            title="Quitar selección"
          >×</button>
        )}
      </div>
      {open && (() => {
        const trimmed = search.trim()
        const hasExact = items.some(it => getLabel(it).toLowerCase() === trimmed.toLowerCase())
        const showCreate = onCreate && trimmed && !loading && !hasExact
        return (
          <div className="combobox-dropdown">
            {loading
              ? <div className="combobox-inline-empty">Buscando…</div>
              : items.length === 0 && !showCreate
                ? <div className="combobox-inline-empty">Sin resultados</div>
                : items.map(item => (
                  <button
                    key={getKey(item)}
                    type="button"
                    className="combobox-option"
                    onClick={() => handleSelect(item)}
                  >
                    {getLabel(item)}
                  </button>
                ))
            }
            {showCreate && (
              <button
                type="button"
                className="combobox-option"
                onClick={() => { onCreate(trimmed); setOpen(false) }}
                style={{ fontStyle: 'italic', color: 'var(--gold-bright)' }}
              >
                + {createLabel} “{trimmed}”
              </button>
            )}
          </div>
        )
      })()}
    </div>
  )
}
