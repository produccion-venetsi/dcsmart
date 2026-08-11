// Campo de CUIT con verificación del dígito verificador.
//
// El CUIT trae su propio control de errores: el último dígito se calcula con módulo
// 11 sobre los otros diez, así que un número mal tipeado se detecta en el momento sin
// consultar a AFIP (ver lib/cuit.js).
//
// Cuando no pasa la verificación se ofrece el CUIT genérico con un botón, en vez de
// solo marcar el error: muchas facturas llegan sin CUIT legible y la salida real es
// cargar el genérico, no quedarse trabado. El botón lo pone de una.
//
// Se apoya en CampoTexto para no repetir el wrapper, el contador y la ayuda visible.

import CampoTexto from './CampoTexto.jsx'
import { CUIT_GENERICO, revisarCuit, formatearCuit, soloDigitos } from '../lib/cuit.js'

export default function CampoCuit({
  label = 'CUIT',
  value,
  onChange,
  id,
  ayuda = 'Once dígitos. Se verifica el dígito verificador.',
  placeholder = '30-99999999-5',
  requerido = false,
  disabled = false,
  // 11 digitos + 2 guiones. Se puede pasar desde afuera para que el largo de la
  // columna en la base y el del campo no queden en dos lugares distintos.
  max = 13,
}) {
  const revision = revisarCuit(value)
  const digitos = soloDigitos(value)
  // Se muestra formateado solo cuando está completo y bien: formatear a medias
  // mientras se tipea mueve el cursor y pelea con quien escribe.
  const valido = digitos.length === 11 && !revision

  return (
    <div>
      <CampoTexto
        id={id}
        label={label}
        value={value ?? ''}
        // Se aceptan guiones y puntos al escribir o pegar, y el límite es de
        // caracteres visibles (11 dígitos + 2 guiones).
        onChange={(v) => onChange(v.replace(/[^\d.\- ]/g, '').slice(0, max))}
        max={max}
        ayuda={ayuda}
        placeholder={placeholder}
        requerido={requerido}
        disabled={disabled}
      />

      {/* Confirmación cuando está bien: sin esto, un campo que no dice nada se lee
          igual que uno que no se validó. */}
      {valido && (
        <p className="form-hint" style={{ margin: '4px 0 0', color: 'var(--green)' }}>
          ✓ CUIT válido · {formatearCuit(value)}
        </p>
      )}

      {/* Incompleto: solo se dice cuánto falta. Marcar "inválido" en el tercer
          dígito es ruido y entrena a ignorar el aviso. */}
      {revision?.estado === 'incompleto' && (
        <p className="form-hint" style={{ margin: '4px 0 0' }}>{revision.mensaje}</p>
      )}

      {/* No pasa la verificación: se dice y se ofrece el genérico en el mismo lugar,
          con el número a la vista para que se sepa qué se está por cargar. */}
      {revision?.ofreceGenerico && (
        <div
          className="callout callout-amber"
          role="alert"
          style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}
        >
          <span style={{ flex: '1 1 auto' }}>
            <strong>{revision.mensaje}.</strong> ¿Desea completar con genérico{' '}
            <strong>{formatearCuit(CUIT_GENERICO)}</strong>?
          </span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => onChange(CUIT_GENERICO)}
            disabled={disabled}
            style={{ flex: '0 0 auto' }}
          >
            Usar genérico
          </button>
        </div>
      )}
    </div>
  )
}
