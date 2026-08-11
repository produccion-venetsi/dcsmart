// Los cuatro datos de la persona detrás de un usuario: departamento, equipo, rol y
// fecha de nacimiento.
//
// Está en un componente porque se usa en dos lugares —el alta de usuario y el panel de
// detalle— y son el mismo formulario. Duplicarlo termina en un lado que valida y otro
// que no.
//
// Ojo con "Rol": acá es el puesto de la persona (Encargada, Cajera, Contador), NO el
// rol de permisos. En el código el campo se llama `puesto` justamente para no
// confundirlo con los roles de super_admin/admin/cajero, que se manejan aparte y más
// abajo en el mismo panel.

import CampoTexto from './CampoTexto.jsx'
import CampoSelect from './CampoSelect.jsx'
import {
  OPCIONES_DEPARTAMENTO, LARGOS, fechaNacInput, edad, hoyISO, errorFechaNac,
} from '../lib/datosUsuario.js'

export default function DatosPersona({
  valores = {},
  onChange,          // (campo, valor) => void
  equiposUsados = [], // los que ya se cargaron, para sugerirlos
  disabled = false,
  idPrefix = 'dp',
}) {
  const fecha = fechaNacInput(valores.fecha_nac)
  const errFecha = errorFechaNac(fecha)
  const años = edad(fecha)

  return (
    <div className="datos-persona-grid">
      <CampoSelect
        id={`${idPrefix}-departamento`}
        label="Departamento"
        value={valores.departamento ?? ''}
        onChange={v => onChange('departamento', v)}
        opciones={OPCIONES_DEPARTAMENTO}
        vacio="Sin asignar"
        ayuda="Lista común a todos los grupos."
        disabled={disabled}
      />

      <CampoTexto
        id={`${idPrefix}-equipo`}
        label="Equipo"
        value={valores.equipo ?? ''}
        onChange={v => onChange('equipo', v)}
        max={LARGOS.equipo}
        sugerencias={equiposUsados}
        placeholder="Turno noche"
        ayuda={equiposUsados.length
          ? 'Podés elegir uno de los que ya existen o escribir otro.'
          : 'Todavía no hay equipos cargados: el primero que escribas queda como sugerencia.'}
        disabled={disabled}
      />

      <CampoTexto
        id={`${idPrefix}-puesto`}
        label="Rol"
        value={valores.puesto ?? ''}
        onChange={v => onChange('puesto', v)}
        max={LARGOS.puesto}
        placeholder="Encargada de salón"
        // Se aclara acá porque en esta misma pantalla, más abajo, "Rol" es el permiso.
        ayuda="El puesto de la persona. No es el rol de permisos del sistema."
        disabled={disabled}
      />

      <CampoTexto
        id={`${idPrefix}-fecha-nac`}
        label="Fecha de nacimiento"
        type="date"
        value={fecha}
        onChange={v => onChange('fecha_nac', v)}
        // El navegador no deja elegir mañana; es mejor que enterarse con un error
        // después de guardar.
        maxAttr={hoyISO()}
        error={errFecha}
        nota={años != null ? `${años} años` : undefined}
        ayuda={años == null ? 'Opcional.' : undefined}
        disabled={disabled}
      />
    </div>
  )
}
