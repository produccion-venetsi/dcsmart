// El cuadre de la caja mientras se carga, pegado arriba.
//
// Estaba dentro del formulario de edición, como un campo más del grid: se lo comía el
// scroll y quien cargaba movimientos dejaba de verlo justo cuando importa. Ahora va
// `sticky` al tope del cuerpo del drawer, así que queda a la vista todo el tiempo, y lo
// usan el alta y la edición.
//
// Es sticky y no un prop del header de DrawerPanel a propósito: los datos del cuadre viven
// dentro de cada panel y se recalculan con cada tecla. Subirlos al padre para que los pinte
// el header obligaría a re-renderizar el listado de cajas entero en cada pulsación.
//
// El cálculo NO está acá: sale de lib/cuadreCaja.js, que es el espejo del backend.

// El formateador vive en lib/cajaMayor.js: mismo criterio (separador de miles y los
// decimales siempre, para que no parezca redondeado).
import { fmtMonto } from '../lib/cajaMayor.js'
import { describirCuadre, faltaParaCuadrar } from '../lib/cuadreCaja.js'

export default function CuadreVivo({ cuadre, origin }) {
  if (!cuadre) return null
  const leyenda = describirCuadre(cuadre)
  const falta = faltaParaCuadrar(cuadre)
  // Tres estados y no dos: mientras no hay total cargado no se sabe si cuadra, y pintarlo
  // rojo seria marcar un error que todavia no existe.
  const estado = leyenda.tono === 'ok' ? 'cuadra' : leyenda.tono === 'alerta' ? 'no-cuadra' : 'sin-datos'

  return (
    <div className={`cuadre-vivo cuadre-vivo-sticky cuadre-${estado}`}>
      <div className="cuadre-vivo-cuentas">
        <span>Efectivo <strong>{fmtMonto(cuadre.efectivo)}</strong></span>
        <span>+ Cobros <strong>{fmtMonto(cuadre.cobros)}</strong></span>
        {cuadre.gastos > 0 && <span>− Gastos <strong>{fmtMonto(cuadre.gastos)}</strong></span>}
        <span className="cuadre-vivo-igual">= <strong>{fmtMonto(cuadre.esperado)}</strong></span>
      </div>
      {/* El estado, en grande y con el color del semaforo: verde cuadra, ROJO no cuadra.
          El monto que falta va PEGADO al texto y en el mismo tamano -- "faltan $1.000" dice
          que buscar, mientras que "diferencia -1000" hay que pensarlo. */}
      {/* Sin `style` de color: lo pone el CSS segun la clase del cartel, porque el color
          depende del fondo tintado sobre el que se lee (ver --cuadre-*-texto). El gris del
          estado "sin datos" sale del color base del bloque. */}
      <div className="cuadre-vivo-estado">
        <span className="cuadre-vivo-marca" aria-hidden="true">{estado === 'cuadra' ? '✓' : estado === 'no-cuadra' ? '!' : '·'}</span>
        <strong>{leyenda.texto}</strong>
        {falta > 0 && <strong className="cuadre-vivo-falta"> {fmtMonto(falta)}</strong>}
      </div>
      <div className="cuadre-vivo-fuente">
        {/* De dónde sale la cuenta: en una caja de TapTap los detalles no cuentan, y sin
            decirlo el número parece estar mal. */}
        según {cuadre.fuente === 'movimientos' ? 'los movimientos' : 'los detalles'}
        {origin && origin !== 'DCSMART' ? ` (${origin})` : ''}
      </div>
    </div>
  )
}
