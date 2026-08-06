// Torta de N gajos con conic-gradient + leyenda.
//
// ── Paleta ──────────────────────────────────────────────────────────────────
// Los colores NO son los que usa el resto de reportes (PAY_COLORS en
// routes/reportes.js). Esa paleta se valido contra la superficie oscura de la app
// (#232c38) y falla tres controles: la banda de luminosidad, el piso de croma
// ('#9b958c' lee gris) y sobre todo el piso de vision normal, donde el par
// '#9b958c'/'#B98CD8' da ΔE 13,3 (el minimo es 15: son dos colores que ni con
// vision de color completa se distinguen bien).
//
// Estos ocho pasan los cinco controles sobre la misma superficie: banda de
// luminosidad OK, croma OK, separacion CVD peor par ΔE 8,4 (protan), vision normal
// peor par ΔE 19,3, y contraste >= 3:1 salvo el verde (2,85:1), que por eso lleva
// SIEMPRE etiqueta visible con su monto en la leyenda.
//
// El orden es FIJO y no se cicla: un noveno color generado seria indistinguible de
// alguno de estos. Por eso la cola se agrupa en "Otros" en vez de inventar hues.
const COLORES = [
  '#3987e5', // azul
  '#d95926', // naranja
  '#199e70', // aqua
  '#c98500', // amarillo
  '#d55181', // magenta
  '#008300', // verde  (2,85:1 -> depende de la etiqueta de la leyenda)
  '#9085e9', // violeta
  '#e66767', // rojo   (reservado para "Otros" cuando hay cola)
]

// Techo de gajos que se dibujan aparte. Mas alla de 7 clases con significado los
// gajos chicos no se leen y la leyenda tapa la pantalla; la cola va a "Otros" y se
// lista completa abajo, para que "rubros completos" siga siendo cierto.
const MAX_GAJOS = 7

// Separacion entre gajos, en grados. A 132px de diametro, 1,5deg son ~2px de arco,
// que es el espaciador que corresponde entre rellenos contiguos.
const GAP_DEG = 1.5

const fmtCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
})
const fmt = (n) => fmtCurrency.format(Number(n) || 0)

export default function Donut({ segmentos, titulo, vacioLabel = 'Sin datos en el período' }) {
  const limpios = (segmentos ?? [])
    .map(s => ({ nombre: s.nombre, total: Number(s.total) || 0 }))
    .filter(s => s.total > 0)

  const total = limpios.reduce((s, x) => s + x.total, 0)

  if (total <= 0) {
    return (
      <div className="rep-kpi">
        <div className="rep-kpi-head"><span className="rep-kpi-label">{titulo}</span></div>
        <div className="rep-kpi-sub">{vacioLabel}</div>
      </div>
    )
  }

  // Los segmentos llegan ordenados por total desc desde el backend.
  const visibles = limpios.slice(0, MAX_GAJOS)
  const cola     = limpios.slice(MAX_GAJOS)
  const gajos = cola.length > 0
    ? [...visibles, { nombre: `Otros (${cola.length})`, total: cola.reduce((s, x) => s + x.total, 0) }]
    : visibles

  // conic-gradient toma cortes acumulados. Entre gajo y gajo se mete un tramo del
  // color de la superficie para que los rellenos no se toquen.
  const stops = []
  let acum = 0
  gajos.forEach((g, i) => {
    const desde = (acum / total) * 360
    acum += g.total
    const hasta = (acum / total) * 360
    const color = COLORES[i]
    const cierre = i === gajos.length - 1 ? hasta : Math.max(desde, hasta - GAP_DEG)
    stops.push(`${color} ${desde}deg ${cierre}deg`)
    if (cierre < hasta) stops.push(`var(--rep-donut-gap) ${cierre}deg ${hasta}deg`)
  })

  const resumen = gajos.map(g => `${g.nombre} ${fmt(g.total)}`).join(', ')

  return (
    <div className="rep-kpi">
      <div className="rep-kpi-head"><span className="rep-kpi-label">{titulo}</span></div>

      <div className="rep-donut-wrap">
        <div
          className="rep-donut"
          role="img"
          aria-label={`${titulo}. ${resumen}`}
          style={{ background: `conic-gradient(${stops.join(', ')})` }}
        />
        {/* La leyenda lleva nombre, monto y porcentaje de CADA gajo: la identidad
            nunca depende solo del color. Es tambien el "relief" que exige el verde,
            que no llega a 3:1 contra la superficie. */}
        <div className="rep-donut-legend">
          {gajos.map((g, i) => (
            <div className="rep-donut-row" key={g.nombre}>
              <span className="rep-donut-dot" style={{ background: COLORES[i] }} />
              <span className="rep-donut-name">{g.nombre}</span>
              <span className="rep-donut-val">{fmt(g.total)}</span>
              <span className="rep-donut-pct">{((g.total / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* La cola agrupada, listada entera: la torta se lee y el dato no se pierde. */}
      {cola.length > 0 && (
        <details className="rep-donut-cola">
          <summary>Ver los {cola.length} rubros agrupados en "Otros"</summary>
          <div className="rep-donut-legend">
            {cola.map((c) => (
              <div className="rep-donut-row" key={c.nombre}>
                <span className="rep-donut-name">{c.nombre}</span>
                <span className="rep-donut-val">{fmt(c.total)}</span>
                <span className="rep-donut-pct">{((c.total / total) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
