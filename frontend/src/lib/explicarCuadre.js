// El descuadre, dicho como se lo diría un encargado a un cajero.
//
// Antes la pantalla mostraba "⚠ Diferencia: $21.450 (falta)" y un tooltip con
// la fórmula. Eso le dice a la persona QUE está mal, nunca QUÉ hacer, así que
// el reclamo llegaba igual: "no me cuadra la caja y no sé por qué".
//
// Acá se arma: el estado en una línea, la cuenta que se hizo, y una lista corta
// de qué mirar primero -- ordenada por lo que en la práctica lo explica más
// seguido.

const fmt = (n) =>
  `$${Math.abs(Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Debajo de este monto una diferencia se explica sola (vuelto, redondeo,
// propina suelta) y no vale la pena mandar a nadie a revisar comprobantes.
const UMBRAL_MENUDEO = 2000

export function explicarDiferencia(cuadre) {
  if (!cuadre || cuadre.total == null || cuadre.cuadra == null) {
    return {
      estado: 'incompleta',
      titulo: 'Falta cargar el total del turno',
      detalle: 'Sin el total no se puede saber si la caja cierra.',
      cuenta: '',
      sospechas: [],
    }
  }

  const cuenta =
    `Vendiste ${fmt(cuadre.total)}. Entre el efectivo (${fmt(cuadre.efectivo)}), ` +
    `los otros cobros (${fmt(cuadre.cobros)})` +
    (cuadre.no_cobrado > 0 ? ` y lo que quedó a cobrar (${fmt(cuadre.no_cobrado)})` : '') +
    ` suman ${fmt(cuadre.esperado)}.`

  if (cuadre.cuadra) {
    return {
      estado: 'cuadra',
      titulo: 'La caja cuadra',
      detalle: 'Todo lo que vendiste está explicado por alguna forma de cobro.',
      cuenta,
      sospechas: [],
    }
  }

  const falta = cuadre.diferencia > 0
  return {
    estado: falta ? 'falta' : 'sobra',
    titulo: falta
      ? `Faltan ${fmt(cuadre.diferencia)} por explicar`
      : `Cargaste ${fmt(cuadre.diferencia)} de más`,
    detalle: falta
      ? 'Vendiste más de lo que suman los cobros cargados: falta cargar algo.'
      : 'Los cobros cargados suman más que la venta declarada.',
    cuenta,
    sospechas: sospechasDeDiferencia(cuadre),
  }
}

// Qué mirar primero, en orden de probabilidad real.
export function sospechasDeDiferencia(cuadre) {
  if (!cuadre || cuadre.cuadra !== false) return []

  const dif = Number(cuadre.diferencia) || 0
  const falta = dif > 0
  const out = []

  if (falta) {
    out.push('Fijate si quedó un cobro sin cargar: alguna tarjeta, app de delivery o transferencia del turno.')
    if (cuadre.no_cobrado > 0) {
      out.push('Lo que quedó fiado o a cobrar ya está contado acá, no hace falta cargarlo de nuevo.')
    } else {
      out.push('¿Quedó algo fiado o una mesa sin cerrar? Cargalo como cuenta corriente o a cobrar.')
    }
  } else {
    out.push('Revisá el total del turno: puede estar cargado de menos.')
    out.push('Fijate que ningún cobro esté cargado dos veces, sobre todo si lo anotaste como detalle y como movimiento.')
  }

  // La firma del signo invertido: la diferencia es exactamente el doble de los
  // gastos. Pasó de verdad en LOS GALGOS y es imposible de adivinar mirando.
  const gastos = Number(cuadre.gastos) || 0
  if (gastos > 0 && Math.abs(Math.abs(dif) - gastos * 2) <= 1) {
    out.push(`Los gastos (${fmt(gastos)}) parecen estar restados dos veces: revisá si ya los descontaste del efectivo antes de cargarlos.`)
  }

  if (Math.abs(dif) < UMBRAL_MENUDEO) {
    out.push('Es un monto chico: suele ser un vuelto, una propina o un redondeo.')
  }

  return out
}
