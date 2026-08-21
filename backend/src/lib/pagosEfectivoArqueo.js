// Los pagos en efectivo que mueven la plata del cofre entre dos arqueos.
//
// Hasta acá el arqueo solo miraba los EGRESOS: una op pagada en efectivo saca
// plata del cofre y por eso se resta. Pero una op de ingreso en efectivo (una
// nota de crédito que el proveedor devuelve en mano, un cobro que entra por
// fuera de la caja) mete plata en el mismo cofre, y quedaba afuera: el conteo
// la encontraba y el sistema no la esperaba, así que aparecía como sobrante.
//
// Medido en prod el 2026-08-21: 2.359 ops de ingreso en efectivo pagadas, y de
// los locales que arquean son TOGNIS-PIZZA (1.178), GRAN-DANZON (579), EVELIA
// (266), TOGNIS-CAFE (98) y 878COOP (83). No era un caso de borde.
//
// Las condiciones son las MISMAS que para los egresos —pagado, método
// Efectivo, y entra por `fecha_pago` en el período (desde, hasta]— porque es la
// misma pregunta: cuándo la plata pasó por el cofre. Una op sin `fecha_pago`
// no entra en ningún período: no se sabe cuándo se movió.

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Filtro de Prisma: los pagos en efectivo del período, en las dos direcciones.
// El período es (desde, hasta], igual que las cajas: `desde` es el instante del
// arqueo anterior, que ya los contó.
export function wherePagosEfectivo({ id_local, id_metodo, desde, hasta }) {
  return {
    id_local,
    pagado: true,
    id_metodo,
    fecha_pago: {
      ...(desde ? { gt: desde } : {}),
      lte: hasta,
    },
  }
}

// Separa una lista de pagos en las dos direcciones y suma cada lado.
//
// Los importes se guardan siempre positivos y la dirección va aparte, en
// `ingresa_egreso` (true = ingresa). Ver lib/dates.js y el modelo de pagos: no
// hay que mirarle el signo al número, hay que mirar la bandera.
export function separarPagosEfectivo(pagos) {
  let ingresos = 0
  let egresos = 0
  for (const p of pagos ?? []) {
    const monto = Math.abs(num(p?.importe))
    if (p?.ingresa_egreso) ingresos += monto
    else egresos += monto
  }
  return { ingresos, egresos }
}
