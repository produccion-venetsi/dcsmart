// Agregado de pagos por DIRECCION, para las tarjetas del reporte de Pagos.
//
// La direccion no es el signo del monto: los importes son siempre positivos y la
// direccion vive en `ingresa_egreso` (true = ingreso, false = egreso). Ver
// migraciones/REGLAS_MIGRACION.md.
//
// Antes el reporte tenia `total_gastos` (los egresos) pero ningun total de
// ingresos, y su `total_efectivo` sumaba las dos direcciones en un solo numero:
// un mes con muchas notas de credito en efectivo lo inflaba y no habia forma de
// saber cuanto entro y cuanto salio.
//
// "En efectivo" se decide con el MISMO esEfectivo que usa el cuadre de caja, a
// proposito: si algun dia se agrega un metodo "Efectivo USD", las dos pantallas
// tienen que cambiar juntas.

import { esEfectivo } from './cuadreCaja.js'

const SIN_RUBRO = 'Sin rubro'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Solo `true` es ingreso. Cualquier otra cosa (false, null, undefined) es egreso,
// que es el default de la columna en la base.
const esIngreso = (pago) => pago?.ingresa_egreso === true

const rubroDe = (pago) => pago?.rubcat?.rubro?.nombre || SIN_RUBRO

// De Map a array ordenado por total descendente. El orden lo fija el backend para
// que la torta y su leyenda coincidan sin que el frontend tenga que reordenar.
function aListaOrdenada(mapa) {
  return [...mapa.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total)
}

export function agregarPorDireccion(filas) {
  let total_ingresos = 0, total_egresos = 0
  let efectivo_ingresos = 0, efectivo_egresos = 0
  const rubrosIngresos = new Map()
  const rubrosEgresos  = new Map()

  for (const fila of filas ?? []) {
    const monto = num(fila?.importe)
    const ingreso = esIngreso(fila)
    const enEfectivo = esEfectivo(fila?.metodo_pago?.nombre)
    const rubro = rubroDe(fila)

    if (ingreso) {
      total_ingresos += monto
      if (enEfectivo) efectivo_ingresos += monto
    } else {
      total_egresos += monto
      if (enEfectivo) efectivo_egresos += monto
    }

    const mapa = ingreso ? rubrosIngresos : rubrosEgresos
    mapa.set(rubro, (mapa.get(rubro) ?? 0) + monto)
  }

  return {
    total_ingresos,
    total_egresos,
    efectivo: { ingresos: efectivo_ingresos, egresos: efectivo_egresos },
    // El resto se DERIVA, no se acumula aparte: asi no puede quedar desalineado
    // con el total si alguien agrega una condicion nueva en el loop.
    resto: {
      ingresos: total_ingresos - efectivo_ingresos,
      egresos:  total_egresos  - efectivo_egresos,
    },
    rubros: {
      ingresos: aListaOrdenada(rubrosIngresos),
      egresos:  aListaOrdenada(rubrosEgresos),
    },
  }
}
