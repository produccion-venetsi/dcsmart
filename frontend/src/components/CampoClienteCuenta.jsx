// El campo "Cuenta corriente" de un detalle de caja: a qué cliente se le carga.
//
// Es un componente y no JSX suelto porque el formulario de detalle aparece cuatro veces
// (alta y edición, en el panel de detalle y en el de edición de caja) y una copia por lugar
// se desincroniza sola.
//
// Lo que hace acá la diferencia respecto de un select pelado:
//
//   - Dice qué significa elegir un cliente, no solo cómo se llama el campo. "Cliente" a
//     secas al lado de una clasificación no le dice a nadie que eso genera una deuda.
//   - Se puede vaciar. Un detalle cargado por error a una cuenta tiene que poder salir de
//     ella sin borrar el detalle.
//   - Con una clasificación que no mueve la cuenta, el campo se explica en vez de aceptar
//     un valor que el backend va a rechazar al guardar. Sin esto se completa el cliente,
//     se aprieta Guardar y recién ahí aparece el error.

import { Link } from 'react-router-dom'
import Combobox from './Combobox.jsx'
import { clientesApi } from '../api/clientes.js'
import { nombreCliente } from '../lib/clientes.js'
import { cargaLaCuenta, ayudaCuentaDetalle } from '../lib/cuentaCorrienteCaja.js'

const buscarClientes = (search) =>
  clientesApi.list({ search, activo: 'true', limit: 50 }).then((r) => r.data.data)

export default function CampoClienteCuenta({
  clasificacion,
  idCliente,
  clienteSel,
  onSelect,
  onClear,
  style,
  // `compact` es para la edición en línea dentro de la tabla de detalles, donde no hay lugar
  // para etiqueta ni ayuda debajo. Mismo criterio que ClasificacionSelect: la ayuda pasa al
  // title, no se pierde.
  compact = false,
}) {
  const habilitado = cargaLaCuenta(clasificacion)
  const ayuda = ayudaCuentaDetalle(clasificacion)

  if (compact) {
    return habilitado ? (
      <div title={ayuda}>
        <Combobox
          value={idCliente || ''}
          displayValue={clienteSel ? nombreCliente(clienteSel) : ''}
          getKey={(c) => c.id}
          getLabel={nombreCliente}
          onSelect={onSelect}
          onClear={onClear}
          fetchItems={buscarClientes}
          placeholder="Sin cuenta"
        />
      </div>
    ) : (
      <span className="td-muted" title={ayuda} style={{ fontSize: 11.5 }}>no aplica</span>
    )
  }

  return (
    <div className="form-group" style={{ margin: 0, ...style }}>
      <label className="form-label">Cuenta corriente</label>
      {habilitado ? (
        <Combobox
          value={idCliente || ''}
          displayValue={clienteSel ? nombreCliente(clienteSel) : ''}
          getKey={(c) => c.id}
          getLabel={nombreCliente}
          onSelect={onSelect}
          onClear={onClear}
          fetchItems={buscarClientes}
          placeholder="Sin cuenta — buscar cliente…"
        />
      ) : (
        // Deshabilitado pero visible y explicado: esconderlo haría que el campo aparezca
        // y desaparezca al cambiar la clasificación sin que se entienda por qué.
        <div className="form-input-wrap">
          <input type="text" value="" placeholder="No aplica" disabled readOnly />
        </div>
      )}
      <p className="form-hint" style={{ marginTop: 4, marginBottom: 0 }}>
        {ayuda}
        {habilitado && (
          <>
            {' '}Se dan de alta en <Link to="/clientes">Clientes</Link>.
          </>
        )}
      </p>
    </div>
  )
}
