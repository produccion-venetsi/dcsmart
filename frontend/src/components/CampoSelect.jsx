// Select de formulario con lo que un select pelado no trae: label asociado, ayuda a la
// vista, error y una opción vacía que dice qué significa estar vacío.
//
// Existe por lo mismo que CampoTexto: un `<select>` suelto deja al usuario sin saber
// si el campo es obligatorio, qué pasa si lo deja en blanco, y por qué se lo rechazó
// al guardar. Es hermano de CampoTexto y comparte su línea de abajo (ayuda / error /
// nota) para que dos campos al lado no se vean distintos.
//
// Para listas largas o con búsqueda está Combobox. Este es para listas cerradas y
// cortas, tipo diez departamentos.

export default function CampoSelect({
  label,
  value,
  onChange,
  // [{ value, label }]. Se pasan ya ordenadas: acá no se reordena nada.
  opciones = [],
  // Texto de la opción vacía. Explica qué implica dejarlo así, no dice "Seleccionar".
  vacio = 'Sin definir',
  // Sacar la opción vacía cuando el campo es obligatorio de verdad.
  permitirVacio = true,
  ayuda,
  error,
  nota,
  requerido = false,
  disabled = false,
  id,
}) {
  return (
    <div className="form-group">
      {label && (
        <label className="form-label" htmlFor={id}>
          {label}{requerido ? ' *' : ''}
        </label>
      )}
      <div
        className="form-input-wrap"
        style={error ? { borderColor: 'var(--red)' } : undefined}
      >
        <select
          id={id}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={(ayuda || error) && id ? `${id}-ayuda` : undefined}
        >
          {permitirVacio && <option value="">{vacio}</option>}
          {opciones.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          {/* Un valor guardado que ya no está en la lista se agrega como opción para
              que no se vea vacío y, sobre todo, para que abrir y guardar el formulario
              no lo borre sin que nadie se dé cuenta. */}
          {value && !opciones.some(o => o.value === value) && (
            <option value={value}>{value}</option>
          )}
        </select>
      </div>

      {(ayuda || error || nota) && (
        error ? (
          <p
            className="form-hint"
            id={id ? `${id}-ayuda` : undefined}
            style={{ marginTop: 4, color: 'var(--red)' }}
            role="alert"
          >
            {error}
          </p>
        ) : (
          <p className="form-hint" id={id ? `${id}-ayuda` : undefined} style={{ marginTop: 4 }}>
            {ayuda}
            {ayuda && nota ? ' · ' : ''}
            {nota && <strong style={{ color: 'var(--t2)', fontWeight: 600 }}>{nota}</strong>}
          </p>
        )
      )}
    </div>
  )
}
