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

const COLOR = { ok: 'var(--green)', falta: 'var(--amber)', sobra: 'var(--red)', neutro: 'var(--t3)' }

export default function CuadreVivo({ cuadre, origin }) {
  if (!cuadre) return null
  const leyenda = describirCuadre(cuadre)
  const falta = faltaParaCuadrar(cuadre)

  return (
    <div className="cuadre-vivo cuadre-vivo-sticky">
      <div className="cuadre-vivo-cuentas">
        <span>Efectivo <strong>{fmtMonto(cuadre.efectivo)}</strong></span>
        <span>+ Cobros <strong>{fmtMonto(cuadre.cobros)}</strong></span>
        {cuadre.gastos > 0 && <span>− Gastos <strong>{fmtMonto(cuadre.gastos)}</strong></span>}
        <span className="cuadre-vivo-igual">= <strong>{fmtMonto(cuadre.esperado)}</strong></span>
      </div>
      <div className="cuadre-vivo-estado" style={{ color: COLOR[leyenda.tono] ?? COLOR.neutro }}>
        <strong>{leyenda.texto}</strong>
        {/* El monto que falta, en positivo: "faltan $1.000" dice qué buscar, mientras que
            "diferencia -1000" hay que pensarlo. */}
        {falta > 0 && <span> · {fmtMonto(falta)}</span>}
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
