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
import { useState } from 'react'
import { fmtMonto } from '../lib/cajaMayor.js'
import { describirCuadre, faltaParaCuadrar } from '../lib/cuadreCaja.js'
import { explicarDiferencia } from '../lib/explicarCuadre.js'

export default function CuadreVivo({ cuadre, origin }) {
  const [verPorque, setVerPorque] = useState(false)
  if (!cuadre) return null
  const leyenda = describirCuadre(cuadre)
  const falta = faltaParaCuadrar(cuadre)
  const explicacion = explicarDiferencia(cuadre)
  // Tres estados y no dos: mientras no hay total cargado no se sabe si cuadra, y pintarlo
  // rojo seria marcar un error que todavia no existe.
  const estado = leyenda.tono === 'ok' ? 'cuadra' : leyenda.tono === 'alerta' ? 'no-cuadra' : 'sin-datos'

  return (
    <div className={`cuadre-vivo cuadre-vivo-sticky cuadre-${estado}`}>
      {/* La cuenta es la de la VENTA: todo lo vendido tiene que estar explicado
          por alguna forma de cobro, incluida la que quedó a deber. Los gastos y
          los retiros no van acá -- mueven la plata del cajón, no cambian lo
          vendido; eso se lee abajo, en el circuito del efectivo. */}
      <div className="cuadre-vivo-cuentas">
        <span>Efectivo <strong>{fmtMonto(cuadre.efectivo)}</strong></span>
        <span>+ Otros cobros <strong>{fmtMonto(cuadre.cobros)}</strong></span>
        {cuadre.no_cobrado > 0 && <span>+ A cobrar <strong>{fmtMonto(cuadre.no_cobrado)}</strong></span>}
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
        {/* "¿Por qué?" en vez de un tooltip con la fórmula: decirle a alguien
            que su caja no cuadra sin decirle qué mirar es lo que hacía que el
            reclamo llegara igual. */}
        {explicacion.sospechas.length > 0 && (
          <button
            type="button"
            onClick={() => setVerPorque((v) => !v)}
            style={{
              marginLeft: 8, padding: '2px 8px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)',
              color: 'inherit', font: 'inherit', fontSize: '0.82em', fontWeight: 700,
            }}
          >
            {verPorque ? 'Ocultar' : '¿Por qué?'}
          </button>
        )}
      </div>

      {verPorque && (
        <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.18)', fontSize: 11.5, lineHeight: 1.55, fontWeight: 400 }}>
          <div style={{ marginBottom: 6 }}>{explicacion.cuenta}</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Qué mirar:</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {explicacion.sospechas.map((s) => <li key={s} style={{ marginBottom: 3 }}>{s}</li>)}
          </ul>
        </div>
      )}
      {/* El circuito de la plata física, que es otra pregunta: cuánto tendría
          que haber en el cajón al cerrar. Solo se muestra si el origen informa
          los movimientos de caja (Fudo no expone fondo inicial ni retiros, y
          las cajas manuales rara vez los cargan). */}
      {cuadre.efectivo_fisico?.disponible && (
        <div className="cuadre-vivo-cuentas" style={{ opacity: 0.85, fontSize: '0.92em' }}>
          <span>En el cajón:</span>
          {cuadre.efectivo_fisico.inicial > 0 && <span>inicial <strong>{fmtMonto(cuadre.efectivo_fisico.inicial)}</strong></span>}
          <span>+ cobrado <strong>{fmtMonto(cuadre.efectivo_fisico.cobrado)}</strong></span>
          {cuadre.efectivo_fisico.gastos > 0 && <span>− gastos <strong>{fmtMonto(cuadre.efectivo_fisico.gastos)}</strong></span>}
          {cuadre.efectivo_fisico.retiros > 0 && <span>− retiros <strong>{fmtMonto(cuadre.efectivo_fisico.retiros)}</strong></span>}
          {cuadre.efectivo_fisico.vaciados > 0 && <span>− vaciados <strong>{fmtMonto(cuadre.efectivo_fisico.vaciados)}</strong></span>}
          <span className="cuadre-vivo-igual">= <strong>{fmtMonto(cuadre.efectivo_fisico.queda)}</strong></span>
        </div>
      )}
      <div className="cuadre-vivo-fuente">
        la venta tiene que estar explicada por lo que se cobró
        {origin && origin !== 'DCSMART' ? ` · ${origin}` : ''}
      </div>
    </div>
  )
}
