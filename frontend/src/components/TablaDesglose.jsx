import { useMemo, useState } from 'react'
import { arrancaExpandido, LIMITE_AUTOEXPANDIR } from '../lib/desgloses.js'

// Tabla de dos niveles para las tablas internas de una caja. Recibe los grupos
// ya armados por lib/desgloses.js y sólo se ocupa de dibujarlos: qué agrupa y
// cómo suma lo decide esa lib, no este componente.
//
// Las filas hoja las dibuja quien la usa (`renderFila`), porque en el drawer de
// cajas cada fila tiene su propio modo de edición inline y sus botones según el
// rol. Acá sólo se agregan las cabeceras de grupo y subgrupo con sus totales.

function IcoChevron({ abierto }) {
  return (
    <svg
      viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{
        transform: abierto ? 'rotate(90deg)' : 'none',
        transition: 'transform 0.16s var(--ease)',
        flexShrink: 0,
      }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

const claveSub = (grupo, sub) => `${grupo}::${sub}`

export default function TablaDesglose({
  grupos,
  columnas,
  renderFila,
  fmtMonto,
  // Cuando hay un solo grupo, agrupar es puro ruido: son todas las filas bajo
  // una cabecera que repite el total que ya está arriba.
  minimoParaAgrupar = 2,
}) {
  const colSpan = columnas.length

  // El estado arranca calculado, no vacío: una caja de 3 movimientos se ve
  // completa como antes, y una de 48 arranca resumida.
  const inicial = useMemo(() => {
    const todoAbierto = arrancaExpandido(grupos)
    return {
      grupos: new Set(todoAbierto ? grupos.map((g) => g.clave) : []),
      // Un grupo chico muestra sus filas directo; uno grande arranca mostrando
      // el desglose por método/nombre, que es el punto de subdividir.
      subs: new Set(
        grupos.flatMap((g) =>
          g.cantidad <= LIMITE_AUTOEXPANDIR
            ? g.subgrupos.map((s) => claveSub(g.clave, s.clave))
            : []
        )
      ),
    }
  }, [grupos])

  const [abiertos, setAbiertos] = useState(inicial.grupos)
  const [subsAbiertos, setSubsAbiertos] = useState(inicial.subs)

  const toggle = (set, clave) => {
    const copia = new Set(set)
    if (copia.has(clave)) copia.delete(clave)
    else copia.add(clave)
    return copia
  }

  const todoAbierto = grupos.every((g) => abiertos.has(g.clave))
  const expandirTodo = () => {
    if (todoAbierto) {
      setAbiertos(new Set())
    } else {
      setAbiertos(new Set(grupos.map((g) => g.clave)))
      setSubsAbiertos(new Set(grupos.flatMap((g) => g.subgrupos.map((s) => claveSub(g.clave, s.clave)))))
    }
  }

  const encabezado = (
    <thead>
      <tr>{columnas.map((c, i) => <th key={i} style={c.style}>{c.label}</th>)}</tr>
    </thead>
  )

  // Pocas filas y un solo grupo: tabla plana, sin cabeceras que no aportan.
  if (grupos.length < minimoParaAgrupar) {
    return (
      <table className="data-table">
        {encabezado}
        <tbody>{grupos.flatMap((g) => g.items.map(renderFila))}</tbody>
      </table>
    )
  }

  return (
    <>
      <div className="desglose-barra">
        <span>{grupos.length} grupos</span>
        <button type="button" className="desglose-toggle-todo" onClick={expandirTodo}>
          {todoAbierto ? 'Contraer todo' : 'Expandir todo'}
        </button>
      </div>
      <table className="data-table tabla-desglose">
        {encabezado}
        <tbody>
          {grupos.map((g) => {
            const abierto = abiertos.has(g.clave)
            return [
              <tr key={`g-${g.clave}`} className={`desglose-grupo${abierto ? ' abierto' : ''}`}>
                <td colSpan={colSpan}>
                  <button
                    type="button"
                    className="desglose-cabecera"
                    onClick={() => setAbiertos((s) => toggle(s, g.clave))}
                    aria-expanded={abierto}
                  >
                    <IcoChevron abierto={abierto} />
                    <span className="desglose-label">{g.label}</span>
                    <span className="desglose-cant">{g.cantidad}</span>
                    <span className="desglose-total">{fmtMonto(g.total)}</span>
                  </button>
                </td>
              </tr>,

              ...(!abierto ? [] : g.subdividir
                ? g.subgrupos.flatMap((s) => {
                    const k = claveSub(g.clave, s.clave)
                    const subAbierto = subsAbiertos.has(k)
                    return [
                      <tr key={`s-${k}`} className="desglose-subgrupo">
                        <td colSpan={colSpan}>
                          <button
                            type="button"
                            className="desglose-cabecera sub"
                            onClick={() => setSubsAbiertos((st) => toggle(st, k))}
                            aria-expanded={subAbierto}
                          >
                            <IcoChevron abierto={subAbierto} />
                            <span className="desglose-label">{s.label}</span>
                            <span className="desglose-cant">{s.cantidad}</span>
                            <span className="desglose-total">{fmtMonto(s.total)}</span>
                          </button>
                        </td>
                      </tr>,
                      ...(subAbierto ? s.items.map(renderFila) : []),
                    ]
                  })
                : g.items.map(renderFila)
              ),
            ]
          })}
        </tbody>
      </table>
    </>
  )
}
