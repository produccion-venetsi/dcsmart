// Campo de texto para formularios: una línea o varias, con autosize, contador y
// ayuda a la vista.
//
// Existe para no volver a escribir un `<textarea rows={3}>` pelado. Un campo así
// deja al usuario adivinando cuánto puede escribir, corta el texto largo detrás de
// un scroll interno de tres líneas, y pierde la ayuda en cuanto empieza a tipear
// (porque estaba en el placeholder).
//
// Lo que resuelve:
//   - crece con el contenido, sin scroll interno ni alto fijo que corte
//   - contador cuando hay límite, que avisa antes de llegar y no después
//   - la ayuda queda visible siempre, debajo del campo, no en el placeholder
//   - el límite se aplica de verdad, no solo se muestra

import { useEffect, useRef } from 'react'

export default function CampoTexto({
  label,
  value,
  onChange,
  // multilínea: crece solo entre minRows y maxRows
  multilinea = false,
  minRows = 2,
  maxRows = 8,
  max,                 // límite de caracteres; sin esto no hay contador
  ayuda,               // qué se espera en el campo. Queda visible.
  placeholder,         // un ejemplo, no la explicación
  requerido = false,
  disabled = false,
  autoFocus = false,
  id,
  // Tipo del input nativo ('text', 'date', 'email'...). El contador solo tiene
  // sentido en texto, así que con otro tipo se ignora.
  type = 'text',
  // Atributos nativos de rango, para 'date' y 'number'. No se llaman `max` porque
  // ese ya es el límite de caracteres.
  minAttr,
  maxAttr,
  // Valores que ya existen, para ofrecerlos sin obligar a elegir de la lista. Es lo
  // que evita que un campo libre junte "Turno noche", "turno noche" y "T. Noche".
  sugerencias,
  // Qué está mal. Pinta el campo y reemplaza la ayuda: dos textos debajo compiten y
  // el que importa es el error.
  error,
  // Un dato calculado a partir de lo que se escribió (la edad, un total). Va al lado
  // de la ayuda, en tono neutro: no es un error.
  nota,
}) {
  const ref = useRef(null)
  const texto = value ?? ''
  const esTexto = type === 'text'
  const idLista = sugerencias?.length && id ? `${id}-sug` : undefined

  // Autosize: el alto sigue al contenido. Se recalcula en cada cambio porque
  // borrar tiene que encoger igual que escribir agranda.
  useEffect(() => {
    const el = ref.current
    if (!el || !multilinea) return
    const linea = parseFloat(getComputedStyle(el).lineHeight) || 20
    const bordes = el.offsetHeight - el.clientHeight
    el.style.height = 'auto'
    const alto = Math.min(
      Math.max(el.scrollHeight, minRows * linea),
      maxRows * linea + bordes
    )
    el.style.height = `${alto + bordes}px`
    // Solo aparece scroll si se pasó del máximo de líneas
    el.style.overflowY = el.scrollHeight > alto + bordes ? 'auto' : 'hidden'
  }, [texto, multilinea, minRows, maxRows])

  const usados = texto.length
  // El contador cuenta caracteres: en un campo de fecha no significa nada.
  const conContador = Boolean(max) && (multilinea || esTexto)
  const cerca = conContador ? usados >= max * 0.9 : false
  const lleno = conContador ? usados >= max : false

  const Control = multilinea ? 'textarea' : 'input'

  return (
    <div className="form-group">
      {label && (
        <label className="form-label" htmlFor={id}>
          {label}{requerido ? ' *' : ''}
        </label>
      )}
      {/* Las dos clases del proyecto, no una sola: `form-input-wrap` fija la altura
          en 44px y su regla que quita fondo y borde solo alcanza a input y select.
          Un textarea adentro de eso queda con SU propio marco encima del marco del
          wrapper -- el cuadro gris doble -- y desbordando los 44px. `form-textarea-wrap`
          es la que el proyecto tiene para esto: altura auto y el textarea sin marco. */}
      <div
        className={`form-input-wrap${multilinea ? ' form-textarea-wrap' : ''}`}
        // El borde rojo va en el wrapper, que es el que dibuja el marco: ponerlo en el
        // input no se ve, porque su propio borde está anulado por `form-input-wrap`.
        style={error ? { borderColor: 'var(--red)' } : undefined}
      >
        <Control
          id={id}
          ref={ref}
          type={multilinea ? undefined : type}
          value={texto}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={conContador ? max : undefined}
          min={minAttr}
          max={maxAttr}
          list={idLista}
          aria-invalid={error ? true : undefined}
          rows={multilinea ? minRows : undefined}
          // El autosize maneja el alto, así que se anula el min-height de 80px y el
          // resize manual de la hoja de estilos: dos cosas peleando por el alto dan
          // saltos al escribir.
          style={multilinea ? { resize: 'none', minHeight: 0 } : undefined}
          aria-describedby={(ayuda || error) && id ? `${id}-ayuda` : undefined}
        />
      </div>

      {/* Las sugerencias no obligan: el navegador las ofrece y se puede escribir otra
          cosa. Un select cerrado acá sería peor -- no siempre está el valor que hace
          falta. */}
      {idLista && (
        <datalist id={idLista}>
          {sugerencias.map(s => <option key={s} value={s} />)}
        </datalist>
      )}

      {/* Ayuda, error, nota y contador comparten la línea de abajo: la ayuda dice qué
          escribir, el contador cuánto queda. El error reemplaza a la ayuda en vez de
          sumarse -- dos textos ahí abajo compiten y gana el que no importa. */}
      {(ayuda || error || nota || conContador) && (
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            gap: '0.75rem', marginTop: 4,
          }}
        >
          {error ? (
            <p
              className="form-hint"
              id={id ? `${id}-ayuda` : undefined}
              style={{ margin: 0, color: 'var(--red)' }}
              role="alert"
            >
              {error}
            </p>
          ) : (ayuda || nota) ? (
            <p className="form-hint" id={id ? `${id}-ayuda` : undefined} style={{ margin: 0 }}>
              {ayuda}
              {ayuda && nota ? ' · ' : ''}
              {nota && <strong style={{ color: 'var(--t2)', fontWeight: 600 }}>{nota}</strong>}
            </p>
          ) : <span />}
          {conContador && (
            <span
              style={{
                fontSize: 11, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                color: lleno ? 'var(--red)' : cerca ? 'var(--amber)' : 'var(--t3)',
              }}
              // Solo se anuncia cuando importa: un contador que habla en cada tecla
              // es ruido para un lector de pantalla.
              aria-live={cerca ? 'polite' : 'off'}
            >
              {lleno ? `máximo ${max}` : `${usados}/${max}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
